"""Métriques de validation : log loss, Brier, ROC-AUC, accuracy, matrice de confusion, calibration."""

from __future__ import annotations

import numpy as np
from sklearn.metrics import confusion_matrix, roc_auc_score

PROBABILITY_CLIP = 1e-15
SIMULATION_BATCH = 100


def per_example_log_loss(y: np.ndarray, p: np.ndarray) -> np.ndarray:
    p = np.clip(np.asarray(p, dtype=np.float64), PROBABILITY_CLIP, 1 - PROBABILITY_CLIP)
    y = np.asarray(y, dtype=np.float64)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


def classification_metrics(y: np.ndarray, p: np.ndarray, y_pred: np.ndarray | None = None) -> dict:
    """``y_pred`` par défaut : 1 si p >= 0,5. Les baselines fournissent leur propre règle."""
    y = np.asarray(y, dtype=np.int64)
    p = np.asarray(p, dtype=np.float64)
    if y_pred is None:
        y_pred = (p >= 0.5).astype(np.int64)
    tn, fp, fn, tp = confusion_matrix(y, y_pred, labels=[0, 1]).ravel()
    both_classes = 0 < y.sum() < len(y)
    return {
        "exemples": int(len(y)),
        "taux_hausse_observe": float(y.mean()),
        "probabilite_moyenne": float(p.mean()),
        "log_loss": float(per_example_log_loss(y, p).mean()),
        "brier": float(np.mean((p - y) ** 2)),
        "roc_auc": float(roc_auc_score(y, p)) if both_classes else None,
        "accuracy": float(np.mean(y_pred == y)),
        "matrice_confusion": {
            "vrais_negatifs": int(tn),
            "faux_positifs": int(fp),
            "faux_negatifs": int(fn),
            "vrais_positifs": int(tp),
        },
        "part_predite_hausse": float(np.mean(y_pred == 1)),
    }


def _bins(p: np.ndarray, n_bins: int) -> list[np.ndarray]:
    """Groupes de tailles égales (± 1) après tri stable des probabilités."""
    order = np.argsort(p, kind="stable")
    return [chunk for chunk in np.array_split(order, min(n_bins, len(p))) if len(chunk)]


def calibration_table(y: np.ndarray, p: np.ndarray, n_bins: int) -> tuple[list[dict], float]:
    y = np.asarray(y, dtype=np.float64)
    p = np.asarray(p, dtype=np.float64)
    rows, ece = [], 0.0
    for index, chunk in enumerate(_bins(p, n_bins)):
        mean_p, freq = float(p[chunk].mean()), float(y[chunk].mean())
        ece += len(chunk) / len(p) * abs(mean_p - freq)
        rows.append(
            {
                "groupe": index + 1,
                "exemples": int(len(chunk)),
                "proba_min": float(p[chunk].min()),
                "proba_max": float(p[chunk].max()),
                "proba_moyenne": mean_p,
                "frequence_hausse_observee": freq,
                "ecart": freq - mean_p,
            }
        )
    return rows, float(ece)


def calibration_check(
    y: np.ndarray, p: np.ndarray, *, n_bins: int, n_simulations: int, confidence: float, seed: int
) -> dict:
    """Compare l'ECE observée aux ECE d'un modèle parfaitement calibré (cibles tirées selon p).

    L'ECE n'est jamais nulle sur un échantillon fini : ce seuil indique ce que le hasard seul
    produirait avec ces probabilités et cet effectif. Les heures sont simulées indépendantes,
    donc le seuil est plutôt sévère pour des données temporelles autocorrélées.
    """
    p = np.asarray(p, dtype=np.float64)
    rows, observed = calibration_table(y, p, n_bins)
    chunks = _bins(p, n_bins)
    weights = np.array([len(c) for c in chunks], dtype=np.float64) / len(p)
    means = np.array([p[c].mean() for c in chunks])
    rng = np.random.default_rng(seed)
    simulated = []
    for start in range(0, n_simulations, SIMULATION_BATCH):
        size = min(SIMULATION_BATCH, n_simulations - start)
        draws = rng.random((size, len(p))) < p
        freqs = np.column_stack([draws[:, c].mean(axis=1) for c in chunks])
        simulated.append(np.abs(freqs - means) @ weights)
    simulated = np.concatenate(simulated)
    threshold = float(np.quantile(simulated, confidence))
    return {
        "ece": observed,
        "seuil_ece_hasard": threshold,
        "quantile": confidence,
        "simulations": n_simulations,
        "suffisante": observed <= threshold,
        "tableau": rows,
    }


def block_bootstrap_mean(values: np.ndarray, *, block: int, n_resamples: int, confidence: float, seed: int) -> dict:
    """Intervalle de la moyenne par bootstrap de blocs consécutifs (préserve la dépendance temporelle courte)."""
    values = np.asarray(values, dtype=np.float64)
    starts = np.arange(0, len(values), block)
    sums = np.add.reduceat(values, starts)
    sizes = np.diff(np.append(starts, len(values))).astype(np.float64)
    rng = np.random.default_rng(seed)
    picks = rng.integers(0, len(starts), size=(n_resamples, len(starts)))
    means = sums[picks].sum(axis=1) / sizes[picks].sum(axis=1)
    alpha = (1 - confidence) / 2
    return {
        "moyenne": float(values.mean()),
        "borne_basse": float(np.quantile(means, alpha)),
        "borne_haute": float(np.quantile(means, 1 - alpha)),
        "confiance": confidence,
        "taille_bloc": block,
        "reechantillonnages": n_resamples,
    }
