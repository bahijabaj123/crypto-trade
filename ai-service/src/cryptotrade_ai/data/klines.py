"""Lecture, normalisation des horodatages et contrôle qualité des bougies Binance Spot.

Toutes les dates sont normalisées en millisecondes UTC depuis le 1er janvier 1970
(même unité que l'API REST Binance et le reste du projet).
"""

from __future__ import annotations

import csv
import io
import math
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone

KLINE_COLUMNS = (
    "open_time",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "close_time",
    "quote_asset_volume",
    "number_of_trades",
    "taker_buy_base_asset_volume",
    "taker_buy_quote_asset_volume",
    "ignore",
)

INTERVAL_MS = {
    "1m": 60_000,
    "3m": 3 * 60_000,
    "5m": 5 * 60_000,
    "15m": 15 * 60_000,
    "30m": 30 * 60_000,
    "1h": 3_600_000,
    "2h": 2 * 3_600_000,
    "4h": 4 * 3_600_000,
    "6h": 6 * 3_600_000,
    "8h": 8 * 3_600_000,
    "12h": 12 * 3_600_000,
    "1d": 86_400_000,
}

# Binance Spot : horodatages en microsecondes à partir des données du 1er janvier 2025.
MICROSECONDS_SINCE_MONTH = (2025, 1)

_MS_RANGE = (10**11, 10**14)
_US_RANGE = (10**14, 10**17)


class KlineDataError(Exception):
    """Erreur bloquante sur le contenu des données (jamais corrigée par invention)."""


# --- Mois et dates -----------------------------------------------------------


def parse_month(text: str) -> tuple[int, int]:
    """Convertit ``"AAAA-MM"`` en ``(année, mois)``."""
    parts = text.strip().split("-")
    if len(parts) != 2 or len(parts[0]) != 4 or len(parts[1]) != 2:
        raise ValueError(f"Mois invalide : {text!r} (format attendu AAAA-MM)")
    try:
        year, month = int(parts[0]), int(parts[1])
    except ValueError as exc:
        raise ValueError(f"Mois invalide : {text!r} (format attendu AAAA-MM)") from exc
    if not 1 <= month <= 12:
        raise ValueError(f"Mois invalide : {text!r} (mois entre 01 et 12)")
    return year, month


def next_month(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


def iter_months(start: tuple[int, int], end: tuple[int, int]) -> list[tuple[int, int]]:
    """Liste des mois de ``start`` à ``end`` inclus."""
    if end < start:
        raise ValueError("Le mois de fin doit être postérieur ou égal au mois de début")
    months = []
    current = start
    while current <= end:
        months.append(current)
        current = next_month(*current)
    return months


def month_start_ms(year: int, month: int) -> int:
    """Début du mois (00:00:00 UTC) en millisecondes."""
    return int(datetime(year, month, 1, tzinfo=timezone.utc).timestamp()) * 1000


def ms_to_utc_iso(ms: int) -> str:
    """Millisecondes UTC -> texte ISO 8601, par ex. ``2020-01-01T00:00:00.000Z``."""
    seconds, millis = divmod(ms, 1000)
    moment = datetime.fromtimestamp(seconds, tz=timezone.utc)
    return f"{moment.strftime('%Y-%m-%dT%H:%M:%S')}.{millis:03d}Z"


def utc_iso_to_ms(text: str) -> int:
    """Texte ISO 8601 avec fuseau explicite -> millisecondes UTC."""
    value = text.strip()
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    try:
        moment = datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"Date invalide : {text!r} (exemple : 2026-10-01T00:00:00Z)") from exc
    if moment.tzinfo is None:
        raise ValueError(f"Date sans fuseau horaire : {text!r} (ajouter Z pour UTC)")
    moment = moment.astimezone(timezone.utc)
    return int(moment.timestamp()) * 1000 + moment.microsecond // 1000


# --- Horodatages ms / µs --------------------------------------------------------


def detect_timestamp_unit(value: int) -> str:
    """Détecte l'unité d'un horodatage Binance d'après son ordre de grandeur.

    Millisecondes : 13 chiffres (≈ 1,5e12 en 2017). Microsecondes : 16 chiffres.
    """
    if _MS_RANGE[0] <= value < _MS_RANGE[1]:
        return "ms"
    if _US_RANGE[0] <= value < _US_RANGE[1]:
        return "us"
    raise KlineDataError(f"Horodatage impossible à interpréter (ni ms ni µs) : {value}")


