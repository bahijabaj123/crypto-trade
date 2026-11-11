"""Tests du script scripts/explain_prediction.py sur un dataset et un modèle SYNTHÉTIQUES (dossiers temporaires).

Le dataset reprend les bornes réelles (validation 2025, test 2026) avec quelques heures par
ensemble ; les lignes du test contiennent du texte illisible : les convertir ferait échouer le
chargement. Aucun test ne lit C:\\CryptoTrade-AI-Data ni le vrai modèle figé.
"""

from __future__ import annotations

import csv
import hashlib
import importlib.util
import json
import os
import random
import socket
import subprocess
import sys
from pathlib import Path

import pytest

pytest.importorskip("sklearn")
pytest.importorskip("shap")

import numpy as np  # noqa: E402
import synthetic_xai  # noqa: E402
from synthetic_training import COLUMNS, DATASET_DIR, DATASET_ID, write_training_config  # noqa: E402
from synthetic_xai import DOWN_INDEX, MARGIN, RETAINED, RUN_ID, UP_INDEX, make_forest, write_frozen_selection  # noqa: E402

from cryptotrade_ai.config import DATA_DIR_ENV_VAR  # noqa: E402
from cryptotrade_ai.data.binance_archive import sha256_file  # noqa: E402
from cryptotrade_ai.data.klines import ms_to_utc_iso, utc_iso_to_ms  # noqa: E402
from cryptotrade_ai.dataset.features import FEATURE_NAMES  # noqa: E402
from cryptotrade_ai.training import data_loading  # noqa: E402
from cryptotrade_ai.training.decision import ATTENDRE, DecisionPolicy, decide  # noqa: E402
from cryptotrade_ai.xai.schema import validate_explanation  # noqa: E402

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "explain_prediction.py"
_spec = importlib.util.spec_from_file_location("explain_prediction_script", SCRIPT)
script = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(script)

