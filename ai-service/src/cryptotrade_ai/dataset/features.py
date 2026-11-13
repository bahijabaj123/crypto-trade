"""Variables explicatives causales du dataset (version 1).

Toutes les variables d'une bougie ``t`` sont calculées à la clôture de ``t`` avec les seules
bougies d'ouverture <= ``t`` appartenant à la même série continue : les indicateurs
repartent de zéro après chaque trou. Les variables sont sans unité de prix pour pouvoir
servir à d'autres paires.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

from cryptotrade_ai.dataset.indicators import log_returns, macd, rolling_std, rsi_wilder, sma
from cryptotrade_ai.dataset.source import Candle

FEATURE_NAMES = (
    "ret_1h",
    "ret_1h_lag1",
    "ret_1h_lag2",
    "ret_6h",
    "ret_24h",
    "volatility_6h",
    "volatility_24h",
    "hl_range",
    "rsi_14",
    "macd_hist_rel",
    "dist_sma_24",
    "dist_sma_72",
    "quote_volume_rel_24h",
    "trades_rel_24h",
    "taker_buy_ratio",
    "hour_sin",
    "hour_cos",
)

# Fenêtres figées par le nom des variables : les changer impose une nouvelle version du dataset.
INDICATOR_PARAMS = {
    "rsi_period": 14,
    "macd_fast": 12,
    "macd_slow": 26,
    "macd_signal": 9,
    "sma_short": 24,
    "sma_long": 72,
    "volatility_short": 6,
    "volatility_long": 24,
    "volume_window": 24,
}

FORBIDDEN_INPUT_COLUMNS = frozenset(
    {
        "target_up_1h",
        "fwd_return_1h",
        "open_time",
        "open_time_utc",
        "decision_time_utc",
        "close_time",
        "close_time_utc",
        "symbol",
        "split",
        "source_file",
        "open",
        "high",
        "low",
        "close",
        "volume",
        "quote_asset_volume",
        "number_of_trades",
        "taker_buy_base_asset_volume",
        "taker_buy_quote_asset_volume",
        "ignore",
    }
)

HOUR_MS = 3_600_000
_RET_6H, _RET_24H = 6, 24

assert not set(FEATURE_NAMES) & FORBIDDEN_INPUT_COLUMNS


def required_history() -> int:
    """Nombre de bougies consécutives (``t`` incluse) nécessaires pour définir toutes les variables."""
    p = INDICATOR_PARAMS
    return max(
        3 + 1,
        _RET_6H + 1,
        _RET_24H + 1,
        p["volatility_short"] + 1,
        p["volatility_long"] + 1,
        p["rsi_period"] + 1,
        p["macd_slow"] + p["macd_signal"] - 1,
        p["sma_short"],
        p["sma_long"],
        p["volume_window"],
    )


def _finite_or_nan(value: float | None) -> float:
    return math.nan if value is None else value


def _ratio(numerator: float | None, denominator: float | None) -> float:
    if numerator is None or denominator is None or denominator == 0:
        return math.nan
    return numerator / denominator


def _log_ratio(numerator: float | None, denominator: float | None) -> float:
    if numerator is None or denominator is None or numerator <= 0 or denominator <= 0:
        return math.nan
    return math.log(numerator / denominator)


def compute_segment_features(candles: Sequence[Candle], *, ddof: int) -> list[tuple[float, ...] | None]:
    """Variables d'une série continue ; ``None`` tant que l'historique est insuffisant.

    Une valeur non finie (division par zéro, log d'un nombre nul) est renvoyée telle quelle
    (NaN) pour être comptée puis exclue, jamais remplacée.
    """
    n = len(candles)
    out: list[tuple[float, ...] | None] = [None] * n
    start = required_history() - 1
    if n <= start:
        return out

    p = INDICATOR_PARAMS
    closes = [k.close for k in candles]
    highs = [k.high for k in candles]
    lows = [k.low for k in candles]
    volumes = [k.volume for k in candles]
    quote = [k.quote_volume for k in candles]
    trades = [float(k.trades) for k in candles]
    taker = [k.taker_buy_base for k in candles]

    returns = log_returns(closes)
    rsi = rsi_wilder(closes, p["rsi_period"])
    _, _, histogram = macd(closes, p["macd_fast"], p["macd_slow"], p["macd_signal"])
    sma_short = sma(closes, p["sma_short"])
    sma_long = sma(closes, p["sma_long"])
    vol_short = rolling_std(returns, p["volatility_short"], ddof)
    vol_long = rolling_std(returns, p["volatility_long"], ddof)
    quote_mean = sma(quote, p["volume_window"])
    trades_mean = sma(trades, p["volume_window"])

    for i in range(start, n):
        angle = 2 * math.pi * ((candles[i].open_time // HOUR_MS) % 24) / 24
        values = (
            _finite_or_nan(returns[i]),
            _finite_or_nan(returns[i - 1]),
            _finite_or_nan(returns[i - 2]),
            _log_ratio(closes[i], closes[i - _RET_6H]),
            _log_ratio(closes[i], closes[i - _RET_24H]),
            _finite_or_nan(vol_short[i]),
            _finite_or_nan(vol_long[i]),
            _log_ratio(highs[i], lows[i]),
            _finite_or_nan(rsi[i]),
            _ratio(histogram[i], closes[i]),
            _ratio(closes[i], sma_short[i]) - 1.0,
            _ratio(closes[i], sma_long[i]) - 1.0,
            _log_ratio(quote[i], quote_mean[i]),
            _log_ratio(trades[i], trades_mean[i]),
            _ratio(taker[i], volumes[i]),
            math.sin(angle),
            math.cos(angle),
        )
        out[i] = values
    return out


def compute_features_by_segment(
    candles: Sequence[Candle], bounds: Sequence[tuple[int, int]], *, ddof: int
) -> list[tuple[float, ...] | None]:
    """Applique ``compute_segment_features`` à chaque série continue séparément."""
    out: list[tuple[float, ...] | None] = []
    for start, end in bounds:
        out.extend(compute_segment_features(candles[start:end], ddof=ddof))
    return out
