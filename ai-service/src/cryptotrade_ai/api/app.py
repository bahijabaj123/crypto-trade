"""Application FastAPI de conseil pédagogique : santé, identité du modèle, prédiction live.

Le modèle figé est chargé et vérifié une seule fois au démarrage. Aucun ordre n'est passé,
aucun entraînement n'est exposé, aucune bougie fournie par un client n'est acceptée.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from cryptotrade_ai.api.errors import (
    CODE_MODEL_UNAVAILABLE,
    MSG_MODEL,
    ApiError,
    map_exception,
    register_exception_handlers,
    utc_now_iso,
)
from cryptotrade_ai.api.schemas import (
    assert_predict_query_allowed,
    health_payload,
    parse_explain,
    parse_symbol,
    public_model_info,
)
from cryptotrade_ai.api.service import PredictionService
from cryptotrade_ai.api.settings import API_PREFIX, ApiSettings
from cryptotrade_ai.live.binance_rest import BinanceRestClient

LOG = logging.getLogger("cryptotrade_ai.api")

router = APIRouter()


def load_prediction_service(settings: ApiSettings) -> PredictionService | None:
    """Charge le modèle figé une fois. Toute défaillance laisse le service indisponible (HTTP 503)."""
    try:
        return PredictionService(
            settings.data_dir,
            client=BinanceRestClient(),
            config_path=settings.config_path,
            expected_experiment=settings.expected_experiment,
            expected_trial=settings.expected_trial,
        )
    except Exception:
        LOG.exception("Chargement du modèle figé impossible")
        return None


def create_app(
    *,
    service: PredictionService | None = None,
    settings: ApiSettings | None = None,
) -> FastAPI:
    """Fabrique l'application. ``service`` injecté est réservé aux tests (aucun réseau)."""
    settings = settings or ApiSettings.from_env()
    injected = service

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        if injected is not None:
            app.state.service = injected
        elif settings.autoload:
            app.state.service = load_prediction_service(settings)
        else:
            app.state.service = None
        yield
        app.state.service = None

    app = FastAPI(
        title="CryptoTrade IA",
        version="0.1.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["*"],
    )
    register_exception_handlers(app)
    app.include_router(router, prefix=API_PREFIX)
    return app


def _service_or_unavailable(request: Request) -> PredictionService:
    loaded = getattr(request.app.state, "service", None)
    if loaded is None:
        raise ApiError(503, CODE_MODEL_UNAVAILABLE, MSG_MODEL)
    return loaded


@router.get("/health")
def health(request: Request) -> dict:
    """Disponibilité du modèle chargé en mémoire. Aucun accès Binance."""
    loaded = getattr(request.app.state, "service", None)
    if loaded is None:
        raise ApiError(503, CODE_MODEL_UNAVAILABLE, MSG_MODEL)
    return health_payload(available=True, horodatage=utc_now_iso())


@router.get("/model-info")
def model_info(request: Request) -> dict:
    """Identité publique du modèle figé, des 17 variables et des seuils. Sans chemin local."""
    return public_model_info(_service_or_unavailable(request))


@router.get("/predict")
def predict(request: Request) -> dict:
    """Prédiction live BTCUSDT 1 h. ``explain=true`` ajoute le JSON xai-1.0 déjà validé."""
    service = _service_or_unavailable(request)
    params = request.query_params
    assert_predict_query_allowed(set(params.keys()))
    parse_symbol(params.get("symbol"), provided="symbol" in params)
    explain = parse_explain(params.get("explain"))
    try:
        return service.predict(explain=explain)
    except ApiError:
        raise
    except Exception as exc:
        raise map_exception(exc) from exc
