"""Prédiction live du modèle figé, sans HTTP : bougies Binance closes, 17 variables, politique ATTENDRE.

Aucun ordre n'est passé, aucun fichier n'est écrit, aucun seuil n'est recalculé.
"""


class PredictionServiceError(Exception):
    """Erreur bloquante du service de prédiction (données, modèle ou incohérence interne)."""
