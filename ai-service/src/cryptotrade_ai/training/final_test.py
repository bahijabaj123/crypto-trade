"""Évaluation finale unique du test 2026, à partir d'une sélection figée.

L'évaluation est consignée dans ``final_test_log.json`` AVANT la lecture du test ; une
seconde évaluation est refusée sauf motif explicite, lui aussi consigné. Aucun modèle,
seuil ou paramètre n'est modifié ici.
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

from cryptotrade_ai.config import resolve_data_dir
from cryptotrade_ai.data.binance_archive import sha256_file
from cryptotrade_ai.data.klines import ms_to_utc_iso
from cryptotrade_ai.training import TestAccessError, TrainingError
from cryptotrade_ai.training.artifacts import (
    FINAL_TEST_LOG_FILE,
    SELECTION_FILE,
    append_registry,
    load_model,
    models_root,
    read_json,
    write_json_atomic,
    write_json_new,
)
from cryptotrade_ai.training.config import DEFAULT_TRAINING_CONFIG_PATH, TrainingConfig, TrainingConfigError, load_training_config
from cryptotrade_ai.training.data_loading import FinalTestAuthorization, load_test_split
from cryptotrade_ai.training.decision import DecisionPolicy, decide, decision_summary
from cryptotrade_ai.training.metrics import calibration_table, classification_metrics


def evaluate_final_test(
    config: TrainingConfig,
    *,
    data_dir: Path,
    config_path: Path,
    repeat_reason: str | None = None,
    now_ms: int | None = None,
) -> dict:
    root = models_root(data_dir, config.dataset_id)
    selection_path = root / SELECTION_FILE
    if not selection_path.is_file():
        raise TestAccessError(f"Aucune sélection figée ({selection_path}) : évaluation finale refusée")
    selection = read_json(selection_path)
    selection_sha = sha256_file(selection_path)
    if selection.get("sha256_configuration_entrainement") != sha256_file(config_path):
        raise TrainingError("La configuration d'entraînement diffère de celle de la sélection figée")

    log_path = root / FINAL_TEST_LOG_FILE
    log = read_json(log_path) if log_path.exists() else {"evaluations": []}
    previous = log.get("evaluations")
    if not isinstance(previous, list):
        raise TrainingError(f"Journal de test illisible, non modifié : {log_path}")
    if previous and not (repeat_reason and repeat_reason.strip()):
        raise TestAccessError(
            f"Le test a déjà été évalué {len(previous)} fois : nouvelle évaluation refusée sans motif (--repeat-reason)"
        )

    models = {
        trial: load_model(root / info["chemin"], expected_sha256=info["sha256"], expected_versions=selection["versions"])
        for trial, info in selection["modeles_figes"].items()
    }
    policy_raw = selection["politique_decision"]
    policy = DecisionPolicy(policy_raw["signal_autorise"], policy_raw["marge"], policy_raw["couverture_cible"])

    started = ms_to_utc_iso(now_ms if now_ms is not None else int(time.time() * 1000))
    entry_id = f"final-{len(previous) + 1}"
    entry = {
        "id": entry_id,
        "debut_utc": started,
        "sha256_selection": selection_sha,
        "retenu": selection["retenu"],
        "motif_repetition": repeat_reason if previous else None,
        "statut": "commencee",
    }
    log = {"evaluations": [*previous, entry]}
    write_json_atomic(log_path, log)

    try:
        identity, test = load_test_split(
            data_dir, config, authorization=FinalTestAuthorization(selection_sha256=selection_sha, log_entry_id=entry_id)
        )
        if identity.dataset_sha256 != selection["dataset"]["sha256_dataset_csv"]:
            raise TrainingError("Le dataset a changé depuis la sélection figée")
        results = {}
        for trial, model in models.items():
            info = selection["modeles_figes"][trial]
            p = model.predict_proba(test.X)[:, 1]
            y_pred = model.predict(test.X) if info["type"] == "baseline" else None
            table, ece = calibration_table(test.y, p, config.calibration_bins)
            results[trial] = {
                "type": info["type"],
                "metriques": classification_metrics(test.y, p, y_pred),
                "calibration": {"ece": ece, "tableau": table},
            }
            if trial == selection["retenu"]:
                results[trial]["decisions"] = decision_summary(
                    decide(p, policy), test.y, test.fwd_return, fee_per_side=config.fee_per_side
                )
        report = {
            "evaluation": entry_id,
            "debut_utc": started,
            "sha256_selection": selection_sha,
            "dataset": identity.as_dict(),
            "statut_signal": selection["statut_signal"],
            "politique_decision": policy.as_dict(),
            "resultats": results,
            "note": "Évaluation unique du modèle figé ; ces résultats ne doivent servir à aucun nouveau choix.",
        }
        result_path = root / f"final_test_{entry_id}.json"
        result_sha = write_json_new(result_path, report)
    except BaseException as exc:
        entry.update(statut="echec", erreur=f"{type(exc).__name__}: {exc}")
        write_json_atomic(log_path, log)
        raise

    entry.update(statut="terminee", resultat=result_path.name, sha256_resultat=result_sha)
    write_json_atomic(log_path, log)
    append_registry(root, {"type": "evaluation_finale_test", "id": entry_id, "date_utc": started, "sha256_resultat": result_sha})
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Évaluation finale UNIQUE du test, à partir de selection.json.")
    parser.add_argument("--config", default=str(DEFAULT_TRAINING_CONFIG_PATH))
    parser.add_argument("--data-dir", default=None)
    parser.add_argument("--repeat-reason", default=None, help="Motif obligatoire pour toute évaluation supplémentaire (consigné)")
    args = parser.parse_args(argv)
    config_path = Path(args.config).resolve()
    try:
        config = load_training_config(config_path)
        report = evaluate_final_test(
            config, data_dir=resolve_data_dir(args.data_dir), config_path=config_path, repeat_reason=args.repeat_reason
        )
    except TrainingConfigError as exc:
        print(f"ERREUR DE CONFIGURATION : {exc}")
        return 2
    except TrainingError as exc:
        print(f"ERREUR : {exc}")
        return 1
    for trial, result in report["resultats"].items():
        m = result["metriques"]
        print(f"  {trial:<45} log loss {m['log_loss']:.5f}  Brier {m['brier']:.5f}  accuracy {m['accuracy']:.4f}")
    print(f"Évaluation consignée : {report['evaluation']}")
    return 0
