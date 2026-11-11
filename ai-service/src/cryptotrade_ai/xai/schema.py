"""Format de réponse XAI ``xai-1.0`` : construction et validation stricte (aucun calcul SHAP ici).

Principe d'additivité : valeur de base + somme des 17 contributions = probabilité prédite,
à ``tolerance`` près. Les contributions sont en points de probabilité (0,01 = 1 point).

Une réponse ``synthetique`` ne peut jamais se faire passer pour un résultat réel : elle porte
une empreinte de modèle nulle, la méthode ``synthetique`` et un avertissement explicite.
"""

from __future__ import annotations

import json
import math
from collections.abc import Iterable, Mapping
from dataclasses import dataclass

import numpy as np

from cryptotrade_ai.data.klines import ms_to_utc_iso, utc_iso_to_ms
from cryptotrade_ai.dataset.features import FEATURE_NAMES
from cryptotrade_ai.training.decision import ATTENDRE, BAISSE, HAUSSE, DecisionPolicy, decide
from cryptotrade_ai.xai import XaiSchemaError
from cryptotrade_ai.xai.labels import GROUPS, LABELS, check_labels, display_value

SCHEMA_VERSION = "xai-1.0"
STATES = (HAUSSE, BAISSE, ATTENDRE)
ORIGIN_REAL = "modele_reel"
ORIGIN_SYNTHETIC = "synthetique"
METHOD_SYNTHETIC = "synthetique"
METHODS = ("tree_shap_path_dependent", "tree_shap_interventional", "saabas", METHOD_SYNTHETIC)
SYNTHETIC_SHA256 = "0" * 64
INTERVAL_MS = 3_600_000
ADDITIVITY_TOLERANCE = 1e-6
MAX_TOLERANCE = 1e-3
CONSISTENCY_TOLERANCE = 1e-12
DIRECTION_UP = "vers_hausse"
DIRECTION_DOWN = "vers_baisse"
DIRECTION_NEUTRAL = "neutre"

WARNING_MODEL_NOT_MARKET = (
    "Cette explication décrit le fonctionnement du modèle : elle n'indique pas la cause d'un mouvement du marché."
)
WARNING_NO_PROFIT = "Conseil pédagogique : aucune garantie de profit et aucun ordre n'est exécuté automatiquement."
WARNING_SYNTHETIC = "EXEMPLE SYNTHÉTIQUE : ces valeurs ne proviennent d'aucun modèle réel."
SYNTHETIC_PREFIX = "[EXEMPLE SYNTHÉTIQUE] "

TOP_KEYS = (
    "schema_version", "data_origin", "symbol", "interval", "candle_open_time_utc", "decision_time_utc",
    "model", "prediction", "explanation", "summary_fr", "warnings",
)
MODEL_KEYS = ("dataset_id", "experiment", "trial_id", "sha256_model", "sha256_selection")
PREDICTION_KEYS = ("probability_up", "signal_authorized", "margin", "threshold_up", "threshold_down", "state")
EXPLANATION_KEYS = (
    "method", "library", "output_space", "base_value", "contributions_sum", "additivity_error", "tolerance",
    "contributions", "groups", "top_k",
)
CONTRIBUTION_KEYS = ("rank", "feature", "label_fr", "group", "unit", "value", "value_display", "contribution", "direction")
GROUP_KEYS = ("group", "label_fr", "features", "contribution")


@dataclass(frozen=True)
class ModelReference:
    dataset_id: str
    experiment: str
    trial_id: str
    sha256_model: str
    sha256_selection: str

    def as_dict(self) -> dict:
        return {key: getattr(self, key) for key in MODEL_KEYS}


def expected_state(probability_up: float, signal_authorized: bool, margin: float | None) -> str:
    """Même règle que la décision figée : HAUSSE si p >= 0,5 + marge, BAISSE si p <= 0,5 - marge."""
    policy = DecisionPolicy(signal_authorized=signal_authorized, margin=margin)
    return str(decide(np.array([probability_up], dtype=np.float64), policy)[0])


