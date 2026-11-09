"""Tests de la source : SHA-256, rapport de collecte, valeurs non finies, doublons (données synthétiques)."""

import json

import pytest

from cryptotrade_ai.dataset import DatasetError
from cryptotrade_ai.dataset.source import load_collection_report, read_candles, verify_source_sha256
from synthetic_dataset import (
    COLLECTION_REPORT,
    HOUR_MS,
    SOURCE_CSV,
    make_candles,
    write_collection_report,
    write_fixture,
    write_source_csv,
)


def load_report(data_dir):
    return load_collection_report(data_dir / COLLECTION_REPORT, symbol="BTCUSDT", interval="1h")


def read(path, symbol="BTCUSDT"):
    return read_candles(path, symbol=symbol, interval="1h", interval_ms=HOUR_MS)


def test_matching_sha256_is_accepted(tmp_path):
    data_dir = write_fixture(tmp_path)
    assert len(verify_source_sha256(data_dir / SOURCE_CSV, load_report(data_dir))) == 64


def test_modified_csv_is_rejected(tmp_path):
    data_dir = write_fixture(tmp_path)
    with (data_dir / SOURCE_CSV).open("a", encoding="utf-8") as handle:
        handle.write("\n")
    with pytest.raises(DatasetError, match="SHA-256"):
        verify_source_sha256(data_dir / SOURCE_CSV, load_report(data_dir))


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [({"symbol": "ETHUSDT"}, "concerne"), ({"statut": "ECHEC"}, "ECHEC"), ({"sha": "abc"}, "SHA-256 valide")],
)
def test_invalid_collection_report_is_rejected(tmp_path, kwargs, message):
    data_dir = write_fixture(tmp_path)
    write_collection_report(data_dir / COLLECTION_REPORT, data_dir / SOURCE_CSV, **kwargs)
    with pytest.raises(DatasetError, match=message):
        load_report(data_dir)


def test_missing_collection_report(tmp_path):
    with pytest.raises(DatasetError, match="introuvable"):
        load_collection_report(tmp_path / "absent.json", symbol="BTCUSDT", interval="1h")


def test_candles_are_read_back_exactly(tmp_path):
    candles = make_candles(30)
    path = tmp_path / "s.csv"
    write_source_csv(path, candles)
    read_back, stats = read(path)
    assert read_back == candles
    assert stats == {"lignes": 30, "doublons": 0, "non_finies": 0, "hors_ordre": 0}


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({3: {"close": "nan"}}, "non finie"),
        ({3: {"volume": "inf"}}, "non finie"),
        ({3: {"close": "abc"}}, "illisible"),
        ({3: {"close_time": "0"}}, "non close"),
        ({3: {"low": "1000000"}}, "OHLC"),
        ({3: {"source_file": "ETHUSDT-1h-2024-01.zip"}}, "source_file"),
    ],
)
def test_invalid_source_rows_fail(tmp_path, overrides, message):
    path = tmp_path / "s.csv"
    write_source_csv(path, make_candles(10), overrides=overrides)
    with pytest.raises(DatasetError, match=message):
        read(path)


def test_duplicates_and_disorder_fail(tmp_path):
    candles = make_candles(10)
    path = tmp_path / "s.csv"
    write_source_csv(path, candles + [candles[4]])
    with pytest.raises(DatasetError, match="double"):
        read(path)


def test_missing_column_fails(tmp_path):
    path = tmp_path / "s.csv"
    path.write_text("open_time,open\n1,2\n", encoding="utf-8")
    with pytest.raises(DatasetError, match="Colonnes absentes"):
        read(path)


def test_report_json_must_be_readable(tmp_path):
    path = tmp_path / "r.json"
    path.write_text("{pas du json", encoding="utf-8")
    with pytest.raises(DatasetError, match="illisible"):
        load_collection_report(path, symbol="BTCUSDT", interval="1h")
    path.write_text(json.dumps({"statut": "OK"}), encoding="utf-8")
    with pytest.raises(DatasetError):
        load_collection_report(path, symbol="BTCUSDT", interval="1h")
