"""Construction du dataset ML : CSV source vérifié -> variables causales -> cible t+1h -> découpage.

En cas d'erreur, aucun fichier de sortie n'est écrit.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import time
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

from cryptotrade_ai import __version__
from cryptotrade_ai.config import resolve_data_dir
from cryptotrade_ai.data.binance_archive import sha256_file
from cryptotrade_ai.data.klines import ms_to_utc_iso
from cryptotrade_ai.dataset import DatasetError
from cryptotrade_ai.dataset.config import (
    DEFAULT_CONFIG_PATH,
    DatasetConfig,
    DatasetConfigError,
    load_dataset_config,
)
from cryptotrade_ai.dataset.continuity import find_gaps, segment_bounds, segment_positions
from cryptotrade_ai.dataset.features import (
    FEATURE_NAMES,
    FORBIDDEN_INPUT_COLUMNS,
    INDICATOR_PARAMS,
    compute_features_by_segment,
    required_history,
)
from cryptotrade_ai.dataset.quality import (
    audit_causality,
    balance_by_period,
    causality_sample,
    class_balance,
    feature_statistics,
    group_ranges,
    run_checks,
)
from cryptotrade_ai.dataset.source import Candle, load_collection_report, read_candles, verify_source_sha256
from cryptotrade_ai.dataset.splits import assign_split, check_boundaries
from cryptotrade_ai.dataset.target import FWD_RETURN_COLUMN, TARGET_COLUMN, Target, build_targets

DATASET_FILE = "dataset.csv"
CONFIG_USED_FILE = "config_used.json"
REPORT_FILE = "dataset_report.json"
META_COLUMNS = ("open_time", "open_time_utc", "decision_time_utc", "symbol", "split")
DATASET_COLUMNS = (*META_COLUMNS, *FEATURE_NAMES, TARGET_COLUMN, FWD_RETURN_COLUMN)
EXCLUSION_REASONS = (
    "hors_periode",
    "historique_insuffisant",
    "cible_absente",
    "valeur_non_finie",
    "embargo",
    "cible_hors_periode",
)
MAX_LISTED = 200


@dataclass(frozen=True, slots=True)
class Example:
    open_time: int
    split: str
    features: tuple[float, ...]
    target: int
    fwd_return: float
    tie: bool
    index: int


def select_examples(
    candles: list[Candle],
    positions: list[int],
    features: list[tuple[float, ...] | None],
    targets: list[Target | None],
    config: DatasetConfig,
) -> tuple[list[Example], dict[str, list[int]], Counter]:
    """Chaque bougie devient un exemple ou reçoit exactement une raison d'exclusion."""
    period_start, period_end = config.splits[0].start_ms, config.splits[-1].end_ms
    examples: list[Example] = []
    excluded: dict[str, list[int]] = {reason: [] for reason in EXCLUSION_REASONS}
    non_finite = Counter()

    for i, candle in enumerate(candles):
        t = candle.open_time
        values, target = features[i], targets[i]
        split = None
        if not period_start <= t < period_end:
            reason = "hors_periode"
        elif positions[i] < config.min_history or values is None:
            reason = "historique_insuffisant"
        elif target is None:
            reason = "cible_absente"
        elif not all(math.isfinite(x) for x in values) or not math.isfinite(target.fwd_return):
            reason = "valeur_non_finie"
            non_finite.update(name for name, x in zip(FEATURE_NAMES, values) if not math.isfinite(x))
            if not math.isfinite(target.fwd_return):
                non_finite[FWD_RETURN_COLUMN] += 1
        else:
            split, reason = assign_split(
                t, config.splits, interval_ms=config.interval_ms, horizon=config.horizon, embargo=config.embargo
            )
        if reason:
            excluded[reason].append(t)
            continue
        examples.append(Example(t, split, values, target.up, target.fwd_return, target.tie, i))
    return examples, excluded, non_finite


