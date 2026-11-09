"""États de décision HAUSSE / BAISSE / ATTENDRE.

Une probabilité élevée ne garantit aucun profit : elle est estimée sur le passé, le marché
change, et les frais peuvent absorber un faible avantage. Sans signal autorisé (aucun modèle
meilleur que les baselines, ou calibration insuffisante) ou sans marge figée, tout est ATTENDRE.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from cryptotrade_ai.training import TrainingError

HAUSSE = "HAUSSE"
BAISSE = "BAISSE"
ATTENDRE = "ATTENDRE"
DISCLAIMER = (
    "Diagnostic historique sur validation : une probabilité élevée ne garantit aucun profit. "
    "Les rendements sont bruts ou nets d'une hypothèse de frais, hors glissement de prix."
)


@dataclass(frozen=True)
class DecisionPolicy:
    signal_authorized: bool
    margin: float | None
    target_coverage: float | None = None

    def as_dict(self) -> dict:
        return {
            "signal_autorise": self.signal_authorized,
            "couverture_cible": self.target_coverage,
            "marge": self.margin,
            "regle": "HAUSSE si p >= 0,5 + marge ; BAISSE si p <= 0,5 - marge ; ATTENDRE sinon ou si le signal est refusé",
        }


REFUSED_POLICY = DecisionPolicy(signal_authorized=False, margin=None)


def margin_for_coverage(validation_probabilities: np.ndarray, coverage: float) -> float:
    """Marge telle qu'environ ``coverage`` des heures de validation reçoivent un signal."""
    if not 0 < coverage <= 1:
        raise TrainingError("La couverture doit être dans ]0, 1]")
    distance = np.abs(np.asarray(validation_probabilities, dtype=np.float64) - 0.5)
    return float(np.quantile(distance, 1 - coverage))


def decide(probabilities: np.ndarray, policy: DecisionPolicy) -> np.ndarray:
    p = np.asarray(probabilities, dtype=np.float64)
    states = np.full(len(p), ATTENDRE, dtype=object)
    if not policy.signal_authorized or policy.margin is None:
        return states
    states[(p > 0.5) & (p - 0.5 >= policy.margin)] = HAUSSE
    states[(p < 0.5) & (0.5 - p >= policy.margin)] = BAISSE
    return states


def decision_summary(states: np.ndarray, y: np.ndarray, fwd_return: np.ndarray, *, fee_per_side: float) -> dict:
    """Bilan des décisions : effectifs, exactitude des signaux et rendements moyens (diagnostic)."""
    y = np.asarray(y)
    fwd_return = np.asarray(fwd_return, dtype=np.float64)
    up, down = states == HAUSSE, states == BAISSE
    acted = up | down
    correct = (up & (y == 1)) | (down & (y == 0))
    round_trip = 2 * fee_per_side
    return {
        "exemples": int(len(states)),
        "hausse": int(up.sum()),
        "baisse": int(down.sum()),
        "attendre": int((~acted).sum()),
        "couverture_reelle": float(acted.mean()) if len(states) else 0.0,
        "exactitude_des_signaux": float(correct[acted].mean()) if acted.any() else None,
        "rendement_log_moyen_brut_hausse": float(fwd_return[up].mean()) if up.any() else None,
        "rendement_log_moyen_net_hausse": float(fwd_return[up].mean() - round_trip) if up.any() else None,
        "rendement_log_moyen_brut_baisse_evitee": float(-fwd_return[down].mean()) if down.any() else None,
        "frais_aller_retour_supposes": round_trip,
        "avertissement": DISCLAIMER,
    }


def coverage_table(
    p: np.ndarray, y: np.ndarray, fwd_return: np.ndarray, coverages: tuple[float, ...], *, fee_per_side: float
) -> list[dict]:
    """Courbe couverture / qualité sur validation : sert à choisir plus tard une couverture, sans la fixer ici."""
    rows = []
    for coverage in coverages:
        margin = margin_for_coverage(p, coverage)
        states = decide(p, DecisionPolicy(signal_authorized=True, margin=margin, target_coverage=coverage))
        rows.append({"couverture_cible": coverage, "marge": margin, **decision_summary(states, y, fwd_return, fee_per_side=fee_per_side)})
    return rows