def build_explanation(
    *,
    model: ModelReference,
    candle_open_time_ms: int,
    feature_values: Mapping[str, float] | Iterable[tuple[str, float]],
    contributions: Mapping[str, float] | Iterable[tuple[str, float]],
    base_value: float,
    probability_up: float,
    signal_authorized: bool,
    margin: float | None,
    method: str,
    library: str | None,
    data_origin: str = ORIGIN_REAL,
    symbol: str = "BTCUSDT",
    interval: str = "1h",
    top_k: int = 3,
    tolerance: float = ADDITIVITY_TOLERANCE,
    expected_features: tuple[str, ...] = FEATURE_NAMES,
) -> dict:
    """Assemble une réponse à partir de contributions déjà calculées, puis la valide entièrement."""
    values = _named_numbers(feature_values, expected_features, "feature_values")
    contribs = _named_numbers(contributions, expected_features, "contributions")
    order = sorted(expected_features, key=lambda f: (-abs(contribs[f]), expected_features.index(f)))
    rows = [
        {
            "rank": rank,
            "feature": f,
            "label_fr": LABELS[f].label_fr,
            "group": LABELS[f].group,
            "unit": LABELS[f].unit,
            "value": values[f],
            "value_display": display_value(f, values[f]),
            "contribution": contribs[f],
            "direction": _direction(contribs[f]),
        }
        for rank, f in enumerate(order, start=1)
    ]
    total = math.fsum(contribs.values())
    state = expected_state(probability_up, signal_authorized, margin)
    payload = {
        "schema_version": SCHEMA_VERSION,
        "data_origin": data_origin,
        "symbol": symbol,
        "interval": interval,
        "candle_open_time_utc": ms_to_utc_iso(candle_open_time_ms),
        "decision_time_utc": ms_to_utc_iso(candle_open_time_ms + INTERVAL_MS),
        "model": model.as_dict(),
        "prediction": {
            "probability_up": probability_up,
            "signal_authorized": signal_authorized,
            "margin": margin if signal_authorized else None,
            "threshold_up": 0.5 + margin if signal_authorized else None,
            "threshold_down": 0.5 - margin if signal_authorized else None,
            "state": state,
        },
        "explanation": {
            "method": method,
            "library": library,
            "output_space": "probability",
            "base_value": base_value,
            "contributions_sum": total,
            "additivity_error": abs(base_value + total - probability_up),
            "tolerance": tolerance,
            "contributions": rows,
            "groups": [
                {
                    "group": g.name,
                    "label_fr": g.label_fr,
                    "features": list(g.features),
                    "contribution": math.fsum(contribs[f] for f in g.features),
                }
                for g in GROUPS
            ],
            "top_k": top_k,
        },
        "summary_fr": _summary(rows[:top_k], probability_up, base_value, state, data_origin),
        "warnings": [WARNING_MODEL_NOT_MARKET, WARNING_NO_PROFIT]
        + ([WARNING_SYNTHETIC] if data_origin == ORIGIN_SYNTHETIC else []),
    }
    return validate_explanation(payload, expected_features=expected_features)


def validate_explanation(payload: dict, *, expected_features: tuple[str, ...] = FEATURE_NAMES) -> dict:
    """Valide une réponse ``xai-1.0`` ; lève ``XaiSchemaError`` à la première anomalie."""
    try:
        check_labels(tuple(expected_features))
    except Exception as exc:
        raise XaiSchemaError(str(exc)) from exc
    _exact_keys(payload, TOP_KEYS, "")
    if payload["schema_version"] != SCHEMA_VERSION:
        raise XaiSchemaError(f"schema_version : {SCHEMA_VERSION} attendu")
    origin = payload["data_origin"]
    if origin not in (ORIGIN_REAL, ORIGIN_SYNTHETIC):
        raise XaiSchemaError(f"data_origin : {ORIGIN_REAL} ou {ORIGIN_SYNTHETIC} attendu")
    synthetic = origin == ORIGIN_SYNTHETIC
    _text(payload["symbol"], "symbol")
    if payload["interval"] != "1h":
        raise XaiSchemaError("interval : 1h attendu")
    _check_times(payload["candle_open_time_utc"], payload["decision_time_utc"])
    _check_model(payload["model"], synthetic)
    probability = _check_prediction(payload["prediction"])
    _check_explanation(payload["explanation"], probability, synthetic, expected_features)
    _check_texts(payload["summary_fr"], payload["warnings"], synthetic)
    return payload


