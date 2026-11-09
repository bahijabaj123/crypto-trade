"""Règle de sélection sur validation, puis figeage de la sélection (``selection.json``).

Rien ici ne lit le test : la marge ATTENDRE est déduite des probabilités de validation.
"""

from __future__ import annotations

import argparse
import csv
import time
from pathlib import Path

import numpy as np

from cryptotrade_ai.config import resolve_data_dir
from cryptotrade_ai.data.binance_archive import sha256_file
from cryptotrade_ai.data.klines import ms_to_utc_iso
from cryptotrade_ai.training import TrainingError
from cryptotrade_ai.training.artifacts import (
    FINAL_TEST_LOG_FILE,
    SELECTION_FILE,
    append_registry,
    models_root,
    read_json,
    write_json_atomic,
)
from cryptotrade_ai.training.config import DEFAULT_TRAINING_CONFIG_PATH, TrainingConfig, TrainingConfigError, load_training_config
from cryptotrade_ai.training.decision import REFUSED_POLICY, DecisionPolicy, margin_for_coverage
from cryptotrade_ai.training.metrics import block_bootstrap_mean

SIGNAL_AUTHORIZED = "AUTORISE"
SIGNAL_REFUSED = "REFUSE"


def select_model(records: list[dict], config: TrainingConfig) -> dict:
    """``records`` : un dict par essai avec ``trial_id``, ``type``, ``modele``, ``metrics_validation``,
    ``calibration`` et ``losses`` (log loss par exemple de validation, dans l'ordre du temps)."""
    baselines = [r for r in records if r["type"] == "baseline"]
    models = [r for r in records if r["type"] == "modele"]
    if not baselines:
        raise TrainingError("Sélection impossible sans baselines")
    best_baseline = min(baselines, key=lambda r: r["metrics_validation"]["log_loss"])
    baseline_losses = {r["trial_id"]: r["metrics_validation"]["log_loss"] for r in baselines}

    comparisons = []
    for record in models:
        loss = record["metrics_validation"]["log_loss"]
        interval = _diff_interval(record, best_baseline, config)
        beats_all = all(loss < b for b in baseline_losses.values())
        significant = interval["borne_haute"] < 0
        comparisons.append(
            {
                "trial_id": record["trial_id"],
                "modele": record["modele"],
                "log_loss_validation": loss,
                "bat_toutes_les_baselines": beats_all,
                "difference_vs_meilleure_baseline": interval,
                "amelioration_significative": significant,
                "eligible": beats_all and (significant or not config.require_significant_improvement),
            }
        )

    eligible = [c for c in comparisons if c["eligible"]]
    by_id = {r["trial_id"]: r for r in records}
    reasons, simplicity = [], []
    retained = None
    if not eligible:
        reasons.append("Aucun modèle ne surpasse les baselines sur la validation (log loss)")
    else:
        best = min(eligible, key=lambda c: c["log_loss_validation"])
        retained = best
        for simpler_name in config.simplicity_order:
            if simpler_name == best["modele"]:
                break
            candidates = [c for c in eligible if c["modele"] == simpler_name]
            if not candidates:
                continue
            simpler = min(candidates, key=lambda c: c["log_loss_validation"])
            interval = _diff_interval(by_id[simpler["trial_id"]], by_id[best["trial_id"]], config)
            indistinct = interval["borne_basse"] <= 0 <= interval["borne_haute"]
            simplicity.append(
                {"plus_simple": simpler["trial_id"], "meilleur": best["trial_id"], "difference": interval, "indistincts": indistinct}
            )
            if indistinct:
                retained = simpler
                break

    calibration = by_id[retained["trial_id"]]["calibration"] if retained else None
    if retained and not calibration["suffisante"]:
        reasons.append(
            f"Calibration insuffisante pour {retained['trial_id']} : ECE {calibration['ece']:.5f} > "
            f"seuil du hasard {calibration['seuil_ece_hasard']:.5f}"
        )
    return {
        "regle": config.raw["selection"]["rule"],
        "metrique_principale": config.primary_metric,
        "meilleure_baseline": best_baseline["trial_id"],
        "log_loss_baselines": baseline_losses,
        "comparaisons": comparisons,
        "simplicite": simplicity,
        "retenu": retained["trial_id"] if retained else None,
        "statut_signal": SIGNAL_REFUSED if reasons else SIGNAL_AUTHORIZED,
        "raisons_refus": reasons,
    }


def _diff_interval(record: dict, reference: dict, config: TrainingConfig) -> dict:
    return block_bootstrap_mean(
        record["losses"] - reference["losses"],
        block=config.bootstrap_block_hours,
        n_resamples=config.bootstrap_resamples,
        confidence=config.bootstrap_confidence,
        seed=config.bootstrap_seed,
    )


