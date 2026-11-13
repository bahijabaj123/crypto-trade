"""Métriques, calibration, bootstrap par blocs et logique ATTENDRE."""

import math

import pytest

np = pytest.importorskip("numpy")
pytest.importorskip("sklearn")

from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score  # noqa: E402

from cryptotrade_ai.training.decision import (  # noqa: E402
    ATTENDRE,
    BAISSE,
    HAUSSE,
    REFUSED_POLICY,
    DecisionPolicy,
    coverage_table,
    decide,
    decision_summary,
    margin_for_coverage,
)
from cryptotrade_ai.training.metrics import (  # noqa: E402
    block_bootstrap_mean,
    calibration_check,
    calibration_table,
    classification_metrics,
)


def test_metrics_on_a_hand_checked_example():
    y = np.array([1, 0, 1, 0])
    p = np.array([0.8, 0.3, 0.4, 0.1])
    m = classification_metrics(y, p)
    assert m["log_loss"] == pytest.approx(log_loss(y, p))
    assert m["log_loss"] == pytest.approx(-(math.log(0.8) + math.log(0.7) + math.log(0.4) + math.log(0.9)) / 4)
    assert m["brier"] == pytest.approx(brier_score_loss(y, p))
    assert m["roc_auc"] == pytest.approx(roc_auc_score(y, p))
    assert m["accuracy"] == pytest.approx(0.75)
    assert m["matrice_confusion"] == {"vrais_negatifs": 2, "faux_positifs": 0, "faux_negatifs": 1, "vrais_positifs": 1}


def test_explicit_predictions_override_the_half_threshold():
    y = np.array([1, 0, 1])
    m = classification_metrics(y, np.array([0.51, 0.51, 0.51]), np.array([1, 1, 1]))
    assert m["accuracy"] == pytest.approx(2 / 3)
    assert m["part_predite_hausse"] == 1.0


def test_constant_probability_has_auc_one_half_and_log_loss_near_ln2():
    rng = np.random.default_rng(0)
    y = rng.integers(0, 2, 5000)
    m = classification_metrics(y, np.full(5000, 0.5))
    assert m["roc_auc"] == pytest.approx(0.5)
    assert m["log_loss"] == pytest.approx(math.log(2))
    assert m["brier"] == pytest.approx(0.25)


def test_auc_is_none_with_a_single_class():
    assert classification_metrics(np.ones(4, dtype=int), np.full(4, 0.6))["roc_auc"] is None


def test_calibration_table_uses_equal_count_groups():
    p = np.linspace(0.3, 0.7, 100)
    y = (np.arange(100) % 2).astype(int)
    rows, ece = calibration_table(y, p, 10)
    assert [r["exemples"] for r in rows] == [10] * 10
    assert rows[0]["proba_max"] <= rows[1]["proba_min"]
    expected = sum(r["exemples"] / 100 * abs(r["proba_moyenne"] - r["frequence_hausse_observee"]) for r in rows)
    assert ece == pytest.approx(expected)


def test_calibration_check_rarely_refuses_calibrated_and_always_refuses_overconfident():
    refused_calibrated = refused_overconfident = 0
    for seed in range(40):
        rng = np.random.default_rng(seed)
        p = rng.uniform(0.3, 0.7, 2000)
        y = (rng.random(2000) < p).astype(int)
        overconfident = np.clip(0.5 + 3 * (p - 0.5), 0.01, 0.99)
        check = dict(n_bins=10, n_simulations=200, confidence=0.95, seed=42)
        refused_calibrated += not calibration_check(y, p, **check)["suffisante"]
        refused_overconfident += not calibration_check(y, overconfident, **check)["suffisante"]
    # Un seuil au quantile 95 % refuse à tort environ 5 % des modèles parfaitement calibrés.
    assert refused_calibrated <= 6
    assert refused_overconfident == 40


def test_calibration_check_is_reproducible():
    rng = np.random.default_rng(2)
    p = rng.uniform(0.4, 0.6, 1000)
    y = rng.integers(0, 2, 1000)
    first = calibration_check(y, p, n_bins=10, n_simulations=200, confidence=0.95, seed=7)
    assert first == calibration_check(y, p, n_bins=10, n_simulations=200, confidence=0.95, seed=7)


def test_block_bootstrap_is_reproducible_and_brackets_the_mean():
    rng = np.random.default_rng(3)
    values = rng.normal(-0.01, 0.05, 2000)
    first = block_bootstrap_mean(values, block=168, n_resamples=500, confidence=0.95, seed=42)
    assert first == block_bootstrap_mean(values, block=168, n_resamples=500, confidence=0.95, seed=42)
    assert first["borne_basse"] < first["moyenne"] < first["borne_haute"]


def test_decision_states_and_margin():
    p = np.array([0.50, 0.53, 0.60, 0.47, 0.40, 0.56])
    policy = DecisionPolicy(signal_authorized=True, margin=0.05)
    assert decide(p, policy).tolist() == [ATTENDRE, ATTENDRE, HAUSSE, ATTENDRE, BAISSE, HAUSSE]


def test_refused_or_unfrozen_policy_always_waits():
    p = np.array([0.9, 0.1, 0.5])
    assert decide(p, REFUSED_POLICY).tolist() == [ATTENDRE] * 3
    assert decide(p, DecisionPolicy(signal_authorized=True, margin=None)).tolist() == [ATTENDRE] * 3


def test_margin_matches_requested_coverage():
    rng = np.random.default_rng(4)
    p = rng.uniform(0.3, 0.7, 10_000)
    for coverage in (1.0, 0.5, 0.25, 0.1):
        states = decide(p, DecisionPolicy(True, margin_for_coverage(p, coverage)))
        assert np.mean(states != ATTENDRE) == pytest.approx(coverage, abs=0.01)


def test_decision_summary_and_coverage_table():
    p = np.array([0.7, 0.3, 0.5, 0.6])
    y = np.array([1, 1, 0, 0])
    fwd = np.array([0.01, 0.02, -0.01, -0.03])
    summary = decision_summary(decide(p, DecisionPolicy(True, 0.05)), y, fwd, fee_per_side=0.001)
    assert (summary["hausse"], summary["baisse"], summary["attendre"]) == (2, 1, 1)
    assert summary["exactitude_des_signaux"] == pytest.approx(1 / 3)
    assert summary["rendement_log_moyen_brut_hausse"] == pytest.approx(-0.01)
    assert summary["rendement_log_moyen_net_hausse"] == pytest.approx(-0.012)
    assert "ne garantit aucun profit" in summary["avertissement"]
    table = coverage_table(p, y, fwd, (1.0, 0.5), fee_per_side=0.001)
    assert [row["couverture_cible"] for row in table] == [1.0, 0.5]
