"""Tests des contrôles qualité (données synthétiques, jamais utilisées pour l'entraînement)."""

import pytest

from cryptotrade_ai.data.klines import check_quality, month_start_ms, normalize_rows, read_kline_csv
from synthetic_klines import HOUR_MS, make_row, rows_to_csv

T0 = month_start_ms(2024, 1)


def parse(rows, year=2024, month=1):
    return normalize_rows(rows, source_file="synthetique.csv", year=year, month=month, interval_ms=HOUR_MS)


def quality(rows, hours=None, reference_time_ms=None):
    parsed = parse(rows)
    end = T0 + (hours if hours is not None else len(rows)) * HOUR_MS
    return check_quality(
        parsed.klines,
        interval_ms=HOUR_MS,
        period_start_ms=T0,
        period_end_ms=end,
        reference_time_ms=end if reference_time_ms is None else reference_time_ms,
    )


def test_valid_series_has_no_anomaly():
    result = quality([make_row(T0 + i * HOUR_MS) for i in range(3)])
    assert len(result.clean) == 3
    assert result.expected_candles == 3
    assert result.missing_candles == 0
    assert result.gaps == []
    assert result.duplicates_identical == 0
    assert result.non_chronological == 0


def test_gap_is_reported_and_not_filled():
    rows = [make_row(T0), make_row(T0 + HOUR_MS), make_row(T0 + 3 * HOUR_MS)]
    result = quality(rows, hours=4)
    assert len(result.clean) == 3
    assert result.missing_candles == 1
    assert result.gaps == [
        {
            "premiere_bougie_manquante_utc": "2024-01-01T02:00:00.000Z",
            "derniere_bougie_manquante_utc": "2024-01-01T02:00:00.000Z",
            "bougies_manquantes": 1,
        }
    ]
    assert T0 + 2 * HOUR_MS not in {k.open_time for k in result.clean}


def test_identical_duplicate_is_removed():
    rows = [make_row(T0), make_row(T0 + HOUR_MS), make_row(T0 + HOUR_MS), make_row(T0 + 2 * HOUR_MS)]
    result = quality(rows, hours=3)
    assert result.duplicates_identical == 1
    assert [k.open_time for k in result.clean] == [T0, T0 + HOUR_MS, T0 + 2 * HOUR_MS]


def test_conflicting_duplicate_is_flagged_and_excluded():
    rows = [make_row(T0), make_row(T0 + HOUR_MS, c="105.0"), make_row(T0 + HOUR_MS, c="106.0")]
    result = quality(rows, hours=2)
    assert result.duplicates_conflicting == [T0 + HOUR_MS]
    assert [k.open_time for k in result.clean] == [T0]
    assert result.missing_candles == 1


def test_unsorted_rows_are_counted_and_sorted():
    rows = [make_row(T0), make_row(T0 + 2 * HOUR_MS), make_row(T0 + HOUR_MS)]
    result = quality(rows)
    assert result.non_chronological == 1
    assert [k.open_time for k in result.clean] == [T0, T0 + HOUR_MS, T0 + 2 * HOUR_MS]


def test_unclosed_candle_is_excluded():
    rows = [make_row(T0 + i * HOUR_MS) for i in range(3)]
    result = quality(rows, reference_time_ms=T0 + 2 * HOUR_MS + 30 * 60_000)
    assert result.not_closed == 1
    assert [k.open_time for k in result.clean] == [T0, T0 + HOUR_MS]
    assert result.expected_candles == 2
    assert result.missing_candles == 0


def test_candle_outside_period_is_excluded():
    rows = [make_row(T0), make_row(T0 + HOUR_MS)]
    result = quality(rows, hours=1)
    assert result.outside_period == 1
    assert len(result.clean) == 1


@pytest.mark.parametrize(
    ("row", "reason"),
    [
        (make_row(T0, h="100.0", c="105.0"), "ohlc_incoherent"),
        (make_row(T0, l="106.0"), "ohlc_incoherent"),
        (make_row(T0, o="0"), "prix_non_positif"),
        (make_row(T0, o="-1", l="-2"), "prix_non_positif"),
        (make_row(T0, volume="-1"), "volume_negatif"),
        (make_row(T0, c="abc"), "valeur_non_numerique"),
        (make_row(T0, c="nan"), "valeur_non_finie"),
        (make_row(T0, trades="1.5"), "nombre_de_transactions_invalide"),
        (make_row(T0 + 60_000), "ouverture_non_alignee"),
        (make_row(T0, interval_ms=HOUR_MS * 2), "cloture_incoherente"),
        (make_row(month_start_ms(2024, 2)), "hors_du_mois_source"),
        (make_row(T0)[:11], "nombre_de_colonnes"),
        (["x", *make_row(T0)[1:]], "horodatage_non_entier"),
    ],
)
def test_invalid_rows_are_rejected_with_reason(row, reason):
    parsed = parse([row])
    assert parsed.klines == []
    assert [issue.reason for issue in parsed.issues] == [reason]
    assert parsed.issues[0].line == 1


def test_zero_volume_and_flat_candles_are_flagged_but_kept():
    rows = [
        make_row(T0, volume="0", taker_base="0"),
        make_row(T0 + HOUR_MS, o="100", h="100", l="100", c="100"),
    ]
    result = quality(rows)
    assert len(result.clean) == 2
    assert result.zero_volume == 1
    assert result.flat == 1


def test_taker_volume_above_total_is_flagged():
    result = quality([make_row(T0, volume="1", taker_base="2")])
    assert result.taker_above_volume == 1


def test_header_line_is_skipped():
    text = "open_time,open,high,low,close,volume,close_time,a,b,c,d,e\n" + rows_to_csv([make_row(T0)])
    rows, header_skipped = read_kline_csv(text)
    assert header_skipped is True
    assert len(rows) == 1


def test_csv_without_header():
    rows, header_skipped = read_kline_csv(rows_to_csv([make_row(T0), make_row(T0 + HOUR_MS)]) + "\n")
    assert header_skipped is False
    assert len(rows) == 2


def test_original_fields_are_preserved():
    row = make_row(T0, o="7195.24000000", h="7255.00000000", l="7175.15000000", c="7200.85000000")
    parsed = parse([row])
    assert parsed.klines[0].fields == tuple(row)
