"""Explications locales TreeSHAP du modèle figé (une bougie à la fois).

Seul le modèle désigné par ``selection.json`` est chargé, après contrôle de toutes les
empreintes (sélection, expérience, modèle). La politique HAUSSE / BAISSE / ATTENDRE est celle
de la sélection : aucun seuil n'est recalculé ici.

TreeSHAP ``tree_path_dependent`` en sortie ``raw`` : pour une forêt scikit-learn, la sortie
brute est la probabilité moyenne des arbres. Chaque explication le revérifie : les deux classes
doivent avoir des valeurs de base de somme 1, des contributions opposées, et la valeur de base
plus la somme des contributions de la classe 1 doit redonner ``predict_proba(X)[0, 1]``.

Les entrées sont exactement les 17 variables nommées : la cible, le rendement futur et toute
autre colonne sont refusés.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from cryptotrade_ai.data.binance_archive import sha256_file
from cryptotrade_ai.dataset.features import FORBIDDEN_INPUT_COLUMNS
from cryptotrade_ai.training import TrainingError
from cryptotrade_ai.training.artifacts import SELECTION_FILE, load_model, models_root, read_json
from cryptotrade_ai.training.config import DEFAULT_TRAINING_CONFIG_PATH, load_training_config
from cryptotrade_ai.training.decision import REFUSED_POLICY, DecisionPolicy
from cryptotrade_ai.xai import XaiError
from cryptotrade_ai.xai.labels import check_labels
from cryptotrade_ai.xai.schema import ADDITIVITY_TOLERANCE, ModelReference, build_explanation

POSITIVE_CLASS = 1
METHOD = "tree_shap_path_dependent"
SHAP_MIN_VERSION = (0, 44, 1)
SHAP_MAX_VERSION = (0, 49, 1)
PROBABILITY_SPACE_TOLERANCE = 1e-9


@dataclass(frozen=True)
class FrozenModel:
    """Modèle figé vérifié, avec son identité, l'ordre de ses variables et sa politique figée."""

    model: object
    forest: object
    reference: ModelReference
    features: tuple[str, ...]
    policy: DecisionPolicy
    symbol: str


def load_frozen_model(
    data_dir: Path,
    *,
    config_path: Path = DEFAULT_TRAINING_CONFIG_PATH,
    expected_experiment: str | None = None,
    expected_trial: str | None = None,
) -> FrozenModel:
    """Charge le modèle retenu par ``selection.json`` après contrôle de chaque empreinte."""
    config_path = Path(config_path)
    config = load_training_config(config_path)
    root = models_root(data_dir, config.dataset_id)
    selection_path = root / SELECTION_FILE
    if not selection_path.is_file():
        raise XaiError(f"Aucune sélection figée : {selection_path}")
    selection = read_json(selection_path)
    selection_sha = sha256_file(selection_path)

    if selection.get("dataset_id") != config.dataset_id:
        raise XaiError(f"selection.json concerne {selection.get('dataset_id')!r}, {config.dataset_id!r} attendu")
    if selection.get("sha256_configuration_entrainement") != sha256_file(config_path):
        raise XaiError("La configuration d'entraînement diffère de celle de la sélection figée")
    run_id, retained = selection.get("experience"), selection.get("retenu")
    if not retained:
        raise XaiError("La sélection figée ne retient aucun modèle : rien à expliquer")
    if expected_experiment is not None and run_id != expected_experiment:
        raise XaiError(f"Expérience figée {run_id!r}, {expected_experiment!r} attendue")
    if expected_trial is not None and retained != expected_trial:
        raise XaiError(f"Modèle retenu {retained!r}, {expected_trial!r} attendu")
    frozen = (selection.get("modeles_figes") or {}).get(retained)
    if not frozen or frozen.get("type") != "modele":
        raise XaiError(f"Le modèle retenu {retained!r} n'est pas un modèle figé explicable")

    experiment_dir = root / "experiments" / run_id
    experiment_path = experiment_dir / "experiment.json"
    if not experiment_path.is_file() or sha256_file(experiment_path) != selection.get("sha256_experiment"):
        raise XaiError("experiment.json absent ou modifié depuis la sélection figée")
    experiment = read_json(experiment_path)
    trial = next((t for t in experiment.get("essais") or [] if t.get("trial_id") == retained), None)
    if trial is None or experiment.get("run_id") != run_id:
        raise XaiError(f"Essai {retained!r} introuvable dans l'expérience {run_id!r}")
    model_path = experiment_dir / trial["dossier"] / "model.joblib"
    if Path(frozen.get("chemin", "")) != Path("experiments") / run_id / trial["dossier"] / "model.joblib":
        raise XaiError("Chemin du modèle figé incohérent avec l'expérience")
    if trial.get("sha256_modele") != frozen.get("sha256"):
        raise XaiError("SHA-256 du modèle différent entre l'expérience et la sélection")

    metadata = read_json(experiment_dir / trial["dossier"] / "metadata.json")
    if (metadata.get("trial_id"), metadata.get("run_id"), metadata.get("sha256_modele")) != (retained, run_id, frozen["sha256"]):
        raise XaiError("metadata.json ne décrit pas le modèle figé")
    if metadata.get("versions") != selection.get("versions"):
        raise XaiError("Versions des bibliothèques différentes entre metadata.json et la sélection")
    features = tuple(metadata.get("variables") or ())
    for source, names in (
        ("configuration", config.features),
        ("experiment.json", tuple(experiment.get("variables") or ())),
        ("selection.json", tuple((selection.get("dataset") or {}).get("variables") or ())),
    ):
        if names != features:
            raise XaiError(f"Ordre des variables de metadata.json différent de {source}")
    forbidden = set(features) & (FORBIDDEN_INPUT_COLUMNS | {metadata.get("cible"), metadata.get("colonne_evaluation_uniquement")})
    if forbidden:
        raise XaiError(f"Colonnes interdites parmi les variables du modèle : {sorted(forbidden)}")
    check_labels(features)

    try:
        model = load_model(model_path, expected_sha256=frozen["sha256"], expected_versions=selection["versions"])
    except TrainingError as exc:
        raise XaiError(f"Chargement du modèle figé refusé : {exc}") from exc
    forest = _check_forest(model, features)

    raw_policy = selection.get("politique_decision") or {}
    if selection.get("statut_signal") == "AUTORISE" and raw_policy.get("signal_autorise") is True:
        policy = DecisionPolicy(True, float(raw_policy["marge"]), raw_policy.get("couverture_cible"))
    elif raw_policy.get("signal_autorise") is False:
        policy = REFUSED_POLICY
    else:
        raise XaiError("Politique de décision figée incohérente avec le statut du signal")

    reference = ModelReference(
        dataset_id=config.dataset_id,
        experiment=run_id,
        trial_id=retained,
        sha256_model=frozen["sha256"],
        sha256_selection=selection_sha,
    )
    symbol = (selection.get("dataset") or {}).get("symbole") or "BTCUSDT"
    return FrozenModel(model, forest, reference, features, policy, symbol)


