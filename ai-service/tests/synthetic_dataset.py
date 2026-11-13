"""DONNÉES SYNTHÉTIQUES POUR LES TESTS UNITAIRES UNIQUEMENT.

Ces bougies sont générées par un tirage pseudo-aléatoire à graine fixe pour vérifier le
code du dataset. Elles ne représentent aucun marché réel et ne doivent JAMAIS servir à
entraîner, valider ou évaluer un modèle. Les tests les écrivent uniquement dans tmp_path.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import random
from datetime import datetime, timezone
from pathlib import Path

from cryptotrade_ai.data.klines import month_start_ms, ms_to_utc_iso
from cryptotrade_ai.dataset.features import FEATURE_NAMES, INDICATOR_PARAMS
from cryptotrade_ai.dataset.source import Candle

HOUR_MS = 3_600_000
START_MS = month_start_ms(2024, 1)
SYMBOL = "BTCUSDT"
N_HOURS = 28 * 24

SOURCE_CSV = "processed/SYNTHETIQUE-BTCUSDT-1h.csv"
COLLECTION_REPORT = "reports/SYNTHETIQUE-BTCUSDT-1h.quality.json"


def hour(index: int) -> int:
    return START_MS + index * HOUR_MS


def make_candles(n: int = N_HOURS, *, seed: int = 7, skip: frozenset[int] = frozenset()) -> list[Candle]:
    rng = random.Random(seed)
    close = 100.0
    candles = []
    for i in range(n):
        open_ = close
        close = round(open_ * math.exp(rng.gauss(0, 0.01)), 2)
        high = round(max(open_, close) * (1 + rng.random() * 0.003), 2)
        low = round(min(open_, close) * (1 - rng.random() * 0.003), 2)
        volume = round(rng.uniform(1, 10), 6)
        trades = rng.randint(10, 500)
        taker = round(volume * rng.uniform(0.3, 0.7), 6)
        if i in skip:
            continue
        t = hour(i)
        candles.append(Candle(t, t + HOUR_MS - 1, open_, high, low, close, volume, round(volume * close, 6), trades, taker))
    return candles


def write_source_csv(
    path: Path, candles: list[Candle], *, symbol: str = SYMBOL, overrides: dict[int, dict[str, str]] | None = None
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "open_time", "open", "high", "low", "close", "volume", "close_time", "quote_asset_volume",
                "number_of_trades", "taker_buy_base_asset_volume", "taker_buy_quote_asset_volume", "ignore",
                "open_time_utc", "close_time_utc", "source_file",
            ]
        )
        for index, k in enumerate(candles):
            month = datetime.fromtimestamp(k.open_time // 1000, tz=timezone.utc).strftime("%Y-%m")
            row = {
                "open_time": str(k.open_time),
                "open": f"{k.open:.8f}",
                "high": f"{k.high:.8f}",
                "low": f"{k.low:.8f}",
                "close": f"{k.close:.8f}",
                "volume": f"{k.volume:.8f}",
                "close_time": str(k.close_time),
                "quote_asset_volume": f"{k.quote_volume:.8f}",
                "number_of_trades": str(k.trades),
                "taker_buy_base_asset_volume": f"{k.taker_buy_base:.8f}",
                "taker_buy_quote_asset_volume": f"{k.taker_buy_base * k.close:.8f}",
                "ignore": "0",
                "open_time_utc": ms_to_utc_iso(k.open_time),
                "close_time_utc": ms_to_utc_iso(k.close_time),
                "source_file": f"{symbol}-1h-{month}.zip",
            }
            row.update((overrides or {}).get(index, {}))
            writer.writerow(row.values())


def write_collection_report(
    path: Path, csv_path: Path, *, symbol: str = SYMBOL, sha: str | None = None, statut: str = "OK", missing: int = 0
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "statut": statut,
        "parametres": {"symbole": symbol, "intervalle": "1h"},
        "qualite": {"bougies_manquantes": missing},
        "sorties": {"csv": {"sha256": sha or hashlib.sha256(csv_path.read_bytes()).hexdigest()}},
    }
    path.write_text(json.dumps(report), encoding="utf-8")


def make_config(**overrides) -> dict:
    config = {
        "dataset_id": "SYNTHETIQUE-BTCUSDT-1h-test",
        "symbol": SYMBOL,
        "interval": "1h",
        "source": {"csv": SOURCE_CSV, "collection_report": COLLECTION_REPORT},
        "output_dir": "datasets/SYNTHETIQUE-v1",
        "target": {"name": "target_up_1h", "horizon_hours": 1, "evaluation_only_column": "fwd_return_1h"},
        "features": list(FEATURE_NAMES),
        "indicators": dict(INDICATOR_PARAMS),
        "conventions": {
            "ema_initialisation": "sma",
            "rsi_smoothing": "wilder",
            "volatility_ddof": 0,
            "hour_reference": "open_time_utc",
        },
        "min_history_hours": 72,
        "embargo_hours": 73,
        "splits": {
            "train": {"start": "2024-01-01T00:00:00Z", "end": "2024-01-15T00:00:00Z"},
            "validation": {"start": "2024-01-15T00:00:00Z", "end": "2024-01-22T00:00:00Z"},
            "test": {"start": "2024-01-22T00:00:00Z", "end": "2024-01-29T00:00:00Z"},
        },
    }
    config.update(overrides)
    return config


def write_fixture(
    tmp_path: Path,
    candles: list[Candle] | None = None,
    *,
    overrides: dict[int, dict[str, str]] | None = None,
    missing: int = 0,
) -> Path:
    """Écrit un CSV source synthétique et son rapport de collecte ; retourne le dossier de données."""
    data_dir = tmp_path / "data"
    csv_path = data_dir / SOURCE_CSV
    write_source_csv(csv_path, candles if candles is not None else make_candles(), overrides=overrides)
    write_collection_report(data_dir / COLLECTION_REPORT, csv_path, missing=missing)
    return data_dir
