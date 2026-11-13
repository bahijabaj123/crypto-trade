"""Téléchargement et vérification des archives mensuelles officielles de data.binance.vision.

Règles appliquées :
- requêtes séquentielles avec une pause entre chaque requête ;
- nombre de tentatives limité, arrêt immédiat sur 403 / 418 / 451 ;
- une archive n'est enregistrée que si son SHA-256 correspond au fichier .CHECKSUM officiel ;
- une archive déjà présente et valide n'est jamais retéléchargée.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import time
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from cryptotrade_ai import __version__
from cryptotrade_ai.config import (
    BINANCE_DATA_BASE_URL,
    MAX_RETRIES,
    REQUEST_DELAY_SECONDS,
    REQUEST_TIMEOUT_SECONDS,
)

LOG = logging.getLogger(__name__)

USER_AGENT = f"CryptoTrade-ai-service/{__version__} (projet universitaire, collecte sequentielle)"
MAX_RETRY_AFTER_SECONDS = 120.0

Fetcher = Callable[[str], bytes]


class ArchiveError(Exception):
    """Archive absente, corrompue ou inaccessible."""


class ArchiveNotFoundError(ArchiveError):
    """L'archive n'existe pas sur le serveur (HTTP 404)."""


def archive_filename(symbol: str, interval: str, year: int, month: int) -> str:
    return f"{symbol}-{interval}-{year:04d}-{month:02d}.zip"


def archive_url(
    symbol: str, interval: str, year: int, month: int, base_url: str = BINANCE_DATA_BASE_URL
) -> str:
    name = archive_filename(symbol, interval, year, month)
    return f"{base_url}/data/spot/monthly/klines/{symbol}/{interval}/{name}"


def archive_dir(raw_dir: Path, symbol: str, interval: str) -> Path:
    return raw_dir / "spot" / "monthly" / "klines" / symbol / interval


def parse_checksum(text: str, expected_filename: str) -> str:
    """Extrait le SHA-256 d'un fichier .CHECKSUM (format ``<sha256>  <nom du fichier>``)."""
    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        raise ArchiveError(f"Fichier CHECKSUM vide pour {expected_filename}")
    parts = lines[0].split()
    if len(parts) != 2:
        raise ArchiveError(f"Fichier CHECKSUM mal formé pour {expected_filename} : {lines[0]!r}")
    digest, name = parts[0], parts[1].lstrip("*")
    if not re.fullmatch(r"[0-9a-fA-F]{64}", digest):
        raise ArchiveError(f"SHA-256 invalide dans le CHECKSUM de {expected_filename}")
    if name != expected_filename:
        raise ArchiveError(
            f"Le CHECKSUM concerne {name!r} au lieu de {expected_filename!r}"
        )
    return digest.lower()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_bytes_atomic(path: Path, data: bytes) -> None:
    """Écrit dans un fichier temporaire puis le renomme : pas de fichier à moitié écrit."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".part")
    temporary.write_bytes(data)
    os.replace(temporary, path)


class HttpFetcher:
    """Client HTTP poli : une requête à la fois, pause avant chaque requête."""

    def __init__(
        self,
        delay_seconds: float = REQUEST_DELAY_SECONDS,
        timeout_seconds: float = REQUEST_TIMEOUT_SECONDS,
        max_retries: int = MAX_RETRIES,
        sleep: Callable[[float], None] = time.sleep,
        opener: Callable[..., object] = urllib.request.urlopen,
    ) -> None:
        if max_retries < 1:
            raise ValueError("max_retries doit être >= 1")
        self.delay_seconds = max(0.0, delay_seconds)
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self._sleep = sleep
        self._opener = opener

    def __call__(self, url: str) -> bytes:
        wait = self.delay_seconds
        last_error: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            self._sleep(wait)
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            try:
                with self._opener(request, timeout=self.timeout_seconds) as response:
                    return response.read()
            except urllib.error.HTTPError as exc:
                if exc.code == 404:
                    raise ArchiveNotFoundError(f"Archive introuvable (HTTP 404) : {url}") from exc
                if exc.code in (403, 418, 451):
                    raise ArchiveError(
                        f"Accès refusé par le serveur (HTTP {exc.code}) : {url}. "
                        "Arrêt immédiat, ne pas relancer en boucle."
                    ) from exc
                last_error = exc
                wait = self._retry_wait(exc, attempt)
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                last_error = exc
                wait = self.delay_seconds * 2**attempt
            LOG.warning("Tentative %d/%d échouée pour %s : %s", attempt, self.max_retries, url, last_error)
        raise ArchiveError(
            f"Échec du téléchargement après {self.max_retries} tentative(s) : {url} ({last_error})"
        )

    def _retry_wait(self, exc: urllib.error.HTTPError, attempt: int) -> float:
        retry_after = exc.headers.get("Retry-After") if exc.headers else None
        if retry_after:
            try:
                return min(float(retry_after), MAX_RETRY_AFTER_SECONDS)
            except ValueError:
                pass
        return self.delay_seconds * 2**attempt


@dataclass(frozen=True)
class ArchiveResult:
    filename: str
    url: str
    zip_path: Path
    checksum_path: Path
    sha256: str
    downloaded: bool
    checksum_changed: bool


def ensure_archive(
    *,
    symbol: str,
    interval: str,
    year: int,
    month: int,
    raw_dir: Path,
    fetcher: Fetcher | None,
    offline: bool = False,
    base_url: str = BINANCE_DATA_BASE_URL,
) -> ArchiveResult:
    """Garantit qu'une archive valide (SHA-256 vérifié) est présente localement."""
    filename = archive_filename(symbol, interval, year, month)
    url = archive_url(symbol, interval, year, month, base_url)
    target_dir = archive_dir(raw_dir, symbol, interval)
    zip_path = target_dir / filename
    checksum_path = target_dir / (filename + ".CHECKSUM")
    checksum_changed = False

    if offline:
        if not zip_path.is_file() or not checksum_path.is_file():
            raise ArchiveError(f"Mode hors ligne : {filename} ou son CHECKSUM est absent localement")
        expected = parse_checksum(checksum_path.read_text(encoding="utf-8"), filename)
    else:
        if fetcher is None:
            raise ValueError("Un fetcher est requis hors mode hors ligne")
        checksum_bytes = fetcher(url + ".CHECKSUM")
        try:
            checksum_text = checksum_bytes.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ArchiveError(f"CHECKSUM illisible pour {filename}") from exc
        expected = parse_checksum(checksum_text, filename)
        if checksum_path.is_file():
            previous = checksum_path.read_text(encoding="utf-8")
            checksum_changed = parse_checksum(previous, filename) != expected
        write_bytes_atomic(checksum_path, checksum_bytes)

    if zip_path.is_file():
        local_digest = sha256_file(zip_path)
        if local_digest == expected:
            return ArchiveResult(filename, url, zip_path, checksum_path, expected, False, checksum_changed)
        if offline:
            raise ArchiveError(f"SHA-256 local incorrect pour {filename} (fichier corrompu ou modifié)")
        LOG.warning("SHA-256 local incorrect pour %s : nouveau téléchargement", filename)

    assert fetcher is not None
    data = fetcher(url)
    digest = sha256_bytes(data)
    if digest != expected:
        raise ArchiveError(
            f"SHA-256 incorrect pour {filename} : attendu {expected}, reçu {digest}. "
            "Archive non enregistrée."
        )
    write_bytes_atomic(zip_path, data)
    return ArchiveResult(filename, url, zip_path, checksum_path, expected, True, checksum_changed)


def read_csv_from_zip(zip_path: Path, expected_csv_name: str) -> str:
    """Lit l'unique fichier CSV d'une archive mensuelle, sans modifier le ZIP."""
    try:
        with zipfile.ZipFile(zip_path) as archive:
            csv_names = [n for n in archive.namelist() if n.lower().endswith(".csv")]
            if len(csv_names) != 1:
                raise ArchiveError(f"{zip_path.name} contient {len(csv_names)} fichier(s) CSV au lieu de 1")
            if Path(csv_names[0]).name != expected_csv_name:
                raise ArchiveError(
                    f"{zip_path.name} contient {csv_names[0]!r} au lieu de {expected_csv_name!r}"
                )
            data = archive.read(csv_names[0])
    except zipfile.BadZipFile as exc:
        raise ArchiveError(f"Archive ZIP illisible : {zip_path.name}") from exc
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ArchiveError(f"CSV illisible (encodage) dans {zip_path.name}") from exc
