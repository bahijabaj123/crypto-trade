"""Chargeur sécurisé du dataset ML.

Vérifie l'identité et les empreintes SHA-256 du dataset, l'ordre exact des colonnes, les
bornes des splits et l'absence de valeurs non finies. Pendant l'entraînement et la sélection,
les lignes du test ne sont jamais converties : seuls leur horodatage et leur split sont lus,
pour contrôler l'intégrité. Leurs variables, cibles et rendements ne sont pas renvoyés.

Ce verrou protège contre les accès accidentels ; il ne remplace pas la discipline du protocole.
"""

from __future__ import annotations

import csv
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from cryptotrade_ai.data.binance_archive import sha256_file
from cryptotrade_ai.data.klines import ms_to_utc_iso, utc_iso_to_ms
from cryptotrade_ai.training import TestAccessError, TrainingError
from cryptotrade_ai.training.config import TrainingConfig

DATASET_FILE = "dataset.csv"
CONFIG_USED_FILE = "config_used.json"
REPORT_FILE = "dataset_report.json"
META_COLUMNS = ("open_time", "open_time_utc", "decision_time_utc", "symbol", "split")
SPLIT_NAMES = ("train", "validation", "test")
DEVELOPMENT_SPLITS = ("train", "validation")
TEST_SPLIT = "test"
INTERVAL_MS = 3_600_000


@dataclass(frozen=True)
class SplitData:
    name: str
    open_time: np.ndarray
    X: np.ndarray
    y: np.ndarray
    fwd_return: np.ndarray

    def __len__(self) -> int:
        return len(self.y)


@dataclass(frozen=True)
class DatasetIdentity:
    dataset_id: str
    dataset_dir: str
    symbol: str
    features: tuple[str, ...]
    dataset_sha256: str
    config_used_sha256: str
    report_sha256: str
    split_bounds_utc: dict
    row_counts: dict

    def as_dict(self) -> dict:
        return {
            "dataset_id": self.dataset_id,
            "dossier": self.dataset_dir,
            "symbole": self.symbol,
            "variables": list(self.features),
            "sha256_dataset_csv": self.dataset_sha256,
            "sha256_config_used": self.config_used_sha256,
            "sha256_dataset_report": self.report_sha256,
            "bornes_ensembles_utc": self.split_bounds_utc,
            "lignes_par_ensemble": self.row_counts,
        }


@dataclass(frozen=True)
class DevelopmentData:
    """Train et validation uniquement : aucun attribut ne donne accès au test."""

    identity: DatasetIdentity
    train: SplitData
    validation: SplitData
    test_rows: int = field(default=0)


@dataclass(frozen=True)
class FinalTestAuthorization:
    """Créée par ``final_test`` après consignation de l'évaluation dans le journal."""

    selection_sha256: str
    log_entry_id: str


def load_development_data(data_dir: Path, config: TrainingConfig) -> DevelopmentData:
    identity, splits, counts = _read_dataset(Path(data_dir), config, parse=DEVELOPMENT_SPLITS)
    return DevelopmentData(identity, splits["train"], splits["validation"], counts[TEST_SPLIT])


def load_test_split(data_dir: Path, config: TrainingConfig, *, authorization: FinalTestAuthorization) -> tuple[DatasetIdentity, SplitData]:
    if not isinstance(authorization, FinalTestAuthorization) or not (
        authorization.selection_sha256 and authorization.log_entry_id
    ):
        raise TestAccessError("Accès au test refusé : réservé à l'évaluation finale consignée (evaluate_final_test.py)")
    identity, splits, _ = _read_dataset(Path(data_dir), config, parse=(TEST_SPLIT,))
    return identity, splits[TEST_SPLIT]


def dataset_paths(data_dir: Path, config: TrainingConfig) -> dict[str, Path]:
    base = Path(data_dir) / config.dataset_dir
    return {name: base / name for name in (DATASET_FILE, CONFIG_USED_FILE, REPORT_FILE)}


