"""Figeage de la sélection et évaluation finale unique du test (données synthétiques)."""

import json

import pytest

np = pytest.importorskip("numpy")
pytest.importorskip("sklearn")

from cryptotrade_ai.training import TestAccessError, TrainingError  # noqa: E402
from cryptotrade_ai.training.artifacts import models_root  # noqa: E402
from cryptotrade_ai.training.config import load_training_config  # noqa: E402
from cryptotrade_ai.training.experiment import run_experiment  # noqa: E402
from cryptotrade_ai.training.final_test import evaluate_final_test  # noqa: E402
from cryptotrade_ai.training.selection import freeze_selection  # noqa: E402
from synthetic_training import DATASET_ID, make_rows, write_dataset, write_fixture  # noqa: E402

NOW = 1_767_225_600_000


def _setup(tmp_path, rows=None):
    data_dir, config_path = write_fixture(tmp_path, rows=rows)
    config = load_training_config(config_path)
    result = run_experiment(config, data_dir=data_dir, config_path=config_path, now_ms=NOW, record_git=False)
    return data_dir, config_path, config, result


def _freeze(data_dir, config_path, config, result, coverage=0.5, **kwargs):
    return freeze_selection(
        config, data_dir=data_dir, config_path=config_path, run_id=result["run_id"], coverage=coverage, now_ms=NOW, **kwargs
    )


def _evaluate(data_dir, config_path, config, **kwargs):
    return evaluate_final_test(config, data_dir=data_dir, config_path=config_path, now_ms=NOW, **kwargs)


def _log(data_dir):
    return json.loads((models_root(data_dir, DATASET_ID) / "final_test_log.json").read_text(encoding="utf-8"))


def test_final_test_requires_a_frozen_selection(tmp_path):
    data_dir, config_path, config, _ = _setup(tmp_path)
    with pytest.raises(TestAccessError, match="Aucune sélection"):
        _evaluate(data_dir, config_path, config)
    assert not (models_root(data_dir, DATASET_ID) / "final_test_log.json").exists()


def test_coverage_must_come_from_the_declared_grid(tmp_path):
    data_dir, config_path, config, result = _setup(tmp_path)
    for coverage in (None, 0.3):
        with pytest.raises(TrainingError, match="grille"):
            _freeze(data_dir, config_path, config, result, coverage=coverage)


def test_frozen_selection_derives_margin_from_validation(tmp_path):
    data_dir, config_path, config, result = _setup(tmp_path)
    selection = _freeze(data_dir, config_path, config, result, coverage=0.25)
    policy = selection["politique_decision"]
    assert policy["signal_autorise"] and policy["couverture_cible"] == 0.25 and policy["marge"] > 0
    expected = next(
        row["marge"] for row in result["comparaison"]["diagnostic_couverture_validation"] if row["couverture_cible"] == 0.25
    )
    assert policy["marge"] == pytest.approx(expected)
    assert set(selection["modeles_figes"]) == {"constant_train_rate", "previous_hour_direction", selection["retenu"]}
    with pytest.raises(TrainingError, match="déjà figée"):
        _freeze(data_dir, config_path, config, result)


def test_refused_signal_is_frozen_as_always_wait(tmp_path):
    data_dir, config_path, config, result = _setup(tmp_path, rows=make_rows(signal=0.0))
    with pytest.raises(TrainingError, match="refusé"):
        _freeze(data_dir, config_path, config, result, coverage=0.5)
    selection = _freeze(data_dir, config_path, config, result, coverage=None)
    assert selection["retenu"] is None and not selection["politique_decision"]["signal_autorise"]
    report = _evaluate(data_dir, config_path, config)
    assert set(report["resultats"]) == {"constant_train_rate", "previous_hour_direction"}


def test_final_evaluation_is_logged_and_runs_once(tmp_path):
    data_dir, config_path, config, result = _setup(tmp_path)
    selection = _freeze(data_dir, config_path, config, result)
    report = _evaluate(data_dir, config_path, config)
    retained = report["resultats"][selection["retenu"]]
    assert {"log_loss", "brier", "roc_auc", "accuracy", "matrice_confusion"} <= set(retained["metriques"])
    assert retained["decisions"]["attendre"] > 0
    log = _log(data_dir)
    assert [(e["id"], e["statut"]) for e in log["evaluations"]] == [("final-1", "terminee")]

    with pytest.raises(TestAccessError, match="déjà été évalué"):
        _evaluate(data_dir, config_path, config)
    with pytest.raises(TrainingError, match="ne peut plus changer"):
        _freeze(data_dir, config_path, config, result, overwrite=True)

    _evaluate(data_dir, config_path, config, repeat_reason="vérification demandée par l'encadrant")
    log = _log(data_dir)
    assert [e["id"] for e in log["evaluations"]] == ["final-1", "final-2"]
    assert log["evaluations"][1]["motif_repetition"] == "vérification demandée par l'encadrant"
    registry = json.loads((models_root(data_dir, DATASET_ID) / "registry.json").read_text(encoding="utf-8"))
    assert [e["type"] for e in registry["entrees"]] == ["experience", "selection", "evaluation_finale_test", "evaluation_finale_test"]


def test_tampered_model_is_refused_before_reading_test(tmp_path):
    data_dir, config_path, config, result = _setup(tmp_path)
    selection = _freeze(data_dir, config_path, config, result)
    model_path = models_root(data_dir, DATASET_ID) / selection["modeles_figes"][selection["retenu"]]["chemin"]
    model_path.write_bytes(model_path.read_bytes() + b"x")
    with pytest.raises(TrainingError, match="SHA-256 du modèle"):
        _evaluate(data_dir, config_path, config)
    assert not (models_root(data_dir, DATASET_ID) / "final_test_log.json").exists()


def test_changed_dataset_is_refused_and_attempt_is_logged(tmp_path):
    data_dir, config_path, config, result = _setup(tmp_path)
    _freeze(data_dir, config_path, config, result)
    write_dataset(data_dir, make_rows(seed=99))
    with pytest.raises(TrainingError, match="dataset a changé"):
        _evaluate(data_dir, config_path, config)
    entry = _log(data_dir)["evaluations"][0]
    assert entry["statut"] == "echec" and "dataset a changé" in entry["erreur"]


def test_changed_training_config_is_refused(tmp_path):
    data_dir, config_path, config, result = _setup(tmp_path)
    _freeze(data_dir, config_path, config, result)
    config_path.write_text(config_path.read_text(encoding="utf-8") + "\n", encoding="utf-8")
    with pytest.raises(TrainingError, match="configuration"):
        _evaluate(data_dir, config_path, config)
