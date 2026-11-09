"""Tests du découpage, de l'embargo et de la validation de configuration."""

import copy

import pytest

from cryptotrade_ai.data.klines import utc_iso_to_ms
from cryptotrade_ai.dataset.config import DEFAULT_CONFIG_PATH, DatasetConfigError, load_dataset_config, parse_dataset_config
from cryptotrade_ai.dataset.splits import assign_split, check_boundaries
from synthetic_dataset import HOUR_MS, make_config

CONFIG = parse_dataset_config(make_config())
TRAIN, VALIDATION, TEST = CONFIG.splits


def split_of(t):
    return assign_split(t, CONFIG.splits, interval_ms=HOUR_MS, horizon=1, embargo=73)


@pytest.mark.parametrize(
    ("t", "expected"),
    [
        (TRAIN.start_ms - HOUR_MS, (None, "hors_periode")),
        (TRAIN.start_ms, ("train", None)),
        (TRAIN.end_ms - 73 * HOUR_MS, ("train", None)),
        (TRAIN.end_ms - 72 * HOUR_MS, (None, "embargo")),
        (TRAIN.end_ms - HOUR_MS, (None, "embargo")),
        (VALIDATION.start_ms, ("validation", None)),
        (VALIDATION.end_ms - 73 * HOUR_MS, ("validation", None)),
        (VALIDATION.end_ms - 72 * HOUR_MS, (None, "embargo")),
        (TEST.start_ms, ("test", None)),
        (TEST.end_ms - 2 * HOUR_MS, ("test", None)),
        (TEST.end_ms - HOUR_MS, (None, "cible_hors_periode")),
        (TEST.end_ms, (None, "hors_periode")),
    ],
)
def test_split_boundaries(t, expected):
    assert split_of(t) == expected


def test_boundary_check_accepts_embargoed_sets():
    times = {
        "train": [TRAIN.end_ms - 73 * HOUR_MS],
        "validation": [VALIDATION.start_ms, VALIDATION.end_ms - 73 * HOUR_MS],
        "test": [TEST.start_ms],
    }
    results = check_boundaries(times, CONFIG.splits, interval_ms=HOUR_MS, horizon=1, min_history=72)
    assert all(r["ok"] for r in results)
    assert results[0]["bougies_libres_entre_fenetres"] == 0
    assert results[0]["cibles_avant_frontiere"] is True


def test_boundary_check_detects_shared_candles():
    times = {"train": [TRAIN.end_ms - 72 * HOUR_MS], "validation": [VALIDATION.start_ms], "test": [TEST.start_ms]}
    results = check_boundaries(times, CONFIG.splits, interval_ms=HOUR_MS, horizon=1, min_history=72)
    assert results[0]["ok"] is False


def test_boundary_check_detects_train_target_in_validation():
    times = {"train": [TRAIN.end_ms - HOUR_MS], "validation": [VALIDATION.end_ms - 73 * HOUR_MS], "test": [TEST.start_ms]}
    results = check_boundaries(times, CONFIG.splits, interval_ms=HOUR_MS, horizon=1, min_history=72)
    assert results[0]["cibles_avant_frontiere"] is False
    assert results[0]["ok"] is False


def modified(path, value):
    config = make_config()
    target = config
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    return config


@pytest.mark.parametrize(
    ("path", "value", "message"),
    [
        (("embargo_hours",), 72, "embargo"),
        (("min_history_hours",), 71, "min_history"),
        (("features",), ["close"] + list(make_config()["features"][1:]), "interdites"),
        (("features",), list(make_config()["features"][:-1]) + ["fwd_return_1h"], "interdites"),
        (("features",), list(reversed(make_config()["features"])), "version 1"),
        (("indicators", "rsi_period"), 21, "figées"),
        (("conventions", "volatility_ddof"), 2, "volatility_ddof"),
        (("conventions", "volatility_ddof"), True, "volatility_ddof"),
        (("conventions", "ema_initialisation"), "first_value", "ema_initialisation"),
        (("interval",), "4h", "Intervalle"),
        (("target", "horizon_hours"), 2, "Horizon"),
        (("target", "name"), "target", "target.name"),
        (("source", "csv"), "C:/donnees/fichier.csv", "relatif"),
        (("output_dir",), "../ailleurs", "relatif"),
        (("symbol",), "btcusdt", "Symbole"),
        (("splits", "validation", "start"), "2024-01-16T00:00:00Z", "exactement"),
        (("splits", "test", "end"), "2024-01-22T00:00:00Z", "postérieure"),
        (("splits", "train", "start"), "2024-01-01T00:30:00Z", "alignées"),
    ],
)
def test_invalid_configurations_are_rejected(path, value, message):
    with pytest.raises(DatasetConfigError, match=message):
        parse_dataset_config(modified(path, value))


def test_split_order_is_enforced():
    config = make_config()
    config["splits"] = {k: config["splits"][k] for k in ("validation", "train", "test")}
    with pytest.raises(DatasetConfigError):
        parse_dataset_config(config)


def test_shipped_btcusdt_config_is_valid_and_exact():
    config = load_dataset_config(DEFAULT_CONFIG_PATH)
    assert config.symbol == "BTCUSDT" and config.interval == "1h"
    assert config.min_history == 72 and config.embargo == 73 and config.horizon == 1
    assert config.volatility_ddof == 0
    bounds = {b.name: (b.start_ms, b.end_ms) for b in config.splits}
    assert bounds == {
        "train": (utc_iso_to_ms("2020-01-01T00:00:00Z"), utc_iso_to_ms("2025-01-01T00:00:00Z")),
        "validation": (utc_iso_to_ms("2025-01-01T00:00:00Z"), utc_iso_to_ms("2026-01-01T00:00:00Z")),
        "test": (utc_iso_to_ms("2026-01-01T00:00:00Z"), utc_iso_to_ms("2026-10-01T00:00:00Z")),
    }
    assert config.source_csv == "processed/BTCUSDT-1h-2020-01_2026-09.csv"
    assert config.output_dir == "datasets/BTCUSDT-1h-v1"


def test_config_for_another_symbol_only_changes_data_fields():
    config = copy.deepcopy(make_config(symbol="ETHUSDT", dataset_id="ETHUSDT-1h-v1"))
    assert parse_dataset_config(config).symbol == "ETHUSDT"
