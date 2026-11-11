"""Tests de l'explainer TreeSHAP sur de petites forêts SYNTHÉTIQUES (aucun artefact réel, aucune donnée réelle)."""

from __future__ import annotations

import json
import math

import pytest

pytest.importorskip("sklearn")
shap = pytest.importorskip("shap")

import numpy as np  # noqa: E402
from sklearn.ensemble import RandomForestClassifier  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402
from sklearn.preprocessing import StandardScaler  # noqa: E402
from synthetic_xai import (  # noqa: E402
    DOWN_INDEX,
    MARGIN,
    RETAINED,
    RUN_ID,
    TRIAL_FOLDER,
    UP_INDEX,
    as_mapping,
    make_forest,
    synthetic_labels,
    synthetic_rows,
    write_frozen_selection,
)

from cryptotrade_ai.data.binance_archive import sha256_file  # noqa: E402
from cryptotrade_ai.dataset.features import FEATURE_NAMES  # noqa: E402
from cryptotrade_ai.training.artifacts import models_root  # noqa: E402
from cryptotrade_ai.training.decision import ATTENDRE, DecisionPolicy, decide  # noqa: E402
from cryptotrade_ai.xai import XaiError  # noqa: E402
from cryptotrade_ai.xai.explainer import (  # noqa: E402
    METHOD,
    LocalExplainer,
    import_shap,
    load_frozen_model,
    positive_class_base_value,
    positive_class_contributions,
)
from cryptotrade_ai.xai.schema import ORIGIN_REAL, validate_explanation  # noqa: E402

OPEN_MS = 1_735_689_600_000
ROWS = synthetic_rows(40, seed=123)


@pytest.fixture(scope="module")
def forest():
    return make_forest()


@pytest.fixture
def frozen_paths(tmp_path, forest):
    return write_frozen_selection(tmp_path, forest)


@pytest.fixture
def explainer(frozen_paths):
    data_dir, config_path = frozen_paths
    return LocalExplainer(load_frozen_model(data_dir, config_path=config_path))


def model_file(data_dir):
    return models_root(data_dir, "BTCUSDT-1h-v1") / "experiments" / RUN_ID / TRIAL_FOLDER / "model.joblib"


# --- Compatibilité SHAP --------------------------------------------------------------------


def test_installed_shap_version_is_supported():
    assert import_shap().__version__ == "0.49.1"


@pytest.mark.parametrize("version", ["0.44.0", "0.50.0", "1.0.0"])
def test_unverified_shap_versions_are_refused(monkeypatch, version):
    monkeypatch.setattr(shap, "__version__", version)
    with pytest.raises(XaiError, match="non vérifiée"):
        import_shap()


def test_shap_0_49_returns_one_column_per_class(forest):
    raw = shap.TreeExplainer(forest.steps[0][1], feature_perturbation="tree_path_dependent", model_output="raw")
    values = raw.shap_values(ROWS, check_additivity=False)
    assert isinstance(values, np.ndarray) and values.shape == (len(ROWS), 17, 2)
    assert np.asarray(raw.expected_value).shape == (2,)


def test_positive_class_from_both_shap_formats():
    rng = np.random.default_rng(0)
    up = rng.normal(size=(3, 17))
    array_format = np.stack([-up, up], axis=-1)
    list_format = [-up, up]
    assert np.array_equal(positive_class_contributions(array_format, 17), up)
    assert np.array_equal(positive_class_contributions(list_format, 17), up)


@pytest.mark.parametrize(
    "raw",
    [
        np.zeros((3, 17)),
        np.zeros((3, 17, 3)),
        np.zeros((3, 16, 2)),
        [np.zeros((3, 17))] * 3,
        np.full((3, 17, 2), np.nan),
        np.ones((3, 17, 2)),
    ],
)
def test_unexpected_shap_outputs_are_refused(raw):
    with pytest.raises(XaiError):
        positive_class_contributions(raw, 17)


def test_base_value_of_class_up():
    assert positive_class_base_value(np.array([0.48, 0.52])) == pytest.approx(0.52)
    for bad in ([0.4, 0.7], [0.5], [0.2, 0.3, 0.5], [math.nan, 1.0], [1.2, -0.2]):
        with pytest.raises(XaiError):
            positive_class_base_value(np.array(bad))


