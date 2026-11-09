"""Construction du dataset ML : variables causales, cible t+1h, découpage chronologique."""


class DatasetError(Exception):
    """Erreur bloquante : aucun fichier de sortie n'est écrit et aucune donnée n'est inventée."""