def expected_unit_for_month(year: int, month: int) -> str:
    """Unité annoncée par Binance pour les archives Spot d'un mois donné."""
    return "us" if (year, month) >= MICROSECONDS_SINCE_MONTH else "ms"


def to_milliseconds(value: int, unit: str) -> int:
    if unit == "ms":
        return value
    if unit == "us":
        return value // 1000
    raise ValueError(f"Unité inconnue : {unit!r}")


# --- Lecture et normalisation ---------------------------------------------------


@dataclass(frozen=True)
class Kline:
    """Une bougie : 12 champs d'origine, horodatages convertis en ms UTC."""

    open_time: int
    close_time: int
    fields: tuple[str, ...]
    source_file: str


@dataclass(frozen=True)
class RowIssue:
    """Ligne rejetée, avec la raison du rejet."""

    source_file: str
    line: int
    reason: str
    open_time: int | None = None


@dataclass
class ParsedFile:
    klines: list[Kline] = field(default_factory=list)
    issues: list[RowIssue] = field(default_factory=list)
    unit: str | None = None


def read_kline_csv(text: str) -> tuple[list[list[str]], bool]:
    """Lit le CSV d'une archive. Retourne les lignes et un indicateur « en-tête ignoré »."""
    rows = [row for row in csv.reader(io.StringIO(text)) if any(cell.strip() for cell in row)]
    header_skipped = False
    if rows and not rows[0][0].strip().isdigit():
        header_skipped = True
        rows = rows[1:]
    return rows, header_skipped


def normalize_rows(
    rows: list[list[str]],
    *,
    source_file: str,
    year: int,
    month: int,
    interval_ms: int,
    first_line_number: int = 1,
) -> ParsedFile:
    """Valide chaque ligne d'un fichier mensuel et convertit les horodatages en ms.

    Les lignes invalides sont rejetées et listées, jamais réparées.
    """
    month_start = month_start_ms(year, month)
    month_end = month_start_ms(*next_month(year, month))
    result = ParsedFile()

    for index, raw in enumerate(rows):
        line = first_line_number + index
        cells = [cell.strip() for cell in raw]

        if len(cells) != len(KLINE_COLUMNS):
            result.issues.append(RowIssue(source_file, line, "nombre_de_colonnes"))
            continue
        try:
            open_raw, close_raw = int(cells[0]), int(cells[6])
        except ValueError:
            result.issues.append(RowIssue(source_file, line, "horodatage_non_entier"))
            continue
        try:
            unit = detect_timestamp_unit(open_raw)
            close_unit = detect_timestamp_unit(close_raw)
        except KlineDataError:
            result.issues.append(RowIssue(source_file, line, "horodatage_hors_plage"))
            continue
        if close_unit != unit or (result.unit is not None and unit != result.unit):
            result.issues.append(RowIssue(source_file, line, "unite_incoherente"))
            continue
        if result.unit is None:
            result.unit = unit

        open_ms = to_milliseconds(open_raw, unit)
        close_ms = to_milliseconds(close_raw, unit)
        reason = _validate_values(cells, open_ms, close_ms, interval_ms, month_start, month_end)
        if reason:
            result.issues.append(RowIssue(source_file, line, reason, open_ms))
            continue

        fields = (str(open_ms), *cells[1:6], str(close_ms), *cells[7:12])
        result.klines.append(Kline(open_ms, close_ms, fields, source_file))

    return result


def _validate_values(
    cells: list[str],
    open_ms: int,
    close_ms: int,
    interval_ms: int,
    month_start: int,
    month_end: int,
) -> str | None:
    try:
        o, h, l, c = (float(cells[i]) for i in (1, 2, 3, 4))
        volumes = [float(cells[i]) for i in (5, 7, 9, 10)]
    except ValueError:
        return "valeur_non_numerique"
    if not all(math.isfinite(x) for x in (o, h, l, c, *volumes)):
        return "valeur_non_finie"
    if min(o, h, l, c) <= 0:
        return "prix_non_positif"
    if any(v < 0 for v in volumes):
        return "volume_negatif"
    if not (l <= min(o, c) and h >= max(o, c) and l <= h):
        return "ohlc_incoherent"
    try:
        trades = int(cells[8])
    except ValueError:
        return "nombre_de_transactions_invalide"
    if trades < 0:
        return "nombre_de_transactions_invalide"
    if open_ms % interval_ms != 0:
        return "ouverture_non_alignee"
    if close_ms != open_ms + interval_ms - 1:
        return "cloture_incoherente"
    if not month_start <= open_ms < month_end:
        return "hors_du_mois_source"
    return None