# --- Espace des probabilités, classe hausse et additivité -----------------------------------


def test_raw_output_is_the_probability_space(forest):
    raw = shap.TreeExplainer(forest.steps[0][1], feature_perturbation="tree_path_dependent", model_output="raw")
    values = raw.shap_values(ROWS, check_additivity=False)
    proba = forest.predict_proba(ROWS)
    for k in (0, 1):
        assert np.max(np.abs(raw.expected_value[k] + values[:, :, k].sum(axis=1) - proba[:, k])) < 1e-10
    assert abs(sum(raw.expected_value) - 1.0) < 1e-12


def test_additivity_on_every_synthetic_row(explainer, forest):
    for row in ROWS:
        p, contributions, base = explainer.contributions(as_mapping(row))
        assert p == pytest.approx(forest.predict_proba(row.reshape(1, -1))[0, 1], abs=0)
        assert abs(base + math.fsum(contributions) - p) <= 1e-6
        assert abs(base + math.fsum(contributions) - p) < 1e-12


def test_contributions_are_those_of_class_up(explainer, forest):
    raw = shap.TreeExplainer(forest.steps[0][1], feature_perturbation="tree_path_dependent", model_output="raw")
    expected = raw.shap_values(ROWS, check_additivity=False)[:, :, 1]
    for row, reference in zip(ROWS, expected):
        assert np.allclose(explainer.contributions(as_mapping(row))[1], reference, atol=1e-15)
    assert explainer.base_value == pytest.approx(raw.expected_value[1])


def test_contribution_signs_follow_the_synthetic_relation(explainer):
    up_row, down_row = np.zeros(17), np.zeros(17)
    up_row[UP_INDEX], up_row[DOWN_INDEX] = 2.5, -2.0
    down_row[UP_INDEX], down_row[DOWN_INDEX] = -2.5, 2.0
    p_up, c_up, _ = explainer.contributions(as_mapping(up_row))
    p_down, c_down, _ = explainer.contributions(as_mapping(down_row))
    assert p_up > 0.5 > p_down
    assert c_up[UP_INDEX] > 0 and c_up[DOWN_INDEX] > 0
    assert c_down[UP_INDEX] < 0 and c_down[DOWN_INDEX] < 0


def test_broken_additivity_is_refused(explainer, monkeypatch):
    real = explainer._explainer.shap_values

    def shifted(X, check_additivity=False):
        values = real(X, check_additivity=check_additivity).copy()
        values[:, 0, 1] += 1e-4
        values[:, 0, 0] -= 1e-4
        return values

    monkeypatch.setattr(explainer._explainer, "shap_values", shifted)
    with pytest.raises(XaiError, match="Additivité"):
        explainer.contributions(as_mapping(ROWS[0]))


# --- Réponse xai-1.0 et politique figée ------------------------------------------------------


def test_explain_produces_a_valid_response_with_frozen_policy(explainer, forest, frozen_paths):
    data_dir, _ = frozen_paths
    for row in ROWS[:10]:
        payload = explainer.explain(as_mapping(row), candle_open_time_ms=OPEN_MS)
        assert validate_explanation(payload) is payload
        p = forest.predict_proba(row.reshape(1, -1))[0, 1]
        assert payload["prediction"]["probability_up"] == p
        assert payload["prediction"]["margin"] == MARGIN
        assert payload["prediction"]["state"] == decide(np.array([p]), DecisionPolicy(True, MARGIN))[0]
    assert payload["data_origin"] == ORIGIN_REAL
    assert payload["explanation"]["method"] == METHOD
    assert payload["explanation"]["library"] == "shap 0.49.1"
    assert payload["model"]["sha256_model"] == sha256_file(model_file(data_dir))
    assert payload["model"]["sha256_selection"] == sha256_file(models_root(data_dir, "BTCUSDT-1h-v1") / "selection.json")
    assert (payload["model"]["experiment"], payload["model"]["trial_id"]) == (RUN_ID, RETAINED)
    text = json.dumps(payload)
    assert "target_up_1h" not in text and "fwd_return_1h" not in text


