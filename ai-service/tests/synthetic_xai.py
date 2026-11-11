"""Sélection figée SYNTHÉTIQUE pour tester l'explainer (dossier temporaire, jamais les vrais artefacts).

La forêt est entraînée sur des données aléatoires où ``ret_1h`` pousse vers la hausse et
``taker_buy_ratio`` vers la baisse : de quoi vérifier le sens des contributions.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline

from cryptotrade_ai.data.binance_archive import sha256_file
from cryptotrade_ai.dataset.features import FEATURE_NAMES
from cryptotrade_ai.training.artifacts import library_versions, models_root, save_model, write_json_atomic
from cryptotrade_ai.training.config import DEFAULT_TRAINING_CONFIG_PATH, load_training_config

RUN_ID = "20250101T000000Z-synthet0"
RETAINED = "random_forest-synthetique"
BASELINE = "constant_train_rate"
TRIAL_FOLDER = str(Path("trials") / "02")
MARGIN = 0.05
UP_INDEX = FEATURE_NAMES.index("ret_1h")
DOWN_INDEX = FEATURE_NAMES.index("taker_buy_ratio")


def synthetic_rows(n: int, seed: int = 0) -> np.ndarray:
    return np.random.default_rng(seed).normal(size=(n, len(FEATURE_NAMES)))


def synthetic_labels(X: np.ndarray, seed: int = 1) -> np.ndarray:
    noise = np.random.default_rng(seed).normal(scale=0.7, size=len(X))
    return (X[:, UP_INDEX] - 0.6 * X[:, DOWN_INDEX] + noise > 0).astype(int)


def make_forest(seed: int = 7, n_estimators: int = 25) -> Pipeline:
    X = synthetic_rows(1500)
    forest = RandomForestClassifier(
        n_estimators=n_estimators, max_depth=4, min_samples_leaf=20, max_features="sqrt", random_state=seed, n_jobs=1
    )
    return Pipeline([("model", forest)]).fit(X, synthetic_labels(X))


def as_mapping(row) -> dict[str, float]:
    return {name: float(value) for name, value in zip(FEATURE_NAMES, row)}


def copy_training_config(tmp_path: Path) -> Path:
    path = Path(tmp_path) / "training_config.json"
    path.write_bytes(Path(DEFAULT_TRAINING_CONFIG_PATH).read_bytes())
    return path


def write_frozen_selection(
    tmp_path: Path,
    model,
    *,
    policy: dict | None = None,
    signal: str = "AUTORISE",
    edit_metadata=None,
    edit_experiment=None,
    edit_selection=None,
) -> tuple[Path, Path]:
    """Écrit modèle, metadata.json, experiment.json et selection.json cohérents ; renvoie (data_dir, config)."""
    config_path = copy_training_config(tmp_path)
    config = load_training_config(config_path)
    data_dir = Path(tmp_path) / "data"
    root = models_root(data_dir, config.dataset_id)
    experiment_dir = root / "experiments" / RUN_ID
    versions = library_versions()

    model_sha = save_model(model, experiment_dir / TRIAL_FOLDER / "model.joblib")
    metadata = {
        "run_id": RUN_ID,
        "trial_id": RETAINED,
        "sha256_modele": model_sha,
        "versions": versions,
        "variables": list(config.features),
        "cible": config.target,
        "colonne_evaluation_uniquement": config.evaluation_only_column,
    }
    if edit_metadata:
        edit_metadata(metadata)
    write_json_atomic(experiment_dir / TRIAL_FOLDER / "metadata.json", metadata)

    experiment = {
        "run_id": RUN_ID,
        "variables": list(config.features),
        "versions": versions,
        "essais": [{"trial_id": RETAINED, "type": "modele", "dossier": TRIAL_FOLDER, "sha256_modele": model_sha}],
    }
    if edit_experiment:
        edit_experiment(experiment)
    experiment_sha = write_json_atomic(experiment_dir / "experiment.json", experiment)

    selection = {
        "dataset_id": config.dataset_id,
        "experience": RUN_ID,
        "sha256_experiment": experiment_sha,
        "sha256_configuration_entrainement": sha256_file(config_path),
        "dataset": {"dataset_id": config.dataset_id, "symbole": "BTCUSDT", "variables": list(config.features)},
        "versions": versions,
        "statut_signal": signal,
        "retenu": RETAINED,
        "modeles_figes": {
            BASELINE: {"type": "baseline", "chemin": "inutilise", "sha256": "0" * 64},
            RETAINED: {
                "type": "modele",
                "chemin": str(Path("experiments") / RUN_ID / TRIAL_FOLDER / "model.joblib"),
                "sha256": model_sha,
            },
        },
        "politique_decision": policy
        or {"signal_autorise": True, "marge": MARGIN, "couverture_cible": 0.25},
    }
    if edit_selection:
        edit_selection(selection)
    write_json_atomic(root / "selection.json", selection)
    return data_dir, config_path
