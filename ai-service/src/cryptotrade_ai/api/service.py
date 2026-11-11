"""Service de prédiction live : une instance, un modèle figé, un cache par bougie close.

Le client Binance est injectable (tests sans réseau). FastAPI n'est pas utilisé ici.
La politique HAUSSE / BAISSE / ATTENDRE est celle de ``selection.json``, jamais recalculée.
"""

from __future__ import annotations

import copy
import json
import threading
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from cryptotrade_ai.api import PredictionServiceError
from cryptotrade_ai.data.klines import INTERVAL_MS, ms_to_utc_iso
from cryptotrade_ai.dataset.features import FEATURE_NAMES, FORBIDDEN_INPUT_COLUMNS
from cryptotrade_ai.live.binance_rest import LIVE_INTERVAL, LIVE_SYMBOL, MAX_KLINES, BinanceRestClient
from cryptotrade_ai.live.candles import expected_last_closed_open_time
from cryptotrade_ai.live.features import features_from_klines
from cryptotrade_ai.training.config import DEFAULT_TRAINING_CONFIG_PATH
from cryptotrade_ai.training.decision import decide
from cryptotrade_ai.xai import XaiError
from cryptotrade_ai.xai.explainer import LocalExplainer, load_frozen_model
from cryptotrade_ai.xai.schema import (
    WARNING_MODEL_NOT_MARKET,
    WARNING_NO_PROFIT,
    expected_state,
    validate_explanation,
)

PREDICT_SCHEMA = "predict-1.0"
MODE_LIVE = "temps_reel"
PROVIDER = "binance_spot_rest"
INTERVAL_MS_1H = INTERVAL_MS[LIVE_INTERVAL]
PROBABILITY_MATCH_TOLERANCE = 1e-12
FROZEN_EXPERIMENT = "20261108T122920Z-c3c17310"
FROZEN_TRIAL = "random_forest-max_depth4-min_samples_leaf200"
TOP_K = 5


@dataclass
class _CacheEntry:
    """Prédiction déjà calculée pour une bougie close ; l'explication TreeSHAP est ajoutée à la demande."""

    open_time_ms: int
    features: dict[str, float]
    payload: dict
    explication: dict | None = None


