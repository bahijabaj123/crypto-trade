"""Baselines naïves. Leurs probabilités sont estimées exclusivement sur le train (``fit``)."""

from __future__ import annotations

import numpy as np

from cryptotrade_ai.training import TrainingError


class ConstantTrainRateBaseline:
    """« Toujours hausse » : prédit toujours 1 ; probabilité constante = taux de hausse du train."""

    name = "constant_train_rate"

    def fit(self, X: np.ndarray, y: np.ndarray) -> "ConstantTrainRateBaseline":
        if len(y) == 0:
            raise TrainingError("Baseline constante : train vide")
        self.rate_ = float(np.mean(y))
        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        p = np.full(len(X), self.rate_, dtype=np.float64)
        return np.column_stack([1.0 - p, p])

    def predict(self, X: np.ndarray) -> np.ndarray:
        return np.ones(len(X), dtype=np.int64)

    def describe(self) -> dict:
        return {"taux_hausse_train": self.rate_}


class PreviousHourDirectionBaseline:
    """Direction de la dernière heure : prédit 1 si ret_1h > 0, sinon 0 (égalité = 0, comme la cible).

    Probabilités : P(hausse | dernière heure en hausse) et P(hausse | dernière heure non haussière),
    estimées sur le train.
    """

    name = "previous_hour_direction"

    def __init__(self, feature_index: int):
        self.feature_index = feature_index

    def fit(self, X: np.ndarray, y: np.ndarray) -> "PreviousHourDirectionBaseline":
        up = X[:, self.feature_index] > 0
        if up.all() or not up.any():
            raise TrainingError("Baseline direction : il faut des heures en hausse et en baisse dans le train")
        self.p_up_after_up_ = float(np.mean(y[up]))
        self.p_up_after_down_ = float(np.mean(y[~up]))
        self.counts_ = {"apres_hausse": int(up.sum()), "apres_baisse_ou_egalite": int((~up).sum())}
        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        p = np.where(X[:, self.feature_index] > 0, self.p_up_after_up_, self.p_up_after_down_).astype(np.float64)
        return np.column_stack([1.0 - p, p])

    def predict(self, X: np.ndarray) -> np.ndarray:
        return (X[:, self.feature_index] > 0).astype(np.int64)

    def describe(self) -> dict:
        return {
            "p_hausse_apres_hausse_train": self.p_up_after_up_,
            "p_hausse_apres_baisse_train": self.p_up_after_down_,
            "effectifs_train": self.counts_,
        }
