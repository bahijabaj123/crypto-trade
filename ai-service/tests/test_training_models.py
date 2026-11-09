"""Baselines (probabilités apprises sur train seul) et Pipelines (scaler ajusté sur train seul)."""

import pytest

np = pytest.importorskip("numpy")
pytest.importorskip("sklearn")

from sklearn.preprocessing import StandardScaler  # noqa: E402

from cryptotrade_ai.training import TrainingError  # noqa: E402
from cryptotrade_ai.training.baselines import ConstantTrainRateBaseline, PreviousHourDirectionBaseline  # noqa: E402
from cryptotrade_ai.training.config import ModelSpec, parse_training_config  # noqa: E402
from cryptotrade_ai.training.models import build_pipeline, expand_grid, trial_id  # noqa: E402
from synthetic_training import training_config_dict  # noqa: E402

CONFIG = parse_training_config(training_config_dict())


def _data(seed=0, n=400, shift=0.0):
    rng = np.random.default_rng(seed)
    X = rng.normal(shift, 1.0 + shift, size=(n, 17))
    y = (X[:, 0] + rng.normal(0, 1, n) > shift).astype(np.int64)
    return X, y


def test_constant_baseline_uses_train_rate_and_always_predicts_up():
    X, _ = _data()
    y = np.array([1] * 300 + [0] * 100)
    model = ConstantTrainRateBaseline().fit(X, y)
    X_val = np.zeros((5, 17))
    assert np.allclose(model.predict_proba(X_val)[:, 1], 0.75)
    assert model.predict(X_val).tolist() == [1] * 5


def test_baselines_ignore_validation_labels():
    X, y = _data()
    X_val, _ = _data(seed=1, n=50)
    first = PreviousHourDirectionBaseline(0).fit(X, y).predict_proba(X_val)
    again = PreviousHourDirectionBaseline(0).fit(X, y).predict_proba(X_val)
    assert np.array_equal(first, again)


def test_previous_hour_baseline_probabilities_and_rule():
    X = np.zeros((6, 17))
    X[:, 0] = [0.01, 0.02, -0.01, 0.0, 0.03, -0.02]
    y = np.array([1, 0, 0, 1, 1, 0])
    model = PreviousHourDirectionBaseline(0).fit(X, y)
    assert model.p_up_after_up_ == pytest.approx(2 / 3)
    assert model.p_up_after_down_ == pytest.approx(1 / 3)
    X_val = np.zeros((3, 17))
    X_val[:, 0] = [0.5, 0.0, -0.5]
    assert model.predict(X_val).tolist() == [1, 0, 0]
    assert model.predict_proba(X_val)[:, 1].tolist() == pytest.approx([2 / 3, 1 / 3, 1 / 3])


def test_previous_hour_baseline_needs_both_directions():
    X = np.ones((4, 17))
    with pytest.raises(TrainingError):
        PreviousHourDirectionBaseline(0).fit(X, np.array([1, 0, 1, 0]))


def test_logistic_pipeline_scaler_is_fitted_on_train_only():
    X_train, y_train = _data(seed=2)
    X_val, _ = _data(seed=3, shift=5.0)
    pipe = build_pipeline("logistic_regression", {"C": 1.0, "max_iter": 2000}, seed=42).fit(X_train, y_train)
    scaler = pipe.named_steps["scaler"]
    assert np.allclose(scaler.mean_, X_train.mean(axis=0))
    assert np.allclose(scaler.scale_, X_train.std(axis=0))
    pipe.predict_proba(X_val)
    assert np.allclose(scaler.mean_, X_train.mean(axis=0))
    assert not np.allclose(scaler.mean_, np.vstack([X_train, X_val]).mean(axis=0))


def test_random_forest_pipeline_has_no_scaler():
    pipe = build_pipeline("random_forest", {"n_estimators": 5}, seed=42)
    assert [name for name, _ in pipe.steps] == ["model"]
    assert not any(isinstance(step, StandardScaler) for _, step in pipe.steps)


@pytest.mark.parametrize("name, params", [("logistic_regression", {"C": 0.1}), ("random_forest", {"n_estimators": 20, "max_depth": 3})])
def test_same_seed_gives_identical_probabilities(name, params):
    X, y = _data(seed=4)
    first = build_pipeline(name, params, seed=42).fit(X, y).predict_proba(X)
    second = build_pipeline(name, params, seed=42).fit(X, y).predict_proba(X)
    assert np.array_equal(first, second)


def test_grid_expansion_is_ordered_and_includes_fixed_params():
    spec = ModelSpec("random_forest", {"n_estimators": 10}, {"max_depth": [4, 6], "min_samples_leaf": [50, 200]})
    combos = expand_grid(spec)
    assert combos == [
        {"n_estimators": 10, "max_depth": 4, "min_samples_leaf": 50},
        {"n_estimators": 10, "max_depth": 4, "min_samples_leaf": 200},
        {"n_estimators": 10, "max_depth": 6, "min_samples_leaf": 50},
        {"n_estimators": 10, "max_depth": 6, "min_samples_leaf": 200},
    ]
    assert trial_id("random_forest", combos[1], spec) == "random_forest-max_depth4-min_samples_leaf200"


def test_repository_grid_sizes():
    sizes = {spec.name: len(expand_grid(spec)) for spec in parse_training_config(training_config_dict()).models}
    assert sizes == {"logistic_regression": 5, "random_forest": 2}


def test_unknown_model_is_rejected():
    with pytest.raises(TrainingError):
        build_pipeline("xgboost", {}, seed=42)
