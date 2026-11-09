"""Comparaison reproductible : ajustement sur train, évaluation et sélection sur validation.

Tous les essais (baselines et grilles) sont journalisés. Le test n'est jamais chargé.
Les sorties sont écrites dans un dossier ``.part`` renommé à la fin : en cas d'erreur,
aucune expérience incomplète n'apparaît dans ``experiments/`` ni dans le registre.
"""

from __future__ import annotations

import argparse
import csv
import os
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path

from cryptotrade_ai.config import resolve_data_dir
from cryptotrade_ai.data.binance_archive import sha256_file
from cryptotrade_ai.data.klines import ms_to_utc_iso
from cryptotrade_ai.training import TrainingError
from cryptotrade_ai.training.artifacts import append_registry, git_info, library_versions, models_root, save_model, write_json_atomic
from cryptotrade_ai.training.baselines import ConstantTrainRateBaseline, PreviousHourDirectionBaseline
from cryptotrade_ai.training.config import DEFAULT_TRAINING_CONFIG_PATH, TrainingConfig, TrainingConfigError, load_training_config
from cryptotrade_ai.training.data_loading import DevelopmentData, load_development_data
from cryptotrade_ai.training.decision import coverage_table
from cryptotrade_ai.training.metrics import calibration_check, classification_metrics, per_example_log_loss
from cryptotrade_ai.training.models import build_pipeline, expand_grid, trial_id
from cryptotrade_ai.training.selection import SIGNAL_AUTHORIZED, select_model


def run_experiment(
    config: TrainingConfig,
    *,
    data_dir: Path,
    config_path: Path,
    now_ms: int | None = None,
    record_git: bool = True,
) -> dict:
    started_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    clock = time.perf_counter()
    config_sha = sha256_file(config_path)
    data = load_development_data(data_dir, config)

    root = models_root(data_dir, config.dataset_id)
    run_id = f"{datetime.fromtimestamp(started_ms / 1000, tz=timezone.utc):%Y%m%dT%H%M%SZ}-{config_sha[:8]}"
    final_dir = root / "experiments" / run_id
    work_dir = final_dir.with_name(run_id + ".part")
    if final_dir.exists() or work_dir.exists():
        raise TrainingError(f"Expérience déjà présente, non remplacée : {final_dir}")

    context = {
        "run_id": run_id,
        "date_entrainement_utc": ms_to_utc_iso(started_ms),
        "sha256_configuration_entrainement": config_sha,
        "dataset": data.identity.as_dict(),
        "versions": library_versions(),
        "git": git_info() if record_git else None,
        "graine": config.seed,
        "variables": list(config.features),
        "cible": config.target,
        "colonne_evaluation_uniquement": config.evaluation_only_column,
    }

    work_dir.mkdir(parents=True)
    try:
        records = [
            _run_trial(spec, data, work_dir / "trials" / f"{index:02d}", config, context)
            for index, spec in enumerate(_trial_specs(config), start=1)
        ]
        comparison = select_model(records, config)
        retained = next((r for r in records if r["trial_id"] == comparison["retenu"]), None)
        comparison["diagnostic_couverture_validation"] = (
            coverage_table(
                retained["p_validation"], data.validation.y, data.validation.fwd_return,
                config.coverage_grid, fee_per_side=config.fee_per_side,
            )
            if retained and comparison["statut_signal"] == SIGNAL_AUTHORIZED
            else None
        )
        comparison["note_couverture"] = (
            "Aucun seuil n'est choisi automatiquement : la couverture sera choisie plus tard parmi la grille, "
            "sur validation uniquement (freeze_selection.py)."
        )
        comparison_sha = write_json_atomic(work_dir / "comparison.json", comparison)
        experiment = {
            **context,
            "duree_secondes": round(time.perf_counter() - clock, 3),
            "effectifs": {"train": len(data.train), "validation": len(data.validation), "test_non_lu": data.test_rows},
            "configuration_entrainement": config.raw,
            "essais": [r["resume"] for r in records],
            "sha256_comparison": comparison_sha,
            "test_2026": "non chargé : réservé à evaluate_final_test.py après figeage de la sélection",
        }
        write_json_atomic(work_dir / "experiment.json", experiment)
        os.replace(work_dir, final_dir)
    except BaseException:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise

    append_registry(
        root,
        {
            "type": "experience",
            "run_id": run_id,
            "date_utc": context["date_entrainement_utc"],
            "sha256_configuration_entrainement": config_sha,
            "sha256_dataset_csv": data.identity.dataset_sha256,
            "essais": len(records),
            "retenu": comparison["retenu"],
            "statut_signal": comparison["statut_signal"],
        },
    )
    return {"run_id": run_id, "dossier": str(final_dir), "comparaison": comparison, "essais": [r["resume"] for r in records]}