def build_dataset(
    config: DatasetConfig,
    *,
    data_dir: Path,
    config_path: Path | None = None,
    output_dir: Path | None = None,
    overwrite: bool = False,
    now_ms: int | None = None,
) -> dict:
    data_dir = Path(data_dir)
    out_dir = Path(output_dir) if output_dir else data_dir / config.output_dir
    outputs = {name: out_dir / name for name in (DATASET_FILE, CONFIG_USED_FILE, REPORT_FILE)}
    existing = [str(p) for p in outputs.values() if p.exists()]
    if existing and not overwrite:
        raise DatasetError(f"Sorties déjà présentes (utiliser --overwrite pour les remplacer) : {existing}")

    csv_path = data_dir / config.source_csv
    report_path = data_dir / config.collection_report
    collection_report = load_collection_report(report_path, symbol=config.symbol, interval=config.interval)
    source_sha = verify_source_sha256(csv_path, collection_report)
    candles, source_stats = read_candles(
        csv_path, symbol=config.symbol, interval=config.interval, interval_ms=config.interval_ms
    )

    open_times = [k.open_time for k in candles]
    bounds = segment_bounds(open_times, config.interval_ms)
    positions = segment_positions(bounds)
    gaps = find_gaps(open_times, config.interval_ms)
    features = compute_features_by_segment(candles, bounds, ddof=config.volatility_ddof)
    targets = build_targets(candles, interval_ms=config.interval_ms, horizon=config.horizon)

    examples, excluded, non_finite = select_examples(candles, positions, features, targets, config)
    by_split: dict[str, list[Example]] = defaultdict(list)
    for example in examples:
        by_split[example.split].append(example)

    boundaries = check_boundaries(
        {name: [e.open_time for e in items] for name, items in by_split.items()},
        config.splits,
        interval_ms=config.interval_ms,
        horizon=config.horizon,
        min_history=config.min_history,
    )
    causality = audit_causality(
        candles, positions, features, causality_sample(examples), interval_ms=config.interval_ms, ddof=config.volatility_ddof
    )
    excluded_total = sum(len(v) for v in excluded.values())
    checks = run_checks(
        examples=examples,
        candles=candles,
        config=config,
        excluded_total=excluded_total,
        boundaries=boundaries,
        causality=causality,
    )
    failed = [c for c in checks if not c["ok"]]
    if failed:
        raise DatasetError(
            "Contrôles du dataset en échec, aucun fichier écrit : "
            + "; ".join(f"{c['controle']} ({c['detail']})" for c in failed)
        )

    out_dir.mkdir(parents=True, exist_ok=True)
    _write_dataset_csv(outputs[DATASET_FILE], examples, config)
    config_used = _config_used(config, config_path, source_sha)
    _write_json(outputs[CONFIG_USED_FILE], config_used)

    warnings = []
    missing_in_report = (collection_report.get("qualite") or {}).get("bougies_manquantes")
    missing_hours = sum(g["heures_manquantes"] for g in gaps)
    if missing_in_report is not None and missing_in_report != missing_hours:
        warnings.append(
            f"Heures manquantes entre bougies ({missing_hours}) différentes du rapport de collecte ({missing_in_report})"
        )

    report = {
        "statut": "OK",
        "dataset_id": config.dataset_id,
        "version_code": __version__,
        "genere_le_utc": ms_to_utc_iso(now_ms if now_ms is not None else int(time.time() * 1000)),
        "symbole": config.symbol,
        "intervalle": config.interval,
        "empreintes_sha256": {
            "csv_source": source_sha,
            "csv_source_attendu_rapport_collecte": collection_report["sorties"]["csv"]["sha256"],
            "concordance_source": True,
            "rapport_collecte": sha256_file(report_path),
            "configuration": sha256_file(config_path) if config_path else None,
            "config_used": sha256_file(outputs[CONFIG_USED_FILE]),
            "dataset_csv": sha256_file(outputs[DATASET_FILE]),
        },
        "fichiers": {
            "csv_source": str(csv_path),
            "rapport_collecte": str(report_path),
            "configuration": str(config_path) if config_path else None,
            "dataset_csv": str(outputs[DATASET_FILE]),
            "config_used": str(outputs[CONFIG_USED_FILE]),
            "rapport": str(outputs[REPORT_FILE]),
        },
        "bougies_source": {
            **source_stats,
            "premiere_ouverture_utc": ms_to_utc_iso(open_times[0]),
            "derniere_ouverture_utc": ms_to_utc_iso(open_times[-1]),
            "series_continues": len(bounds),
        },
        "trous": {
            "nombre": len(gaps),
            "heures_manquantes": missing_hours,
            "heures_manquantes_rapport_collecte": missing_in_report,
            "liste": gaps,
        },
        "exclusions": {
            "total": excluded_total,
            "par_raison": {reason: len(times) for reason, times in excluded.items()},
            "plages_utc_par_raison": {
                reason: group_ranges(times, config.interval_ms)[:MAX_LISTED]
                for reason, times in excluded.items()
                if times
            },
            "valeurs_non_finies_par_colonne": dict(sorted(non_finite.items())),
        },
        "ensembles": {
            bounds_.name: _split_summary(bounds_, by_split.get(bounds_.name, []))
            for bounds_ in config.splits
        },
        "equilibre_global": class_balance(examples),
        "frontieres_embargo": {
            "embargo_heures": config.embargo,
            "historique_minimum": config.min_history,
            "horizon_heures": config.horizon,
            "regle": "exemple conservé si t <= fin de l'ensemble - embargo (sauf dernier ensemble : t + horizon < fin)",
            "verifications": boundaries,
        },
        "variables": {
            "entrees": list(FEATURE_NAMES),
            "cible": TARGET_COLUMN,
            "evaluation_uniquement": FWD_RETURN_COLUMN,
            "colonnes_interdites_en_entree": sorted(FORBIDDEN_INPUT_COLUMNS),
            "statistiques_par_ensemble": {name: feature_statistics(items) for name, items in by_split.items()},
        },
        "doublons": {"source": source_stats["doublons"], "dataset": len(examples) - len({e.open_time for e in examples})},
        "audit_causalite": causality,
        "verifications": checks,
        "avertissements": warnings,
    }
    _write_json(outputs[REPORT_FILE], report)
    return report


