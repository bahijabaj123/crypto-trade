"""Réglages de l'API FastAPI : dossier de données, modèle figé, CORS, écoute locale.

Le dossier de données vient de ``CRYPTOTRADE_AI_DATA_DIR``, jamais d'un chemin Windows
personnel écrit en dur. Seul l'essai figé est accepté.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from cryptotrade_ai.api.service import FROZEN_EXPERIMENT, FROZEN_TRIAL
from cryptotrade_ai.config import resolve_data_dir
from cryptotrade_ai.training.config import DEFAULT_TRAINING_CONFIG_PATH

API_HOST = "127.0.0.1"
API_PORT = 8000
API_PREFIX = "/api/ia"
DEFAULT_CORS_ORIGINS = ("http://localhost:4200", "http://127.0.0.1:4200")


@dataclass(frozen=True)
class ApiSettings:
    """Configuration lue à l'amorçage : aucun secret, aucun chemin personnel codé en dur."""

    data_dir: Path
    config_path: Path
    expected_experiment: str
    expected_trial: str
    cors_origins: tuple[str, ...]
    host: str = API_HOST
    port: int = API_PORT
    autoload: bool = True

    @classmethod
    def from_env(cls) -> ApiSettings:
        """Lit ``CRYPTOTRADE_AI_DATA_DIR`` et fige l'expérience / l'essai autorisés."""
        return cls(
            data_dir=resolve_data_dir(),
            config_path=DEFAULT_TRAINING_CONFIG_PATH,
            expected_experiment=FROZEN_EXPERIMENT,
            expected_trial=FROZEN_TRIAL,
            cors_origins=DEFAULT_CORS_ORIGINS,
            host=API_HOST,
            port=API_PORT,
            autoload=True,
        )