def test_refused_signal_always_waits(tmp_path, forest):
    data_dir, config_path = write_frozen_selection(
        tmp_path, forest, signal="REFUSE", policy={"signal_autorise": False, "marge": None, "couverture_cible": None}
    )
    explainer = LocalExplainer(load_frozen_model(data_dir, config_path=config_path))
    for row in ROWS[:10]:
        payload = explainer.explain(as_mapping(row), candle_open_time_ms=OPEN_MS)
        assert payload["prediction"]["state"] == ATTENDRE
        assert payload["prediction"]["margin"] is None


def test_explanations_are_deterministic(frozen_paths):
    data_dir, config_path = frozen_paths
    first = LocalExplainer(load_frozen_model(data_dir, config_path=config_path))
    second = LocalExplainer(load_frozen_model(data_dir, config_path=config_path))
    values = as_mapping(ROWS[3])
    reference = first.explain(values, candle_open_time_ms=OPEN_MS)
    assert first.explain(values, candle_open_time_ms=OPEN_MS) == reference
    assert second.explain(values, candle_open_time_ms=OPEN_MS) == reference


def test_order_comes_from_names_not_from_insertion(explainer):
    values = as_mapping(ROWS[5])
    reversed_values = dict(reversed(list(values.items())))
    assert explainer.explain(reversed_values, candle_open_time_ms=OPEN_MS) == explainer.explain(
        values, candle_open_time_ms=OPEN_MS
    )


# --- Entrées refusées ------------------------------------------------------------------------


@pytest.mark.parametrize("bad", [math.nan, math.inf, -math.inf, None, "0.1", True])
def test_non_finite_or_non_numeric_inputs_are_refused(explainer, bad):
    values = as_mapping(ROWS[0])
    values["rsi_14"] = bad
    with pytest.raises(XaiError):
        explainer.explain(values, candle_open_time_ms=OPEN_MS)


@pytest.mark.parametrize("column", ["target_up_1h", "fwd_return_1h", "close", "open_time"])
def test_target_future_and_raw_columns_are_refused(explainer, column):
    values = {**as_mapping(ROWS[0]), column: 1.0}
    with pytest.raises(XaiError, match="interdites"):
        explainer.explain(values, candle_open_time_ms=OPEN_MS)


def test_missing_unexpected_or_unnamed_inputs_are_refused(explainer):
    values = as_mapping(ROWS[0])
    del values["hour_cos"]
    with pytest.raises(XaiError, match="manquantes"):
        explainer.contributions(values)
    with pytest.raises(XaiError, match="inattendues"):
        explainer.contributions({**as_mapping(ROWS[0]), "ret_48h": 0.0})
    with pytest.raises(XaiError, match="nom: valeur"):
        explainer.contributions(list(ROWS[0]))


# --- Sécurité du chargement ------------------------------------------------------------------


def test_frozen_model_identity_is_loaded(frozen_paths):
    data_dir, config_path = frozen_paths
    frozen = load_frozen_model(data_dir, config_path=config_path, expected_experiment=RUN_ID, expected_trial=RETAINED)
    assert frozen.features == FEATURE_NAMES
    assert frozen.policy.margin == MARGIN and frozen.policy.signal_authorized
    assert frozen.reference.sha256_model == sha256_file(model_file(data_dir))


def test_modified_model_file_is_refused(frozen_paths):
    data_dir, config_path = frozen_paths
    with model_file(data_dir).open("ab") as handle:
        handle.write(b"\0")
    with pytest.raises(XaiError, match="SHA-256"):
        load_frozen_model(data_dir, config_path=config_path)


def test_modified_experiment_is_refused(frozen_paths):
    data_dir, config_path = frozen_paths
    path = models_root(data_dir, "BTCUSDT-1h-v1") / "experiments" / RUN_ID / "experiment.json"
    path.write_text(path.read_text(encoding="utf-8") + " ", encoding="utf-8")
    with pytest.raises(XaiError, match="experiment.json"):
        load_frozen_model(data_dir, config_path=config_path)


def test_different_training_config_is_refused(frozen_paths):
    data_dir, config_path = frozen_paths
    config_path.write_bytes(config_path.read_bytes() + b"\n")
    with pytest.raises(XaiError, match="configuration"):
        load_frozen_model(data_dir, config_path=config_path)


def test_missing_selection_is_refused(tmp_path):
    from synthetic_xai import copy_training_config

    with pytest.raises(XaiError, match="Aucune sélection"):
        load_frozen_model(tmp_path / "vide", config_path=copy_training_config(tmp_path))


