"""Lance l'API FastAPI en local : python scripts\\run_api.py

Écoute uniquement 127.0.0.1:8000, sans rechargement automatique.
Le dossier de données vient de CRYPTOTRADE_AI_DATA_DIR (jamais un chemin Windows personnel en dur).
Aucun ordre n'est passé, le modèle n'est ni réentraîné ni recalibré.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import uvicorn  # noqa: E402

from cryptotrade_ai.api.app import create_app  # noqa: E402
from cryptotrade_ai.api.settings import API_HOST, API_PORT, ApiSettings  # noqa: E402


def main() -> int:
    settings = ApiSettings.from_env()
    uvicorn.run(
        create_app(settings=settings),
        host=API_HOST,
        port=API_PORT,
        reload=False,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
