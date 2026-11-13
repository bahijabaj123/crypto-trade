"""Tests du client REST Binance : URLs, limites, erreurs HTTP. Aucune requête réseau."""

from __future__ import annotations

import email.message
import json
import socket
import urllib.error

import pytest

from cryptotrade_ai.live import MarketDataError
from cryptotrade_ai.live.binance_rest import (
    BINANCE_REST_BASE_URL,
    KLINES_PATH,
    LIVE_INTERVAL,
    LIVE_SYMBOL,
    MAX_KLINES,
    MAX_RESPONSE_BYTES,
    TIME_PATH,
    BinanceRestClient,
    default_fetcher,
    validate_live_request,
)
from synthetic_market import klines_bytes, klines_payload, rest_urls, time_bytes


def client(fetcher, **kwargs) -> BinanceRestClient:
    return BinanceRestClient(fetcher=fetcher, sleep=lambda _: None, delay_seconds=0, **kwargs)


class FakeFetcher:
    def __init__(self, responses: dict, errors: dict | None = None):
        self.responses = responses
        self.errors = errors or {}
        self.calls: list[str] = []

    def __call__(self, url: str) -> bytes:
        self.calls.append(url)
        if url in self.errors:
            raise self.errors[url]
        if url not in self.responses:
            raise AssertionError(f"URL inattendue (aucun réseau) : {url}")
        return self.responses[url]


class FakeResponse:
    def __init__(self, data: bytes):
        self.data = data

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, n: int = -1):
        if n is None or n < 0:
            data, self.data = self.data, b""
            return data
        chunk, self.data = self.data[:n], self.data[n:]
        return chunk


def http_error(code: int, url: str = "https://api.binance.com/x"):
    return urllib.error.HTTPError(url, code, "erreur", email.message.Message(), None)


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def blocked(*args, **kwargs):
        raise AssertionError("Accès réseau interdit dans les tests live")

    monkeypatch.setattr(socket.socket, "connect", blocked)
    monkeypatch.setattr(socket, "create_connection", blocked)


def test_v1_accepts_only_btcusdt_1h_with_bounded_limit():
    assert validate_live_request("btcusdt", "1h", 1000) == (LIVE_SYMBOL, LIVE_INTERVAL, 1000)
    for symbol, interval, limit in (("ETHUSDT", "1h", 1000), ("BTCUSDT", "4h", 1000), ("BTCUSDT", "1h", 71), ("BTCUSDT", "1h", 1001), ("BTCUSDT", "1h", True)):
        with pytest.raises(MarketDataError):
            validate_live_request(symbol, interval, limit)


def test_time_and_klines_urls_and_payloads():
    rows, server_time, _ = klines_payload(80)
    time_url, klines_url = rest_urls()
    fake = FakeFetcher({time_url: time_bytes(server_time), klines_url: klines_bytes(rows)})
    rest = client(fake)
    assert rest.server_time_ms() == server_time
    assert rest.klines() == rows
    assert fake.calls == [time_url, klines_url]
    assert TIME_PATH in time_url and KLINES_PATH in klines_url
    assert "symbol=BTCUSDT" in klines_url and "interval=1h" in klines_url and "limit=1000" in klines_url


def test_fetch_spot_klines_asks_time_before_klines():
    rows, server_time, _ = klines_payload(80)
    time_url, klines_url = rest_urls()
    fake = FakeFetcher({time_url: time_bytes(server_time), klines_url: klines_bytes(rows)})
    got_rows, got_time = client(fake).fetch_spot_klines()
    assert got_time == server_time and got_rows == rows
    assert fake.calls == [time_url, klines_url]


def test_invalid_json_and_unexpected_shapes_are_refused():
    time_url, klines_url = rest_urls()
    rest = client(FakeFetcher({time_url: b"pas-json"}))
    with pytest.raises(MarketDataError, match="JSON"):
        rest.server_time_ms()
    rest = client(FakeFetcher({time_url: json.dumps({"time": 1}).encode()}))
    with pytest.raises(MarketDataError, match="serverTime"):
        rest.server_time_ms()
    rest = client(FakeFetcher({klines_url: json.dumps({"rows": []}).encode()}))
    with pytest.raises(MarketDataError, match="liste"):
        rest.klines()
    rest = client(FakeFetcher({klines_url: json.dumps([[]] * (MAX_KLINES + 1)).encode()}))
    with pytest.raises(MarketDataError, match="trop longue"):
        rest.klines()


@pytest.mark.parametrize("code", [403, 418, 429, 451])
def test_forbidden_http_codes_stop_without_retry(code):
    time_url, _ = rest_urls()
    fake = FakeFetcher({}, errors={time_url: http_error(code, time_url)})
    with pytest.raises(MarketDataError, match="Arrêt immédiat"):
        client(fake, max_retries=3).server_time_ms()
    assert fake.calls == [time_url]


def test_http_500_is_retried_then_succeeds():
    time_url, _ = rest_urls()
    calls = {"n": 0}

    def flaky(url: str) -> bytes:
        calls["n"] += 1
        if calls["n"] < 3:
            raise http_error(500, url)
        return time_bytes(1_700_000_000_000)

    assert client(flaky, max_retries=3).server_time_ms() == 1_700_000_000_000
    assert calls["n"] == 3


def test_oversized_response_is_refused_without_parsing():
    time_url, _ = rest_urls()
    huge = b"{" + b"x" * (MAX_RESPONSE_BYTES + 1)
    with pytest.raises(MarketDataError, match="volumineuse"):
        client(FakeFetcher({time_url: huge})).server_time_ms()


def test_default_fetcher_respects_byte_limit_via_opener():
    def opener(request, timeout):
        assert request.get_method() == "GET"
        assert timeout == 3.0
        return FakeResponse(b"a" * 50)

    with pytest.raises(MarketDataError, match="volumineuse"):
        default_fetcher("https://api.binance.com/api/v3/time", timeout_seconds=3.0, max_bytes=10, opener=opener)


def test_client_does_not_call_unrelated_urls():
    fake = FakeFetcher({"https://example.invalid": b"{}"})
    rest = client(fake)
    with pytest.raises(MarketDataError, match="non autorisé"):
        rest._allowed_url("/api/v3/order", None)
    with pytest.raises(MarketDataError, match="paramètre"):
        rest._allowed_url(TIME_PATH, {"foo": "1"})
    assert fake.calls == []
    assert BINANCE_REST_BASE_URL.startswith("https://")
