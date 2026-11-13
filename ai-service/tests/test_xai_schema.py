"""Tests synthétiques du format XAI ``xai-1.0`` et des libellés (aucun modèle, aucune donnée réelle)."""

from __future__ import annotations

import copy
import json
import math
from pathlib import Path

import pytest

pytest.importorskip("numpy")

import numpy as np  # noqa: E402

from cryptotrade_ai.dataset.features import FEATURE_NAMES, FORBIDDEN_INPUT_COLUMNS  # noqa: E402
from cryptotrade_ai.training.decision import ATTENDRE, BAISSE, HAUSSE, DecisionPolicy, decide  # noqa: E402
from cryptotrade_ai.xai import XaiError, XaiSchemaError  # noqa: E402
from cryptotrade_ai.xai.labels import GROUPS, LABELS, UNITS, check_labels, display_value  # noqa: E402
from cryptotrade_ai.xai.schema import (  # noqa: E402
    ORIGIN_REAL,
    ORIGIN_SYNTHETIC,
    SCHEMA_VERSION,
    SYNTHETIC_PREFIX,
    SYNTHETIC_SHA256,
    WARNING_MODEL_NOT_MARKET,
    WARNING_NO_PROFIT,
    WARNING_SYNTHETIC,
    ModelReference,
    build_explanation,
    expected_state,
    to_json,
    validate_explanation,
)

CONFIG_DIR = Path(__file__).resolve().parents[1] / "config"

SYNTHETIC_MODEL = ModelReference("BTCUSDT-1h-v1", "synthetique", "synthetique", SYNTHETIC_SHA256, SYNTHETIC_SHA256)
FAKE_REAL_MODEL = ModelReference("BTCUSDT-1h-v1", "exp-test", "01", "ab" * 32, "cd" * 32)
OPEN_MS = 1_735_689_600_000  # 2025-01-01T00:00:00Z

VALUES = dict(zip(FEATURE_NAMES, (
    0.004, -0.002, 0.001, 0.01, -0.015, 0.004, 0.006, 0.008, 58.0, 0.0004,
    0.006, -0.01, 0.2, 0.1, 0.53, 0.5, -0.866,
)))
CONTRIBUTIONS = dict(zip(FEATURE_NAMES, (
    0.030, -0.012, 0.004, 0.021, -0.006, 0.0, 0.002, -0.003, 0.008, -0.001,
    0.005, -0.002, 0.001, -0.004, 0.009, 0.0005, -0.0005,
)))
BASE = 0.5
MARGIN = 0.05


def total() -> float:
    return math.fsum(CONTRIBUTIONS.values())


def build(**overrides) -> dict:
    kwargs = dict(
        model=SYNTHETIC_MODEL,
        candle_open_time_ms=OPEN_MS,
        feature_values=VALUES,
        contributions=CONTRIBUTIONS,
        base_value=BASE,
        probability_up=BASE + total(),
        signal_authorized=True,
        margin=MARGIN,
        method="synthetique",
        library=None,
        data_origin=ORIGIN_SYNTHETIC,
    )
    kwargs.update(overrides)
    return build_explanation(**kwargs)


# --- Libellés -------------------------------------------------------------------------------


def test_labels_cover_the_17_real_features_in_config_order():
    training = json.loads((CONFIG_DIR / "training" / "btcusdt_1h_v1.json").read_text(encoding="utf-8"))
    dataset = json.loads((CONFIG_DIR / "datasets" / "btcusdt_1h_v1.json").read_text(encoding="utf-8"))
    assert len(FEATURE_NAMES) == 17
    assert tuple(training["features"]) == FEATURE_NAMES
    assert tuple(dataset["features"]) == FEATURE_NAMES
    assert tuple(LABELS) == FEATURE_NAMES
    assert not set(LABELS) & FORBIDDEN_INPUT_COLUMNS


