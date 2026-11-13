"""Configuration d'entraînement : règles figées (variables, cible, métrique, paramètres autorisés)."""

import copy

import pytest

from cryptotrade_ai.dataset.features import FEATURE_NAMES
from cryptotrade_ai.training.config import (
    DEFAULT_TRAINING_CONFIG_PATH,
    TrainingConfigError,
    load_training_config,
    parse_training_config,
)
from synthetic_training import training_config_dict


def test_repository_config_is_valid():
    config = load_training_config(DEFAULT_TRAINING_CONFIG_PATH)
    assert config.dataset_id == "BTCUSDT-1h-v1"
    assert config.features == FEATURE_NAMES
    assert config.primary_metric == "log_loss"
    assert config.seed == 42
    assert [m.name for m in config.models] == ["logistic_regression", "random_forest"]
    assert config.coverage_grid == (1.0, 0.5, 0.25, 0.1)


def _mutated(change):
    raw = copy.deepcopy(training_config_dict())
    change(raw)
    return raw


@pytest.mark.parametrize(
    "change, message",
    [
        (lambda r: r.__setitem__("features", list(reversed(FEATURE_NAMES))), "exactement"),
        (lambda r: r["features"].__setitem__(0, "fwd_return_1h"), "interdites"),
        (lambda r: r["features"].append("target_up_1h"), "interdites"),
        (lambda r: r.__setitem__("target", "fwd_return_1h"), "Cible"),
        (lambda r: r.__setitem__("primary_metric", "accuracy"), "log_loss"),
        (lambda r: r["models"]["logistic_regression"]["grid"].__setitem__("class_weight", ["balanced"]), "non autorisés"),
        (lambda r: r["models"].__setitem__("xgboost", {"grid": {}}), "autorisés"),
        (lambda r: r["dataset"].__setitem__("dir", "C:/autre"), "relatif"),
        (lambda r: r["dataset"].__setitem__("dir", "../datasets"), "relatif"),
        (lambda r: r["decision"].__setitem__("coverage_grid", [0.5, 1.5]), "coverage_grid"),
        (lambda r: r.__setitem__("seed", True), "seed"),
        (lambda r: r["selection"].__setitem__("simplicity_order", ["random_forest"]), "simplicity_order"),
    ],
)
def test_invalid_configs_are_rejected(change, message):
    with pytest.raises(TrainingConfigError, match=message):
        parse_training_config(_mutated(change))
