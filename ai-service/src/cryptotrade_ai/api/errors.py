"""Erreurs HTTP uniformes de l'API IA : status, code, message, horodatage UTC.

Les messages publics ne contiennent ni chemin local, ni trace Python, ni secret.
"""

from __future__ import annotations

import logging
import re
import time
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import JSONResponse

from cryptotrade_ai.api import PredictionServiceError
from cryptotrade_ai.data.klines import ms_to_utc_iso
from cryptotrade_ai.live import HistoryError, MarketDataError
from cryptotrade_ai.xai import XaiError

LOG = logging.getLogger("cryptotrade_ai.api")

CODE_INVALID_INPUT = "ENTREE_INVALIDE"
CODE_UNSUPPORTED_SYMBOL = "SYMBOLE_NON_PRIS_EN_CHARGE"
CODE_NOT_FOUND = "INTROUVABLE"
CODE_METHOD_NOT_ALLOWED = "METHODE_NON_AUTORISEE"
CODE_MODEL_UNAVAILABLE = "MODELE_INDISPONIBLE"
CODE_MARKET_UNAVAILABLE = "MARCHE_INDISPONIBLE"
CODE_MARKET_TIMEOUT = "MARCHE_DELAI_DEPASSE"
CODE_MARKET_INVALID = "DONNEES_MARCHE_INVALIDES"
CODE_HISTORY_SHORT = "HISTORIQUE_INSUFFISANT"
CODE_STALE_DATA = "DONNEES_NON_A_JOUR"
CODE_XAI_INCOHERENT = "EXPLICATION_INCOHERENTE"
CODE_INTERNAL = "ERREUR_INTERNE"

MSG_INVALID_INPUT = "Paramètre de requête invalide."
MSG_UNKNOWN_PARAM = "Paramètre de requête non autorisé."
MSG_UNSUPPORTED_SYMBOL = "Seul BTCUSDT est pris en charge."
MSG_EXPLAIN = "explain : true ou false attendu."
MSG_NOT_FOUND = "Ressource introuvable."
MSG_METHOD = "Cette méthode HTTP n'est pas autorisée."
MSG_MODEL = "Le modèle n'est pas disponible."
MSG_MARKET = "Le marché est temporairement indisponible."
MSG_TIMEOUT = "Délai d'attente dépassé auprès du marché."
MSG_MARKET_INVALID = "La réponse du marché est illisible ou invalide."
MSG_HISTORY = "L'historique de bougies closes est insuffisant."
MSG_STALE = "Les données de marché ne sont pas à jour."
MSG_XAI = "L'explication n'est pas cohérente : elle n'est pas affichée."
MSG_INTERNAL = "Une erreur interne s'est produite."

_PATH_RE = re.compile(
    r"(?:[A-Za-z]:[\\/]|\\\\|/home/|/Users/|CryptoTrade-AI-Data)[^\s\"']*",
    re.IGNORECASE,
)
_TRACE_MARKERS = ("traceback", ".py\"", "file \"", "  file ")


class ApiError(Exception):
    """Erreur destinée au client, déjà traduite en code HTTP et message public."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = int(status)
        self.code = str(code)
        self.message = str(message)


def utc_now_iso() -> str:
    """Horodatage UTC courant, milliseconde, suffixe Z."""
    return ms_to_utc_iso(int(time.time() * 1000))


def error_body(status: int, code: str, message: str) -> dict[str, Any]:
    """Enveloppe JSON unique des erreurs de l'API."""
    return {
        "status": int(status),
        "code": str(code),
        "message": sanitize_public_text(message),
        "horodatage": utc_now_iso(),
    }


def error_response(status: int, code: str, message: str) -> JSONResponse:
    """Réponse HTTP JSON sans cache, sans détail interne."""
    return JSONResponse(status_code=int(status), content=error_body(status, code, message))


def sanitize_public_text(text: str) -> str:
    """Retire chemins locaux et indices de trace avant tout envoi au client."""
    cleaned = _PATH_RE.sub("[chemin masqué]", str(text))
    lowered = cleaned.lower()
    if any(marker in lowered for marker in _TRACE_MARKERS):
        return MSG_INTERNAL
    return cleaned


def map_exception(exc: BaseException) -> ApiError:
    """Traduit une exception métier en erreur HTTP publique."""
    if isinstance(exc, ApiError):
        return exc
    text = str(exc)
    lowered = text.lower()
    if isinstance(exc, TimeoutError) or "timed out" in lowered or "timeout" in lowered:
        return ApiError(504, CODE_MARKET_TIMEOUT, MSG_TIMEOUT)
    if isinstance(exc, HistoryError):
        if "non à jour" in lowered:
            return ApiError(503, CODE_STALE_DATA, MSG_STALE)
        if "finie" in lowered or "heure serveur" in lowered:
            return ApiError(502, CODE_MARKET_INVALID, MSG_MARKET_INVALID)
        return ApiError(503, CODE_HISTORY_SHORT, MSG_HISTORY)
    if isinstance(exc, MarketDataError):
        if "arrêt immédiat" in lowered or "accès refusé" in lowered or "échec après" in lowered:
            return ApiError(503, CODE_MARKET_UNAVAILABLE, MSG_MARKET)
        if "http" in lowered and "invalide" not in lowered and "json" not in lowered:
            return ApiError(503, CODE_MARKET_UNAVAILABLE, MSG_MARKET)
        return ApiError(502, CODE_MARKET_INVALID, MSG_MARKET_INVALID)
    if isinstance(exc, XaiError):
        if "additiv" in lowered or "explication" in lowered:
            return ApiError(500, CODE_XAI_INCOHERENT, MSG_XAI)
        return ApiError(500, CODE_INTERNAL, MSG_INTERNAL)
    if isinstance(exc, PredictionServiceError):
        if "horloge" in lowered or "ne correspond pas" in lowered:
            return ApiError(503, CODE_STALE_DATA, MSG_STALE)
        if "ouverte" in lowered:
            return ApiError(502, CODE_MARKET_INVALID, MSG_MARKET_INVALID)
        return ApiError(500, CODE_INTERNAL, MSG_INTERNAL)
    return ApiError(500, CODE_INTERNAL, MSG_INTERNAL)


def register_exception_handlers(app: FastAPI) -> None:
    """Installe les gestionnaires : jamais de trace, jamais de chemin local."""

    @app.exception_handler(ApiError)
    async def handle_api_error(_request: Request, exc: ApiError) -> JSONResponse:
        return error_response(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def handle_validation(_request: Request, _exc: RequestValidationError) -> JSONResponse:
        return error_response(400, CODE_INVALID_INPUT, MSG_INVALID_INPUT)

    @app.exception_handler(StarletteHTTPException)
    async def handle_http(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code == 404:
            return error_response(404, CODE_NOT_FOUND, MSG_NOT_FOUND)
        if exc.status_code == 405:
            return error_response(405, CODE_METHOD_NOT_ALLOWED, MSG_METHOD)
        return error_response(exc.status_code, CODE_INTERNAL, MSG_INTERNAL)

    @app.exception_handler(Exception)
    async def handle_unexpected(_request: Request, exc: Exception) -> JSONResponse:
        mapped = map_exception(exc)
        if mapped.code == CODE_INTERNAL and not isinstance(exc, ApiError):
            LOG.exception("Erreur interne de l'API IA")
        return error_response(mapped.status, mapped.code, mapped.message)
