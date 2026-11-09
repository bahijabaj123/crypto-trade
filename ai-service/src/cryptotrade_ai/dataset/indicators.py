"""Indicateurs techniques causaux.

Conventions identiques à ``frontend/src/app/pages/analysis/indicators.ts`` :

- SMA : moyenne simple des ``period`` dernières valeurs ;
- EMA : coefficient ``k = 2 / (period + 1)``, première valeur (indice ``period - 1``)
  égale à la SMA des ``period`` premières valeurs ;
- RSI : lissage de Wilder, initialisé par la moyenne simple des ``period`` premières
  variations (variation nulle comptée comme gain nul) ; RSI = 100 si la perte moyenne est nulle ;
- MACD : EMA rapide - EMA lente ; signal = EMA de la ligne MACD, calculée à partir de sa
  première valeur définie ; histogramme = ligne - signal.

La valeur d'indice ``i`` n'utilise jamais de valeur d'indice supérieur à ``i``.
Les positions sans assez d'historique valent ``None``.
"""

from __future__ import annotations

import math
from collections.abc import Sequence


def _check_period(period: int) -> None:
    if period < 1:
        raise ValueError(f"Période invalide : {period}")


def sma(values: Sequence[float], period: int) -> list[float | None]:
    _check_period(period)
    out: list[float | None] = [None] * len(values)
    for i in range(period - 1, len(values)):
        out[i] = sum(values[i - period + 1 : i + 1]) / period
    return out


def ema(values: Sequence[float], period: int) -> list[float | None]:
    _check_period(period)
    out: list[float | None] = [None] * len(values)
    if len(values) < period:
        return out
    k = 2 / (period + 1)
    previous = sum(values[:period]) / period
    out[period - 1] = previous
    for i in range(period, len(values)):
        previous = values[i] * k + previous * (1 - k)
        out[i] = previous
    return out


def _rsi_value(avg_gain: float, avg_loss: float) -> float:
    return 100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)


def rsi_wilder(closes: Sequence[float], period: int = 14) -> list[float | None]:
    _check_period(period)
    n = len(closes)
    out: list[float | None] = [None] * n
    if n <= period:
        return out
    gain = loss = 0.0
    for i in range(1, period + 1):
        change = closes[i] - closes[i - 1]
        if change >= 0:
            gain += change
        else:
            loss -= change
    avg_gain, avg_loss = gain / period, loss / period
    out[period] = _rsi_value(avg_gain, avg_loss)
    for i in range(period + 1, n):
        change = closes[i] - closes[i - 1]
        avg_gain = (avg_gain * (period - 1) + max(change, 0.0)) / period
        avg_loss = (avg_loss * (period - 1) + max(-change, 0.0)) / period
        out[i] = _rsi_value(avg_gain, avg_loss)
    return out


def macd(
    closes: Sequence[float], fast: int = 12, slow: int = 26, signal: int = 9
) -> tuple[list[float | None], list[float | None], list[float | None]]:
    if not 1 <= fast < slow:
        raise ValueError("MACD : il faut 1 <= rapide < lente")
    fast_ema, slow_ema = ema(closes, fast), ema(closes, slow)
    line = [f - s if f is not None and s is not None else None for f, s in zip(fast_ema, slow_ema)]
    defined = [x for x in line if x is not None]
    offset = len(line) - len(defined)
    signal_line: list[float | None] = [None] * offset + ema(defined, signal)
    histogram = [
        value - sig if value is not None and sig is not None else None
        for value, sig in zip(line, signal_line)
    ]
    return line, signal_line, histogram


def log_returns(closes: Sequence[float]) -> list[float | None]:
    """Rendements logarithmiques ``ln(C[i] / C[i-1])`` ; le premier vaut ``None``."""
    out: list[float | None] = [None] * len(closes)
    for i in range(1, len(closes)):
        out[i] = math.log(closes[i] / closes[i - 1])
    return out


def rolling_std(values: Sequence[float | None], window: int, ddof: int = 0) -> list[float | None]:
    """Écart-type glissant ; ``ddof=0`` divise par ``window``, ``ddof=1`` par ``window - 1``."""
    if ddof not in (0, 1) or window <= ddof:
        raise ValueError("rolling_std : ddof doit valoir 0 ou 1 et window > ddof")
    out: list[float | None] = [None] * len(values)
    for i in range(window - 1, len(values)):
        chunk = values[i - window + 1 : i + 1]
        if any(x is None for x in chunk):
            continue
        mean = sum(chunk) / window
        out[i] = math.sqrt(sum((x - mean) ** 2 for x in chunk) / (window - ddof))
    return out