class LocalExplainer:
    """Explique une bougie : contributions TreeSHAP de la classe hausse, en points de probabilité."""

    def __init__(self, frozen: FrozenModel, *, tolerance: float = ADDITIVITY_TOLERANCE) -> None:
        shap = import_shap()
        self.frozen = frozen
        self.tolerance = tolerance
        self.library = f"shap {shap.__version__}"
        self._explainer = shap.TreeExplainer(
            frozen.forest, feature_perturbation="tree_path_dependent", model_output="raw"
        )
        self.base_value = positive_class_base_value(self._explainer.expected_value)

    def contributions(self, feature_values: Mapping[str, float]) -> tuple[float, np.ndarray, float]:
        """(probabilité de hausse, 17 contributions dans l'ordre des variables, valeur de base)."""
        X = self._row(feature_values)
        probability = float(self.frozen.model.predict_proba(X)[0, POSITIVE_CLASS])
        raw = self._explainer.shap_values(X, check_additivity=False)
        contributions = positive_class_contributions(raw, len(self.frozen.features))[0]
        error = abs(self.base_value + math.fsum(contributions) - probability)
        if not error <= self.tolerance:
            raise XaiError(
                f"Additivité TreeSHAP non respectée : écart {error:.3g} > {self.tolerance:.3g} "
                "(valeurs SHAP hors de l'espace des probabilités ?)"
            )
        return probability, contributions, self.base_value

    def explain(self, feature_values: Mapping[str, float], *, candle_open_time_ms: int, top_k: int = 3) -> dict:
        """Réponse ``xai-1.0`` validée par schema.py ; l'état vient de la politique figée."""
        probability, contributions, base = self.contributions(feature_values)
        names = self.frozen.features
        policy = self.frozen.policy
        return build_explanation(
            model=self.frozen.reference,
            candle_open_time_ms=candle_open_time_ms,
            feature_values={f: float(feature_values[f]) for f in names},
            contributions=dict(zip(names, (float(c) for c in contributions))),
            base_value=base,
            probability_up=probability,
            signal_authorized=policy.signal_authorized,
            margin=policy.margin,
            method=METHOD,
            library=self.library,
            symbol=self.frozen.symbol,
            top_k=top_k,
            tolerance=self.tolerance,
            expected_features=names,
        )

    def _row(self, feature_values: Mapping[str, float]) -> np.ndarray:
        if not isinstance(feature_values, Mapping):
            raise XaiError("Variables attendues sous forme {nom: valeur}, pour garantir leur ordre")
        names = self.frozen.features
        forbidden = sorted(set(feature_values) & FORBIDDEN_INPUT_COLUMNS)
        if forbidden:
            raise XaiError(f"Colonnes interdites en entrée (cible, futur ou brutes) : {forbidden}")
        unexpected = sorted(set(feature_values) - set(names))
        missing = [f for f in names if f not in feature_values]
        if unexpected or missing:
            raise XaiError(f"Variables inattendues {unexpected} ou manquantes {missing}")
        row = []
        for f in names:
            value = feature_values[f]
            if isinstance(value, bool) or not isinstance(value, (int, float, np.floating, np.integer)):
                raise XaiError(f"{f} : nombre attendu, reçu {value!r}")
            if not math.isfinite(float(value)):
                raise XaiError(f"{f} : valeur non finie ({value}), explication refusée")
            row.append(float(value))
        return np.array([row], dtype=np.float64)


