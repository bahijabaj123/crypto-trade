"""DONNÉES SYNTHÉTIQUES POUR LES TESTS UNITAIRES UNIQUEMENT.

Ce générateur écrit, dans tmp_path, un faux dataset au format de BTCUSDT-1h-v1 (dataset.csv,
config_used.json, dataset_report.json). Les variables sont tirées au hasard avec une graine
fixe ; la cible peut dépendre d'une variable (``signal``) pour vérifier qu'un modèle utile est
reconnu, ou en être indépendante (``signal=0``) pour vérifier le refus de signal.
Ces données ne représentent aucun marché réel et ne doivent JAMAIS servir à entraîner,
valider ou évaluer un modèle réel.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import random
from pathlib import Path

from cryptotrade_ai.data.klines import ms_to_utc_iso, utc_iso_to_ms
from cryptotrade_ai.dataset.features import FEATURE_NAMES
from cryptotrade_ai.training.config import DEFAULT_TRAINING_CONFIG_PATH

HOUR_MS = 3_600_000
DATASET_ID = "SYNTHETIQUE-BTCUSDT-1h-entrainement"
DATASET_DIR = "datasets/SYNTHETIQUE-entrainement"
META = ("open_time", "open_time_utc", "decision_time_utc", "symbol", "split")
COLUMNS = (*META, *FEATURE_NAMES, "target_up_1h", "fwd_return_1h")
SPLITS = (
    ("train", "2024-01-01T00:00:00.000Z", "2024-05-01T00:00:00.000Z"),
    ("validation", "2024-05-01T00:00:00.000Z", "2024-07-01T00:00:00.000Z"),
    ("test", "2024-07-01T00:00:00.000Z", "2024-08-01T00:00:00.000Z"),
)
SIGNAL_FEATURE = "dist_sma_24"
TEST_GARBAGE = "NON_LU"


def make_rows(*, seed: int = 3, signal: float = 1.2, skip: frozenset[int] = frozenset({100, 101, 3000})) -> list[list[str]]:
    rng = random.Random(seed)
    rows, index = [], 0
    signal_column = FEATURE_NAMES.index(SIGNAL_FEATURE)
    for name, start, end in SPLITS:
        for t in range(utc_iso_to_ms(start), utc_iso_to_ms(end), HOUR_MS):
            index += 1
            features = [rng.gauss(0, 1) for _ in FEATURE_NAMES]
            features[FEATURE_NAMES.index("ret_1h")] = rng.gauss(0, 0.005)
            probability = 1 / (1 + math.exp(-signal * features[signal_column]))
            up = 1 if rng.random() < probability else 0
            fwd = (1 if up else -1) * abs(rng.gauss(0, 0.005))
            if index in skip:
                continue
            rows.append(
                [str(t), ms_to_utc_iso(t), ms_to_utc_iso(t + HOUR_MS), "BTCUSDT", name, *map(repr, features), str(up), repr(fwd)]
            )
    return rows


def write_dataset(
    data_dir: Path,
    rows: list[list[str]] | None = None,
    *,
    header: tuple[str, ...] = COLUMNS,
    test_garbage: bool = False,
    report_overrides: dict | None = None,
) -> Path:
    rows = [list(r) for r in (rows if rows is not None else make_rows())]
    if test_garbage:
        for row in rows:
            if row[4] == "test":
                row[5:] = [TEST_GARBAGE] * (len(row) - 5)
    folder = data_dir / DATASET_DIR
    folder.mkdir(parents=True, exist_ok=True)
    csv_path = folder / "dataset.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)
    config_used = {
        "dataset_id": DATASET_ID,
        "configuration": {"symbol": "BTCUSDT"},
        "valeurs_derivees": {
            "variables_entree": list(FEATURE_NAMES),
            "colonnes_dataset": list(COLUMNS),
            "ensembles": [{"nom": n, "debut_utc": s, "fin_exclue_utc": e} for n, s, e in SPLITS],
        },
    }
    config_used_path = folder / "config_used.json"
    config_used_path.write_text(json.dumps(config_used), encoding="utf-8")
    counts = {n: sum(1 for r in rows if r[4] == n) for n, _, _ in SPLITS}
    report = {
        "statut": "OK",
        "dataset_id": DATASET_ID,
        "empreintes_sha256": {"dataset_csv": _sha(csv_path), "config_used": _sha(config_used_path)},
        "verifications": [{"controle": "synthetique", "ok": True}],
        "ensembles": {n: {"equilibre": {"exemples": c}} for n, c in counts.items()},
    }
    report.update(report_overrides or {})
    (folder / "dataset_report.json").write_text(json.dumps(report), encoding="utf-8")
    return folder


def training_config_dict(**overrides) -> dict:
    """Configuration réelle du dépôt, réduite pour des tests rapides (même structure, mêmes règles)."""
    config = json.loads(Path(DEFAULT_TRAINING_CONFIG_PATH).read_text(encoding="utf-8"))
    config["dataset"] = {"dataset_id": DATASET_ID, "dir": DATASET_DIR}
    config["models"]["random_forest"] = {
        "fixed": {"n_estimators": 25, "max_features": "sqrt", "n_jobs": 1},
        "grid": {"max_depth": [3, 5], "min_samples_leaf": [20]},
    }
    config["selection"]["bootstrap"]["n_resamples"] = 200
    config["calibration"]["n_simulations"] = 200
    config.update(overrides)
    return config


def write_training_config(path: Path, config: dict | None = None) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config or training_config_dict(), indent=2), encoding="utf-8")
    return path


def write_fixture(tmp_path: Path, **dataset_kwargs) -> tuple[Path, Path]:
    """Écrit un dataset et une configuration synthétiques ; retourne (data_dir, config_path)."""
    data_dir = tmp_path / "data"
    write_dataset(data_dir, **dataset_kwargs)
    return data_dir, write_training_config(tmp_path / "training.json")


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()