def test_every_label_has_text_known_unit_and_one_group():
    for label in LABELS.values():
        assert label.label_fr.strip() and label.description_fr.strip()
        assert label.unit in UNITS
    grouped = [f for group in GROUPS for f in group.features]
    assert sorted(grouped) == sorted(FEATURE_NAMES)
    assert len(grouped) == len(set(grouped))
    assert {g.name: g.features for g in GROUPS}["heure"] == ("hour_sin", "hour_cos")


@pytest.mark.parametrize(
    "names",
    [
        FEATURE_NAMES[:-1],
        FEATURE_NAMES + ("close",),
        (FEATURE_NAMES[1], FEATURE_NAMES[0]) + FEATURE_NAMES[2:],
        FEATURE_NAMES[:-1] + ("ret_1h",),
    ],
)
def test_check_labels_rejects_misaligned_feature_lists(names):
    with pytest.raises(XaiError, match="désalignés"):
        check_labels(names)


def test_display_value_is_readable_french():
    assert display_value("ret_1h", math.log(1.01)) == "+1,00 %"
    assert display_value("rsi_14", 58.0) == "58,0"
    assert display_value("taker_buy_ratio", 0.53) == "53,00 %"
    assert display_value("quote_volume_rel_24h", math.log(2.0)) == "× 2,00 la moyenne 24 h"
    assert display_value("dist_sma_24", -0.01) == "-1,000 %"
    assert display_value("hour_cos", -0.866) == "-0,866"


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf, True, "1.0", None])
def test_display_value_rejects_non_finite_or_non_numeric(value):
    with pytest.raises(XaiError):
        display_value("ret_1h", value)


def test_display_value_rejects_unknown_feature():
    with pytest.raises(XaiError, match="inconnue"):
        display_value("close", 1.0)


# --- Construction ---------------------------------------------------------------------------


def test_valid_synthetic_response_structure():
    payload = build()
    assert payload["schema_version"] == SCHEMA_VERSION
    assert payload["data_origin"] == ORIGIN_SYNTHETIC
    assert payload["candle_open_time_utc"] == "2025-01-01T00:00:00.000Z"
    assert payload["decision_time_utc"] == "2025-01-01T01:00:00.000Z"
    assert payload["prediction"]["state"] == HAUSSE
    assert payload["prediction"]["threshold_up"] == pytest.approx(0.55)
    rows = payload["explanation"]["contributions"]
    assert [r["rank"] for r in rows] == list(range(1, 18))
    assert sorted(r["feature"] for r in rows) == sorted(FEATURE_NAMES)
    assert rows[0]["feature"] == "ret_1h"
    assert [abs(r["contribution"]) for r in rows] == sorted((abs(r["contribution"]) for r in rows), reverse=True)
    assert payload["explanation"]["additivity_error"] < 1e-12
    assert payload["summary_fr"].startswith(SYNTHETIC_PREFIX)
    assert "pas les causes du marché" in payload["summary_fr"]
    assert WARNING_SYNTHETIC in payload["warnings"]
    assert WARNING_MODEL_NOT_MARKET in payload["warnings"] and WARNING_NO_PROFIT in payload["warnings"]


def test_positive_negative_and_neutral_directions():
    rows = {r["feature"]: r for r in build()["explanation"]["contributions"]}
    assert rows["ret_1h"]["direction"] == "vers_hausse"
    assert rows["ret_1h_lag1"]["direction"] == "vers_baisse"
    assert rows["volatility_6h"]["direction"] == "neutre"


def test_group_contributions_are_sums_of_their_features():
    groups = {g["group"]: g for g in build()["explanation"]["groups"]}
    assert groups["heure"]["contribution"] == pytest.approx(0.0, abs=1e-15)
    assert groups["rendements_recents"]["contribution"] == pytest.approx(0.030 - 0.012 + 0.004)
    assert math.fsum(g["contribution"] for g in groups.values()) == pytest.approx(total())