def _read_dataset(data_dir: Path, config: TrainingConfig, *, parse: tuple[str, ...]):
    paths = dataset_paths(data_dir, config)
    for path in paths.values():
        if not path.is_file():
            raise TrainingError(f"Fichier du dataset introuvable : {path}")

    report = _read_json(paths[REPORT_FILE])
    config_used = _read_json(paths[CONFIG_USED_FILE])
    if report.get("statut") != "OK":
        raise TrainingError(f"Rapport du dataset en statut {report.get('statut')!r}, OK attendu")
    if report.get("dataset_id") != config.dataset_id or config_used.get("dataset_id") != config.dataset_id:
        raise TrainingError(
            f"Identité du dataset incohérente : configuration {config.dataset_id!r}, "
            f"rapport {report.get('dataset_id')!r}, config_used {config_used.get('dataset_id')!r}"
        )
    checks = report.get("verifications") or []
    failed = [c.get("controle") for c in checks if not c.get("ok")]
    if not checks or failed:
        raise TrainingError(f"Vérifications du dataset absentes ou en échec : {failed}")

    expected_sha = report.get("empreintes_sha256") or {}
    dataset_sha = sha256_file(paths[DATASET_FILE])
    config_used_sha = sha256_file(paths[CONFIG_USED_FILE])
    if dataset_sha != expected_sha.get("dataset_csv"):
        raise TrainingError(
            f"SHA-256 de dataset.csv différent du rapport : {dataset_sha} != {expected_sha.get('dataset_csv')}"
        )
    if config_used_sha != expected_sha.get("config_used"):
        raise TrainingError("SHA-256 de config_used.json différent du rapport")

    derived = config_used.get("valeurs_derivees") or {}
    if tuple(derived.get("variables_entree") or ()) != config.features:
        raise TrainingError("Les variables de config_used.json ne sont pas exactement celles de la configuration, dans l'ordre")
    expected_columns = (*META_COLUMNS, *config.features, config.target, config.evaluation_only_column)
    if tuple(derived.get("colonnes_dataset") or ()) != expected_columns:
        raise TrainingError("Colonnes déclarées par config_used.json inattendues")
    bounds = _split_bounds(derived.get("ensembles") or [])
    symbol = (config_used.get("configuration") or {}).get("symbol")

    columns, counts = _read_csv(paths[DATASET_FILE], expected_columns, bounds, symbol, parse)

    report_sets = report.get("ensembles") or {}
    for name in SPLIT_NAMES:
        declared = ((report_sets.get(name) or {}).get("equilibre") or {}).get("exemples")
        if declared != counts[name]:
            raise TrainingError(f"Effectif {name} : {counts[name]} lignes dans le CSV, {declared} dans le rapport")

    splits = {}
    for name in parse:
        if counts[name] == 0:
            raise TrainingError(f"Ensemble {name} vide")
        times, features, targets, returns = columns[name]
        splits[name] = SplitData(
            name=name,
            open_time=np.asarray(times, dtype=np.int64),
            X=np.asarray(features, dtype=np.float64).reshape(len(times), len(config.features)),
            y=np.asarray(targets, dtype=np.int64),
            fwd_return=np.asarray(returns, dtype=np.float64),
        )

    identity = DatasetIdentity(
        dataset_id=config.dataset_id,
        dataset_dir=config.dataset_dir,
        symbol=symbol,
        features=config.features,
        dataset_sha256=dataset_sha,
        config_used_sha256=config_used_sha,
        report_sha256=sha256_file(paths[REPORT_FILE]),
        split_bounds_utc={n: [ms_to_utc_iso(s), ms_to_utc_iso(e)] for n, (s, e) in bounds.items()},
        row_counts=dict(counts),
    )
    return identity, splits, counts


def _read_csv(path: Path, expected_columns: tuple, bounds: dict, symbol: str, parse: tuple[str, ...]):
    n_features = len(expected_columns) - len(META_COLUMNS) - 2
    first_feature = len(META_COLUMNS)
    target_index = first_feature + n_features
    columns = {name: ([], [], [], []) for name in parse}
    counts = {name: 0 for name in SPLIT_NAMES}
    previous = None
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle)
        header = tuple(next(reader, ()))
        if header != expected_columns:
            raise TrainingError("En-tête de dataset.csv différent des colonnes attendues (ordre compris)")
        for line, row in enumerate(reader, start=2):
            if len(row) != len(expected_columns):
                raise TrainingError(f"Ligne {line} : {len(row)} colonnes au lieu de {len(expected_columns)}")
            split = row[4]
            if split not in bounds:
                raise TrainingError(f"Ligne {line} : split inconnu {split!r}")
            try:
                t = int(row[0])
            except ValueError as exc:
                raise TrainingError(f"Ligne {line} : open_time invalide") from exc
            start, end = bounds[split]
            if not start <= t < end or t % INTERVAL_MS:
                raise TrainingError(f"Ligne {line} : {ms_to_utc_iso(t)} hors des bornes de {split}")
            if previous is not None and t <= previous:
                raise TrainingError(f"Ligne {line} : horodatages non strictement croissants")
            if row[1] != ms_to_utc_iso(t) or row[2] != ms_to_utc_iso(t + INTERVAL_MS) or row[3] != symbol:
                raise TrainingError(f"Ligne {line} : métadonnées incohérentes")
            previous = t
            counts[split] += 1
            if split not in columns:
                continue
            times, features, targets, returns = columns[split]
            values = [_finite(row[i], line, expected_columns[i]) for i in range(first_feature, target_index)]
            if row[target_index] not in ("0", "1"):
                raise TrainingError(f"Ligne {line} : cible non binaire {row[target_index]!r}")
            times.append(t)
            features.extend(values)
            targets.append(int(row[target_index]))
            returns.append(_finite(row[target_index + 1], line, expected_columns[target_index + 1]))
    return columns, counts


def _split_bounds(entries: list) -> dict[str, tuple[int, int]]:
    names = tuple(e.get("nom") for e in entries)
    if names != SPLIT_NAMES:
        raise TrainingError(f"Ensembles attendus {list(SPLIT_NAMES)}, reçus {list(names)}")
    bounds = {}
    for entry in entries:
        try:
            bounds[entry["nom"]] = (utc_iso_to_ms(entry["debut_utc"]), utc_iso_to_ms(entry["fin_exclue_utc"]))
        except (KeyError, ValueError) as exc:
            raise TrainingError(f"Bornes de l'ensemble {entry.get('nom')} invalides") from exc
    ordered = [bounds[n] for n in SPLIT_NAMES]
    if any(s >= e for s, e in ordered) or any(a[1] != b[0] for a, b in zip(ordered, ordered[1:])):
        raise TrainingError("Ensembles non contigus ou mal ordonnés")
    return bounds


def _finite(text: str, line: int, column: str) -> float:
    try:
        value = float(text)
    except ValueError as exc:
        raise TrainingError(f"Ligne {line} : {column} n'est pas un nombre") from exc
    if not math.isfinite(value):
        raise TrainingError(f"Ligne {line} : {column} non fini ({text})")
    return value


def _read_json(path: Path) -> dict:
    try:
        content = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise TrainingError(f"JSON invalide : {path}") from exc
    if not isinstance(content, dict):
        raise TrainingError(f"Objet JSON attendu : {path}")
    return content
