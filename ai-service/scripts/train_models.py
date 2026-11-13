"""Point d'entrée : python scripts\\train_models.py --help"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from cryptotrade_ai.training.experiment import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
