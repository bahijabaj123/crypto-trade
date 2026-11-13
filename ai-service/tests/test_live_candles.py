"""Validation des bougies closes : OHLC, continuité, bougie ouverte, fraîcheur (données synthétiques)."""

from __future__ import annotations

import math

import pytest

from cryptotrade_ai.data.klines import to_milliseconds
from cryptotrade_ai.dataset.features import required_history
from cryptotrade_ai.live import HistoryError, MarketDataError
from cryptotrade_ai.live.candles import closed_series_from_klines, expected_last_closed_open_time, parse_kline_row
from synthetic_dataset import HOUR_MS, make_candles
from synthetic_market import candle_to_kline, klines_payload, open_followup, server_time_after


def test_required_history_is_72():
    assert required_history() == 72


def test_open_candle_is_discarded_and_last_closed_is_fresh():
    rows, server_time, candles = klines_payload(90, include_open=True)
    series = closed_series_from_klines(rows, server_time_ms=server_time)
    assert series.discarded_open == 1
    assert len(series.candles) == 90
    assert series.last.open_time == candles[-1].open_time
    assert series.last.open_time == expected_last_closed_open_time(server_time)
    assert series.last.close_time < server_time
    assert series.last_segment_length == 90
    assert series.gaps == ()
    assert series.symbol == "BTCUSDT" and series.interval == "1h"


def test_all_closed_klines_are_kept_when_last_hour_is_already_closed():
    rows, server_time, candles = klines_payload(90, include_open=False)
    series = closed_series_from_klines(rows, server_time_ms=server_time)
    assert series.discarded_open == 0
    assert [c.open_time for c in series.candles] == [c.open_time for c in candles]


def test_stale_last_candle_is_refused():
    rows, server_time, _ = klines_payload(90, include_open=False)
    late = server_time + HOUR_MS
    with pytest.raises(HistoryError, match="non à jour"):
        closed_series_from_klines(rows, server_time_ms=late)


def test_open_candle_in_the_middle_is_refused():
    rows, server_time, candles = klines_payload(90, include_open=True)
    rows.insert(10, open_followup(candles[-1]))
    with pytest.raises(MarketDataError, match="au milieu"):
        closed_series_from_klines(rows, server_time_ms=server_time)


def test_earlier_gap_is_allowed_if_last_segment_has_72_hours():
    rows, server_time, candles = klines_payload(160, skip=frozenset({20}), include_open=True)
    series = closed_series_from_klines(rows, server_time_ms=server_time)
    assert len(series.gaps) == 1
    assert series.gaps[0]["heures_manquantes"] == 1
    assert series.last_segment_length == 160 - 21
    assert series.last_segment_length >= 72
    assert series.last.open_time == candles[-1].open_time


def test_gap_leaving_fewer_than_72_consecutive_hours_is_refused():
    rows, server_time, _ = klines_payload(100, skip=frozenset({30}), include_open=True)
    with pytest.raises(HistoryError, match="dernier trou"):
        closed_series_from_klines(rows, server_time_ms=server_time)


def test_fewer_than_72_closed_candles_are_refused():
    rows, server_time, _ = klines_payload(50, include_open=True)
    with pytest.raises(HistoryError, match="72"):
        closed_series_from_klines(rows, server_time_ms=server_time)


def test_duplicates_and_decreasing_times_are_refused():
    rows, server_time, _ = klines_payload(90, include_open=False)
    duplicated = list(rows) + [rows[-1]]
    with pytest.raises(MarketDataError, match="double"):
        closed_series_from_klines(duplicated, server_time_ms=server_time)
    reversed_rows = list(reversed(rows))
    with pytest.raises(MarketDataError, match="croissants"):
        closed_series_from_klines(reversed_rows, server_time_ms=server_time + 10 * HOUR_MS)


@pytest.mark.parametrize(
    ("index", "value", "match"),
    [
        (1, "nan", "finie"),
        (4, "-1", "positif"),
        (2, "1", "OHLC"),
        (5, "-0.1", "négatif"),
        (8, "-3", "négatif"),
        (9, "999", "agressifs"),
        (0, 1, "unité|Horodatage|alignée"),
    ],
)
def test_invalid_ohlcv_is_refused(index, value, match):
    rows, server_time, _ = klines_payload(90, include_open=False)
    rows[-1] = list(rows[-1])
    rows[-1][index] = value
    with pytest.raises((MarketDataError, HistoryError), match=match):
        closed_series_from_klines(rows, server_time_ms=server_time)


def test_unaligned_open_time_is_refused():
    rows, server_time, _ = klines_payload(90, include_open=False)
    rows[-1] = list(rows[-1])
    rows[-1][0] = rows[-1][0] + 60_000
    rows[-1][6] = rows[-1][0] + HOUR_MS - 1
    with pytest.raises(MarketDataError, match="alignée"):
        closed_series_from_klines(rows, server_time_ms=server_time)


def test_wrong_close_time_is_refused():
    rows, server_time, _ = klines_payload(90, include_open=False)
    rows[-1] = list(rows[-1])
    rows[-1][6] = rows[-1][0] + HOUR_MS
    with pytest.raises(MarketDataError, match="durée"):
        closed_series_from_klines(rows, server_time_ms=server_time)


def test_microseconds_are_converted_to_milliseconds():
    candles = make_candles(3)
    row = candle_to_kline(candles[0])
    row[0] = candles[0].open_time * 1000
    row[6] = candles[0].close_time * 1000
    parsed = parse_kline_row(row)
    assert parsed.open_time == candles[0].open_time
    assert parsed.close_time == candles[0].close_time
    assert parsed.open_time == to_milliseconds(row[0], "us")


def test_other_symbol_or_interval_is_refused():
    rows, server_time, _ = klines_payload(90)
    with pytest.raises(MarketDataError, match="uniquement"):
        closed_series_from_klines(rows, server_time_ms=server_time, symbol="ETHUSDT")
    with pytest.raises(MarketDataError, match="uniquement"):
        closed_series_from_klines(rows, server_time_ms=server_time, interval="4h")


def test_empty_or_non_list_payload_is_refused():
    with pytest.raises(HistoryError, match="Aucune"):
        closed_series_from_klines([], server_time_ms=1_700_000_000_000)
    with pytest.raises(MarketDataError):
        closed_series_from_klines("[]", server_time_ms=1_700_000_000_000)


def test_server_time_matches_last_closed_formula():
    last = make_candles(90)[-1]
    server_time = server_time_after(last)
    assert expected_last_closed_open_time(server_time) == last.open_time
    assert last.close_time < server_time
    assert not math.isnan(last.close)