def to_json(payload: dict) -> str:
    """JSON strict (aucun NaN ni infini), après validation."""
    validate_explanation(payload)
    return json.dumps(payload, ensure_ascii=False, allow_nan=False, indent=2)


def _check_times(open_text, decision_text) -> None:
    for name, text in (("candle_open_time_utc", open_text), ("decision_time_utc", decision_text)):
        if not isinstance(text, str):
            raise XaiSchemaError(f"{name} : texte ISO UTC attendu")
    try:
        open_ms, decision_ms = utc_iso_to_ms(open_text), utc_iso_to_ms(decision_text)
    except ValueError as exc:
        raise XaiSchemaError(f"Horodatage invalide : {exc}") from exc
    if ms_to_utc_iso(open_ms) != open_text or open_ms % INTERVAL_MS:
        raise XaiSchemaError("candle_open_time_utc : début d'heure UTC au format 2025-01-01T00:00:00.000Z attendu")
    if decision_ms != open_ms + INTERVAL_MS or ms_to_utc_iso(decision_ms) != decision_text:
        raise XaiSchemaError("decision_time_utc doit être la clôture de la bougie (ouverture + 1 h)")


def _check_model(model, synthetic: bool) -> None:
    _exact_keys(model, MODEL_KEYS, "model")
    for key in ("dataset_id", "experiment", "trial_id"):
        _text(model[key], f"model.{key}")
    for key in ("sha256_model", "sha256_selection"):
        value = model[key]
        if not isinstance(value, str) or len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
            raise XaiSchemaError(f"model.{key} : empreinte SHA-256 hexadécimale en minuscules attendue")
    if synthetic != (model["sha256_model"] == SYNTHETIC_SHA256):
        raise XaiSchemaError(
            "Une réponse synthétique doit porter l'empreinte nulle, et une réponse réelle une vraie empreinte de modèle"
        )


def _check_prediction(prediction) -> float:
    _exact_keys(prediction, PREDICTION_KEYS, "prediction")
    p = _number(prediction["probability_up"], "prediction.probability_up", 0.0, 1.0)
    authorized = prediction["signal_authorized"]
    if not isinstance(authorized, bool):
        raise XaiSchemaError("prediction.signal_authorized : booléen attendu")
    margin = prediction["margin"]
    if authorized:
        margin = _number(margin, "prediction.margin", 0.0, 0.5)
        up = _number(prediction["threshold_up"], "prediction.threshold_up", 0.5, 1.0)
        down = _number(prediction["threshold_down"], "prediction.threshold_down", 0.0, 0.5)
        if abs(up - (0.5 + margin)) > CONSISTENCY_TOLERANCE or abs(down - (0.5 - margin)) > CONSISTENCY_TOLERANCE:
            raise XaiSchemaError("Seuils incohérents avec la marge (0,5 ± marge attendu)")
    elif any(prediction[k] is not None for k in ("margin", "threshold_up", "threshold_down")):
        raise XaiSchemaError("Signal refusé : marge et seuils doivent être null")
    state = prediction["state"]
    if state not in STATES:
        raise XaiSchemaError(f"prediction.state : une valeur parmi {list(STATES)} attendue")
    if state != expected_state(p, authorized, margin if authorized else None):
        raise XaiSchemaError(f"prediction.state {state!r} incohérent avec la probabilité et la règle de décision")
    return p