def _split_summary(bounds, items: list[Example]) -> dict:
    return {
        "borne_debut_utc": ms_to_utc_iso(bounds.start_ms),
        "borne_fin_exclue_utc": ms_to_utc_iso(bounds.end_ms),
        "premier_t_utc": ms_to_utc_iso(items[0].open_time) if items else None,
        "dernier_t_utc": ms_to_utc_iso(items[-1].open_time) if items else None,
        "equilibre": class_balance(items),
        "par_annee": balance_by_period(items, "%Y"),
        "par_mois": balance_by_period(items, "%Y-%m"),
    }


def _config_used(config: DatasetConfig, config_path: Path | None, source_sha: str) -> dict:
    return {
        "dataset_id": config.dataset_id,
        "version_code": __version__,
        "fichier_configuration_sha256": sha256_file(config_path) if config_path else None,
        "configuration": config.raw,
        "valeurs_derivees": {
            "intervalle_ms": config.interval_ms,
            "historique_requis_par_variables": required_history(),
            "historique_minimum": config.min_history,
            "horizon_heures": config.horizon,
            "embargo_heures": config.embargo,
            "parametres_indicateurs": INDICATOR_PARAMS,
            "colonnes_dataset": list(DATASET_COLUMNS),
            "variables_entree": list(FEATURE_NAMES),
            "ensembles": [
                {"nom": b.name, "debut_utc": ms_to_utc_iso(b.start_ms), "fin_exclue_utc": ms_to_utc_iso(b.end_ms)}
                for b in config.splits
            ],
        },
        "csv_source_sha256": source_sha,
    }


def _write_dataset_csv(path: Path, examples: list[Example], config: DatasetConfig) -> None:
    temporary = path.with_name(path.name + ".part")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(DATASET_COLUMNS)
        for e in examples:
            writer.writerow(
                (
                    e.open_time,
                    ms_to_utc_iso(e.open_time),
                    ms_to_utc_iso(e.open_time + config.interval_ms),
                    config.symbol,
                    e.split,
                    *(repr(x) for x in e.features),
                    e.target,
                    repr(e.fwd_return),
                )
            )
    os.replace(temporary, path)


def _write_json(path: Path, content: dict) -> None:
    temporary = path.with_name(path.name + ".part")
    temporary.write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Construit le dataset ML à partir du CSV collecté (aucun entraînement).")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG_PATH), help="Fichier de configuration JSON du dataset")
    parser.add_argument("--data-dir", default=None, help="Dossier des données (défaut : CRYPTOTRADE_AI_DATA_DIR ou ai-service/data)")
    parser.add_argument("--output-dir", default=None, help="Dossier de sortie (défaut : <data-dir>/<output_dir de la config>)")
    parser.add_argument("--overwrite", action="store_true", help="Autorise le remplacement de sorties existantes")
    args = parser.parse_args(argv)

    config_path = Path(args.config).resolve()
    try:
        config = load_dataset_config(config_path)
        report = build_dataset(
            config,
            data_dir=resolve_data_dir(args.data_dir),
            config_path=config_path,
            output_dir=Path(args.output_dir) if args.output_dir else None,
            overwrite=args.overwrite,
        )
    except DatasetConfigError as exc:
        print(f"ERREUR DE CONFIGURATION : {exc}")
        return 2
    except DatasetError as exc:
        print(f"ERREUR : {exc}")
        return 1

    print(f"Statut : {report['statut']}")
    for name, summary in report["ensembles"].items():
        balance = summary["equilibre"]
        print(f"  {name} : {balance['exemples']} exemples, taux de hausse {balance['taux_hausse']}")
    print(f"  Exclusions : {report['exclusions']['par_raison']}")
    for warning in report["avertissements"]:
        print(f"  AVERTISSEMENT : {warning}")
    print(f"Dataset : {report['fichiers']['dataset_csv']}")
    print(f"Rapport : {report['fichiers']['rapport']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
