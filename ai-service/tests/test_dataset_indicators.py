"""Tests des indicateurs (conventions du frontend), sur petites séries synthétiques."""

import math

import pytest

from cryptotrade_ai.dataset.indicators import ema, log_returns, macd, rolling_std, rsi_wilder, sma
from synthetic_dataset import make_candles


def test_sma():
    assert sma([1, 2, 3, 4], 2) == [None, 1.5, 2.5, 3.5]


def test_ema_starts_with_sma_then_recursion():
    assert ema([1, 2, 3, 4, 5], 3) == [None, None, 2.0, 3.0, 4.0]


def test_ema_too_short_series():
    assert ema([1, 2], 3) == [None, None]


def test_rsi_wilder_hand_computed():
    assert rsi_wilder([1, 2, 1, 2], 2) == [None, None, 50.0, 75.0]


def test_rsi_without_losses_is_100():
    assert rsi_wilder([1, 2, 3, 4, 5], 2)[2:] == [100.0, 100.0, 100.0]
    assert rsi_wilder([5, 5, 5, 5], 2)[2:] == [100.0, 100.0]


def test_macd_offsets_and_relations():
    closes = [k.close for k in make_candles(80)]
    line, signal, hist = macd(closes, 12, 26, 9)
    assert line[24] is None and line[25] is not None
    assert signal[32] is None and signal[33] is not None
    defined = [x for x in line if x is not None]
    assert signal[25:] == ema(defined, 9)
    fast, slow = ema(closes, 12), ema(closes, 26)
    for i in range(33, 80):
        assert line[i] == fast[i] - slow[i]
        assert hist[i] == line[i] - signal[i]


def test_log_returns():
    assert log_returns([100.0, 110.0, 99.0]) == [None, math.log(1.1), math.log(0.9)]


def test_rolling_std_ddof():
    assert rolling_std([1, 2, 3, 4], 4, ddof=0)[3] == pytest.approx(math.sqrt(1.25))
    assert rolling_std([1, 2, 3, 4], 4, ddof=1)[3] == pytest.approx(math.sqrt(5 / 3))
    assert rolling_std([None, 2, 3, 4, 5], 3, ddof=0)[:3] == [None, None, None]


@pytest.mark.parametrize("call", [lambda: sma([1], 0), lambda: macd([1.0] * 40, 26, 12, 9), lambda: rolling_std([1, 2], 1, ddof=1)])
def test_invalid_parameters(call):
    with pytest.raises(ValueError):
        call()
