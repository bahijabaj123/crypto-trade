"""Tests du service de prédiction live : cache, fraîcheur, erreurs. Aucun réseau, aucun artefact réel."""

from __future__ import annotations

import json
import math
import socket
import threading
import time

import pytest

pytest.importorskip("sklearn")
pytest.importorskip("shap")

import numpy as np  # noqa: E402
from synthetic_market import HOUR_MS, candle_to_kline, klines_payload, open_followup, server_time_after  # noqa: E402
from synthetic_xai import MARGIN, RETAINED, RUN_ID, make_forest, write_frozen_selection  # noqa: E402

from cryptotrade_ai.api import PredictionServiceError  # noqa: E402
from cryptotrade_ai.api.service import PREDICT_SCHEMA, PredictionService  # noqa: E402
from cryptotrade_ai.data.klines import ms_to_utc_iso  # noqa: E402
from cryptotrade_ai.dataset.features import FEATURE_NAMES, FORBIDDEN_INPUT_COLUMNS  # noqa: E402
from cryptotrade_ai.live import HistoryError, MarketDataError  # noqa: E402
from cryptotrade_ai.training.decision import ATTENDRE, DecisionPolicy, decide  # noqa: E402
from cryptotrade_ai.xai import XaiError  # noqa: E402
from cryptotrade_ai.xai.schema import WARNING_MODEL_NOT_MARKET, WARNING_NO_PROFIT, validate_explanation  # noqa: E402

N_CLOSED = 120


class ScriptedMarket:
    def __init__(self, rows, server_time_ms, *, klines_delay=0.0):
        self.rows = rows
        self.now = int(server_time_ms)
        self.klines_delay = klines_delay
        self.time_calls = 0
        self.klines_calls = 0

    def server_time_ms(self) -> int:
        self.time_calls += 1
        return self.now

    def klines(self, symbol="BTCUSDT", interval="1h", limit=1000) -> list:
        self.klines_calls += 1
        if self.klines_delay:
            time.sleep(self.klines_delay)
        if symbol != "BTCUSDT" or interval != "1h" or limit != 1000:
            raise MarketDataError("requête klines inattendue")
        return list(self.rows)


@pytest.fixture(scope="module")
def forest():
    return make_forest()


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def blocked(*args, **kwargs):
        raise AssertionError("Accès réseau interdit dans les tests du service de prédiction")

    monkeypatch.setattr(socket.socket, "connect", blocked)
    monkeypatch.setattr(socket, "create_connection", blocked)


@pytest.fixture
def frozen_paths(tmp_path, forest):
    return write_frozen_selection(tmp_path, forest)


def market(include_open=True, n=N_CLOSED):
    rows, server_time, candles = klines_payload(n, include_open=include_open)
    return ScriptedMarket(rows, server_time), candles, server_time


def service(frozen_paths, client) -> PredictionService:
    data_dir, config_path = frozen_paths
    return PredictionService(
        data_dir, client=client, config_path=config_path, expected_experiment=RUN_ID, expected_trial=RETAINED
    )


def test_predict_returns_structured_json_for_the_last_closed_candle(frozen_paths):
    client, candles, server_time = market()
    payload = service(frozen_paths, client).predict()
    last = candles[-1]
    assert payload["schema_version"] == PREDICT_SCHEMA
    assert payload["mode"] == "temps_reel"
    assert payload["symbol"] == "BTCUSDT" and payload["interval"] == "1h"
    assert payload["candle_open_time_utc"] == ms_to_utc_iso(last.open_time)
    assert payload["decision_time_utc"] == ms_to_utc_iso(last.open_time + HOUR_MS)
    assert payload["valid_until_utc"] == ms_to_utc_iso(last.open_time + 2 * HOUR_MS)
    assert last.close_time < server_time
    assert payload["data_source"]["all_closed"] is True
    assert payload["data_source"]["discarded_open"] == 1
    assert payload["data_source"]["candles_used"] == N_CLOSED
    assert payload["data_source"]["candles_requested"] == 1000
    assert payload["data_source"]["provider"] == "binance_spot_rest"
    assert payload["explication"] is None
    assert payload["prediction"]["margin"] == MARGIN
    assert payload["prediction"]["state"] in ("HAUSSE", "BAISSE", "ATTENDRE")
    assert 0.0 <= payload["prediction"]["probability_up"] <= 1.0
    assert WARNING_MODEL_NOT_MARKET in payload["warnings"] and WARNING_NO_PROFIT in payload["warnings"]
    assert "target_up_1h" not in json.dumps(payload) and "fwd_return_1h" not in json.dumps(payload)
    json.dumps(payload, allow_nan=False)


