"""Entraînement et sélection des modèles ML (train 2020-2024, sélection sur validation 2025).

Le test 2026 n'est lisible que par ``final_test.py``, à partir d'une sélection figée.
"""


class TrainingError(Exception):
    """Erreur bloquante : rien n'est entraîné, sélectionné ou évalué."""


class TestAccessError(TrainingError):
    """Tentative d'accès au test en dehors de l'évaluation finale consignée."""

    __test__ = False
