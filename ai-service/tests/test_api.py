"""Tests de l'API FastAPI : TestClient, service synthétique, aucun réseau, aucun artefact réel."""

from __future__ import annotations

import json
import socket
import urllib.request
from pathlib import Path

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("sklearn")
pytest.importorskip("shap")

from fastapi.testclient import TestClient  # noqa: E402
from synthetic_market import klines_payload  # noqa: E402
from synthetic_xai import RETAINED, RUN_ID, copy_training_config, make_forest, write_frozen_selection  # noqa: E402

from cryptotrade_ai.api.app import create_app  # noqa: E402
from cryptotrade_ai.api.errors import (  # noqa: E402
    CODE_HISTORY_SHORT,
    CODE_INVALID_INPUT,
    CODE_MARKET_INVALID,
    CODE_METHOD_NOT_ALLOWED,
    CODE_MODEL_UNAVAILABLE,
    CODE_NOT_FOUND,
    CODE_STALE_DATA,
    CODE_UNSUPPORTED_SYMBOL,
    CODE_XAI_INCOHERENT,
)
from cryptotrade_ai.api.service import PREDICT_SCHEMA, PredictionService  # noqa: E402
from cryptotrade_ai.api.settings import API_HOST, API_PORT, API_PREFIX, ApiSettings  # noqa: E402
from cryptotrade_ai.dataset.features import FEATURE_NAMES  # noqa: E402
from cryptotrade_ai.live import HistoryError, MarketDataError  # noqa: E402
from cryptotrade_ai.training.config import DEFAULT_TRAINING_CONFIG_PATH  # noqa: E402
from cryptotrade_ai.xai import XaiError  # noqa: E402
from cryptotrade_ai.xai.schema import validate_explanation  # noqa: E402

N_CLOSED = 120
ERROR_KEYS = ("status", "code", "message", "horodatage")
AI_SERVICE_DIR = Path(__file__).resolve().parents[1]


class ScriptedMarket:
    def __init__(self, rows, server_time_ms):
        self.rows = rows
        self.now = int(server_time_ms)
        self.time_calls = 0
        self.klines_calls = 0

    def server_time_ms(self) -> int:
        self.time_calls += 1
        return self.now

    def klines(self, symbol="BTCUSDT", interval="1h", limit=1000) -> list:
        self.klines_calls += 1
        if symbol != "BTCUSDT" or interval != "1h" or limit != 1000:
            raise MarketDataError("requête klines inattendue")
        return list(self.rows)


class StubService:
    """Service injecté : délègue ou lève l'erreur demandée, sans réseau."""

    def __init__(self, inner: PredictionService | None = None, error: Exception | None = None):
        self.inner = inner
        self.error = error
        self.predict_calls: list[bool] = []
        if inner is not None:
            self.frozen = inner.frozen
            self.explainer = inner.explainer

    def predict(self, *, explain: bool = False) -> dict:
        self.predict_calls.append(bool(explain))
        if self.error is not None:
            raise self.error
        if self.inner is None:
            raise AssertionError("StubService sans inner ni error")
        return self.inner.predict(explain=explain)


@pytest.fixture(scope="module")
def forest():
    return make_forest()


