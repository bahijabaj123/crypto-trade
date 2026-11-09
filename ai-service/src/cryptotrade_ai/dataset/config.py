"""Configuration d'un dataset : un fichier JSON par paire et par version.

Les chemins sont relatifs au dossier de données (``--data-dir`` ou ``CRYPTOTRADE_AI_DATA_DIR``).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path, PureWindowsPath
from typing import Any

from cryptotrade_ai.config import AI_SERVICE_DIR
from cryptotrade_ai.data.klines import INTERVAL_MS, utc_iso_to_ms
from cryptotrade_ai.dataset import DatasetError
from cryptotrade_ai.dataset.features import (
    FEATURE_NAMES,
    FORBIDDEN_INPUT_COLUMNS,
    INDICATOR_PARAMS,
    required_history,
)
from cryptotrade_ai.dataset.splits import SplitBounds
from cryptotrade_ai.dataset.target import FWD_RETURN_COLUMN, TARGET_COLUMN

DEFAULT_CONFIG_PATH = AI_SERVICE_DIR / "config" / "datasets" / "btcusdt_1h_v1.json"
SUPPORTED_INTERVALS = ("1h",)
SUPPORTED_HORIZONS = (1,)
SPLIT_NAMES = ("train", "validation", "test")
SUPPORTED_CONVENTIONS: dict[str, tuple[Any, ...]] = {
    "ema_initialisation": ("sma",),
    "rsi_smoothing": ("wilder",),
    "volatility_ddof": (0, 1),
    "hour_reference": ("open_time_utc",),
}


class DatasetConfigError(DatasetError):
    """Configuration invalide."""


@dataclass(frozen=True)
class DatasetConfig:
    dataset_id: str
    symbol: str
    interval: str
    interval_ms: int
    source_csv: str
    collection_report: str
    output_dir: str
    features: tuple[str, ...]
    min_history: int
    horizon: int
    embargo: int
    volatility_ddof: int
    splits: tuple[SplitBounds, ...]
    raw: dict


def load_dataset_config(path: Path) -> DatasetConfig:
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise DatasetConfigError(f"Configuration introuvable : {path}") from exc
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise DatasetConfigError(f"Configuration JSON illisible : {path} ({exc})") from exc
    return parse_dataset_config(raw)


def parse_dataset_config(raw: Any) -> DatasetConfig:
    if not isinstance(raw, dict):
        raise DatasetConfigError("La configuration doit être un objet JSON")

    dataset_id = _str(raw, "dataset_id")
    symbol = _str(raw, "symbol")
    if not re.fullmatch(r"[A-Z0-9]{5,20}", symbol):
        raise DatasetConfigError(f"Symbole invalide : {symbol!r} (majuscules, ex. BTCUSDT)")
    interval = _str(raw, "interval")
    if interval not in SUPPORTED_INTERVALS:
        raise DatasetConfigError(f"Intervalle {interval!r} non pris en charge (seulement {SUPPORTED_INTERVALS})")
    interval_ms = INTERVAL_MS[interval]

    source = _dict(raw, "source")
    source_csv = _relative_path(source, "csv")
    collection_report = _relative_path(source, "collection_report")
    output_dir = _relative_path(raw, "output_dir")

    target = _dict(raw, "target")
    if target.get("name") != TARGET_COLUMN or target.get("evaluation_only_column") != FWD_RETURN_COLUMN:
        raise DatasetConfigError(
            f"target.name doit valoir {TARGET_COLUMN!r} et target.evaluation_only_column {FWD_RETURN_COLUMN!r}"
        )
    horizon = _int(target, "horizon_hours")
    if horizon not in SUPPORTED_HORIZONS:
        raise DatasetConfigError(f"Horizon {horizon} h non pris en charge (seulement 1 h)")

    features = raw.get("features")
    if not isinstance(features, list) or not all(isinstance(f, str) for f in features):
        raise DatasetConfigError("features doit être une liste de noms")
    forbidden = sorted(set(features) & FORBIDDEN_INPUT_COLUMNS)
    if forbidden:
        raise DatasetConfigError(f"Colonnes interdites comme variables d'entrée : {forbidden}")
    if tuple(features) != FEATURE_NAMES:
        raise DatasetConfigError(f"La liste des variables doit être exactement celle de la version 1 : {list(FEATURE_NAMES)}")

    if _dict(raw, "indicators") != INDICATOR_PARAMS:
        raise DatasetConfigError(
            f"Les fenêtres des indicateurs sont figées par le nom des variables : {INDICATOR_PARAMS}. "
            "Les modifier impose une nouvelle version du dataset."
        )

    conventions = _dict(raw, "conventions")
    unknown = sorted(set(conventions) - set(SUPPORTED_CONVENTIONS))
    if unknown:
        raise DatasetConfigError(f"Conventions inconnues : {unknown}")
    for key, allowed in SUPPORTED_CONVENTIONS.items():
        value = conventions.get(key)
        if isinstance(value, bool) or value not in allowed:
            raise DatasetConfigError(f"conventions.{key} = {value!r} ; valeurs acceptées : {allowed}")

    min_history = _int(raw, "min_history_hours")
    if min_history < required_history():
        raise DatasetConfigError(
            f"min_history_hours = {min_history} < {required_history()} bougies nécessaires aux variables"
        )
    embargo = _int(raw, "embargo_hours")
    if embargo < min_history + horizon:
        raise DatasetConfigError(
            f"embargo_hours = {embargo} < min_history_hours + horizon = {min_history + horizon} : "
            "les fenêtres de deux ensembles pourraient partager des bougies"
        )

    return DatasetConfig(
        dataset_id=dataset_id,
        symbol=symbol,
        interval=interval,
        interval_ms=interval_ms,
        source_csv=source_csv,
        collection_report=collection_report,
        output_dir=output_dir,
        features=tuple(features),
        min_history=min_history,
        horizon=horizon,
        embargo=embargo,
        volatility_ddof=conventions["volatility_ddof"],
        splits=_parse_splits(_dict(raw, "splits"), interval_ms),
        raw=raw,
    )


def _parse_splits(raw: dict, interval_ms: int) -> tuple[SplitBounds, ...]:
    if list(raw) != list(SPLIT_NAMES):
        raise DatasetConfigError(f"splits doit contenir exactement, dans l'ordre : {list(SPLIT_NAMES)}")
    bounds = []
    for name in SPLIT_NAMES:
        item = _dict(raw, name)
        start, end = _utc(item, "start", name), _utc(item, "end", name)
        if start % interval_ms or end % interval_ms:
            raise DatasetConfigError(f"Les bornes de {name} doivent être alignées sur l'intervalle")
        if end <= start:
            raise DatasetConfigError(f"La fin de {name} doit être postérieure à son début")
        bounds.append(SplitBounds(name, start, end))
    for before, after in zip(bounds, bounds[1:]):
        if before.end_ms != after.start_ms:
            raise DatasetConfigError(f"{before.name} doit se terminer exactement au début de {after.name}")
    return tuple(bounds)


def _str(container: dict, key: str) -> str:
    value = container.get(key)
    if not isinstance(value, str) or not value.strip():
        raise DatasetConfigError(f"Champ texte obligatoire manquant : {key}")
    return value


def _int(container: dict, key: str) -> int:
    value = container.get(key)
    if isinstance(value, bool) or not isinstance(value, int):
        raise DatasetConfigError(f"Champ entier obligatoire manquant ou invalide : {key}")
    return value


def _dict(container: dict, key: str) -> dict:
    value = container.get(key)
    if not isinstance(value, dict):
        raise DatasetConfigError(f"Section obligatoire manquante : {key}")
    return value


def _relative_path(container: dict, key: str) -> str:
    value = _str(container, key)
    windows_path = PureWindowsPath(value)
    if windows_path.drive or windows_path.is_absolute() or Path(value).is_absolute() or ".." in windows_path.parts:
        raise DatasetConfigError(f"{key} doit être un chemin relatif au dossier de données, sans '..' : {value!r}")
    return value


def _utc(container: dict, key: str, split: str) -> int:
    try:
        return utc_iso_to_ms(_str(container, key))
    except ValueError as exc:
        raise DatasetConfigError(f"splits.{split}.{key} : {exc}") from exc