@pytest.mark.parametrize(
    ("probability", "state"),
    [(0.60, HAUSSE), (0.551, HAUSSE), (0.54, ATTENDRE), (0.50, ATTENDRE), (0.46, ATTENDRE), (0.449, BAISSE), (0.30, BAISSE)],
)
def test_three_states_follow_the_decision_rule(probability, state):
    payload = build(probability_up=probability, base_value=probability - total())
    assert payload["prediction"]["state"] == state


def test_refused_policy_always_waits_with_null_thresholds():
    payload = build(signal_authorized=False, margin=None, probability_up=0.9, base_value=0.9 - total())
    assert payload["prediction"]["state"] == ATTENDRE
    assert payload["prediction"]["margin"] is None
    assert payload["prediction"]["threshold_up"] is None and payload["prediction"]["threshold_down"] is None


def test_expected_state_matches_training_decision():
    probabilities = np.linspace(0.0, 1.0, 201)
    policy = DecisionPolicy(signal_authorized=True, margin=MARGIN)
    assert [expected_state(float(p), True, MARGIN) for p in probabilities] == list(decide(probabilities, policy))


def test_pairs_are_accepted_like_a_mapping():
    pairs = list(CONTRIBUTIONS.items())
    assert build(contributions=pairs) == build()


@pytest.mark.parametrize("bad", [math.nan, math.inf, -math.inf, True, None, "0.1"])
@pytest.mark.parametrize("field", ["contributions", "feature_values"])
def test_builder_rejects_non_finite_inputs(field, bad):
    source = dict(CONTRIBUTIONS if field == "contributions" else VALUES)
    source["rsi_14"] = bad
    with pytest.raises(XaiSchemaError):
        build(**{field: source})


@pytest.mark.parametrize("field", ["base_value", "probability_up"])
@pytest.mark.parametrize("bad", [math.nan, math.inf, -0.1, 1.1])
def test_builder_rejects_bad_base_or_probability(field, bad):
    with pytest.raises(XaiSchemaError):
        build(**{field: bad})


def test_builder_rejects_missing_duplicated_and_unexpected_features():
    missing = dict(CONTRIBUTIONS)
    del missing["hour_cos"]
    with pytest.raises(XaiSchemaError, match="manquantes"):
        build(contributions=missing)
    with pytest.raises(XaiSchemaError, match="dupliquée"):
        build(contributions=list(CONTRIBUTIONS.items()) + [("ret_1h", 0.0)])
    with pytest.raises(XaiSchemaError, match="inattendue"):
        build(contributions={**CONTRIBUTIONS, "close": 0.0})


def test_additivity_tolerance():
    p = BASE + total()
    build(probability_up=p + 5e-7)
    with pytest.raises(XaiSchemaError, match="Additivité"):
        build(probability_up=p + 2e-6)
    with pytest.raises(XaiSchemaError, match="Additivité"):
        build(probability_up=p + 1e-4, tolerance=1e-6)


def test_synthetic_cannot_be_presented_as_real():
    with pytest.raises(XaiSchemaError):
        build(data_origin=ORIGIN_REAL)
    with pytest.raises(XaiSchemaError):
        build(data_origin=ORIGIN_REAL, method="tree_shap_path_dependent", library="shap")
    with pytest.raises(XaiSchemaError):
        build(model=FAKE_REAL_MODEL)
    real = build(model=FAKE_REAL_MODEL, data_origin=ORIGIN_REAL, method="tree_shap_path_dependent", library="shap")
    assert real["data_origin"] == ORIGIN_REAL
    assert WARNING_SYNTHETIC not in real["warnings"]
    assert not real["summary_fr"].startswith(SYNTHETIC_PREFIX)
    assert real["model"]["sha256_model"] == "ab" * 32


def test_to_json_is_strict_and_round_trips():
    payload = build()
    text = to_json(payload)
    assert "NaN" not in text and "Infinity" not in text
    assert validate_explanation(json.loads(text)) == payload


# --- Validation d'une réponse altérée ---------------------------------------------------------