def _is_loopback(address) -> bool:
    host = address[0] if isinstance(address, tuple) else str(address)
    return host in ("127.0.0.1", "localhost", "::1", "")


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Interdit Binance et tout hôte distant ; laisse 127.0.0.1 pour la boucle asyncio de TestClient."""
    real_connect = socket.socket.connect
    real_create = socket.create_connection

    def guarded_connect(self, address):
        if _is_loopback(address):
            return real_connect(self, address)
        raise AssertionError(f"Accès réseau interdit dans les tests de l'API : {address!r}")

    def guarded_create(address, *args, **kwargs):
        if _is_loopback(address):
            return real_create(address, *args, **kwargs)
        raise AssertionError(f"Accès réseau interdit dans les tests de l'API : {address!r}")

    def blocked_urlopen(*args, **kwargs):
        raise AssertionError("urllib.urlopen interdit dans les tests de l'API")

    monkeypatch.setattr(socket.socket, "connect", guarded_connect)
    monkeypatch.setattr(socket, "create_connection", guarded_create)
    monkeypatch.setattr(urllib.request, "urlopen", blocked_urlopen)


@pytest.fixture
def frozen_paths(tmp_path, forest):
    return write_frozen_selection(tmp_path, forest)


def make_settings(data_dir, *, autoload=False, config_path=None, experiment=RUN_ID, trial=RETAINED) -> ApiSettings:
    return ApiSettings(
        data_dir=Path(data_dir),
        config_path=Path(config_path or DEFAULT_TRAINING_CONFIG_PATH),
        expected_experiment=experiment,
        expected_trial=trial,
        cors_origins=("http://localhost:4200", "http://127.0.0.1:4200"),
        host=API_HOST,
        port=API_PORT,
        autoload=autoload,
    )


def live_market():
    rows, server_time, candles = klines_payload(N_CLOSED, include_open=True)
    return ScriptedMarket(rows, server_time), candles


def build_service(frozen_paths, client) -> PredictionService:
    data_dir, config_path = frozen_paths
    return PredictionService(
        data_dir, client=client, config_path=config_path, expected_experiment=RUN_ID, expected_trial=RETAINED
    )


def client_for(service, frozen_paths) -> TestClient:
    return TestClient(create_app(service=service, settings=make_settings(frozen_paths[0])))


def assert_error_envelope(response, status: int, code: str) -> dict:
    payload = response.json()
    assert response.status_code == status
    assert tuple(payload) == ERROR_KEYS
    assert payload["status"] == status
    assert payload["code"] == code
    assert payload["message"]
    assert payload["horodatage"].endswith("Z")
    leaked = json.dumps(payload)
    assert "C:\\" not in leaked and "C:/" not in leaked
    assert "Traceback" not in leaked and ".py" not in leaked
    assert "azizf" not in leaked.lower()
    return payload


def test_health_is_up_without_calling_binance(frozen_paths):
    market, _ = live_market()
    svc = build_service(frozen_paths, market)
    with client_for(svc, frozen_paths) as client:
        response = client.get(f"{API_PREFIX}/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "UP"
    assert payload["modele_charge"] is True
    assert payload["horodatage"].endswith("Z")
    assert market.time_calls == 0 and market.klines_calls == 0


def test_health_and_predict_are_unavailable_without_model(tmp_path):
    settings = make_settings(tmp_path / "absent", autoload=False, config_path=copy_training_config(tmp_path))
    with TestClient(create_app(settings=settings)) as client:
        health = client.get(f"{API_PREFIX}/health")
        info = client.get(f"{API_PREFIX}/model-info")
        prediction = client.get(f"{API_PREFIX}/predict", params={"symbol": "BTCUSDT"})
    assert_error_envelope(health, 503, CODE_MODEL_UNAVAILABLE)
    assert_error_envelope(info, 503, CODE_MODEL_UNAVAILABLE)
    assert_error_envelope(prediction, 503, CODE_MODEL_UNAVAILABLE)


def test_startup_without_model_does_not_leak_paths(tmp_path):
    empty = tmp_path / "vide"
    empty.mkdir()
    settings = make_settings(empty, autoload=True, config_path=copy_training_config(tmp_path))
    with TestClient(create_app(settings=settings)) as client:
        response = client.get(f"{API_PREFIX}/health")
    payload = assert_error_envelope(response, 503, CODE_MODEL_UNAVAILABLE)
    assert str(empty) not in json.dumps(payload)
    assert "selection.json" not in json.dumps(payload)


def test_model_info_lists_seventeen_features_and_frozen_thresholds(frozen_paths):
    market, _ = live_market()
    svc = build_service(frozen_paths, market)
    with client_for(svc, frozen_paths) as client:
        response = client.get(f"{API_PREFIX}/model-info")
    assert response.status_code == 200
    payload = response.json()
    assert payload["symbol"] == "BTCUSDT" and payload["interval"] == "1h"
    assert payload["horizon_heures"] == 1
    assert [row["feature"] for row in payload["variables"]] == list(FEATURE_NAMES)
    assert len(payload["variables"]) == 17
    assert payload["politique"]["signal_autorise"] is True
    assert payload["politique"]["marge"] == pytest.approx(0.05)
    assert payload["politique"]["seuil_hausse"] == pytest.approx(0.55)
    assert payload["politique"]["seuil_baisse"] == pytest.approx(0.45)
    assert payload["modele"]["experiment"] == RUN_ID
    assert payload["modele"]["trial_id"] == RETAINED
    assert payload["modele"]["integrite"] == "verifiee_au_demarrage"
    assert payload["versions"]["schema_predict"] == PREDICT_SCHEMA
    assert payload["versions"]["schema_xai"] == "xai-1.0"
    text = json.dumps(payload)
    assert "C:\\" not in text and "/Users/" not in text
    assert "CRYPTOTRADE" not in text
    assert str(frozen_paths[0]) not in text
    assert market.time_calls == 0 and market.klines_calls == 0


def test_predict_without_explain_uses_predict_schema(frozen_paths):
    market, candles = live_market()
    svc = build_service(frozen_paths, market)
    with client_for(svc, frozen_paths) as client:
        response = client.get(f"{API_PREFIX}/predict", params={"symbol": "BTCUSDT"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_version"] == PREDICT_SCHEMA
    assert payload["mode"] == "temps_reel"
    assert payload["symbol"] == "BTCUSDT"
    assert payload["explication"] is None
    assert payload["prediction"]["state"] in ("HAUSSE", "BAISSE", "ATTENDRE")
    assert 0.0 <= payload["prediction"]["probability_up"] <= 1.0
    json.dumps(payload, allow_nan=False)
    assert candles[-1].close_time < market.now


def test_predict_explain_true_matches_probability_and_state(frozen_paths):
    market, _ = live_market()
    svc = build_service(frozen_paths, market)
    with client_for(svc, frozen_paths) as client:
        plain = client.get(f"{API_PREFIX}/predict", params={"symbol": "BTCUSDT", "explain": "false"})
        explained = client.get(f"{API_PREFIX}/predict", params={"symbol": "BTCUSDT", "explain": "true"})
    assert plain.status_code == 200 and explained.status_code == 200
    without = plain.json()
    with_xai = explained.json()
    assert without["explication"] is None
    validate_explanation(with_xai["explication"])
    assert with_xai["prediction"]["state"] == without["prediction"]["state"]
    assert with_xai["prediction"]["probability_up"] == without["prediction"]["probability_up"]
    assert with_xai["explication"]["prediction"]["state"] == with_xai["prediction"]["state"]
    assert with_xai["explication"]["prediction"]["probability_up"] == with_xai["prediction"]["probability_up"]
    assert with_xai["explication"]["explanation"]["additivity_error"] <= 1e-6


def test_unsupported_symbol_is_rejected(frozen_paths):
    market, _ = live_market()
    svc = build_service(frozen_paths, market)
    with client_for(svc, frozen_paths) as client:
        response = client.get(f"{API_PREFIX}/predict", params={"symbol": "ETHUSDT"})
    assert_error_envelope(response, 400, CODE_UNSUPPORTED_SYMBOL)
    assert market.klines_calls == 0


def test_invalid_explain_and_unknown_query_are_rejected(frozen_paths):
    market, _ = live_market()
    svc = build_service(frozen_paths, market)
    with client_for(svc, frozen_paths) as client:
        explain = client.get(f"{API_PREFIX}/predict", params={"symbol": "BTCUSDT", "explain": "peut-etre"})
        candles = client.get(f"{API_PREFIX}/predict", params={"symbol": "BTCUSDT", "klines": "[]"})
    assert_error_envelope(explain, 400, CODE_INVALID_INPUT)
    assert_error_envelope(candles, 400, CODE_INVALID_INPUT)
    assert market.klines_calls == 0


def test_unknown_route_and_docs_are_not_found(frozen_paths):
    market, _ = live_market()
    svc = build_service(frozen_paths, market)
    with client_for(svc, frozen_paths) as client:
        missing = client.get(f"{API_PREFIX}/ordres")
        docs = client.get("/docs")
    assert_error_envelope(missing, 404, CODE_NOT_FOUND)
    assert_error_envelope(docs, 404, CODE_NOT_FOUND)


def test_write_methods_cannot_place_orders_or_send_candles(frozen_paths):
    market, _ = live_market()
    svc = build_service(frozen_paths, market)
    body = {"symbol": "BTCUSDT", "klines": [[1, 2, 3]], "side": "BUY"}
    with client_for(svc, frozen_paths) as client:
        responses = [
            client.post(f"{API_PREFIX}/predict", json=body),
            client.put(f"{API_PREFIX}/predict", json=body),
            client.delete(f"{API_PREFIX}/predict"),
            client.post(f"{API_PREFIX}/ordres", json={"symbol": "BTCUSDT", "side": "BUY"}),
        ]
    for response in responses:
        assert response.status_code in (404, 405)
        payload = response.json()
        assert payload["code"] in (CODE_NOT_FOUND, CODE_METHOD_NOT_ALLOWED)
        assert tuple(payload) == ERROR_KEYS
    assert market.klines_calls == 0


def test_cors_allows_angular_origin_only(frozen_paths):
    market, _ = live_market()
    svc = build_service(frozen_paths, market)
    with client_for(svc, frozen_paths) as client:
        allowed = client.get(f"{API_PREFIX}/health", headers={"Origin": "http://localhost:4200"})
        local = client.get(f"{API_PREFIX}/health", headers={"Origin": "http://127.0.0.1:4200"})
        denied = client.get(f"{API_PREFIX}/health", headers={"Origin": "http://evil.example"})
        preflight = client.options(
            f"{API_PREFIX}/predict",
            headers={
                "Origin": "http://localhost:4200",
                "Access-Control-Request-Method": "GET",
            },
        )
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:4200"
    assert local.headers.get("access-control-allow-origin") == "http://127.0.0.1:4200"
    assert denied.headers.get("access-control-allow-origin") != "http://evil.example"
    assert preflight.status_code in (200, 204)
    assert preflight.headers.get("access-control-allow-origin") == "http://localhost:4200"


def test_stale_market_maps_to_503_without_internal_details(frozen_paths):
    market, _ = live_market()
    inner = build_service(frozen_paths, market)
    stub = StubService(inner, HistoryError("Données non à jour : C:\\CryptoTrade-AI-Data\\secret.joblib"))
    with client_for(stub, frozen_paths) as client:
        response = client.get(f"{API_PREFIX}/predict", params={"symbol": "BTCUSDT"})
    payload = assert_error_envelope(response, 503, CODE_STALE_DATA)
    assert "secret" not in payload["message"]
    assert "joblib" not in payload["message"]


def test_short_history_and_invalid_market_payload(frozen_paths):
    market, _ = live_market()
    inner = build_service(frozen_paths, market)
    with client_for(StubService(inner, HistoryError("50 bougies closes, 72 exigées")), frozen_paths) as client:
        short = client.get(f"{API_PREFIX}/predict", params={"symbol": "BTCUSDT"})
    with client_for(StubService(inner, MarketDataError("Réponse Binance : JSON invalide")), frozen_paths) as client:
        invalid = client.get(f"{API_PREFIX}/predict", params={"symbol": "BTCUSDT"})
    assert_error_envelope(short, 503, CODE_HISTORY_SHORT)
    assert_error_envelope(invalid, 502, CODE_MARKET_INVALID)


def test_xai_additivity_failure_never_returns_an_explanation(frozen_paths):
    market, _ = live_market()
    inner = build_service(frozen_paths, market)
    stub = StubService(inner, XaiError("Additivité TreeSHAP non respectée : écart 0.2 > 1e-06"))
    with client_for(stub, frozen_paths) as client:
        response = client.get(f"{API_PREFIX}/predict", params={"symbol": "BTCUSDT", "explain": "true"})
    payload = assert_error_envelope(response, 500, CODE_XAI_INCOHERENT)
    assert "explication" not in payload
    assert "0.2" not in payload["message"]


def test_predict_does_not_write_files(frozen_paths):
    market, _ = live_market()
    svc = build_service(frozen_paths, market)
    before = {path: path.stat().st_mtime_ns for path in frozen_paths[0].rglob("*") if path.is_file()}
    with client_for(svc, frozen_paths) as client:
        response = client.get(f"{API_PREFIX}/predict", params={"symbol": "BTCUSDT", "explain": "true"})
    assert response.status_code == 200
    after = {path: path.stat().st_mtime_ns for path in frozen_paths[0].rglob("*") if path.is_file()}
    assert before == after


def test_api_sources_have_no_trading_hooks_and_no_personal_path():
    files = [
        AI_SERVICE_DIR / "src/cryptotrade_ai/api/app.py",
        AI_SERVICE_DIR / "src/cryptotrade_ai/api/settings.py",
        AI_SERVICE_DIR / "src/cryptotrade_ai/api/schemas.py",
        AI_SERVICE_DIR / "src/cryptotrade_ai/api/errors.py",
        AI_SERVICE_DIR / "scripts/run_api.py",
    ]
    joined = "\n".join(path.read_text(encoding="utf-8") for path in files)
    lowered = joined.lower()
    for forbidden in ("create_order", "place_order", "new_order", "execute_order", "/api/ordres", "retrain"):
        assert forbidden not in lowered
    assert "azizf" not in lowered
    assert "c:\\cryptotrade-ai-data" not in lowered
    assert "CRYPTOTRADE_AI_DATA_DIR" in joined
    run_api = (AI_SERVICE_DIR / "scripts/run_api.py").read_text(encoding="utf-8")
    assert "reload=False" in run_api
    assert "API_HOST" in run_api
    settings = (AI_SERVICE_DIR / "src/cryptotrade_ai/api/settings.py").read_text(encoding="utf-8")
    assert 'API_HOST = "127.0.0.1"' in settings
    assert "8000" in settings