HOUR_MS = 3_600_000
BOUNDS = (
    ("train", "2020-01-01T00:00:00.000Z", "2025-01-01T00:00:00.000Z"),
    ("validation", "2025-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
    ("test", "2026-01-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z"),
)
FIRST_HOURS = {"train": "2024-12-29T00:00:00.000Z", "validation": "2025-01-01T00:00:00.000Z", "test": "2026-01-01T00:00:00.000Z"}
COUNTS = {"train": 48, "validation": 120, "test": 24}
QUIET_HOURS = 6
SIGNAL_HOUR = 9
MISSING_HOUR = "2025-01-03T02:00:00.000Z"
UNREADABLE = "NON_LU"


# --- Données synthétiques ---------------------------------------------------------------------


def neutral_row(forest) -> list[float]:
    """Variables nulles sauf ret_1h, choisi pour que la forêt synthétique donne p au plus près de 0,5."""
    grid = np.zeros((401, len(FEATURE_NAMES)))
    grid[:, UP_INDEX] = np.linspace(-2.0, 2.0, 401)
    p = forest.predict_proba(grid)[:, 1]
    best = int(np.argmin(np.abs(p - 0.5)))
    assert abs(p[best] - 0.5) < MARGIN, "aucune ligne neutre trouvée pour la forêt synthétique"
    return [float(v) for v in grid[best]]


def make_rows(neutral: list[float], seed: int = 11) -> list[list[str]]:
    """Validation : 6 heures neutres (zone ATTENDRE), puis du bruit, avec un signal fort à la 10e heure."""
    rng = random.Random(seed)
    rows = []
    for split, _, _ in BOUNDS:
        start = utc_iso_to_ms(FIRST_HOURS[split])
        for k in range(COUNTS[split]):
            t = start + k * HOUR_MS
            if ms_to_utc_iso(t) == MISSING_HOUR:
                continue
            meta = [str(t), ms_to_utc_iso(t), ms_to_utc_iso(t + HOUR_MS), "BTCUSDT", split]
            if split == "test":
                rows.append(meta + [UNREADABLE] * (len(COLUMNS) - len(meta)))
                continue
            features = [rng.gauss(0, 1) for _ in FEATURE_NAMES]
            if split == "validation" and k < QUIET_HOURS:
                features = list(neutral)
            if split == "validation" and k == SIGNAL_HOUR:
                features[UP_INDEX], features[DOWN_INDEX] = 2.5, -2.0
            rows.append(meta + [repr(v) for v in features] + [str(rng.randint(0, 1)), repr(rng.gauss(0, 0.005))])
    return rows


def write_dataset(data_dir: Path, rows: list[list[str]], *, features: tuple[str, ...] = FEATURE_NAMES) -> str:
    columns = ("open_time", "open_time_utc", "decision_time_utc", "symbol", "split", *features, "target_up_1h", "fwd_return_1h")
    keep = [COLUMNS.index(c) for c in columns]
    folder = data_dir / DATASET_DIR
    folder.mkdir(parents=True, exist_ok=True)
    csv_path = folder / "dataset.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(columns)
        writer.writerows([row[i] for i in keep] for row in rows)
    config_used = {
        "dataset_id": DATASET_ID,
        "configuration": {"symbol": "BTCUSDT"},
        "valeurs_derivees": {
            "variables_entree": list(features),
            "colonnes_dataset": list(columns),
            "ensembles": [{"nom": n, "debut_utc": s, "fin_exclue_utc": e} for n, s, e in BOUNDS],
        },
    }
    config_used_path = folder / "config_used.json"
    config_used_path.write_text(json.dumps(config_used), encoding="utf-8")
    report = {
        "statut": "OK",
        "dataset_id": DATASET_ID,
        "empreintes_sha256": {"dataset_csv": sha256_file(csv_path), "config_used": sha256_file(config_used_path)},
        "verifications": [{"controle": "synthetique", "ok": True}],
        "ensembles": {n: {"equilibre": {"exemples": sum(1 for r in rows if r[4] == n)}} for n, _, _ in BOUNDS},
    }
    (folder / "dataset_report.json").write_text(json.dumps(report), encoding="utf-8")
    return sha256_file(csv_path)


def validation_matrix(rows) -> tuple[np.ndarray, np.ndarray]:
    validation = [r for r in rows if r[4] == "validation"]
    times = np.array([int(r[0]) for r in validation], dtype=np.int64)
    X = np.array([[float(v) for v in r[5 : 5 + len(FEATURE_NAMES)]] for r in validation])
    return times, X


@pytest.fixture(scope="module")
def forest():
    return make_forest()


@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    """Ni réseau (donc aucun ordre possible), ni dossier de données réel, ni accès au test."""

    def no_network(*args, **kwargs):
        raise AssertionError("Accès réseau interdit pendant les tests du script XAI")

    def no_test_split(*args, **kwargs):
        raise AssertionError("load_test_split ne doit jamais être appelé par le script XAI")

    monkeypatch.setattr(socket.socket, "connect", no_network)
    monkeypatch.setattr(socket, "create_connection", no_network)
    monkeypatch.setattr(data_loading, "load_test_split", no_test_split)
    monkeypatch.delenv(DATA_DIR_ENV_VAR, raising=False)
    monkeypatch.setattr(script, "FROZEN_EXPERIMENT", RUN_ID)
    monkeypatch.setattr(script, "FROZEN_TRIAL", RETAINED)


def build_fixture(tmp_path, monkeypatch, forest, *, rows=None, features=FEATURE_NAMES, policy=None, signal="AUTORISE", edit_selection=None):
    rows = rows if rows is not None else make_rows(neutral_row(forest))
    config_path = write_training_config(tmp_path / "training_config.json")
    monkeypatch.setattr(synthetic_xai, "copy_training_config", lambda _: config_path)
    data_dir = tmp_path / "data"
    dataset_sha = write_dataset(data_dir, rows, features=features)

    def add_dataset_identity(selection):
        selection["dataset"].update(
            sha256_dataset_csv=dataset_sha, bornes_ensembles_utc={n: [s, e] for n, s, e in BOUNDS}
        )
        if edit_selection:
            edit_selection(selection)

    write_frozen_selection(tmp_path, forest, policy=policy, signal=signal, edit_selection=add_dataset_identity)
    return data_dir, config_path, rows


def run(data_dir, config_path, *extra) -> int:
    return script.main(["--data-dir", str(data_dir), "--config", str(config_path), *extra])


def json_payload(output: str) -> dict:
    return json.loads(output[output.index("\n{\n") + 1 :])


def snapshot(folder: Path) -> dict:
    return {str(p.relative_to(folder)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(folder.rglob("*")) if p.is_file()}


def expected_signal_index(forest, rows, policy=DecisionPolicy(True, MARGIN)) -> tuple[int, np.ndarray]:
    times, X = validation_matrix(rows)
    states = decide(forest.predict_proba(X)[:, 1], policy)
    signals = np.flatnonzero(states != ATTENDRE)
    return (int(signals[0]) if len(signals) else 0), times


# --- Mode historique ---------------------------------------------------------------------------


def test_historical_mode_explains_the_first_signal_of_validation(tmp_path, monkeypatch, forest, capsys):
    data_dir, config_path, rows = build_fixture(tmp_path, monkeypatch, forest)
    index, times = expected_signal_index(forest, rows)
    assert QUIET_HOURS <= index <= SIGNAL_HOUR, "les heures neutres doivent précéder le premier signal"

    assert run(data_dir, config_path, "--json") == 0
    output = capsys.readouterr().out
    payload = json_payload(output)
    assert validate_explanation(payload) == payload
    assert payload["candle_open_time_utc"] == ms_to_utc_iso(int(times[index]))
    assert payload["prediction"]["state"] != ATTENDRE
    assert payload["prediction"]["margin"] == MARGIN
    assert payload["explanation"]["method"] == "tree_shap_path_dependent"
    assert payload["explanation"]["additivity_error"] <= 1e-6
    assert payload["model"]["experiment"] == RUN_ID and payload["model"]["trial_id"] == RETAINED
    _, X = validation_matrix(rows)
    assert payload["prediction"]["probability_up"] == pytest.approx(forest.predict_proba(X[index : index + 1])[0, 1], abs=1e-12)
    for text in ("mode historique (validation 2025)", "Probabilité hausse", "Valeur de base", "Top 5 contributions", "Erreur additivité", "Temps de calcul"):
        assert text in output
    assert len([line for line in output.splitlines() if line.startswith("  ") and " pt  vers_" in line]) == 5


def test_candle_choice_is_deterministic(tmp_path, monkeypatch, forest, capsys):
    data_dir, config_path, _ = build_fixture(tmp_path, monkeypatch, forest)
    assert run(data_dir, config_path, "--json") == 0
    first = json_payload(capsys.readouterr().out)
    assert run(data_dir, config_path, "--json") == 0
    second = json_payload(capsys.readouterr().out)
    assert first["candle_open_time_utc"] == second["candle_open_time_utc"]
    assert first["prediction"]["state"] == second["prediction"]["state"]
    assert [r["feature"] for r in first["explanation"]["contributions"]] == [r["feature"] for r in second["explanation"]["contributions"]]


def test_disabled_signal_explains_the_first_candle_as_attendre(tmp_path, monkeypatch, forest, capsys):
    refused = {"signal_autorise": False, "marge": None, "couverture_cible": None}
    data_dir, config_path, _ = build_fixture(tmp_path, monkeypatch, forest, policy=refused, signal="REFUSE")
    assert run(data_dir, config_path, "--json") == 0
    output = capsys.readouterr().out
    payload = json_payload(output)
    assert validate_explanation(payload) == payload
    assert payload["candle_open_time_utc"] == "2025-01-01T00:00:00.000Z"
    assert payload["prediction"]["state"] == ATTENDRE
    assert payload["prediction"]["threshold_up"] is None and payload["prediction"]["threshold_down"] is None
    assert payload["explanation"]["additivity_error"] <= 1e-6
    assert "signal désactivé par la politique figée : aucune HAUSSE ni BAISSE possible" in output
    assert "aucun — signal désactivé par la politique figée, l'état est toujours ATTENDRE" in output
    assert "avec HAUSSE ou BAISSE" not in output
    assert "État              : ATTENDRE" in output


def test_authorized_signal_without_any_signal_says_so(tmp_path, monkeypatch, forest, capsys):
    unreachable = {"signal_autorise": True, "marge": 0.5, "couverture_cible": 0.25}
    data_dir, config_path, _ = build_fixture(tmp_path, monkeypatch, forest, policy=unreachable)
    assert run(data_dir, config_path, "--json") == 0
    output = capsys.readouterr().out
    assert json_payload(output)["candle_open_time_utc"] == "2025-01-01T00:00:00.000Z"
    assert "aucune bougie HAUSSE ou BAISSE sur la validation" in output
    assert "Signaux sur 2025  : 0 bougies" in output
    assert "HAUSSE si p >= 1.000000" in output


def test_requested_validation_candle_is_explained(tmp_path, monkeypatch, forest, capsys):
    data_dir, config_path, _ = build_fixture(tmp_path, monkeypatch, forest)
    assert run(data_dir, config_path, "--open-time", "2025-01-02T05:00:00.000Z", "--json") == 0
    output = capsys.readouterr().out
    assert "demandée explicitement" in output
    assert json_payload(output)["candle_open_time_utc"] == "2025-01-02T05:00:00.000Z"


def test_without_json_flag_no_json_is_printed(tmp_path, monkeypatch, forest, capsys):
    data_dir, config_path, _ = build_fixture(tmp_path, monkeypatch, forest)
    assert run(data_dir, config_path) == 0
    assert "\n{\n" not in capsys.readouterr().out


# --- Refus avant toute lecture du dataset -------------------------------------------------------


@pytest.mark.parametrize(
    ("when", "reason"),
    [
        ("2024-06-01T00:00:00.000Z", "entraînement"),
        ("2024-12-31T23:00:00.000Z", "entraînement"),
        ("2026-01-01T00:00:00.000Z", "test final 2026"),
        ("2026-03-15T10:00:00.000Z", "test final 2026"),
        ("2026-09-30T23:00:00.000Z", "test final 2026"),
        ("2027-01-01T00:00:00.000Z", "hors du dataset"),
        ("2019-06-01T00:00:00.000Z", "hors du dataset"),
    ],
)
def test_dates_outside_validation_are_refused_before_reading_the_dataset(tmp_path, monkeypatch, forest, capsys, when, reason):
    data_dir, config_path, _ = build_fixture(tmp_path, monkeypatch, forest)
    calls = []
    monkeypatch.setattr(script, "load_development_data", lambda *a, **k: calls.append(a))
    assert run(data_dir, config_path, "--open-time", when) == script.EXIT_REFUSED
    output = capsys.readouterr().out
    assert output.startswith("REFUSÉ") and reason in output
    assert calls == []


def test_refusal_does_not_need_the_dataset_at_all(tmp_path, monkeypatch, forest, capsys):
    data_dir, config_path, _ = build_fixture(tmp_path, monkeypatch, forest)
    for path in (data_dir / DATASET_DIR).iterdir():
        path.unlink()
    assert run(data_dir, config_path, "--open-time", "2026-03-15T10:00:00.000Z") == script.EXIT_REFUSED
    assert "test final 2026" in capsys.readouterr().out


# --- Dates invalides, variables manquantes, entrées non autorisées ------------------------------


@pytest.mark.parametrize("when", ["pas-une-date", "2025-13-01T00:00:00Z", "2025-01-01", "2025-01-01T00:00:00"])
def test_invalid_dates_are_refused(tmp_path, monkeypatch, forest, capsys, when):
    data_dir, config_path, _ = build_fixture(tmp_path, monkeypatch, forest)
    calls = []
    monkeypatch.setattr(script, "load_frozen_model", lambda *a, **k: calls.append(a))
    assert run(data_dir, config_path, "--open-time", when) == 1
    assert capsys.readouterr().out.startswith("ERREUR")
    assert calls == []


@pytest.mark.parametrize("when", ["", "   "])
def test_empty_date_is_refused(tmp_path, monkeypatch, forest, capsys, when):
    data_dir, config_path, _ = build_fixture(tmp_path, monkeypatch, forest)
    calls = []
    monkeypatch.setattr(script, "load_frozen_model", lambda *a, **k: calls.append("modele"))
    monkeypatch.setattr(script, "load_development_data", lambda *a, **k: calls.append("donnees"))
    assert run(data_dir, config_path, "--open-time", when) == 1
    output = capsys.readouterr().out
    assert output.startswith("ERREUR : --open-time vide")
    assert "Bougie" not in output and "Probabilité" not in output
    assert calls == []


@pytest.mark.parametrize("when", [MISSING_HOUR, "2025-01-01T00:30:00.000Z", "2025-12-31T23:00:00.000Z"])
def test_validation_times_absent_from_the_dataset_are_refused(tmp_path, monkeypatch, forest, capsys, when):
    data_dir, config_path, _ = build_fixture(tmp_path, monkeypatch, forest)
    assert run(data_dir, config_path, "--open-time", when) == script.EXIT_REFUSED
    assert "absente" in capsys.readouterr().out


def test_dataset_with_a_missing_variable_is_refused(tmp_path, monkeypatch, forest, capsys):
    data_dir, config_path, _ = build_fixture(tmp_path, monkeypatch, forest, features=FEATURE_NAMES[:-1])
    assert run(data_dir, config_path) == 1
    assert capsys.readouterr().out.startswith("ERREUR")


def test_non_finite_validation_value_is_refused(tmp_path, monkeypatch, forest, capsys):
    rows = make_rows(neutral_row(forest))
    validation = next(r for r in rows if r[4] == "validation")
    validation[5 + FEATURE_NAMES.index("rsi_14")] = "nan"
    data_dir, config_path, _ = build_fixture(tmp_path, monkeypatch, forest, rows=rows)
    assert run(data_dir, config_path) == 1
    assert "non fini" in capsys.readouterr().out


def test_selection_with_another_variable_order_is_refused(tmp_path, monkeypatch, forest, capsys):
    def swap(selection):
        names = selection["dataset"]["variables"]
        names[0], names[1] = names[1], names[0]

    data_dir, config_path, _ = build_fixture(tmp_path, monkeypatch, forest, edit_selection=swap)
    assert run(data_dir, config_path) == 1
    assert "Ordre des variables" in capsys.readouterr().out


def test_selection_of_another_dataset_is_refused(tmp_path, monkeypatch, forest, capsys):
    data_dir, config_path, _ = build_fixture(
        tmp_path, monkeypatch, forest, edit_selection=lambda s: s["dataset"].update(sha256_dataset_csv="ab" * 32)
    )
    assert run(data_dir, config_path) == 1
    assert "dataset diffère" in capsys.readouterr().out


def test_unexpected_frozen_model_is_refused(tmp_path, monkeypatch, forest, capsys):
    data_dir, config_path, _ = build_fixture(tmp_path, monkeypatch, forest)
    monkeypatch.setattr(script, "FROZEN_EXPERIMENT", "20261108T122920Z-c3c17310")
    assert run(data_dir, config_path) == 1
    assert "Expérience" in capsys.readouterr().out


@pytest.mark.parametrize(
    "arguments",
    [["--mode", "trading"], ["--mode", "ordre"], ["--target-up-1h", "1"], ["--fwd-return-1h", "0.01"], ["--execute-order"]],
)
def test_unauthorized_arguments_are_refused(arguments):
    with pytest.raises(SystemExit) as exc:
        script.main(arguments)
    assert exc.value.code == 2


# --- Mode temps réel ---------------------------------------------------------------------------


def test_realtime_mode_fails_clearly_without_loading_anything(monkeypatch, capsys):
    calls = []
    monkeypatch.setattr(script, "load_frozen_model", lambda *a, **k: calls.append("modele"))
    monkeypatch.setattr(script, "load_development_data", lambda *a, **k: calls.append("donnees"))
    assert script.main(["--mode", "temps-reel"]) == script.EXIT_NOT_IMPLEMENTED
    assert "non implémenté" in capsys.readouterr().out
    assert calls == []


def test_realtime_mode_exit_code_from_the_command_line(tmp_path):
    done = subprocess.run(
        [sys.executable, str(SCRIPT), "--mode", "temps-reel"],
        capture_output=True, text=True, encoding="utf-8", timeout=120, cwd=tmp_path,
        env={"PYTHONDONTWRITEBYTECODE": "1", "PYTHONIOENCODING": "utf-8", "SYSTEMROOT": os.environ.get("SYSTEMROOT", "")},
    )
    assert done.returncode == script.EXIT_NOT_IMPLEMENTED
    assert "non implémenté" in done.stdout
    assert list(tmp_path.iterdir()) == []


# --- Aucune écriture, aucun ordre ----------------------------------------------------------------


def test_no_file_is_created_or_modified(tmp_path, monkeypatch, forest, capsys):
    data_dir, config_path, _ = build_fixture(tmp_path, monkeypatch, forest)
    before = snapshot(tmp_path)
    assert run(data_dir, config_path, "--json") == 0
    assert run(data_dir, config_path, "--open-time", "2026-03-15T10:00:00.000Z") == script.EXIT_REFUSED
    capsys.readouterr()
    after = snapshot(tmp_path)
    assert after == before
    assert any(name.endswith("model.joblib") for name in after)
    assert any(name.endswith("selection.json") for name in after)


def test_no_trading_order_is_possible(tmp_path, monkeypatch, forest, capsys):
    data_dir, config_path, _ = build_fixture(tmp_path, monkeypatch, forest)
    assert run(data_dir, config_path, "--json") == 0
    payload = json_payload(capsys.readouterr().out)
    assert "aucun ordre n'est exécuté" in " ".join(payload["warnings"])
    source = SCRIPT.read_text(encoding="utf-8").lower()
    for forbidden in ("requests", "urllib", "http", "socket", "api_key", "create_order", "place_order", "new_order"):
        assert forbidden not in source