class PredictionService:
    """Charge le modèle une fois, prédit la dernière heure close, met en cache jusqu'à la clôture suivante."""

    def __init__(
        self,
        data_dir: Path,
        *,
        client: BinanceRestClient,
        config_path: Path = DEFAULT_TRAINING_CONFIG_PATH,
        expected_experiment: str = FROZEN_EXPERIMENT,
        expected_trial: str = FROZEN_TRIAL,
    ) -> None:
        if client is None:
            raise PredictionServiceError("Un client Binance (réel ou de test) est obligatoire")
        self.client = client
        self.frozen = load_frozen_model(
            Path(data_dir),
            config_path=Path(config_path),
            expected_experiment=expected_experiment,
            expected_trial=expected_trial,
        )
        if self.frozen.features != FEATURE_NAMES:
            raise PredictionServiceError("Ordre des variables du modèle figé différent de FEATURE_NAMES")
        self.explainer = LocalExplainer(self.frozen)
        self._lock = threading.Lock()
        self._cache: _CacheEntry | None = None

    def predict(self, *, explain: bool = False) -> dict:
        """Dernière bougie close BTCUSDT 1 h. ``explain=True`` ajoute la réponse xai-1.0 validée."""
        if not isinstance(explain, bool):
            raise PredictionServiceError("explain : booléen attendu")
        with self._lock:
            server_time_ms = self.client.server_time_ms()
            expected_open = expected_last_closed_open_time(server_time_ms)
            if self._cache is not None and self._cache.open_time_ms == expected_open:
                return self._from_cache(explain)
            rows = self.client.klines(LIVE_SYMBOL, LIVE_INTERVAL, MAX_KLINES)
            series, features = features_from_klines(rows, server_time_ms=server_time_ms)
            if series.last.open_time != expected_open:
                raise PredictionServiceError("La dernière bougie close ne correspond pas à l'horloge Binance")
            if series.last.open_time + INTERVAL_MS_1H > server_time_ms:
                raise PredictionServiceError("Une bougie encore ouverte a été présentée comme close")
            forbidden = set(features) & FORBIDDEN_INPUT_COLUMNS
            if forbidden:
                raise PredictionServiceError(f"Colonnes interdites dans les variables live : {sorted(forbidden)}")
            payload = self._build_payload(series, features, server_time_ms, explain=explain)
            self._cache = _CacheEntry(
                open_time_ms=series.last.open_time,
                features=dict(features),
                payload=_without_explication(payload),
                explication=payload.get("explication"),
            )
            return copy.deepcopy(payload)

    def _from_cache(self, explain: bool) -> dict:
        entry = self._cache
        if entry is None:
            raise PredictionServiceError("Cache vide")
        payload = copy.deepcopy(entry.payload)
        if not explain:
            payload["explication"] = None
            return payload
        if entry.explication is None:
            entry.explication = self._explain(entry.features, entry.open_time_ms, payload["prediction"])
        payload["explication"] = copy.deepcopy(entry.explication)
        _check_prediction_matches_explanation(payload["prediction"], payload["explication"])
        return payload

    def _build_payload(self, series, features: dict[str, float], server_time_ms: int, *, explain: bool) -> dict:
        last = series.last
        policy = self.frozen.policy
        if explain:
            explication = self.explainer.explain(features, candle_open_time_ms=last.open_time, top_k=TOP_K)
            prediction = copy.deepcopy(explication["prediction"])
        else:
            explication = None
            X = np.array([[features[name] for name in self.frozen.features]], dtype=np.float64)
            probability = float(self.frozen.model.predict_proba(X)[0, 1])
            prediction = {
                "probability_up": probability,
                "signal_authorized": policy.signal_authorized,
                "margin": policy.margin if policy.signal_authorized else None,
                "threshold_up": 0.5 + policy.margin if policy.signal_authorized else None,
                "threshold_down": 0.5 - policy.margin if policy.signal_authorized else None,
                "state": expected_state(probability, policy.signal_authorized, policy.margin),
            }
            computed = str(decide(np.array([probability]), policy)[0])
            if computed != prediction["state"]:
                raise PredictionServiceError("État incohérent avec la politique figée")
        payload = {
            "schema_version": PREDICT_SCHEMA,
            "mode": MODE_LIVE,
            "symbol": LIVE_SYMBOL,
            "interval": LIVE_INTERVAL,
            "candle_open_time_utc": ms_to_utc_iso(last.open_time),
            "decision_time_utc": ms_to_utc_iso(last.open_time + INTERVAL_MS_1H),
            "valid_until_utc": ms_to_utc_iso(last.open_time + 2 * INTERVAL_MS_1H),
            "prediction": prediction,
            "model": self.frozen.reference.as_dict(),
            "data_source": {
                "provider": PROVIDER,
                "candles_requested": MAX_KLINES,
                "candles_used": len(series.candles),
                "all_closed": True,
                "discarded_open": series.discarded_open,
                "consecutive": series.last_segment_length == len(series.candles),
                "last_segment_length": series.last_segment_length,
                "gaps": len(series.gaps),
                "first_open_time_utc": ms_to_utc_iso(series.candles[0].open_time),
                "last_open_time_utc": ms_to_utc_iso(last.open_time),
                "binance_server_time_utc": ms_to_utc_iso(server_time_ms),
            },
            "explication": explication,
            "warnings": [WARNING_MODEL_NOT_MARKET, WARNING_NO_PROFIT],
        }
        if explication is not None:
            _check_prediction_matches_explanation(payload["prediction"], explication)
        return _json_safe(payload)

    def _explain(self, features: dict[str, float], open_time_ms: int, prediction: dict) -> dict:
        explication = self.explainer.explain(features, candle_open_time_ms=open_time_ms, top_k=TOP_K)
        _check_prediction_matches_explanation(prediction, explication)
        return _json_safe(explication)


def _without_explication(payload: dict) -> dict:
    copy_payload = copy.deepcopy(payload)
    copy_payload["explication"] = None
    return copy_payload


def _check_prediction_matches_explanation(prediction: dict, explication: dict) -> None:
    validate_explanation(explication)
    explained = explication["prediction"]
    if explained["state"] != prediction["state"]:
        raise XaiError(
            f"État de l'explication {explained['state']!r} différent de la prédiction {prediction['state']!r}"
        )
    if abs(float(explained["probability_up"]) - float(prediction["probability_up"])) > PROBABILITY_MATCH_TOLERANCE:
        raise XaiError("Probabilité de l'explication différente de celle de la prédiction")


def _json_safe(payload: dict) -> dict:
    return json.loads(json.dumps(payload, allow_nan=False))
