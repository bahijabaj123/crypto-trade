"""Artefacts : modèles joblib, métadonnées, empreintes SHA-256, versions et registre.

Charger un fichier joblib peut exécuter du code : on ne charge que nos propres fichiers,
après vérification de leur SHA-256 et de la version de scikit-learn.
"""

from __future__ import annotations

import json
import os
import platform
import subprocess
import sys
from importlib import metadata
from pathlib import Path

import joblib

from cryptotrade_ai.config import AI_SERVICE_DIR
from cryptotrade_ai.data.binance_archive import sha256_file
from cryptotrade_ai.training import TrainingError

MODELS_DIR = "models"
REGISTRY_FILE = "registry.json"
SELECTION_FILE = "selection.json"
FINAL_TEST_LOG_FILE = "final_test_log.json"
TRACKED_LIBRARIES = ("scikit-learn", "numpy", "scipy", "joblib")


def models_root(data_dir: Path, dataset_id: str) -> Path:
    return Path(data_dir) / MODELS_DIR / dataset_id


def library_versions() -> dict:
    versions = {"python": sys.version.split()[0], "plateforme": platform.platform()}
    for name in TRACKED_LIBRARIES:
        try:
            versions[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            versions[name] = None
    return versions


def git_info(repo_dir: Path = AI_SERVICE_DIR) -> dict:
    def run(*args: str) -> str | None:
        try:
            done = subprocess.run(["git", *args], cwd=repo_dir, capture_output=True, text=True, timeout=10)
        except (OSError, subprocess.SubprocessError):
            return None
        return done.stdout.strip() if done.returncode == 0 else None

    status = run("status", "--porcelain", "--", ".")
    return {"commit": run("rev-parse", "HEAD"), "modifications_non_commitees": bool(status) if status is not None else None}


def write_json_atomic(path: Path, content) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".part")
    temporary.write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)
    return sha256_file(path)


def write_json_new(path: Path, content) -> str:
    if path.exists():
        raise TrainingError(f"Fichier déjà présent, non remplacé : {path}")
    return write_json_atomic(path, content)


def read_json(path: Path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise TrainingError(f"Fichier introuvable : {path}") from exc
    except json.JSONDecodeError as exc:
        raise TrainingError(f"JSON invalide : {path}") from exc


def save_model(model, path: Path) -> str:
    if path.exists():
        raise TrainingError(f"Modèle déjà présent, non remplacé : {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".part")
    joblib.dump(model, temporary)
    os.replace(temporary, path)
    return sha256_file(path)


def load_model(path: Path, *, expected_sha256: str, expected_versions: dict):
    path = Path(path)
    if not path.is_file():
        raise TrainingError(f"Modèle introuvable : {path}")
    actual = sha256_file(path)
    if actual != expected_sha256:
        raise TrainingError(f"SHA-256 du modèle différent de la sélection : {path}")
    current = library_versions()
    if current["scikit-learn"] != expected_versions.get("scikit-learn"):
        raise TrainingError(
            f"Version de scikit-learn différente : entraîné avec {expected_versions.get('scikit-learn')}, "
            f"installé {current['scikit-learn']}"
        )
    return joblib.load(path)


def append_registry(root: Path, entry: dict) -> None:
    path = root / REGISTRY_FILE
    registry = read_json(path) if path.exists() else {"entrees": []}
    if not isinstance(registry, dict) or not isinstance(registry.get("entrees"), list):
        raise TrainingError(f"Registre illisible, non modifié : {path}")
    registry["entrees"].append(entry)
    write_json_atomic(path, registry)
