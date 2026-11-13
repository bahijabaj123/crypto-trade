"""DONNÉES SYNTHÉTIQUES POUR LES TESTS UNITAIRES UNIQUEMENT.

Ces bougies sont inventées pour vérifier le code (conversion des dates, contrôles qualité).
Elles ne représentent aucun marché réel et ne doivent JAMAIS servir à entraîner,
valider ou évaluer un modèle. Les tests les écrivent uniquement dans des dossiers
temporaires (tmp_path), jamais dans ai-service/data/.
"""

from __future__ import annotations

import io
import zipfile

from cryptotrade_ai.data.klines import month_start_ms, next_month

HOUR_MS = 3_600_000


def make_row(
    open_ms: int,
    *,
    o: str = "100.0",
    h: str = "110.0",
    l: str = "90.0",
    c: str = "105.0",
    volume: str = "1.5",
    unit: str = "ms",
    interval_ms: int = HOUR_MS,
    trades: str = "10",
    taker_base: str = "0.5",
) -> list[str]:
    factor = 1000 if unit == "us" else 1
    open_raw = open_ms * factor
    close_raw = open_raw + interval_ms * factor - 1
    return [str(open_raw), o, h, l, c, volume, str(close_raw), "157.5", trades, taker_base, "52.5", "0"]


def make_month_rows(year: int, month: int, unit: str) -> list[list[str]]:
    start = month_start_ms(year, month)
    end = month_start_ms(*next_month(year, month))
    return [make_row(t, unit=unit) for t in range(start, end, HOUR_MS)]


def rows_to_csv(rows: list[list[str]]) -> str:
    return "".join(",".join(row) + "\n" for row in rows)


def make_zip_bytes(csv_name: str, rows: list[list[str]]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(csv_name, rows_to_csv(rows))
    return buffer.getvalue()
