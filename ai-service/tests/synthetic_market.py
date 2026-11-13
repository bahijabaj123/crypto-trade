"""Réponses Binance SYNTHÉTIQUES pour les tests du module live (aucun réseau, aucun marché réel)."""

from __future__ import annotations

import json

from cryptotrade_ai.data.klines import INTERVAL_MS
from cryptotrade_ai.dataset.source import Candle
from cryptotrade_ai.live.binance_rest import BINANCE_REST_BASE_URL, KLINES_PATH, LIVE_INTERVAL, LIVE_SYMBOL, TIME_PATH
from synthetic_dataset import HOUR_MS, make_candles

INTERVAL_MS_1H = INTERVAL_MS[LIVE_INTERVAL]


def candle_to_kline(candle: Candle) -> list:
    """Ligne REST Binance à 12 champs, identique au format public /api/v3/klines."""
    return [
        candle.open_time,
        f"{candle.open:.8f}",
        f"{candle.high:.8f}",
        f"{candle.low:.8f}",
        f"{candle.close:.8f}",
        f"{candle.volume:.8f}",
        candle.close_time,
        f"{candle.quote_volume:.8f}",
        candle.trades,
        f"{candle.taker_buy_base:.8f}",
        f"{candle.taker_buy_base * candle.close:.8f}",
        "0",
    ]


def open_followup(last: Candle) -> list:
    """Bougie encore ouverte : même prix, heure suivante, close_time dans le futur."""
    open_ms = last.open_time + HOUR_MS
    return [
        open_ms,
        f"{last.close:.8f}",
        f"{last.close:.8f}",
        f"{last.close:.8f}",
        f"{last.close:.8f}",
        "1.00000000",
        open_ms + HOUR_MS - 1,
        f"{last.close:.8f}",
        10,
        "0.40000000",
        f"{0.4 * last.close:.8f}",
        "0",
    ]


def server_time_after(last_closed: Candle, *, extra_ms: int = 5_000) -> int:
    """Quelques secondes après la clôture de ``last_closed`` : la bougie suivante est encore ouverte."""
    return last_closed.close_time + 1 + extra_ms


def klines_payload(n: int = 120, *, seed: int = 7, skip: frozenset[int] = frozenset(), include_open: bool = True) -> tuple[list, int, list[Candle]]:
    candles = make_candles(n, seed=seed, skip=skip)
    rows = [candle_to_kline(c) for c in candles]
    if include_open:
        rows.append(open_followup(candles[-1]))
    return rows, server_time_after(candles[-1]), candles


def time_bytes(server_time_ms: int) -> bytes:
    return json.dumps({"serverTime": server_time_ms}).encode()


def klines_bytes(rows: list) -> bytes:
    return json.dumps(rows).encode()


def rest_urls(limit: int = 1000) -> tuple[str, str]:
    time_url = f"{BINANCE_REST_BASE_URL}{TIME_PATH}"
    klines_url = (
        f"{BINANCE_REST_BASE_URL}{KLINES_PATH}?symbol={LIVE_SYMBOL}&interval={LIVE_INTERVAL}&limit={limit}"
    )
    return time_url, klines_url
