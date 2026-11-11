"""Données de marché en direct pour la prédiction : bougies Binance Spot closes, puis 17 variables.

Aucun ordre n'est passé, aucun fichier n'est écrit. Les appels HTTP sont isolés dans le client
REST, injectable pour les tests : pytest n'interroge jamais Binance.
"""


class LiveError(Exception):
    """Erreur bloquante des données ou de l'historique en direct."""


class MarketDataError(LiveError):
    """Réponse de marché illisible, refusée ou trop volumineuse : aucune donnée n'est inventée."""


class HistoryError(LiveError):
    """Bougies closes insuffisantes, trop anciennes, ou non consécutives depuis le dernier trou."""
