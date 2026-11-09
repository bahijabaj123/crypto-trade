"""Configuration simple du module IA : valeurs par défaut et dossiers de données.

Les données sont stockées localement (hors Git) dans ``ai-service/data/`` par défaut.
Ce dossier peut être déplacé avec la variable d'environnement ``CRYPTOTRADE_AI_DATA_DIR``
ou l'option ``--data-dir`` du script de collecte.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

AI_SERVICE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = AI_SERVICE_DIR / "data"
DATA_DIR_ENV_VAR = "CRYPTOTRADE_AI_DATA_DIR"

# Période fixe par défaut : elle ne dépend jamais de la date du jour.
DEFAULT_SYMBOL = "BTCUSDT"
DEFAULT_INTERVAL = "1h"
DEFAULT_START_MONTH = "2020-01"
DEFAULT_END_MONTH = "2026-09"

BINANCE_DATA_BASE_URL = "https://data.binance.vision"
REQUEST_DELAY_SECONDS = 1.0
REQUEST_TIMEOUT_SECONDS = 30.0
MAX_RETRIES = 3


@dataclass(frozen=True)
class DataPaths:
    """Arborescence locale des données."""

    base: Path

    @property
    def raw(self) -> Path:
        """Archives ZIP et fichiers .CHECKSUM officiels, conservés tels quels."""
        return self.base / "raw" / "binance"

    @property
    def processed(self) -> Path:
        """CSV nettoyés."""
        return self.base / "processed"

    @property
    def reports(self) -> Path:
        """Rapports qualité JSON."""
        return self.base / "reports"


def resolve_data_dir(cli_value: str | None = None) -> Path:
    """Choisit le dossier de données : option CLI, puis variable d'environnement, puis défaut."""
    if cli_value:
        return Path(cli_value).expanduser().resolve()
    env_value = os.environ.get(DATA_DIR_ENV_VAR)
    if env_value:
        return Path(env_value).expanduser().resolve()
    return DEFAULT_DATA_DIR
