"""Lecture du CSV nettoyé par le collecteur et vérification de son empreinte SHA-256."""

from __future__ import annotations

import csv
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path

from cryptotrade_ai.data.binance_archive import sha256_file
from cryptotrade_ai.dataset import DatasetError

REQUIRED_COLUMNS = (
    "open_time",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "close_time",
    "quote_asset_volume",
    "number_of_trades",
    "taker_buy_base_asset_volume",
    "source_file",
)
MAX_REPORTED_PROBLEMS = 20


@dataclass(frozen=True, slots=True)
class Candle:
    """Bougie close ; horodatages en millisecondes UTC."""

    open_time: int
    close_time: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    quote_volume: float
    trades: int
    taker_buy_base: float


def load_collection_report(report_path: Path, *, symbol: str, interval: str) -> dict:
    """Charge le rapport de collecte et vérifie qu'il concerne bien la paire et l'intervalle attendus."""
    if not report_path.is_file():
        raise DatasetError(f"Rapport de collecte introuvable : {report_path}")
    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise DatasetError(f"Rapport de collecte illisible : {report_path} ({exc})") from exc
    if report.get("statut") == "ECHEC":
        raise DatasetError("Le rapport de collecte a le statut ECHEC : la source n'est pas utilisable")
    params = report.get("parametres") or {}
    if params.get("symbole") != symbol or params.get("intervalle") != interval:
        raise DatasetError(
            f"Le rapport de collecte concerne {params.get('symbole')} {params.get('intervalle')}, "
            f"pas {symbol} {interval}"
        )
    sha = ((report.get("sorties") or {}).get("csv") or {}).get("sha256")
    if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{64}", sha):
        raise DatasetError("Le rapport de collecte ne contient pas de SHA-256 valide pour le CSV")
    return report


def verify_source_sha256(csv_path: Path, collection_report: dict) -> str:
    """Échoue si le CSV source n'a pas exactement l'empreinte notée par le collecteur."""
    if not csv_path.is_file():
        raise DatasetError(f"CSV source introuvable : {csv_path}")
    expected = collection_report["sorties"]["csv"]["sha256"]
    actual = sha256_file(csv_path)
    if actual != expected:
        raise DatasetError(
            f"SHA-256 du CSV source différent du rapport de collecte : calculé {actual}, attendu {expected}. "
            "Le CSV a été modifié ou régénéré : relancer la collecte ou vérifier le fichier."
        )
    return actual


def read_candles(csv_path: Path, *, symbol: str, interval: str, interval_ms: int) -> tuple[list[Candle], dict]:
    """Lit et revérifie les bougies. Toute anomalie est bloquante (rien n'est corrigé)."""
    problems: list[str] = []
    non_finite = 0
    candles: list[Candle] = []
    prefix = f"{symbol}-{interval}-"

    with csv_path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = [c for c in REQUIRED_COLUMNS if c not in (reader.fieldnames or [])]
        if missing:
            raise DatasetError(f"Colonnes absentes du CSV source : {missing}")
        for line, row in enumerate(reader, start=2):
            try:
                candle = Candle(
                    open_time=int(row["open_time"]),
                    close_time=int(row["close_time"]),
                    open=float(row["open"]),
                    high=float(row["high"]),
                    low=float(row["low"]),
                    close=float(row["close"]),
                    volume=float(row["volume"]),
                    quote_volume=float(row["quote_asset_volume"]),
                    trades=int(row["number_of_trades"]),
                    taker_buy_base=float(row["taker_buy_base_asset_volume"]),
                )
            except (TypeError, ValueError):
                problems.append(f"ligne {line} : valeur illisible")
                continue
            problem = _candle_problem(candle, row["source_file"], prefix, interval_ms)
            if problem:
                if problem == "valeur non finie":
                    non_finite += 1
                problems.append(f"ligne {line} : {problem}")
                continue
            candles.append(candle)

    duplicates = unsorted = 0
    seen: set[int] = set()
    for i, candle in enumerate(candles):
        if candle.open_time in seen:
            duplicates += 1
        seen.add(candle.open_time)
        if i and candle.open_time < candles[i - 1].open_time:
            unsorted += 1

    if not candles and not problems:
        problems.append("aucune bougie dans le CSV source")
    if duplicates:
        problems.append(f"{duplicates} horodatage(s) en double")
    if unsorted:
        problems.append(f"{unsorted} ligne(s) hors ordre chronologique")
    if problems:
        shown = "; ".join(problems[:MAX_REPORTED_PROBLEMS])
        raise DatasetError(f"CSV source invalide ({len(problems)} problème(s)) : {shown}")

    return candles, {"lignes": len(candles), "doublons": duplicates, "non_finies": non_finite, "hors_ordre": unsorted}


def _candle_problem(candle: Candle, source_file: str, prefix: str, interval_ms: int) -> str | None:
    floats = (candle.open, candle.high, candle.low, candle.close, candle.volume, candle.quote_volume, candle.taker_buy_base)
    if not all(math.isfinite(x) for x in floats):
        return "valeur non finie"
    if candle.open_time % interval_ms:
        return "ouverture non alignée"
    if candle.close_time != candle.open_time + interval_ms - 1:
        return "bougie non close ou de durée incorrecte"
    if min(candle.open, candle.high, candle.low, candle.close) <= 0:
        return "prix non positif"
    if candle.low > min(candle.open, candle.close) or candle.high < max(candle.open, candle.close):
        return "OHLC incohérent"
    if min(candle.volume, candle.quote_volume, candle.taker_buy_base) < 0 or candle.trades < 0:
        return "volume négatif"
    if not source_file.startswith(prefix):
        return f"source_file {source_file!r} ne correspond pas à {prefix}"
    return None
