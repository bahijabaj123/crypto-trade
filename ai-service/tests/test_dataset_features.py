"""Tests des variables : formules, causalité, trous, colonnes interdites (données synthétiques)."""

import dataclasses
import math
import statistics

import pytest

from cryptotrade_ai.dataset.continuity import segment_bounds
from cryptotrade_ai.dataset.features import (
    FEATURE_NAMES,
    FORBIDDEN_INPUT_COLUMNS,
    compute_features_by_segment,
    compute_segment_features,
    required_history,
)
from cryptotrade_ai.dataset.indicators import macd, rsi_wilder
from synthetic_dataset import HOUR_MS, make_candles

COL = {name: i for i, name in enumerate(FEATURE_NAMES)}


def test_feature_list_and_history():
    assert len(FEATURE_NAMES) == 17
    assert required_history() == 72
    assert not set(FEATURE_NAMES) & FORBIDDEN_INPUT_COLUMNS
    assert {"target_up_1h", "fwd_return_1h", "open_time", "close", "split"} <= FORBIDDEN_INPUT_COLUMNS


def test_first_features_need_72_consecutive_candles():
    features = compute_segment_features(make_candles(100), ddof=0)
    assert features[70] is None
    assert features[71] is not None


def test_formulas():
    candles = make_candles(120)
    features = compute_segment_features(candles, ddof=0)
    i = 100
    f = features[i]
    c = [k.close for k in candles]
    r = [None] + [math.log(c[j] / c[j - 1]) for j in range(1, len(c))]
    approx = lambda x: pytest.approx(x, rel=1e-12, abs=1e-15)

    assert f[COL["ret_1h"]] == approx(r[i])
    assert f[COL["ret_1h_lag1"]] == approx(r[i - 1])
    assert f[COL["ret_1h_lag2"]] == approx(r[i - 2])
    assert f[COL["ret_6h"]] == approx(math.log(c[i] / c[i - 6]))
    assert f[COL["ret_24h"]] == approx(math.log(c[i] / c[i - 24]))
    assert f[COL["volatility_6h"]] == approx(statistics.pstdev(r[i - 5 : i + 1]))
    assert f[COL["volatility_24h"]] == approx(statistics.pstdev(r[i - 23 : i + 1]))
    assert f[COL["hl_range"]] == approx(math.log(candles[i].high / candles[i].low))
    assert f[COL["rsi_14"]] == approx(rsi_wilder(c, 14)[i])
    assert f[COL["macd_hist_rel"]] == approx(macd(c, 12, 26, 9)[2][i] / c[i])
    assert f[COL["dist_sma_24"]] == approx(c[i] / (sum(c[i - 23 : i + 1]) / 24) - 1)
    assert f[COL["dist_sma_72"]] == approx(c[i] / (sum(c[i - 71 : i + 1]) / 72) - 1)
    qv = [k.quote_volume for k in candles]
    assert f[COL["quote_volume_rel_24h"]] == approx(math.log(qv[i] / (sum(qv[i - 23 : i + 1]) / 24)))
    n = [k.trades for k in candles]
    assert f[COL["trades_rel_24h"]] == approx(math.log(n[i] / (sum(n[i - 23 : i + 1]) / 24)))
    assert f[COL["taker_buy_ratio"]] == approx(candles[i].taker_buy_base / candles[i].volume)
    hour_of_day = (candles[i].open_time // HOUR_MS) % 24
    assert hour_of_day == 100 % 24
    assert f[COL["hour_sin"]] == approx(math.sin(2 * math.pi * hour_of_day / 24))
    assert f[COL["hour_cos"]] == approx(math.cos(2 * math.pi * hour_of_day / 24))


def test_ddof_one_changes_volatility_only():
    candles = make_candles(100)
    pop, sample = compute_segment_features(candles, ddof=0)[90], compute_segment_features(candles, ddof=1)[90]
    assert sample[COL["volatility_24h"]] == pytest.approx(pop[COL["volatility_24h"]] * math.sqrt(24 / 23))
    assert sample[COL["ret_1h"]] == pop[COL["ret_1h"]]


@pytest.mark.parametrize("i", [71, 100, 150, 199])
def test_no_future_leakage_by_truncation(i):
    candles = make_candles(200)
    full = compute_segment_features(candles, ddof=0)
    assert compute_segment_features(candles[: i + 1], ddof=0)[-1] == full[i]


def test_changing_future_candles_does_not_change_past_features():
    candles = make_candles(200)
    altered = candles[:120] + [
        dataclasses.replace(k, close=k.close * 3, high=k.high * 3, low=k.low * 3, open=k.open * 3, volume=k.volume * 50)
        for k in candles[120:]
    ]
    assert compute_segment_features(altered, ddof=0)[:120] == compute_segment_features(candles, ddof=0)[:120]


def test_features_restart_after_gap():
    candles = make_candles(300, skip=frozenset({150}))
    bounds = segment_bounds([k.open_time for k in candles], HOUR_MS)
    assert bounds == [(0, 150), (150, 299)]
    features = compute_features_by_segment(candles, bounds, ddof=0)

    assert all(features[j] is None for j in range(150, 150 + 71))
    after_gap = compute_segment_features(candles[150:], ddof=0)
    assert features[150 + 71] == after_gap[71]
    assert features[150 + 71] != compute_segment_features(candles, ddof=0)[150 + 71]


def test_non_finite_values_are_kept_as_nan_not_replaced():
    candles = make_candles(100)
    candles[90] = dataclasses.replace(candles[90], trades=0, volume=0.0, taker_buy_base=0.0)
    f = compute_segment_features(candles, ddof=0)[90]
    assert math.isnan(f[COL["trades_rel_24h"]])
    assert math.isnan(f[COL["taker_buy_ratio"]])