# --- Contrôle qualité de la série complète --------------------------------------


@dataclass
class QualityResult:
    clean: list[Kline]
    expected_candles: int
    non_chronological: int
    duplicates_identical: int
    duplicates_conflicting: list[int]
    outside_period: int
    not_closed: int
    gaps: list[dict]
    missing_candles: int
    zero_volume: int
    flat: int
    taker_above_volume: int


def check_quality(
    klines: list[Kline],
    *,
    interval_ms: int,
    period_start_ms: int,
    period_end_ms: int,
    reference_time_ms: int,
) -> QualityResult:
    """Contrôle la série dans l'ordre de lecture et produit la série nettoyée triée.

    - ``period_end_ms`` est exclusif ;
    - une bougie n'est conservée que si elle est clôturée avant ``reference_time_ms`` ;
    - les trous sont listés, jamais comblés.
    """
    non_chronological = 0
    previous: int | None = None
    for kline in klines:
        if previous is not None and kline.open_time < previous:
            non_chronological += 1
        previous = kline.open_time

    outside_period = 0
    not_closed = 0
    groups: dict[int, list[Kline]] = {}
    for kline in klines:
        if not period_start_ms <= kline.open_time < period_end_ms:
            outside_period += 1
            continue
        if kline.close_time >= reference_time_ms:
            not_closed += 1
            continue
        groups.setdefault(kline.open_time, []).append(kline)

    duplicates_identical = 0
    duplicates_conflicting: list[int] = []
    clean: list[Kline] = []
    for open_time, group in groups.items():
        if len(group) == 1:
            clean.append(group[0])
        elif all(k.fields == group[0].fields for k in group):
            duplicates_identical += len(group) - 1
            clean.append(group[0])
        else:
            duplicates_conflicting.append(open_time)
    clean.sort(key=lambda k: k.open_time)
    duplicates_conflicting.sort()

    expected: list[int] = []
    t = period_start_ms
    while t < period_end_ms and t + interval_ms - 1 < reference_time_ms:
        expected.append(t)
        t += interval_ms
    present = {k.open_time for k in clean}
    missing = [t for t in expected if t not in present]
    gaps = _group_gaps(missing, interval_ms)

    zero_volume = flat = taker_above_volume = 0
    for kline in clean:
        o, h, l, c, v = (float(kline.fields[i]) for i in (1, 2, 3, 4, 5))
        if v == 0:
            zero_volume += 1
        if o == h == l == c:
            flat += 1
        if float(kline.fields[9]) > v:
            taker_above_volume += 1

    return QualityResult(
        clean=clean,
        expected_candles=len(expected),
        non_chronological=non_chronological,
        duplicates_identical=duplicates_identical,
        duplicates_conflicting=duplicates_conflicting,
        outside_period=outside_period,
        not_closed=not_closed,
        gaps=gaps,
        missing_candles=len(missing),
        zero_volume=zero_volume,
        flat=flat,
        taker_above_volume=taker_above_volume,
    )


def _group_gaps(missing: list[int], interval_ms: int) -> list[dict]:
    gaps: list[dict] = []
    if not missing:
        return gaps
    start = previous = missing[0]
    for t in missing[1:]:
        if t != previous + interval_ms:
            gaps.append(_gap(start, previous, interval_ms))
            start = t
        previous = t
    gaps.append(_gap(start, previous, interval_ms))
    return gaps


def _gap(first: int, last: int, interval_ms: int) -> dict:
    return {
        "premiere_bougie_manquante_utc": ms_to_utc_iso(first),
        "derniere_bougie_manquante_utc": ms_to_utc_iso(last),
        "bougies_manquantes": (last - first) // interval_ms + 1,
    }


def count_issues_by_reason(issues: list[RowIssue]) -> dict[str, int]:
    return dict(sorted(Counter(issue.reason for issue in issues).items()))