def freeze_selection(
    config: TrainingConfig,
    *,
    data_dir: Path,
    config_path: Path,
    run_id: str,
    coverage: float | None,
    overwrite: bool = False,
    now_ms: int | None = None,
) -> dict:
    root = models_root(data_dir, config.dataset_id)
    experiment_dir = root / "experiments" / run_id
    experiment = read_json(experiment_dir / "experiment.json")
    comparison_path = experiment_dir / "comparison.json"
    comparison = read_json(comparison_path)
    if experiment.get("sha256_comparison") != sha256_file(comparison_path):
        raise TrainingError("comparison.json a été modifié depuis l'expérience")
    if experiment["sha256_configuration_entrainement"] != sha256_file(config_path):
        raise TrainingError("La configuration d'entraînement diffère de celle de l'expérience")

    selection_path = root / SELECTION_FILE
    log_path = root / FINAL_TEST_LOG_FILE
    if log_path.exists() and read_json(log_path).get("evaluations"):
        raise TrainingError("Une évaluation finale du test est déjà consignée : la sélection ne peut plus changer")
    if selection_path.exists() and not overwrite:
        raise TrainingError(f"Sélection déjà figée (utiliser --overwrite avant toute évaluation finale) : {selection_path}")

    trials = {t["trial_id"]: t for t in experiment["essais"]}
    retained = comparison["retenu"]
    if comparison["statut_signal"] == SIGNAL_REFUSED:
        if coverage is not None:
            raise TrainingError("Signal refusé par la règle : aucune couverture ne peut être choisie")
        policy = REFUSED_POLICY
    else:
        if coverage is None or coverage not in config.coverage_grid:
            raise TrainingError(f"Couverture à choisir parmi la grille déclarée : {list(config.coverage_grid)}")
        p_val = _validation_probabilities(experiment_dir, trials[retained])
        policy = DecisionPolicy(signal_authorized=True, margin=margin_for_coverage(p_val, coverage), target_coverage=coverage)

    frozen_ids = [t for t in trials if trials[t]["type"] == "baseline"] + ([retained] if retained else [])
    selection = {
        "dataset_id": config.dataset_id,
        "fige_le_utc": ms_to_utc_iso(now_ms if now_ms is not None else int(time.time() * 1000)),
        "experience": run_id,
        "sha256_experiment": sha256_file(experiment_dir / "experiment.json"),
        "sha256_comparison": experiment["sha256_comparison"],
        "sha256_configuration_entrainement": experiment["sha256_configuration_entrainement"],
        "dataset": experiment["dataset"],
        "versions": experiment["versions"],
        "statut_signal": comparison["statut_signal"],
        "raisons_refus": comparison["raisons_refus"],
        "retenu": retained,
        "modeles_figes": {
            trial: {
                "type": trials[trial]["type"],
                "chemin": str(Path("experiments") / run_id / trials[trial]["dossier"] / "model.joblib"),
                "sha256": trials[trial]["sha256_modele"],
            }
            for trial in frozen_ids
        },
        "politique_decision": policy.as_dict(),
        "note": "Couverture choisie sur validation uniquement. Une probabilité élevée ne garantit aucun profit.",
    }
    write_json_atomic(selection_path, selection)
    append_registry(
        root,
        {"type": "selection", "date_utc": selection["fige_le_utc"], "experience": run_id, "retenu": retained,
         "statut_signal": selection["statut_signal"], "sha256_selection": sha256_file(selection_path)},
    )
    return selection


def _validation_probabilities(experiment_dir: Path, trial: dict) -> np.ndarray:
    path = experiment_dir / trial["dossier"] / "predictions_validation.csv"
    if sha256_file(path) != trial["sha256_predictions_validation"]:
        raise TrainingError(f"Prédictions de validation modifiées : {path}")
    with path.open(newline="", encoding="utf-8") as handle:
        return np.array([float(row["probabilite_hausse"]) for row in csv.DictReader(handle)])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fige la sélection (modèle + politique ATTENDRE) choisie sur validation.")
    parser.add_argument("--config", default=str(DEFAULT_TRAINING_CONFIG_PATH))
    parser.add_argument("--data-dir", default=None)
    parser.add_argument("--experiment", required=True, help="Identifiant de l'expérience (dossier models/<dataset>/experiments/<id>)")
    parser.add_argument("--coverage", type=float, default=None, help="Couverture choisie parmi coverage_grid (omise si le signal est refusé)")
    parser.add_argument("--overwrite", action="store_true", help="Remplace une sélection existante (impossible après une évaluation finale)")
    args = parser.parse_args(argv)
    config_path = Path(args.config).resolve()
    try:
        config = load_training_config(config_path)
        selection = freeze_selection(
            config, data_dir=resolve_data_dir(args.data_dir), config_path=config_path,
            run_id=args.experiment, coverage=args.coverage, overwrite=args.overwrite,
        )
    except TrainingConfigError as exc:
        print(f"ERREUR DE CONFIGURATION : {exc}")
        return 2
    except TrainingError as exc:
        print(f"ERREUR : {exc}")
        return 1
    print(f"Sélection figée : retenu={selection['retenu']} signal={selection['statut_signal']}")
    print(f"Politique : {selection['politique_decision']}")
    return 0