def import_shap():
    """Importe SHAP et refuse une version dont le format de sortie n'a pas été vérifié."""
    try:
        import shap
    except ImportError as exc:
        raise XaiError("SHAP n'est pas installé (version 0.49.1 attendue)") from exc
    version = _version_tuple(shap.__version__)
    if not SHAP_MIN_VERSION <= version <= SHAP_MAX_VERSION:
        raise XaiError(f"Version de SHAP {shap.__version__} non vérifiée (0.44.1 à 0.49.1 attendues)")
    return shap


def positive_class_contributions(raw, n_features: int) -> np.ndarray:
    """Contributions de la classe 1, forme (n, n_features), depuis les deux formats de SHAP.

    SHAP < 0.45 : liste [classe 0, classe 1] de tableaux (n, d) ; SHAP >= 0.45 : tableau (n, d, 2).
    Les deux classes doivent être opposées (probabilités de somme 1).
    """
    if isinstance(raw, list):
        if len(raw) != 2:
            raise XaiError(f"Sortie SHAP inattendue : {len(raw)} classes, 2 attendues")
        values = np.stack([np.asarray(v, dtype=np.float64) for v in raw], axis=-1)
    else:
        values = np.asarray(raw, dtype=np.float64)
    if values.ndim != 3 or values.shape[1:] != (n_features, 2):
        raise XaiError(f"Sortie SHAP de forme {values.shape}, (n, {n_features}, 2) attendue")
    if not np.all(np.isfinite(values)):
        raise XaiError("Sortie SHAP non finie")
    if np.max(np.abs(values[..., 0] + values[..., 1]), initial=0.0) > PROBABILITY_SPACE_TOLERANCE:
        raise XaiError("Contributions des deux classes non opposées : sortie hors de l'espace des probabilités")
    return values[..., POSITIVE_CLASS]


def positive_class_base_value(expected_value) -> float:
    """Valeur de base de la classe 1 ; les deux valeurs de base doivent sommer à 1."""
    values = np.asarray(expected_value, dtype=np.float64).reshape(-1)
    if values.shape != (2,) or not np.all(np.isfinite(values)):
        raise XaiError(f"Valeur de base SHAP inattendue : {expected_value!r}, deux classes attendues")
    if abs(values.sum() - 1.0) > PROBABILITY_SPACE_TOLERANCE or not 0.0 <= values[POSITIVE_CLASS] <= 1.0:
        raise XaiError("Valeurs de base hors de l'espace des probabilités")
    return float(values[POSITIVE_CLASS])


def _check_forest(model, features: tuple[str, ...]):
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.pipeline import Pipeline

    forest = model
    if isinstance(model, Pipeline):
        if len(model.steps) != 1:
            raise XaiError("Pipeline avec prétraitement : TreeSHAP expliquerait des variables transformées")
        forest = model.steps[0][1]
    if not isinstance(forest, RandomForestClassifier):
        raise XaiError(f"Modèle {type(forest).__name__} non pris en charge : RandomForestClassifier attendu")
    if list(getattr(forest, "classes_", [])) != [0, 1]:
        raise XaiError(f"Classes du modèle {getattr(forest, 'classes_', None)}, [0, 1] attendues")
    if getattr(forest, "n_features_in_", None) != len(features):
        raise XaiError(f"Le modèle attend {getattr(forest, 'n_features_in_', None)} variables, {len(features)} déclarées")
    names = getattr(forest, "feature_names_in_", None)
    if names is not None and tuple(names) != features:
        raise XaiError("Noms de colonnes du modèle différents de l'ordre de metadata.json")
    return forest


def _version_tuple(text: str) -> tuple[int, ...]:
    parts = []
    for piece in text.split(".")[:3]:
        digits = "".join(c for c in piece if c.isdigit())
        parts.append(int(digits) if digits else 0)
    return tuple(parts)
