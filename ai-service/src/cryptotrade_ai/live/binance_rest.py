"""Client REST public Binance Spot : uniquement ``/api/v3/time`` et ``/api/v3/klines``.

Aucune clé API. Une requête à la fois, délai, taille maximale, arrêt immédiat sur
403 / 418 / 429 / 451. La V1 n'accepte que BTCUSDT en 1 h, jusqu'à 1000 bougies.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Mapping
from typing import Any

from cryptotrade_ai import __version__
from cryptotrade_ai.live import MarketDataError

LIVE_SYMBOL = "BTCUSDT"
LIVE_INTERVAL = "1h"
MAX_KLINES = 1000
MIN_KLINES = 72
BINANCE_REST_BASE_URL = "https://api.binance.com"
TIME_PATH = "/api/v3/time"
KLINES_PATH = "/api/v3/klines"
REQUEST_TIMEOUT_SECONDS = 3.0
REQUEST_DELAY_SECONDS = 0.5
MAX_RETRIES = 3
MAX_RESPONSE_BYTES = 2_000_000
STOP_HTTP_CODES = (403, 418, 429, 451)
MAX_RETRY_AFTER_SECONDS = 120.0
USER_AGENT = f"CryptoTrade-ai-service/{__version__} (projet universitaire, lecture klines publiques)"

Fetcher = Callable[[str], bytes]


def default_fetcher(
    url: str,
    *,
    timeout_seconds: float = REQUEST_TIMEOUT_SECONDS,
    max_bytes: int = MAX_RESPONSE_BYTES,
    opener: Callable[..., object] = urllib.request.urlopen,
) -> bytes:
    """GET unique, lecture plafonnée. Réservé à l'exécution réelle : les tests injectent un ``fetcher``."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}, method="GET")
    with opener(request, timeout=timeout_seconds) as response:
        return _read_limited(response, max_bytes)