def test_open_candle_is_never_the_observation(frozen_paths):
    client, candles, server_time = market(include_open=True)
    payload = service(frozen_paths, client).predict()
    assert payload["candle_open_time_utc"] == ms_to_utc_iso(candles[-1].open_time)
    assert candles[-1].close_time < server_time
    open_row = client.rows[-1]
    assert int(open_row[0]) == candles[-1].open_time + HOUR_MS
    assert int(open_row[6]) >= server_time


def test_explanation_matches_prediction_probability_and_state(frozen_paths):
    client, candles, _ = market()
    payload = service(frozen_paths, client).predict(explain=True)
    expl = payload["explication"]
    validate_explanation(expl)
    assert expl["candle_open_time_utc"] == payload["candle_open_time_utc"]
    assert expl["prediction"]["state"] == payload["prediction"]["state"]
    assert expl["prediction"]["probability_up"] == payload["prediction"]["probability_up"]
    assert expl["prediction"]["margin"] == MARGIN
    assert expl["explanation"]["additivity_error"] <= 1e-6
    assert expl["explanation"]["method"] == "tree_shap_path_dependent"
    assert tuple(r["feature"] for r in sorted(expl["explanation"]["contributions"], key=lambda r: FEATURE_NAMES.index(r["feature"]))) == FEATURE_NAMES


def test_cached_explanation_stays_aligned_with_the_stored_prediction(frozen_paths):
    client, _, _ = market()
    svc = service(frozen_paths, client)
    first = svc.predict(explain=False)
    second = svc.predict(explain=True)
    assert second["prediction"] == first["prediction"]
    assert second["explication"]["prediction"]["state"] == first["prediction"]["state"]
    assert abs(second["explication"]["prediction"]["probability_up"] - first["prediction"]["probability_up"]) <= 1e-12


def test_cache_skips_klines_for_the_same_closed_hour(frozen_paths):
    client, _, _ = market()
    svc = service(frozen_paths, client)
    a = svc.predict()
    b = svc.predict()
    assert a == b
    assert client.time_calls == 2
    assert client.klines_calls == 1


def test_hour_change_invalidates_the_cache(frozen_paths):
    client, candles, _ = market(include_open=True)
    svc = service(frozen_paths, client)
    first = svc.predict()
    closed_next = candles[-1]
    next_open = closed_next.open_time + HOUR_MS
    from cryptotrade_ai.dataset.source import Candle

    newly_closed = Candle(
        next_open, next_open + HOUR_MS - 1, closed_next.close, closed_next.close * 1.001,
        closed_next.close * 0.999, closed_next.close * 1.0005, 2.0, 2.0 * closed_next.close, 20, 1.0,
    )
    client.rows = [candle_to_kline(c) for c in candles] + [candle_to_kline(newly_closed), open_followup(newly_closed)]
    client.now = server_time_after(newly_closed)
    second = svc.predict()
    assert second["candle_open_time_utc"] != first["candle_open_time_utc"]
    assert second["candle_open_time_utc"] == ms_to_utc_iso(next_open)
    assert client.klines_calls == 2
    assert first["valid_until_utc"] == ms_to_utc_iso(next_open + HOUR_MS)


def test_stale_klines_are_refused_instead_of_returning_cache(frozen_paths):
    client, _, _ = market(include_open=False)
    svc = service(frozen_paths, client)
    first = svc.predict()
    client.now = client.now + HOUR_MS
    with pytest.raises(HistoryError, match="non à jour"):
        svc.predict()
    assert first["candle_open_time_utc"] == ms_to_utc_iso(svc._cache.open_time_ms)


