"""Explications (XAI) du modèle figé : libellés, format de réponse et, plus tard, calcul TreeSHAP.

Une explication décrit le fonctionnement du modèle (quelles variables ont pesé sur sa
probabilité) ; elle n'indique pas la cause d'un mouvement du marché.
"""


class XaiError(Exception):
    """Erreur bloquante du module d'explication."""


class XaiSchemaError(XaiError):
    """Réponse XAI invalide (champ manquant ou inattendu, valeur non finie, incohérence)."""
