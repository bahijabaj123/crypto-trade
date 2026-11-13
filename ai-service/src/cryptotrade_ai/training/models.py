"""Pipelines scikit-learn. Tout prétraitement est dans le Pipeline, donc ajusté sur le train seul."""

from __future__ import annotations

import itertools

from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from cryptotrade_ai.training import TrainingError
from cryptotrade_ai.training.config import ModelSpec


def build_pipeline(model_name: str, params: dict, seed: int) -> Pipeline:
    if model_name == "logistic_regression":
        return Pipeline([("scaler", StandardScaler()), ("model", LogisticRegression(random_state=seed, **params))])
    if model_name == "random_forest":
        # Les arbres sont insensibles à l'échelle : pas de scaler.
        return Pipeline([("model", RandomForestClassifier(random_state=seed, **params))])
    raise TrainingError(f"Modèle inconnu : {model_name}")


def expand_grid(spec: ModelSpec) -> list[dict]:
    """Combinaisons dans l'ordre déclaré par la configuration (ordre stable, donc reproductible)."""
    keys = list(spec.grid)
    return [{**spec.fixed, **dict(zip(keys, values))} for values in itertools.product(*(spec.grid[k] for k in keys))]


def trial_id(model_name: str, params: dict, spec: ModelSpec) -> str:
    varying = "-".join(f"{k}{params[k]}" for k in spec.grid)
    return f"{model_name}-{varying}" if varying else model_name
