"""Comparaison sur validation : journalisation, reproductibilité, refus de signal, artefacts, registre."""

import json

import pytest

np = pytest.importorskip("numpy")
pytest.importorskip("sklearn")

from cryptotrade_ai.data.binance_archive import sha256_file  # noqa: E402
from cryptotrade_ai.training import TrainingError  # noqa: E402
from cryptotrade_ai.training import experiment as experiment_module  # noqa: E402
from cryptotrade_ai.training.artifacts import append_registry, library_versions, load_model, models_root, save_model  # noqa: E402
from cryptotrade_ai.training.config import load_training_config  # noqa: E402
from cryptotrade_ai.training.experiment import run_experiment  # noqa: E402
from synthetic_training import DATASET_ID, make_rows, write_fixture  # noqa: E402

NOW = 1_767_225_600_000  # 2026-01-01T00:00:00Z
EXPECTED_TRIALS = 2 + 5 + 2


def _run(data_dir, config_path, now=NOW):
    return run_experiment(load_training_config(config_path), data_dir=data_dir, config_path=config_path, now_ms=now, record_git=False)


def test_all_trials_are_logged_with_artifacts(tmp_path):
    data_dir, config_path = write_fixture(tmp_path)
    result = _run(data_dir, config_path)
    folder = models_root(data_dir, DATASET_ID) / "experiments" / result["run_id"]
    experiment = json.loads((folder / "experiment.json").read_text(encoding="utf-8"))
    assert len(experiment["essais"]) == EXPECTED_TRIALS
    assert [t["type"] for t in experiment["essais"]][:2] == ["baseline", "baseline"]
    for trial in experiment["essais"]:
        trial_dir = folder / trial["dossier"]
        assert sha256_file(trial_dir / "model.joblib") == trial["sha256_modele"]
        assert sha256_file(trial_dir / "predictions_validation.csv") == trial["sha256_predictions_validation"]
        metadata = json.loads((trial_dir / "metadata.json").read_text(encoding="utf-8"))
        assert metadata["versions"]["scikit-learn"] and metadata["versions"]["numpy"]
        assert metadata["variables"][0] == "ret_1h" and len(metadata["variables"]) == 17
        assert metadata["dataset"]["sha256_dataset_csv"]
        assert metadata["graine"] == 42 and metadata["date_entrainement_utc"] == "2026-01-01T00:00:00.000Z"
    assert experiment["effectifs"]["test_non_lu"] > 0
    assert sha256_file(folder / "comparison.json") == experiment["sha256_comparison"]
    registry = json.loads((models_root(data_dir, DATASET_ID) / "registry.json").read_text(encoding="utf-8"))
    assert [e["type"] for e in registry["entrees"]] == ["experience"]
    assert not list(folder.parent.glob("*.part"))


def test_useful_model_is_retained_with_authorized_signal(tmp_path):
    data_dir, config_path = write_fixture(tmp_path)
    comparison = _run(data_dir, config_path)["comparaison"]
    assert comparison["statut_signal"] == "AUTORISE", comparison["raisons_refus"]
    retained = next(c for c in comparison["comparaisons"] if c["trial_id"] == comparison["retenu"])
    assert retained["eligible"] and retained["difference_vs_meilleure_baseline"]["borne_haute"] < 0
    assert all(retained["log_loss_validation"] < loss for loss in comparison["log_loss_baselines"].values())
    assert [row["couverture_cible"] for row in comparison["diagnostic_couverture_validation"]] == [1.0, 0.5, 0.25, 0.1]


def test_no_signal_means_refusal(tmp_path):
    data_dir, config_path = write_fixture(tmp_path, rows=make_rows(signal=0.0))
    comparison = _run(data_dir, config_path)["comparaison"]
    assert comparison["statut_signal"] == "REFUSE"
    assert comparison["retenu"] is None
    assert comparison["raisons_refus"] and comparison["diagnostic_couverture_validation"] is None


def test_runs_are_reproducible(tmp_path):
    data_dir, config_path = write_fixture(tmp_path)
    first = _run(data_dir, config_path, now=NOW)
    second = _run(data_dir, config_path, now=NOW + 1000)
    assert first["run_id"] != second["run_id"]
    keys = ("trial_id", "log_loss_validation", "brier_validation", "roc_auc_validation", "accuracy_validation", "sha256_predictions_validation")
    assert [{k: t[k] for k in keys} for t in first["essais"]] == [{k: t[k] for k in keys} for t in second["essais"]]
    assert first["comparaison"]["retenu"] == second["comparaison"]["retenu"]


def test_experiment_never_parses_test_rows(tmp_path):
    data_dir, config_path = write_fixture(tmp_path, test_garbage=True)
    assert _run(data_dir, config_path)["comparaison"]["retenu"] is not None


def test_existing_experiment_is_not_replaced(tmp_path):
    data_dir, config_path = write_fixture(tmp_path)
    _run(data_dir, config_path)
    with pytest.raises(TrainingError, match="déjà présente"):
        _run(data_dir, config_path)


def test_failure_leaves_no_partial_experiment(tmp_path, monkeypatch):
    data_dir, config_path = write_fixture(tmp_path)

    def broken(*args, **kwargs):
        raise TrainingError("panne simulée")

    monkeypatch.setattr(experiment_module, "select_model", broken)
    with pytest.raises(TrainingError, match="panne simulée"):
        _run(data_dir, config_path)
    root = models_root(data_dir, DATASET_ID)
    assert not list((root / "experiments").iterdir())
    assert not (root / "registry.json").exists()


def test_invalid_dataset_stops_before_any_output(tmp_path):
    data_dir, config_path = write_fixture(tmp_path)
    with (data_dir / "datasets" / "SYNTHETIQUE-entrainement" / "dataset.csv").open("a", encoding="utf-8") as handle:
        handle.write("\n")
    with pytest.raises(TrainingError, match="SHA-256"):
        _run(data_dir, config_path)
    assert not (data_dir / "models").exists()


def test_model_loading_checks_sha256_and_versions(tmp_path):
    path = tmp_path / "model.joblib"
    sha = save_model({"factice": 1}, path)
    versions = library_versions()
    assert load_model(path, expected_sha256=sha, expected_versions=versions) == {"factice": 1}
    with pytest.raises(TrainingError, match="déjà présent"):
        save_model({"autre": 2}, path)
    with pytest.raises(TrainingError, match="Version de scikit-learn"):
        load_model(path, expected_sha256=sha, expected_versions={**versions, "scikit-learn": "0.0"})
    path.write_bytes(path.read_bytes() + b"x")
    with pytest.raises(TrainingError, match="SHA-256"):
        load_model(path, expected_sha256=sha, expected_versions=versions)


def test_registry_appends_and_refuses_corrupted_file(tmp_path):
    append_registry(tmp_path, {"n": 1})
    append_registry(tmp_path, {"n": 2})
    assert json.loads((tmp_path / "registry.json").read_text(encoding="utf-8"))["entrees"] == [{"n": 1}, {"n": 2}]
    (tmp_path / "registry.json").write_text("[]", encoding="utf-8")
    with pytest.raises(TrainingError, match="Registre"):
        append_registry(tmp_path, {"n": 3})