def test_unexpected_experiment_or_trial_is_refused(frozen_paths):
    data_dir, config_path = frozen_paths
    with pytest.raises(XaiError, match="Expérience"):
        load_frozen_model(data_dir, config_path=config_path, expected_experiment="autre")
    with pytest.raises(XaiError, match="retenu"):
        load_frozen_model(data_dir, config_path=config_path, expected_trial="trials/01")


def _swap_two(names):
    names[0], names[1] = names[1], names[0]


SELECTION_EDITS = {
    "aucun modèle retenu": lambda s: s.update(retenu=None),
    "baseline retenue": lambda s: s.update(retenu="constant_train_rate"),
    "autre dataset": lambda s: s.update(dataset_id="ETHUSDT-1h-v1"),
    "empreinte de modèle différente": lambda s: s["modeles_figes"][RETAINED].update(sha256="ab" * 32),
    "chemin différent": lambda s: s["modeles_figes"][RETAINED].update(chemin="ailleurs/model.joblib"),
    "ordre des variables": lambda s: _swap_two(s["dataset"]["variables"]),
    "politique incohérente": lambda s: s.update(statut_signal="REFUSE"),
    "versions différentes de metadata.json": lambda s: s["versions"].update({"scikit-learn": "0.0"}),
}


@pytest.mark.parametrize("name", sorted(SELECTION_EDITS))
def test_inconsistent_selection_is_refused(tmp_path, forest, name):
    data_dir, config_path = write_frozen_selection(tmp_path, forest, edit_selection=SELECTION_EDITS[name])
    with pytest.raises(XaiError):
        load_frozen_model(data_dir, config_path=config_path)


METADATA_EDITS = {
    "ordre des variables": lambda m: _swap_two(m["variables"]),
    "variable manquante": lambda m: m["variables"].pop(),
    "cible parmi les variables": lambda m: m["variables"].__setitem__(0, "target_up_1h"),
    "autre essai": lambda m: m.update(trial_id="autre"),
    "versions différentes": lambda m: m.update(versions={}),
}


@pytest.mark.parametrize("name", sorted(METADATA_EDITS))
def test_inconsistent_metadata_is_refused(tmp_path, forest, name):
    data_dir, config_path = write_frozen_selection(tmp_path, forest, edit_metadata=METADATA_EDITS[name])
    with pytest.raises(XaiError):
        load_frozen_model(data_dir, config_path=config_path)


def test_experiment_variables_must_match(tmp_path, forest):
    data_dir, config_path = write_frozen_selection(tmp_path, forest, edit_experiment=lambda e: _swap_two(e["variables"]))
    with pytest.raises(XaiError, match="Ordre des variables"):
        load_frozen_model(data_dir, config_path=config_path)


def _fit(model, n_classes=2, n_features=17):
    X = synthetic_rows(300)[:, :n_features]
    y = synthetic_labels(synthetic_rows(300)) if n_classes == 2 else np.arange(300) % n_classes
    return model.fit(X, y)


@pytest.mark.parametrize(
    "model",
    [
        lambda: _fit(Pipeline([("model", LogisticRegression())])),
        lambda: _fit(Pipeline([("scale", StandardScaler()), ("model", RandomForestClassifier(5, random_state=0))])),
        lambda: _fit(Pipeline([("model", RandomForestClassifier(5, random_state=0))]), n_classes=3),
        lambda: _fit(Pipeline([("model", RandomForestClassifier(5, random_state=0))]), n_features=16),
    ],
    ids=["regression_logistique", "pretraitement", "trois_classes", "16_variables"],
)
def test_unsupported_models_are_refused(tmp_path, model):
    data_dir, config_path = write_frozen_selection(tmp_path, model())
    with pytest.raises(XaiError):
        load_frozen_model(data_dir, config_path=config_path)


def test_model_trained_with_another_sklearn_version_is_refused(tmp_path, forest):
    def older(target):
        target["versions"] = {**target["versions"], "scikit-learn": "0.0"}

    data_dir, config_path = write_frozen_selection(tmp_path, forest, edit_metadata=older, edit_selection=older)
    with pytest.raises(XaiError, match="scikit-learn"):
        load_frozen_model(data_dir, config_path=config_path)
