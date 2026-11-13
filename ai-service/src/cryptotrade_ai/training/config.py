"""Lecture et validation de la configuration d'entraînement (aucun calcul, aucune donnée lue)."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from cryptotrade_ai.config import AI_SERVICE_DIR
from cryptotrade_ai.dataset.features import FEATURE_NAMES, FORBIDDEN_INPUT_COLUMNS
from cryptotrade_ai.training import TrainingError

DEFAULT_TRAINING_CONFIG_PATH = AI_SERVICE_DIR / "config" / "training" / "btcusdt_1h_v1.json"

TARGET_COLUMN = "target_up_1h"
EVALUATION_ONLY_COLUMN = "fwd_return_1h"
BASELINE_NAMES = ("constant_train_rate", "previous_hour_direction")
MODEL_NAMES = ("logistic_regression", "random_forest")
ALLOWED_MODEL_PARAMS = {
    "logistic_regression": frozenset({"C", "solver", "max_iter", "tol"}),
    "random_forest": frozenset({"n_estimators", "max_depth", "min_samples_leaf", "max_features", "n_jobs"}),
}


class TrainingConfigError(TrainingError):
    """Configuration d'entraînement invalide."""


@dataclass(frozen=True)
class ModelSpec:
    name: str
    fixed: dict
    grid: dict


@dataclass(frozen=True)
class TrainingConfig:
    training_id: str
    dataset_id: str
    dataset_dir: str
    features: tuple[str, ...]
    target: str
    evaluation_only_column: str
    seed: int
    primary_metric: str
    previous_hour_feature: str
    models: tuple[ModelSpec, ...]
    require_significant_improvement: bool
    simplicity_order: tuple[str, ...]
    bootstrap_block_hours: int
    bootstrap_resamples: int
    bootstrap_confidence: float
    bootstrap_seed: int
    calibration_bins: int
    calibration_simulations: int
    calibration_confidence: float
    calibration_seed: int
    coverage_grid: tuple[float, ...]
    fee_per_side: float
    raw: dict


def load_training_config(path: Path) -> TrainingConfig:
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise TrainingConfigError(f"Configuration d'entraînement introuvable : {path}") from exc
    except json.JSONDecodeError as exc:
        raise TrainingConfigError(f"Configuration d'entraînement JSON invalide : {path} ({exc})") from exc
    return parse_training_config(raw)


def parse_training_config(raw: dict) -> TrainingConfig:
    if not isinstance(raw, dict):
        raise TrainingConfigError("La configuration doit être un objet JSON")
    dataset = _section(raw, "dataset")
    features = tuple(_require(raw, "features", list))
    if features != FEATURE_NAMES:
        forbidden = sorted(set(features) & FORBIDDEN_INPUT_COLUMNS)
        detail = f" (colonnes interdites : {forbidden})" if forbidden else ""
        raise TrainingConfigError(f"Les variables doivent être exactement les 17 variables v1, dans l'ordre{detail}")
    if _require(raw, "target", str) != TARGET_COLUMN:
        raise TrainingConfigError(f"Cible attendue : {TARGET_COLUMN}")
    if _require(raw, "evaluation_only_column", str) != EVALUATION_ONLY_COLUMN:
        raise TrainingConfigError(f"Colonne d'évaluation attendue : {EVALUATION_ONLY_COLUMN}")
    if _require(raw, "primary_metric", str) != "log_loss":
        raise TrainingConfigError("La métrique principale doit être log_loss")

    baselines = _section(raw, "baselines")
    if tuple(baselines) != BASELINE_NAMES:
        raise TrainingConfigError(f"Baselines attendues : {list(BASELINE_NAMES)}")
    previous_feature = _require(baselines["previous_hour_direction"], "feature", str)
    if previous_feature not in features:
        raise TrainingConfigError(f"Variable de la baseline inconnue : {previous_feature}")

    models_raw = _section(raw, "models")
    unknown = set(models_raw) - set(MODEL_NAMES)
    if unknown or not models_raw:
        raise TrainingConfigError(f"Modèles autorisés : {list(MODEL_NAMES)} (reçu : {sorted(models_raw)})")
    models = tuple(_model_spec(name, spec) for name, spec in models_raw.items())

    selection = _section(raw, "selection")
    simplicity = tuple(_require(selection, "simplicity_order", list))
    if sorted(simplicity) != sorted(models_raw):
        raise TrainingConfigError("simplicity_order doit lister exactement les modèles configurés")
    bootstrap = _section(selection, "bootstrap")
    calibration = _section(raw, "calibration")
    decision = _section(raw, "decision")
    coverage = tuple(float(c) for c in _require(decision, "coverage_grid", list))
    if not coverage or any(not 0 < c <= 1 for c in coverage) or len(set(coverage)) != len(coverage):
        raise TrainingConfigError("coverage_grid : valeurs distinctes dans ]0, 1]")
    fee = _number(decision, "fee_per_side_assumption")
    if not 0 <= fee < 0.05:
        raise TrainingConfigError("fee_per_side_assumption doit être dans [0, 0.05[")

    return TrainingConfig(
        training_id=_require(raw, "training_id", str),
        dataset_id=_require(dataset, "dataset_id", str),
        dataset_dir=_relative_path(_require(dataset, "dir", str)),
        features=features,
        target=TARGET_COLUMN,
        evaluation_only_column=EVALUATION_ONLY_COLUMN,
        seed=_integer(raw, "seed", minimum=0),
        primary_metric="log_loss",
        previous_hour_feature=previous_feature,
        models=models,
        require_significant_improvement=_require(selection, "require_significant_improvement", bool),
        simplicity_order=simplicity,
        bootstrap_block_hours=_integer(bootstrap, "block_hours", minimum=1),
        bootstrap_resamples=_integer(bootstrap, "n_resamples", minimum=100),
        bootstrap_confidence=_probability(bootstrap, "confidence"),
        bootstrap_seed=_integer(bootstrap, "seed", minimum=0),
        calibration_bins=_integer(calibration, "n_bins", minimum=2),
        calibration_simulations=_integer(calibration, "n_simulations", minimum=100),
        calibration_confidence=_probability(calibration, "confidence"),
        calibration_seed=_integer(calibration, "seed", minimum=0),
        coverage_grid=coverage,
        fee_per_side=fee,
        raw=raw,
    )