def _check_explanation(explanation, probability: float, synthetic: bool, expected_features) -> None:
    _exact_keys(explanation, EXPLANATION_KEYS, "explanation")
    method = explanation["method"]
    if method not in METHODS:
        raise XaiSchemaError(f"explanation.method : une valeur parmi {list(METHODS)} attendue")
    if synthetic != (method == METHOD_SYNTHETIC):
        raise XaiSchemaError("La méthode « synthetique » est réservée aux réponses synthétiques, et réciproquement")
    if explanation["library"] is not None:
        _text(explanation["library"], "explanation.library")
    if explanation["output_space"] != "probability":
        raise XaiSchemaError("explanation.output_space : probability attendu")
    base = _number(explanation["base_value"], "explanation.base_value", 0.0, 1.0)
    tolerance = _number(explanation["tolerance"], "explanation.tolerance", 0.0, MAX_TOLERANCE)
    if tolerance == 0:
        raise XaiSchemaError("explanation.tolerance doit être strictement positive")

    rows = explanation["contributions"]
    if not isinstance(rows, list) or len(rows) != len(expected_features):
        raise XaiSchemaError(f"explanation.contributions : {len(expected_features)} variables attendues")
    seen, contribs = set(), {}
    for index, row in enumerate(rows):
        path = f"explanation.contributions[{index}]"
        _exact_keys(row, CONTRIBUTION_KEYS, path)
        feature = row["feature"]
        if feature not in expected_features:
            raise XaiSchemaError(f"{path}.feature : variable inattendue {feature!r}")
        if feature in seen:
            raise XaiSchemaError(f"{path}.feature : variable dupliquée {feature!r}")
        seen.add(feature)
        if row["rank"] != index + 1 or isinstance(row["rank"], bool):
            raise XaiSchemaError(f"{path}.rank : {index + 1} attendu")
        label = LABELS[feature]
        if (row["label_fr"], row["group"], row["unit"]) != (label.label_fr, label.group, label.unit):
            raise XaiSchemaError(f"{path} : libellé, groupe ou unité différents de labels.py")
        value = _number(row["value"], f"{path}.value")
        if row["value_display"] != display_value(feature, value):
            raise XaiSchemaError(f"{path}.value_display incohérent avec la valeur")
        contribution = _number(row["contribution"], f"{path}.contribution", -1.0, 1.0)
        if row["direction"] != _direction(contribution):
            raise XaiSchemaError(f"{path}.direction incohérente avec le signe de la contribution")
        contribs[feature] = contribution
    keys = [(-abs(contribs[r["feature"]]), expected_features.index(r["feature"])) for r in rows]
    if keys != sorted(keys):
        raise XaiSchemaError("explanation.contributions : tri par contribution absolue décroissante attendu")

    total = math.fsum(contribs.values())
    declared_sum = _number(explanation["contributions_sum"], "explanation.contributions_sum")
    if abs(declared_sum - total) > CONSISTENCY_TOLERANCE:
        raise XaiSchemaError("explanation.contributions_sum différent de la somme des contributions")
    error = abs(base + total - probability)
    declared_error = _number(explanation["additivity_error"], "explanation.additivity_error", 0.0)
    if abs(declared_error - error) > CONSISTENCY_TOLERANCE:
        raise XaiSchemaError("explanation.additivity_error différent de |base + somme - probabilité|")
    if error > tolerance:
        raise XaiSchemaError(
            f"Additivité non respectée : base {base} + somme {total} = {base + total}, probabilité {probability} "
            f"(écart {error:.3g} > tolérance {tolerance:.3g})"
        )

    groups = explanation["groups"]
    if not isinstance(groups, list) or len(groups) != len(GROUPS):
        raise XaiSchemaError(f"explanation.groups : {len(GROUPS)} groupes attendus")
    for index, (row, group) in enumerate(zip(groups, GROUPS)):
        path = f"explanation.groups[{index}]"
        _exact_keys(row, GROUP_KEYS, path)
        if row["group"] != group.name or row["label_fr"] != group.label_fr or row["features"] != list(group.features):
            raise XaiSchemaError(f"{path} : groupe différent de labels.py ({group.name} attendu)")
        value = _number(row["contribution"], f"{path}.contribution")
        if abs(value - math.fsum(contribs[f] for f in group.features)) > CONSISTENCY_TOLERANCE:
            raise XaiSchemaError(f"{path}.contribution différente de la somme de ses variables")

    top_k = explanation["top_k"]
    if isinstance(top_k, bool) or not isinstance(top_k, int) or not 1 <= top_k <= len(expected_features):
        raise XaiSchemaError(f"explanation.top_k : entier entre 1 et {len(expected_features)} attendu")