def test_concurrent_calls_compute_klines_once(frozen_paths):
    client, _, _ = market()
    client.klines_delay = 0.05
    svc = service(frozen_paths, client)
    results = []

    def run():
        results.append(svc.predict())

    threads = [threading.Thread(target=run) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(results) == 2 and results[0] == results[1]
    assert client.klines_calls == 1
    assert client.time_calls == 2


def test_determinism_on_synthetic_forest(frozen_paths):
    client, _, _ = market()
    svc = service(frozen_paths, client)
    assert svc.predict() == svc.predict()
    other = service(frozen_paths, ScriptedMarket(client.rows, client.now))
    assert other.predict()["prediction"]["state"] == svc.predict()["prediction"]["state"]


def test_frozen_policy_is_not_recomputed(frozen_paths, forest):
    client, candles, _ = market()
    payload = service(frozen_paths, client).predict()
    p = payload["prediction"]["probability_up"]
    assert payload["prediction"]["threshold_up"] == pytest.approx(0.5 + MARGIN)
    assert payload["prediction"]["threshold_down"] == pytest.approx(0.5 - MARGIN)
    expected = str(decide(np.array([p]), DecisionPolicy(True, MARGIN))[0])
    assert payload["prediction"]["state"] == expected
    assert payload["model"]["trial_id"] == RETAINED
    assert payload["model"]["experiment"] == RUN_ID


def test_refused_signal_always_waits(tmp_path, forest):
    data_dir, config_path = write_frozen_selection(
        tmp_path, forest, signal="REFUSE", policy={"signal_autorise": False, "marge": None, "couverture_cible": None}
    )
    client, _, _ = market()
    payload = PredictionService(
        data_dir, client=client, config_path=config_path, expected_experiment=RUN_ID, expected_trial=RETAINED
    ).predict()
    assert payload["prediction"]["state"] == ATTENDRE
    assert payload["prediction"]["margin"] is None
    assert payload["prediction"]["threshold_up"] is None


def test_too_few_closed_candles_are_refused(frozen_paths):
    client, _, _ = market(n=50)
    with pytest.raises(HistoryError, match="72"):
        service(frozen_paths, client).predict()


def test_invalid_klines_are_not_hidden(frozen_paths):
    client, _, _ = market()
    client.rows[-2][4] = "nan"
    with pytest.raises(MarketDataError):
        service(frozen_paths, client).predict()


def test_missing_model_is_not_hidden(tmp_path, forest):
    from synthetic_xai import copy_training_config

    client, _, _ = market()
    config_path = copy_training_config(tmp_path)
    with pytest.raises(XaiError, match="sélection"):
        PredictionService(tmp_path / "vide", client=client, config_path=config_path, expected_experiment=RUN_ID, expected_trial=RETAINED)


def test_client_is_mandatory(frozen_paths):
    data_dir, config_path = frozen_paths
    with pytest.raises(PredictionServiceError, match="client"):
        PredictionService(data_dir, client=None, config_path=config_path, expected_experiment=RUN_ID, expected_trial=RETAINED)


def test_payload_mutation_does_not_corrupt_the_cache(frozen_paths):
    client, _, _ = market()
    svc = service(frozen_paths, client)
    first = svc.predict()
    first["prediction"]["state"] = "ACHETER"
    second = svc.predict()
    assert second["prediction"]["state"] != "ACHETER"


def test_no_trading_hooks_in_the_service():
    from pathlib import Path

    text = (Path(__file__).resolve().parents[1] / "src/cryptotrade_ai/api/service.py").read_text(encoding="utf-8").lower()
    for forbidden in ("create_order", "place_order", "new_order", "execute_order", "achat", "vente", "/api/ordres"):
        assert forbidden not in text
    assert "final_test" not in text and "load_test_split" not in text


def test_forbidden_columns_are_absent_from_features(frozen_paths):
    client, _, _ = market()
    svc = service(frozen_paths, client)
    svc.predict()
    assert not set(svc._cache.features) & FORBIDDEN_INPUT_COLUMNS
    assert tuple(svc._cache.features) == FEATURE_NAMES


def test_json_round_trip_has_no_nan(frozen_paths):
    client, _, _ = market()
    payload = service(frozen_paths, client).predict(explain=True)
    text = json.dumps(payload, allow_nan=False)
    assert "NaN" not in text and "Infinity" not in text
    assert math.isfinite(payload["prediction"]["probability_up"])
