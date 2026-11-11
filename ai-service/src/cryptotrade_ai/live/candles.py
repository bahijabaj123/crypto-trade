"""Validation des bougies Binance Spot pour une prédiction : closes, cohérentes, consécutives.

Une bougie encore ouverte n'est jamais une observation terminée. Un trou n'est jamais comblé.
Les horodatages microsecondes (archives 2025+) sont ramenés en millisecondes comme le collecteur.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from cryptotrade_ai.data.klines import INTERVAL_MS, KlineDataError, detect_timestamp_unit, ms_to_utc_iso, to_milliseconds
from cryptotrade_ai.dataset import DatasetError
from cryptotrade_ai.dataset.continuity import find_gaps, segment_bounds
from cryptotrade_ai.dataset.features import required_history
from cryptotrade_ai.dataset.source import Candle
from cryptotrade_ai.live import HistoryError, MarketDataError
from cryptotrade_ai.live.binance_rest import LIVE_INTERVAL, LIVE_SYMBOL, MAX_KLINES, MIN_KLINES

KLINE_WIDTH = 12
INTERVAL_MS_1H = INTERVAL_MS[LIVE_INTERVAL]


@dataclass(frozen=True)
class ClosedSeries:
    """Série de bougies **closes**, prête pour le calcul des variables (aucun prix simulé)."""

    symbol: str
    interval: str
    candles: tuple[Candle, ...]
    server_time_ms: int
    discarded_open: int
    gaps: tuple[dict, ...]
    last_segment_length: int

    @property
    def last(self) -> Candle:
        return self.candles[-1]


def expected_last_closed_open_time(server_time_ms: int, interval_ms: int = INTERVAL_MS_1H) -> int:
    """Ouverture de la dernière heure déjà close à ``server_time_ms`` (horloge Binance)."""
    if isinstance(server_time_ms, bool) or not isinstance(server_time_ms, int) or server_time_ms < interval_ms:
        raise HistoryError("Heure serveur Binance invalide")
    current_hour = (server_time_ms // interval_ms) * interval_ms
    return current_hour - interval_ms


def parse_kline_row(row, *, interval_ms: int = INTERVAL_MS_1H) -> Candle:
    """Une ligne REST Binance (12 champs) -> ``Candle`` en millisecondes UTC."""
    if not isinstance(row, (list, tuple)) or len(row) < 11:
        raise MarketDataError("Ligne kline : 12 champs Binance attendus")
    try:
        open_raw, close_raw = _as_int(row[0], "open_time"), _as_int(row[6], "close_time")
        unit = detect_timestamp_unit(open_raw)
        if detect_timestamp_unit(close_raw) != unit:
            raise MarketDataError("Ligne kline : unités d'horodatage incohérentes")
        open_ms, close_ms = to_milliseconds(open_raw, unit), to_milliseconds(close_raw, unit)
        candle = Candle(
            open_time=open_ms,
            close_time=close_ms,
            open=_as_float(row[1], "open"),
            high=_as_float(row[2], "high"),
            low=_as_float(row[3], "low"),
            close=_as_float(row[4], "close"),
            volume=_as_float(row[5], "volume"),
            quote_volume=_as_float(row[7], "quote_asset_volume"),
            trades=_as_int(row[8], "number_of_trades"),
            taker_buy_base=_as_float(row[9], "taker_buy_base_asset_volume"),
        )
    except (TypeError, ValueError, MarketDataError, KlineDataError) as exc:
        raise MarketDataError(f"Ligne kline illisible : {exc}") from exc
    problem = _candle_problem(candle, interval_ms)
    if problem:
        raise MarketDataError(f"Bougie invalide à {ms_to_utc_iso(candle.open_time)} : {problem}")
    return candle


def closed_series_from_klines(
    rows: Sequence,
    *,
    server_time_ms: int,
    symbol: str = LIVE_SYMBOL,
    interval: str = LIVE_INTERVAL,
) -> ClosedSeries:
    """Parse, refuse toute réparation, écarte seulement un suffixe encore ouvert, exige la fraîcheur."""
    if symbol != LIVE_SYMBOL or interval != LIVE_INTERVAL:
        raise MarketDataError(f"V1 : {LIVE_SYMBOL} {LIVE_INTERVAL} uniquement")
    if not isinstance(rows, Sequence) or isinstance(rows, (str, bytes)):
        raise MarketDataError("Liste de klines attendue")
    if len(rows) > MAX_KLINES:
        raise MarketDataError(f"Plus de {MAX_KLINES} klines reçues : série refusée")
    if not rows:
        raise HistoryError("Aucune bougie renvoyée par Binance")

    parsed = [parse_kline_row(row, interval_ms=INTERVAL_MS_1H) for row in rows]
    closed, discarded_open = _drop_trailing_open(parsed, server_time_ms)
    if len(closed) < MIN_KLINES:
        raise HistoryError(
            f"{len(closed)} bougies closes, {MIN_KLINES} consécutives au minimum depuis le dernier trou"
        )
    _check_strict_order(closed)
    last = closed[-1]
    expected = expected_last_closed_open_time(server_time_ms)
    if last.open_time != expected:
        raise HistoryError(
            f"Données non à jour : dernière close {ms_to_utc_iso(last.open_time)}, "
            f"{ms_to_utc_iso(expected)} attendue (horloge Binance {ms_to_utc_iso(server_time_ms)})"
        )
    times = [c.open_time for c in closed]
    try:
        gaps = tuple(find_gaps(times, INTERVAL_MS_1H))
        last_start, last_end = segment_bounds(times, INTERVAL_MS_1H)[-1]
    except DatasetError as exc:
        raise MarketDataError(str(exc)) from exc
    last_segment_length = last_end - last_start
    if last_segment_length < required_history():
        raise HistoryError(
            f"Historique insuffisant depuis le dernier trou : {last_segment_length} bougies consécutives, "
            f"{required_history()} exigées (les indicateurs ne traversent jamais un trou)"
        )
    return ClosedSeries(
        symbol=symbol,
        interval=interval,
        candles=tuple(closed),
        server_time_ms=server_time_ms,
        discarded_open=discarded_open,
        gaps=gaps,
        last_segment_length=last_segment_length,
    )


def _drop_trailing_open(candles: list[Candle], server_time_ms: int) -> tuple[list[Candle], int]:
    """Écarte uniquement un suffixe encore ouvert (close_time >= horloge). Un ouvert au milieu est refusé."""
    open_flags = [c.close_time >= server_time_ms for c in candles]
    if any(open_flags):
        first_open = open_flags.index(True)
        if not all(open_flags[first_open:]):
            raise MarketDataError("Bougie encore ouverte au milieu de la série : données refusées")
        discarded = len(candles) - first_open
        return candles[:first_open], discarded
    return candles, 0


def _check_strict_order(candles: Sequence[Candle]) -> None:
    seen: set[int] = set()
    previous: int | None = None
    for candle in candles:
        if candle.open_time in seen:
            raise MarketDataError(f"Horodatage en double : {ms_to_utc_iso(candle.open_time)}")
        seen.add(candle.open_time)
        if previous is not None and candle.open_time <= previous:
            raise MarketDataError(f"Horodatages non strictement croissants à {ms_to_utc_iso(candle.open_time)}")
        previous = candle.open_time


def _candle_problem(candle: Candle, interval_ms: int) -> str | None:
    floats = (candle.open, candle.high, candle.low, candle.close, candle.volume, candle.quote_volume, candle.taker_buy_base)
    if not all(math.isfinite(x) for x in floats):
        return "valeur non finie"
    if candle.open_time % interval_ms:
        return "ouverture non alignée"
    if candle.close_time != candle.open_time + interval_ms - 1:
        return "bougie non close ou de durée incorrecte"
    if min(candle.open, candle.high, candle.low, candle.close) <= 0:
        return "prix non positif"
    if candle.low > min(candle.open, candle.close) or candle.high < max(candle.open, candle.close):
        return "OHLC incohérent"
    if min(candle.volume, candle.quote_volume, candle.taker_buy_base) < 0 or candle.trades < 0:
        return "volume négatif"
    if candle.taker_buy_base > candle.volume:
        return "achats agressifs supérieurs au volume"
    return None


def _as_int(value, name: str) -> int:
    if isinstance(value, bool):
        raise MarketDataError(f"{name} : entier attendu")
    if isinstance(value, int):
        return int(value)
    if isinstance(value, str):
        text = value.strip()
        if text.isdigit() or (text.startswith("-") and text[1:].isdigit()):
            return int(text)
    raise MarketDataError(f"{name} : entier attendu")


def _as_float(value, name: str) -> float:
    if isinstance(value, bool) or isinstance(value, (bytes, bytearray)):
        raise MarketDataError(f"{name} : nombre attendu")
    if isinstance(value, (int, float)):
        number = float(value)
    elif isinstance(value, str):
        number = float(value)
    else:
        raise MarketDataError(f"{name} : nombre attendu")
    if not math.isfinite(number):
        raise MarketDataError(f"{name} : valeur non finie")
    return number
