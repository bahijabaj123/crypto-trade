"""Point d'entrée : python scripts\\evaluate_final_test.py --help

Évaluation finale UNIQUE du test 2026 : à lancer seulement après figeage de la sélection.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from cryptotrade_ai.training.final_test import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
