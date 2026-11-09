"""Tests de la cible t+1h exacte et des séries continues (données synthétiques)."""

import dataclasses
import math

import pytest

from cryptotrade_ai.dataset import DatasetError
from cryptotrade_ai.dataset.continuity import find_gaps, segment_bounds, segment_positions
from cryptotrade_ai.dataset.target import build_targets
from synthetic_dataset import HOUR_MS, hour, make_candles


def test_target_uses_exact_next_hour_never_next_row():
    candles = make_candles(5, skip=frozenset({2}))
    targets = build_targets(candles, interval_ms=HOUR_MS)
    assert targets[0].target_open_time == hour(1)
    assert targets[1] is None
    assert targets[2].target_open_time == hour(4)
    assert targets[3] is None


def test_target_values_and_ties():
    base = make_candles(4)
    closes = [100.0, 101.0, 101.0, 100.5]
    candles = [dataclasses.replace(k, close=c, high=max(k.high, c, k.open), low=min(k.low, c, k.open)) for k, c in zip(base, closes)]
    targets = build_targets(candles, interval_ms=HOUR_MS)
    assert [t.up for t in targets[:3]] == [1, 0, 0]
    assert [t.tie for t in targets[:3]] == [False, True, False]
    assert targets[0].fwd_return == math.log(101.0 / 100.0)
    assert targets[1].fwd_return == 0.0


def test_segments_positions_and_gaps():
    times = [hour(i) for i in (0, 1, 3, 4, 7)]
    bounds = segment_bounds(times, HOUR_MS)
    assert bounds == [(0, 2), (2, 4), (4, 5)]
    assert segment_positions(bounds) == [1, 2, 1, 2, 1]
    gaps = find_gaps(times, HOUR_MS)
    assert [g["heures_manquantes"] for g in gaps] == [1, 2]
    assert gaps[1]["premiere_heure_manquante_utc"] == "2024-01-01T05:00:00.000Z"
    assert gaps[1]["derniere_heure_manquante_utc"] == "2024-01-01T06:00:00.000Z"


@pytest.mark.parametrize("times", [[hour(1), hour(0)], [hour(0), hour(0)], [hour(0), hour(1) + 1]])
def test_invalid_time_sequences_fail(times):
    with pytest.raises(DatasetError):
        segment_bounds(times, HOUR_MS)
