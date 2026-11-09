"""Tests de conversion des dates (données synthétiques, jamais utilisées pour l'entraînement)."""

import pytest

from cryptotrade_ai.data.klines import (
    KlineDataError,
    detect_timestamp_unit,
    expected_unit_for_month,
    iter_months,
    month_start_ms,
    ms_to_utc_iso,
    next_month,
    normalize_rows,
    parse_month,
    to_milliseconds,
    utc_iso_to_ms,
)
from synthetic_klines import HOUR_MS, make_row

JAN_2020_MS = 1_577_836_800_000
JAN_2025_MS = 1_735_689_600_000


def test_detect_unit_milliseconds():
    assert detect_timestamp_unit(JAN_2020_MS) == "ms"


def test_detect_unit_microseconds():
    assert detect_timestamp_unit(JAN_2025_MS * 1000) == "us"


@pytest.mark.parametrize("value", [1_577_836_800, 0, 10**18])
def test_detect_unit_rejects_unknown_scale(value):
    with pytest.raises(KlineDataError):
        detect_timestamp_unit(value)


def test_microseconds_open_and_close_to_milliseconds():
    assert to_milliseconds(1_735_689_600_000_000, "us") == JAN_2025_MS
    assert to_milliseconds(1_735_693_199_999_999, "us") == JAN_2025_MS + HOUR_MS - 1


def test_expected_unit_switches_in_january_2025():
    assert expected_unit_for_month(2024, 12) == "ms"
    assert expected_unit_for_month(2025, 1) == "us"
    assert expected_unit_for_month(2026, 9) == "us"


def test_ms_to_utc_iso():
    assert ms_to_utc_iso(JAN_2020_MS) == "2020-01-01T00:00:00.000Z"
    assert ms_to_utc_iso(JAN_2025_MS + HOUR_MS - 1) == "2025-01-01T00:59:59.999Z"


def test_utc_iso_to_ms():
    assert utc_iso_to_ms("2025-01-01T00:00:00Z") == JAN_2025_MS
    assert utc_iso_to_ms("2025-01-01T01:00:00+01:00") == JAN_2025_MS


def test_utc_iso_to_ms_requires_timezone():
    with pytest.raises(ValueError):
        utc_iso_to_ms("2025-01-01T00:00:00")


def test_month_helpers():
    assert month_start_ms(2020, 1) == JAN_2020_MS
    assert month_start_ms(2025, 1) == JAN_2025_MS
    assert month_start_ms(2026, 10) == 1_790_812_800_000
    assert next_month(2024, 12) == (2025, 1)
    assert iter_months((2024, 11), (2025, 2)) == [(2024, 11), (2024, 12), (2025, 1), (2025, 2)]


@pytest.mark.parametrize("text", ["2020-1", "2020-13", "20-01", "janvier", "2020/01"])
def test_parse_month_rejects_invalid(text):
    with pytest.raises(ValueError):
        parse_month(text)


def test_iter_months_rejects_reversed_period():
    with pytest.raises(ValueError):
        iter_months((2025, 2), (2025, 1))


def test_normalize_microsecond_file_gives_milliseconds():
    rows = [make_row(JAN_2025_MS, unit="us"), make_row(JAN_2025_MS + HOUR_MS, unit="us")]
    parsed = normalize_rows(rows, source_file="synthetique.csv", year=2025, month=1, interval_ms=HOUR_MS)
    assert parsed.unit == "us"
    assert not parsed.issues
    first = parsed.klines[0]
    assert first.open_time == JAN_2025_MS
    assert first.close_time == JAN_2025_MS + HOUR_MS - 1
    assert first.fields[0] == str(JAN_2025_MS)
    assert first.fields[6] == str(JAN_2025_MS + HOUR_MS - 1)
    assert len(first.fields) == 12


def test_normalize_millisecond_file_is_unchanged():
    rows = [make_row(JAN_2020_MS)]
    parsed = normalize_rows(rows, source_file="synthetique.csv", year=2020, month=1, interval_ms=HOUR_MS)
    assert parsed.unit == "ms"
    assert parsed.klines[0].fields == tuple(rows[0])


def test_mixed_units_in_one_file_are_rejected():
    rows = [make_row(JAN_2025_MS, unit="us"), make_row(JAN_2025_MS + HOUR_MS, unit="ms")]
    parsed = normalize_rows(rows, source_file="synthetique.csv", year=2025, month=1, interval_ms=HOUR_MS)
    assert len(parsed.klines) == 1
    assert [i.reason for i in parsed.issues] == ["unite_incoherente"]