def _check_texts(summary, warnings, synthetic: bool) -> None:
    _text(summary, "summary_fr")
    if not isinstance(warnings, list) or not all(isinstance(w, str) for w in warnings):
        raise XaiSchemaError("warnings : liste de textes attendue")
    for required in (WARNING_MODEL_NOT_MARKET, WARNING_NO_PROFIT):
        if required not in warnings:
            raise XaiSchemaError(f"Avertissement obligatoire manquant : {required}")
    if synthetic != (WARNING_SYNTHETIC in warnings) or synthetic != summary.startswith(SYNTHETIC_PREFIX):
        raise XaiSchemaError("Une réponse synthétique doit être signalée comme telle (et une réponse réelle ne doit pas l'être)")


def _summary(top_rows: list[dict], probability: float, base: float, state: str, origin: str) -> str:
    def points(c: float) -> str:
        return f"{c * 100:+.2f} pt".replace(".", ",")

    def percent(x: float) -> str:
        return f"{x * 100:.1f} %".replace(".", ",")

    up = [f"{r['label_fr']} ({points(r['contribution'])})" for r in top_rows if r["direction"] == DIRECTION_UP]
    down = [f"{r['label_fr']} ({points(r['contribution'])})" for r in top_rows if r["direction"] == DIRECTION_DOWN]
    parts = [f"Le modèle estime la probabilité de hausse à {percent(probability)} (valeur de base {percent(base)}) ; état {state}."]
    if up:
        parts.append("Variables qui ont le plus poussé vers la hausse : " + ", ".join(up) + ".")
    if down:
        parts.append("Variables qui ont le plus poussé vers la baisse : " + ", ".join(down) + ".")
    parts.append("Ces contributions décrivent le modèle, pas les causes du marché.")
    text = " ".join(parts)
    return SYNTHETIC_PREFIX + text if origin == ORIGIN_SYNTHETIC else text


def _named_numbers(source, expected: tuple[str, ...], name: str) -> dict[str, float]:
    pairs = list(source.items()) if isinstance(source, Mapping) else list(source)
    result: dict[str, float] = {}
    for item in pairs:
        if not isinstance(item, tuple) or len(item) != 2:
            raise XaiSchemaError(f"{name} : paires (variable, valeur) attendues")
        feature, value = item
        if feature not in expected:
            raise XaiSchemaError(f"{name} : variable inattendue {feature!r}")
        if feature in result:
            raise XaiSchemaError(f"{name} : variable dupliquée {feature!r}")
        result[feature] = _number(value, f"{name}.{feature}")
    missing = [f for f in expected if f not in result]
    if missing:
        raise XaiSchemaError(f"{name} : variables manquantes {missing}")
    return result


def _direction(contribution: float) -> str:
    if abs(contribution) <= CONSISTENCY_TOLERANCE:
        return DIRECTION_NEUTRAL
    return DIRECTION_UP if contribution > 0 else DIRECTION_DOWN


def _exact_keys(obj, keys: tuple[str, ...], path: str) -> None:
    where = path or "réponse"
    if not isinstance(obj, dict):
        raise XaiSchemaError(f"{where} : objet attendu")
    missing = [k for k in keys if k not in obj]
    extra = sorted(set(obj) - set(keys))
    if missing:
        raise XaiSchemaError(f"{where} : champs manquants {missing}")
    if extra:
        raise XaiSchemaError(f"{where} : champs inattendus {extra}")


def _number(value, path: str, low: float | None = None, high: float | None = None) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise XaiSchemaError(f"{path} : nombre attendu")
    value = float(value)
    if not math.isfinite(value):
        raise XaiSchemaError(f"{path} : valeur non finie ({value})")
    if (low is not None and value < low) or (high is not None and value > high):
        raise XaiSchemaError(f"{path} : {value} hors de [{low}, {high}]")
    return value


def _text(value, path: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise XaiSchemaError(f"{path} : texte non vide attendu")
