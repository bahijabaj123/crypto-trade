"""Calcul des 17 variables live : mêmes formules que le dataset, sans cible ni futur."""

from __future__ import annotations

import math

import pytest

from cryptotrade_ai.dataset.continuity import segment_bounds
from cryptotrade_ai.dataset.features import FEATURE_NAMES, FORBIDDEN_INPUT_COLUMNS, compute_features_by_segment, required_history
from cryptotrade_ai.live import HistoryError, MarketDataError
from cryptotrade_ai.live.candles import closed_series_from_klines
from cryptotrade_ai.live.features import VOLATILITY_DDOF, as_model_inputs, features_from_klines, live_feature_values
from synthetic_dataset import HOUR_MS, make_candles
from synthetic_market import klines_payload


def test_live_features_match_dataset_builder_on_the_same_candles():
    rows, server_time, candles = klines_payload(160, include_open=True)
    series, values = features_from_klines(rows, server_time_ms=server_time)
    expected = compute_features_by_segment(candles, segment_bounds([c.open_time for c in candles], HOUR_MS), ddof=0)[-1]
    assert list(values) == list(FEATURE_NAMES)
    assert len(values) == 17
    for name, got, ref in zip(FEATURE_NAMES, values.values(), expected):
        assert math.isfinite(got)
        assert got == pytest.approx(ref, rel=1e-15, abs=1e-15), name
    assert series.last.open_time == candles[-1].open_time
    assert VOLATILITY_DDOF == 0


def test_features_after_a_gap_use_only_the_last_continuous_segment():
    rows, server_time, candles = klines_payload(180, skip=frozenset({25}), include_open=True)
    _, values = features_from_klines(rows, server_time_ms=server_time)
    last_segment = candles[25:]
    expected = compute_features_by_segment(
        last_segment, segment_bounds([c.open_time for c in last_segment], HOUR_MS), ddof=0
    )[-1]
    assert list(values.values()) == pytest.approx(expected, rel=1e-15, abs=1e-15)


def test_target_and_future_return_are_never_model_inputs():
    rows, server_time, _ = klines_payload(90, include_open=True)
    _, values = features_from_klines(rows, server_time_ms=server_time)
    assert "target_up_1h" not in values
    assert "fwd_return_1h" not in values
    assert not set(values) & FORBIDDEN_INPUT_COLUMNS
    assert set(values) == set(FEATURE_NAMES)
    with pytest.raises(MarketDataError, match="interdites"):
        as_model_inputs({**values, "target_up_1h": 1.0})
    with pytest.raises(MarketDataError, match="interdites"):
        as_model_inputs({**values, "fwd_return_1h": 0.01})


def test_missing_or_extra_feature_names_are_refused():
    rows, server_time, _ = klines_payload(90, include_open=True)
    _, values = features_from_klines(rows, server_time_ms=server_time)
    incomplete = dict(values)
    del incomplete["hour_cos"]
    with pytest.raises(MarketDataError, match="manquantes"):
        as_model_inputs(incomplete)
    with pytest.raises(MarketDataError, match="inattendues"):
        as_model_inputs({**values, "ret_48h": 0.0})


def test_non_finite_computed_feature_is_refused():
    rows, server_time, candles = klines_payload(90, include_open=True)
    series = closed_series_from_klines(rows, server_time_ms=server_time)
    broken = candles[-1].__class__(
        candles[-1].open_time,
        candles[-1].close_time,
        candles[-1].open,
        candles[-1].high,
        candles[-1].low,
        candles[-1].close,
        0.0,
        candles[-1].quote_volume,
        candles[-1].trades,
        0.0,
    )
    object.__setattr__(series, "candles", series.candles[:-1] + (broken,))
    with pytest.raises(HistoryError, match="finie"):
        live_feature_values(series)


def test_insufficient_history_yields_undefined_features():
    rows, server_time, _ = klines_payload(required_history() - 1, include_open=True)
    with pytest.raises(HistoryError):
        features_from_klines(rows, server_time_ms=server_time)


def test_a_longer_window_changes_recursive_indicators_without_claiming_full_history():
    """Le RSI / MACD gardent une mémoire : 72 bougies ≠ 200. 1000 bougies ne reproduisent pas 2020–."""
    long_rows, server_time, long_candles = klines_payload(200, include_open=True)
    _, long_values = features_from_klines(long_rows, server_time_ms=server_time)
    short_candles = long_candles[-required_history():]
    short_values = compute_features_by_segment(
        short_candles, segment_bounds([c.open_time for c in short_candles], HOUR_MS), ddof=0
    )[-1]
    short = dict(zip(FEATURE_NAMES, short_values))
    assert long_values["rsi_14"] != pytest.approx(short["rsi_14"], abs=1e-12)
    assert long_values["macd_hist_rel"] != pytest.approx(short["macd_hist_rel"], abs=1e-12)
    assert long_values["ret_1h"] == pytest.approx(short["ret_1h"], rel=1e-15, abs=1e-15)


def test_feature_order_is_exactly_feature_names():
    rows, server_time, _ = klines_payload(90, include_open=True)
    _, values = features_from_klines(rows, server_time_ms=server_time)
    assert tuple(values) == FEATURE_NAMES
    assert live_feature_values(closed_series_from_klines(rows, server_time_ms=server_time)) == values
