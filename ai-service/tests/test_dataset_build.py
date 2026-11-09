"""Tests de bout en bout de la construction du dataset, sur données synthétiques dans tmp_path."""

import csv
import json
import math

import pytest

from cryptotrade_ai.dataset import DatasetError
from cryptotrade_ai.dataset import build as build_module
from cryptotrade_ai.dataset.build import DATASET_COLUMNS, build_dataset, main
from cryptotrade_ai.dataset.config import parse_dataset_config
from cryptotrade_ai.dataset.continuity import segment_bounds
from cryptotrade_ai.dataset.features import FEATURE_NAMES, FORBIDDEN_INPUT_COLUMNS, compute_features_by_segment
from synthetic_dataset import HOUR_MS, SOURCE_CSV, hour, make_candles, make_config, write_fixture

NOW_MS = hour(10_000)


def build(data_dir, out_name="out", config=None, **kwargs):
    return build_dataset(
        parse_dataset_config(config or make_config()),
        data_dir=data_dir,
        output_dir=data_dir / out_name,
        now_ms=NOW_MS,
        **kwargs,
    )


def read_rows(data_dir, out_name="out"):
    with (data_dir / out_name / "dataset.csv").open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def test_end_to_end_counts_splits_and_report(tmp_path):
    data_dir = write_fixture(tmp_path)
    report = build(data_dir)

    assert report["statut"] == "OK"
    assert all(check["ok"] for check in report["verifications"])
    assert report["exclusions"]["par_raison"] == {
        "hors_periode": 0,
        "historique_insuffisant": 71,
        "cible_absente": 1,
        "valeur_non_finie": 0,
        "embargo": 144,
        "cible_hors_periode": 0,
    }
    sets = report["ensembles"]
    assert sets["train"]["equilibre"]["exemples"] == 193
    assert sets["validation"]["equilibre"]["exemples"] == 96
    assert sets["test"]["equilibre"]["exemples"] == 167
    assert sets["train"]["premier_t_utc"] == "2024-01-03T23:00:00.000Z"
    assert sets["train"]["dernier_t_utc"] == "2024-01-11T23:00:00.000Z"
    assert sets["validation"]["premier_t_utc"] == "2024-01-15T00:00:00.000Z"
    assert sets["validation"]["dernier_t_utc"] == "2024-01-18T23:00:00.000Z"
    assert sets["test"]["dernier_t_utc"] == "2024-01-28T22:00:00.000Z"
    assert report["empreintes_sha256"]["concordance_source"] is True
    assert report["doublons"] == {"source": 0, "dataset": 0}
    assert report["audit_causalite"]["ok"] is True
    assert all(b["ok"] for b in report["frontieres_embargo"]["verifications"])

    rows = read_rows(data_dir)
    assert len(rows) == 193 + 96 + 167
    assert tuple(rows[0]) == DATASET_COLUMNS
    for name in ("dataset.csv", "config_used.json", "dataset_report.json"):
        assert (data_dir / "out" / name).is_file()


def test_dataset_columns_keep_forbidden_columns_out_of_inputs(tmp_path):
    data_dir = write_fixture(tmp_path)
    build(data_dir)
    header = tuple(read_rows(data_dir)[0])
    inputs = header[5 : 5 + len(FEATURE_NAMES)]
    assert inputs == FEATURE_NAMES
    assert not set(inputs) & FORBIDDEN_INPUT_COLUMNS
    assert header[-2:] == ("target_up_1h", "fwd_return_1h")


def test_validation_and_test_rows_use_their_real_past(tmp_path):
    candles = make_candles()
    data_dir = write_fixture(tmp_path, candles)
    build(data_dir)
    features = compute_features_by_segment(candles, segment_bounds([k.open_time for k in candles], HOUR_MS), ddof=0)
    by_time = {int(r["open_time"]): r for r in read_rows(data_dir)}
    for index in (336, 504):
        row = by_time[hour(index)]
        assert tuple(float(row[name]) for name in FEATURE_NAMES) == features[index]
        assert int(row["target_up_1h"]) == int(candles[index + 1].close > candles[index].close)
        assert float(row["fwd_return_1h"]) == math.log(candles[index + 1].close / candles[index].close)


def test_gap_excludes_target_and_restarts_history(tmp_path):
    candles = make_candles(skip=frozenset({100}))
    data_dir = write_fixture(tmp_path, candles, missing=1)
    report = build(data_dir)

    reasons = report["exclusions"]["par_raison"]
    assert reasons["cible_absente"] == 2
    assert reasons["historique_insuffisant"] == 71 + 71
    assert report["trous"]["nombre"] == 1 and report["trous"]["heures_manquantes"] == 1
    assert report["avertissements"] == []
    times = {int(r["open_time"]) for r in read_rows(data_dir)}
    assert hour(99) not in times
    assert not any(hour(101) <= t <= hour(171) for t in times)
    assert hour(172) in times


def test_non_finite_feature_is_excluded_and_reported(tmp_path):
    data_dir = write_fixture(tmp_path, overrides={150: {"number_of_trades": "0"}})
    report = build(data_dir)
    assert report["exclusions"]["par_raison"]["valeur_non_finie"] == 1
    assert report["exclusions"]["valeurs_non_finies_par_colonne"] == {"trades_rel_24h": 1}
    assert hour(150) not in {int(r["open_time"]) for r in read_rows(data_dir)}


def test_sha256_mismatch_writes_nothing(tmp_path):
    data_dir = write_fixture(tmp_path)
    with (data_dir / SOURCE_CSV).open("a", encoding="utf-8") as handle:
        handle.write("\n")
    with pytest.raises(DatasetError, match="SHA-256"):
        build(data_dir)
    assert not (data_dir / "out").exists()


def test_failed_check_writes_nothing(tmp_path, monkeypatch):
    data_dir = write_fixture(tmp_path)
    monkeypatch.setattr(build_module, "audit_causality", lambda *a, **k: {"ok": False, "ecarts_utc": ["simulé"]})
    with pytest.raises(DatasetError, match="audit_causalite"):
        build(data_dir)
    assert not (data_dir / "out").exists()


def test_build_is_reproducible(tmp_path):
    data_dir = write_fixture(tmp_path)
    first = build(data_dir, "run1")
    second = build(data_dir, "run2")
    for name in ("dataset.csv", "config_used.json"):
        assert (data_dir / "run1" / name).read_bytes() == (data_dir / "run2" / name).read_bytes()
    assert first["empreintes_sha256"]["dataset_csv"] == second["empreintes_sha256"]["dataset_csv"]


def test_existing_outputs_require_overwrite(tmp_path):
    data_dir = write_fixture(tmp_path)
    build(data_dir)
    with pytest.raises(DatasetError, match="overwrite"):
        build(data_dir)
    assert build(data_dir, overwrite=True)["statut"] == "OK"


def test_cli(tmp_path, capsys):
    data_dir = write_fixture(tmp_path)
    config_path = tmp_path / "config.json"
    config_path.write_text(json.dumps(make_config()), encoding="utf-8")

    assert main(["--config", str(config_path), "--data-dir", str(data_dir)]) == 0
    assert (data_dir / "datasets" / "SYNTHETIQUE-v1" / "dataset_report.json").is_file()
    assert "train : 193 exemples" in capsys.readouterr().out

    config_path.write_text(json.dumps(make_config(embargo_hours=1)), encoding="utf-8")
    assert main(["--config", str(config_path), "--data-dir", str(data_dir)]) == 2

    config_path.write_text(json.dumps(make_config()), encoding="utf-8")
    assert main(["--config", str(config_path), "--data-dir", str(tmp_path / "vide")]) == 1