class BinanceRestClient:
    """Client poli : délai avant chaque requête, tentatives limitées, chemins autorisés seulement."""

    def __init__(
        self,
        *,
        base_url: str = BINANCE_REST_BASE_URL,
        delay_seconds: float = REQUEST_DELAY_SECONDS,
        timeout_seconds: float = REQUEST_TIMEOUT_SECONDS,
        max_retries: int = MAX_RETRIES,
        max_bytes: int = MAX_RESPONSE_BYTES,
        fetcher: Fetcher | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if max_retries < 1:
            raise ValueError("max_retries doit être >= 1")
        if timeout_seconds <= 0 or max_bytes < 1:
            raise ValueError("timeout_seconds et max_bytes doivent être strictement positifs")
        self.base_url = base_url.rstrip("/")
        self.delay_seconds = max(0.0, delay_seconds)
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.max_bytes = max_bytes
        self._sleep = sleep
        self._fetcher = fetcher if fetcher is not None else self._default_fetch

    def server_time_ms(self) -> int:
        payload = self._get_json(TIME_PATH)
        if not isinstance(payload, dict) or "serverTime" not in payload:
            raise MarketDataError("Réponse /api/v3/time inattendue : objet {serverTime} attendu")
        return _as_int(payload["serverTime"], "serverTime")

    def klines(self, symbol: str = LIVE_SYMBOL, interval: str = LIVE_INTERVAL, limit: int = MAX_KLINES) -> list:
        symbol, interval, limit = validate_live_request(symbol, interval, limit)
        payload = self._get_json(KLINES_PATH, {"symbol": symbol, "interval": interval, "limit": str(limit)})
        if not isinstance(payload, list):
            raise MarketDataError("Réponse /api/v3/klines inattendue : liste de bougies attendue")
        if len(payload) > MAX_KLINES:
            raise MarketDataError(f"Réponse /api/v3/klines trop longue : {len(payload)} lignes, {MAX_KLINES} au plus")
        return payload

    def fetch_spot_klines(self) -> tuple[list, int]:
        """Heure serveur d'abord, puis les klines : une bougie close après l'horloge n'est pas encore utilisable."""
        server_time_ms = self.server_time_ms()
        return self.klines(), server_time_ms

    def _get_json(self, path: str, params: Mapping[str, str] | None = None) -> Any:
        url = self._allowed_url(path, params)
        wait = self.delay_seconds
        last_error: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            self._sleep(wait)
            try:
                raw = self._fetcher(url)
            except urllib.error.HTTPError as exc:
                if exc.code in STOP_HTTP_CODES:
                    raise MarketDataError(
                        f"Accès refusé par Binance (HTTP {exc.code}). Arrêt immédiat, ne pas relancer en boucle."
                    ) from exc
                if exc.code == 404:
                    raise MarketDataError(f"Ressource introuvable (HTTP 404) : {path}") from exc
                last_error = exc
                wait = _retry_wait(exc, attempt, self.delay_seconds)
                continue
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                last_error = exc
                wait = self.delay_seconds * 2**attempt
                continue
            except MarketDataError:
                raise
            return _parse_json(raw)
        raise MarketDataError(f"Échec après {self.max_retries} tentative(s) pour {path} ({last_error})")

    def _allowed_url(self, path: str, params: Mapping[str, str] | None) -> str:
        if path == TIME_PATH:
            if params:
                raise MarketDataError("/api/v3/time n'accepte aucun paramètre")
            return f"{self.base_url}{TIME_PATH}"
        if path == KLINES_PATH:
            if set(params or ()) != {"symbol", "interval", "limit"}:
                raise MarketDataError("/api/v3/klines : seuls symbol, interval et limit sont autorisés")
            query = urllib.parse.urlencode(params, doseq=False)
            return f"{self.base_url}{KLINES_PATH}?{query}"
        raise MarketDataError(f"Chemin REST non autorisé : {path}")

    def _default_fetch(self, url: str) -> bytes:
        return default_fetcher(url, timeout_seconds=self.timeout_seconds, max_bytes=self.max_bytes)


def validate_live_request(symbol: str, interval: str, limit: int) -> tuple[str, str, int]:
    """V1 : BTCUSDT 1 h uniquement, entre 72 et 1000 bougies demandées."""
    symbol = symbol.strip().upper()
    interval = interval.strip()
    if symbol != LIVE_SYMBOL:
        raise MarketDataError(f"Symbole non pris en charge en V1 : {symbol!r} ({LIVE_SYMBOL} attendu)")
    if interval != LIVE_INTERVAL:
        raise MarketDataError(f"Intervalle non pris en charge en V1 : {interval!r} ({LIVE_INTERVAL} attendu)")
    if isinstance(limit, bool) or not isinstance(limit, int) or not MIN_KLINES <= limit <= MAX_KLINES:
        raise MarketDataError(f"limit : entier entre {MIN_KLINES} et {MAX_KLINES} attendu")
    return symbol, interval, limit


def _parse_json(raw: bytes) -> Any:
    if not isinstance(raw, (bytes, bytearray)):
        raise MarketDataError("Réponse Binance : octets attendus")
    if len(raw) > MAX_RESPONSE_BYTES:
        raise MarketDataError("Réponse Binance trop volumineuse")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise MarketDataError("Réponse Binance : UTF-8 attendu") from exc
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise MarketDataError("Réponse Binance : JSON invalide") from exc


def _read_limited(response, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = response.read(min(64 * 1024, max_bytes + 1 - total))
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise MarketDataError("Réponse Binance trop volumineuse")
        chunks.append(chunk)
    return b"".join(chunks)


def _as_int(value, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise MarketDataError(f"{name} : entier attendu")
    return int(value)


def _retry_wait(exc: urllib.error.HTTPError, attempt: int, delay: float) -> float:
    retry_after = exc.headers.get("Retry-After") if exc.headers else None
    if retry_after:
        try:
            return min(float(retry_after), MAX_RETRY_AFTER_SECONDS)
        except ValueError:
            pass
    return delay * 2**attempt