def _model_spec(name: str, spec: dict) -> ModelSpec:
    if not isinstance(spec, dict):
        raise TrainingConfigError(f"{name} : objet attendu")
    fixed = spec.get("fixed", {})
    grid = _require(spec, "grid", dict)
    if not isinstance(fixed, dict):
        raise TrainingConfigError(f"{name}.fixed : objet attendu")
    keys = set(fixed) | set(grid)
    if set(fixed) & set(grid):
        raise TrainingConfigError(f"{name} : paramètres à la fois fixes et dans la grille : {sorted(set(fixed) & set(grid))}")
    if not keys <= ALLOWED_MODEL_PARAMS[name]:
        raise TrainingConfigError(f"{name} : paramètres non autorisés : {sorted(keys - ALLOWED_MODEL_PARAMS[name])}")
    for key, values in grid.items():
        if not isinstance(values, list) or not values or len(values) > 10:
            raise TrainingConfigError(f"{name}.grid.{key} : liste de 1 à 10 valeurs attendue")
    return ModelSpec(name=name, fixed=dict(fixed), grid={k: list(v) for k, v in grid.items()})


def _section(raw: dict, key: str) -> dict:
    return _require(raw, key, dict)


def _require(raw: dict, key: str, kind: type):
    if key not in raw:
        raise TrainingConfigError(f"Clé manquante : {key}")
    value = raw[key]
    if kind is not bool and isinstance(value, bool) or not isinstance(value, kind):
        raise TrainingConfigError(f"{key} : type {kind.__name__} attendu")
    return value


def _number(raw: dict, key: str) -> float:
    value = raw.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise TrainingConfigError(f"{key} : nombre fini attendu")
    return float(value)


def _integer(raw: dict, key: str, *, minimum: int) -> int:
    value = raw.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise TrainingConfigError(f"{key} : entier >= {minimum} attendu")
    return value


def _probability(raw: dict, key: str) -> float:
    value = _number(raw, key)
    if not 0.5 <= value < 1:
        raise TrainingConfigError(f"{key} doit être dans [0.5, 1[")
    return value


def _relative_path(text: str) -> str:
    path = PurePosixPath(text.replace("\\", "/"))
    if path.is_absolute() or ":" in text or ".." in path.parts or not path.parts:
        raise TrainingConfigError(f"Chemin relatif au dossier de données attendu : {text!r}")
    return str(path)