def _swap_first_rows(p):
    rows = p["explanation"]["contributions"]
    rows[0], rows[1] = rows[1], rows[0]
    rows[0]["rank"], rows[1]["rank"] = 1, 2


TAMPERING = {
    "champ manquant": lambda p: p.pop("warnings"),
    "champ inattendu": lambda p: p.update(cause_du_marche="news"),
    "champ imbriqué inattendu": lambda p: p["model"].update(owner="x"),
    "version": lambda p: p.update(schema_version="xai-0.9"),
    "intervalle": lambda p: p.update(interval="4h"),
    "heure non alignée": lambda p: p.update(candle_open_time_utc="2025-01-01T00:30:00.000Z"),
    "décision décalée": lambda p: p.update(decision_time_utc="2025-01-01T02:00:00.000Z"),
    "sha256 invalide": lambda p: p["model"].update(sha256_selection="XYZ"),
    "synthétique déguisé": lambda p: p.update(data_origin=ORIGIN_REAL),
    "probabilité hors bornes": lambda p: p["prediction"].update(probability_up=1.5),
    "booléen comme nombre": lambda p: p["explanation"].update(base_value=True),
    "état incohérent": lambda p: p["prediction"].update(state=BAISSE),
    "état inconnu": lambda p: p["prediction"].update(state="ACHETER"),
    "seuil incohérent": lambda p: p["prediction"].update(threshold_up=0.6),
    "contribution NaN": lambda p: p["explanation"]["contributions"][3].update(contribution=math.nan),
    "valeur infinie": lambda p: p["explanation"]["contributions"][3].update(value=math.inf),
    "variable dupliquée": lambda p: p["explanation"]["contributions"][1].update(feature="ret_1h"),
    "variable inattendue": lambda p: p["explanation"]["contributions"][0].update(feature="close"),
    "variable manquante": lambda p: p["explanation"]["contributions"].pop(),
    "libellé modifié": lambda p: p["explanation"]["contributions"][0].update(label_fr="Cause du krach"),
    "affichage incohérent": lambda p: p["explanation"]["contributions"][0].update(value_display="+9 %"),
    "direction inversée": lambda p: p["explanation"]["contributions"][0].update(direction="vers_baisse"),
    "tri cassé": _swap_first_rows,
    "rang faux": lambda p: p["explanation"]["contributions"][0].update(rank=2),
    "somme déclarée fausse": lambda p: p["explanation"].update(contributions_sum=0.0),
    "base modifiée": lambda p: p["explanation"].update(base_value=0.4),
    "erreur d'additivité cachée": lambda p: p["explanation"].update(additivity_error=0.0, base_value=0.49),
    "tolérance nulle": lambda p: p["explanation"].update(tolerance=0.0),
    "tolérance trop large": lambda p: p["explanation"].update(tolerance=0.1),
    "espace de sortie": lambda p: p["explanation"].update(output_space="log_odds"),
    "méthode inconnue": lambda p: p["explanation"].update(method="lime"),
    "groupe modifié": lambda p: p["explanation"]["groups"][0].update(features=["ret_1h"]),
    "somme de groupe fausse": lambda p: p["explanation"]["groups"][0].update(contribution=1.0),
    "top_k invalide": lambda p: p["explanation"].update(top_k=0),
    "avertissement retiré": lambda p: p["warnings"].remove(WARNING_MODEL_NOT_MARKET),
    "mention synthétique retirée": lambda p: p.update(summary_fr=p["summary_fr"][len(SYNTHETIC_PREFIX):]),
    "résumé vide": lambda p: p.update(summary_fr="  "),
}


@pytest.mark.parametrize("name", sorted(TAMPERING))
def test_validation_rejects_tampered_response(name):
    payload = copy.deepcopy(build())
    TAMPERING[name](payload)
    with pytest.raises(XaiSchemaError):
        validate_explanation(payload)


def test_validation_rejects_non_object():
    with pytest.raises(XaiSchemaError):
        validate_explanation([])  # type: ignore[arg-type]
