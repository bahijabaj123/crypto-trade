"""Chargeur sécurisé : identité, SHA-256, colonnes, valeurs finies, splits et verrou du test."""

import dataclasses
import hashlib
import json

import pytest

np = pytest.importorskip("numpy")

from cryptotrade_ai.dataset.features import FEATURE_NAMES  # noqa: E402
from cryptotrade_ai.training import TestAccessError, TrainingError  # noqa: E402
from cryptotrade_ai.training.config import parse_training_config  # noqa: E402
from cryptotrade_ai.training.data_loading import (  # noqa: E402
    DevelopmentData,
    FinalTestAuthorization,
    load_development_data,
    load_test_split,
)
from synthetic_training import COLUMNS, DATASET_DIR, make_rows, training_config_dict, write_dataset  # noqa: E402

CONFIG = parse_training_config(training_config_dict())
FEATURE_START = 5


def test_loads_train_and_validation_with_exact_shapes(tmp_path):
    rows = make_rows()
    write_dataset(tmp_path)
    data = load_development_data(tmp_path, CONFIG)
    expected = {n: sum(1 for r in rows if r[4] == n) for n in ("train", "validation", "test")}
    assert len(data.train) == expected["train"] and len(data.validation) == expected["validation"]
    assert data.test_rows == expected["test"]
    assert data.train.X.shape == (expected["train"], 17)
    assert data.identity.features == FEATURE_NAMES
    assert data.train.open_time.max() < data.validation.open_time.min()
    first = next(r for r in rows if r[4] == "train")
    assert data.train.X[0].tolist() == [float(v) for v in first[FEATURE_START : FEATURE_START + 17]]
    assert data.train.y[0] == int(first[-2])


def test_development_data_exposes_no_test_split(tmp_path):
    write_dataset(tmp_path)
    data = load_development_data(tmp_path, CONFIG)
    assert {f.name for f in dataclasses.fields(DevelopmentData)} == {"identity", "train", "validation", "test_rows"}
    assert not hasattr(data, "test")


def test_test_rows_are_never_parsed_during_development(tmp_path):
    write_dataset(tmp_path, test_garbage=True)
    data = load_development_data(tmp_path, CONFIG)
    assert data.test_rows > 0
    with pytest.raises(TrainingError, match="n'est pas un nombre"):
        load_test_split(tmp_path, CONFIG, authorization=FinalTestAuthorization("sha", "final-1"))


def test_fwd_return_and_target_are_not_features(tmp_path):
    write_dataset(tmp_path)
    data = load_development_data(tmp_path, CONFIG)
    assert data.train.X.shape[1] == len(FEATURE_NAMES)
    for column in range(data.train.X.shape[1]):
        assert not np.array_equal(data.train.X[:, column], data.train.fwd_return)
        assert not np.array_equal(data.train.X[:, column], data.train.y.astype(float))


@pytest.mark.parametrize("authorization", [None, "final-1", FinalTestAuthorization("", "")])
def test_test_split_requires_authorization(tmp_path, authorization):
    write_dataset(tmp_path)
    with pytest.raises(TestAccessError):
        load_test_split(tmp_path, CONFIG, authorization=authorization)


def test_sha256_mismatch_is_rejected(tmp_path):
    folder = write_dataset(tmp_path)
    with (folder / "dataset.csv").open("a", encoding="utf-8") as handle:
        handle.write("\n")
    with pytest.raises(TrainingError, match="SHA-256 de dataset.csv"):
        load_development_data(tmp_path, CONFIG)


def test_wrong_column_order_is_rejected(tmp_path):
    header = list(COLUMNS)
    header[5], header[6] = header[6], header[5]
    write_dataset(tmp_path, header=tuple(header))
    with pytest.raises(TrainingError, match="En-tête"):
        load_development_data(tmp_path, CONFIG)


@pytest.mark.parametrize("bad", ["nan", "inf", "-inf", "abc"])
def test_non_finite_feature_is_rejected(tmp_path, bad):
    rows = make_rows()
    rows[10][FEATURE_START + 3] = bad
    write_dataset(tmp_path, rows)
    with pytest.raises(TrainingError, match="Ligne 12"):
        load_development_data(tmp_path, CONFIG)


def test_non_finite_fwd_return_is_rejected(tmp_path):
    rows = make_rows()
    rows[-1 - 800][-1] = "nan"
    write_dataset(tmp_path, rows)
    with pytest.raises(TrainingError, match="fwd_return_1h non fini"):
        load_development_data(tmp_path, CONFIG)


def test_non_binary_target_is_rejected(tmp_path):
    rows = make_rows()
    rows[5][-2] = "2"
    write_dataset(tmp_path, rows)
    with pytest.raises(TrainingError, match="non binaire"):
        load_development_data(tmp_path, CONFIG)


def test_row_outside_its_split_is_rejected(tmp_path):
    rows = make_rows()
    rows[0][4] = "validation"
    write_dataset(tmp_path, rows)
    with pytest.raises(TrainingError, match="hors des bornes"):
        load_development_data(tmp_path, CONFIG)


def test_duplicate_timestamp_is_rejected(tmp_path):
    rows = make_rows()
    rows.insert(1, list(rows[0]))
    write_dataset(tmp_path, rows)
    with pytest.raises(TrainingError, match="croissants"):
        load_development_data(tmp_path, CONFIG)


@pytest.mark.parametrize(
    "overrides, message",
    [
        ({"statut": "ECHEC"}, "statut"),
        ({"dataset_id": "AUTRE"}, "Identité"),
        ({"verifications": [{"controle": "x", "ok": False}]}, "échec"),
        ({"ensembles": {"train": {"equilibre": {"exemples": 1}}}}, "Effectif"),
    ],
)
def test_report_inconsistencies_are_rejected(tmp_path, overrides, message):
    write_dataset(tmp_path, report_overrides=overrides)
    with pytest.raises(TrainingError, match=message):
        load_development_data(tmp_path, CONFIG)


def test_config_used_with_other_features_is_rejected(tmp_path):
    folder = write_dataset(tmp_path)
    path = folder / "config_used.json"
    content = json.loads(path.read_text(encoding="utf-8"))
    content["valeurs_derivees"]["variables_entree"] = list(reversed(FEATURE_NAMES))
    path.write_text(json.dumps(content), encoding="utf-8")
    report_path = folder / "dataset_report.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["empreintes_sha256"]["config_used"] = hashlib.sha256(path.read_bytes()).hexdigest()
    report_path.write_text(json.dumps(report), encoding="utf-8")
    with pytest.raises(TrainingError, match="variables de config_used"):
        load_development_data(tmp_path, CONFIG)


def test_missing_dataset_is_reported(tmp_path):
    with pytest.raises(TrainingError, match="introuvable"):
        load_development_data(tmp_path, CONFIG)
    assert not (tmp_path / DATASET_DIR).exists()


def test_authorized_final_loading_returns_test_only(tmp_path):
    write_dataset(tmp_path)
    identity, test = load_test_split(tmp_path, CONFIG, authorization=FinalTestAuthorization("sha", "final-1"))
    assert test.name == "test" and len(test) == identity.row_counts["test"]
    assert set(test.y.tolist()) <= {0, 1}