def _trial_specs(config: TrainingConfig):
    feature_index = config.features.index(config.previous_hour_feature)
    yield "baseline", ConstantTrainRateBaseline.name, {}, ConstantTrainRateBaseline()
    yield "baseline", PreviousHourDirectionBaseline.name, {"feature": config.previous_hour_feature}, PreviousHourDirectionBaseline(feature_index)
    for spec in config.models:
        for params in expand_grid(spec):
            yield "modele", trial_id(spec.name, params, spec), params, (spec.name, build_pipeline(spec.name, params, config.seed))


def _run_trial(spec, data: DevelopmentData, trial_dir: Path, config: TrainingConfig, context: dict) -> dict:
    kind, name, params, estimator = spec
    model_name = name if kind == "baseline" else estimator[0]
    if kind == "modele":
        estimator = estimator[1]
    started = time.perf_counter()
    estimator.fit(data.train.X, data.train.y)
    fit_seconds = time.perf_counter() - started

    p_train = estimator.predict_proba(data.train.X)[:, 1]
    p_val = estimator.predict_proba(data.validation.X)[:, 1]
    own_rule = kind == "baseline"
    metrics_train = classification_metrics(data.train.y, p_train, estimator.predict(data.train.X) if own_rule else None)
    metrics_val = classification_metrics(data.validation.y, p_val, estimator.predict(data.validation.X) if own_rule else None)
    calibration = calibration_check(
        data.validation.y, p_val, n_bins=config.calibration_bins, n_simulations=config.calibration_simulations,
        confidence=config.calibration_confidence, seed=config.calibration_seed,
    )

    folder = Path("trials") / trial_dir.name
    model_sha = save_model(estimator, trial_dir / "model.joblib")
    predictions_sha = _write_predictions(trial_dir / "predictions_validation.csv", data.validation.open_time, p_val)
    metrics = {"train": metrics_train, "validation": metrics_val, "calibration_validation": calibration}
    metrics_sha = write_json_atomic(trial_dir / "metrics.json", metrics)
    summary = {
        "trial_id": name,
        "type": kind,
        "modele": model_name,
        "parametres": params,
        "dossier": str(folder),
        "sha256_modele": model_sha,
        "sha256_predictions_validation": predictions_sha,
        "sha256_metrics": metrics_sha,
        "duree_ajustement_secondes": round(fit_seconds, 3),
        "log_loss_validation": metrics_val["log_loss"],
        "brier_validation": metrics_val["brier"],
        "roc_auc_validation": metrics_val["roc_auc"],
        "accuracy_validation": metrics_val["accuracy"],
        "log_loss_train": metrics_train["log_loss"],
        "ece_validation": calibration["ece"],
        "calibration_suffisante": calibration["suffisante"],
    }
    if kind == "baseline":
        summary["probabilites_train"] = estimator.describe()
    write_json_atomic(trial_dir / "metadata.json", {**context, **summary})
    return {
        "trial_id": name,
        "type": kind,
        "modele": model_name,
        "metrics_validation": metrics_val,
        "calibration": calibration,
        "losses": per_example_log_loss(data.validation.y, p_val),
        "p_validation": p_val,
        "resume": summary,
    }


def _write_predictions(path: Path, open_times, probabilities) -> str:
    temporary = path.with_name(path.name + ".part")
    with temporary.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(("open_time", "open_time_utc", "probabilite_hausse"))
        for t, p in zip(open_times, probabilities):
            writer.writerow((int(t), ms_to_utc_iso(int(t)), repr(float(p))))
    os.replace(temporary, path)
    return sha256_file(path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Entraîne baselines et modèles sur train, les compare sur validation. Ne lit jamais le test."
    )
    parser.add_argument("--config", default=str(DEFAULT_TRAINING_CONFIG_PATH), help="Configuration d'entraînement JSON")
    parser.add_argument("--data-dir", default=None, help="Dossier des données (défaut : CRYPTOTRADE_AI_DATA_DIR ou ai-service/data)")
    args = parser.parse_args(argv)
    config_path = Path(args.config).resolve()
    try:
        config = load_training_config(config_path)
        result = run_experiment(config, data_dir=resolve_data_dir(args.data_dir), config_path=config_path)
    except TrainingConfigError as exc:
        print(f"ERREUR DE CONFIGURATION : {exc}")
        return 2
    except TrainingError as exc:
        print(f"ERREUR : {exc}")
        return 1
    comparison = result["comparaison"]
    print(f"Expérience : {result['run_id']}")
    for trial in result["essais"]:
        print(
            f"  {trial['trial_id']:<45} log loss {trial['log_loss_validation']:.5f}  "
            f"AUC {trial['roc_auc_validation'] if trial['roc_auc_validation'] is None else round(trial['roc_auc_validation'], 4)}  "
            f"ECE {trial['ece_validation']:.4f}"
        )
    print(f"Retenu : {comparison['retenu']}  signal : {comparison['statut_signal']}")
    for reason in comparison["raisons_refus"]:
        print(f"  REFUS : {reason}")
    print(f"Dossier : {result['dossier']}")
    return 0
