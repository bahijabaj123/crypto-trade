"""Tests de vérification SHA-256 et du client HTTP, sans aucun accès réseau.

Les archives utilisées sont synthétiques et écrites uniquement dans tmp_path.
"""

import email.message
import hashlib
import urllib.error

import pytest

from cryptotrade_ai.data.binance_archive import (
    ArchiveError,
    ArchiveNotFoundError,
    HttpFetcher,
    archive_url,
    ensure_archive,
    parse_checksum,
    read_csv_from_zip,
    sha256_file,
)
from synthetic_klines import make_month_rows, make_zip_bytes

FILENAME = "BTCUSDT-1h-2024-01.zip"
DIGEST = "a" * 64


class FakeFetcher:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def __call__(self, url):
        self.calls.append(url)
        if url not in self.responses:
            raise ArchiveNotFoundError(f"absent : {url}")
        return self.responses[url]


def synthetic_archive():
    data = make_zip_bytes("BTCUSDT-1h-2024-01.csv", make_month_rows(2024, 1, "ms"))
    checksum = f"{hashlib.sha256(data).hexdigest()}  {FILENAME}\n".encode()
    url = archive_url("BTCUSDT", "1h", 2024, 1)
    return data, checksum, url


def ensure(tmp_path, fetcher, offline=False):
    return ensure_archive(
        symbol="BTCUSDT", interval="1h", year=2024, month=1, raw_dir=tmp_path, fetcher=fetcher, offline=offline
    )


def test_parse_checksum():
    assert parse_checksum(f"{DIGEST.upper()}  {FILENAME}\n", FILENAME) == DIGEST


def test_parse_checksum_rejects_other_file():
    with pytest.raises(ArchiveError):
        parse_checksum(f"{DIGEST}  BTCUSDT-1h-2024-02.zip", FILENAME)


@pytest.mark.parametrize("text", ["", "abc  " + FILENAME, DIGEST])
def test_parse_checksum_rejects_malformed(text):
    with pytest.raises(ArchiveError):
        parse_checksum(text, FILENAME)


def test_sha256_file(tmp_path):
    path = tmp_path / "f.bin"
    path.write_bytes(b"cryptotrade")
    assert sha256_file(path) == hashlib.sha256(b"cryptotrade").hexdigest()


def test_valid_archive_is_downloaded_and_kept(tmp_path):
    data, checksum, url = synthetic_archive()
    result = ensure(tmp_path, FakeFetcher({url: data, url + ".CHECKSUM": checksum}))
    assert result.downloaded is True
    assert result.zip_path.read_bytes() == data
    assert result.checksum_path.read_bytes() == checksum
    assert read_csv_from_zip(result.zip_path, "BTCUSDT-1h-2024-01.csv").startswith("17040672000")


def test_corrupted_download_is_rejected_and_not_saved(tmp_path):
    data, checksum, url = synthetic_archive()
    with pytest.raises(ArchiveError):
        ensure(tmp_path, FakeFetcher({url: data + b"x", url + ".CHECKSUM": checksum}))
    assert not list(tmp_path.rglob("*.zip"))


def test_existing_valid_archive_is_not_downloaded_again(tmp_path):
    data, checksum, url = synthetic_archive()
    ensure(tmp_path, FakeFetcher({url: data, url + ".CHECKSUM": checksum}))
    fetcher = FakeFetcher({url: data, url + ".CHECKSUM": checksum})
    result = ensure(tmp_path, fetcher)
    assert result.downloaded is False
    assert fetcher.calls == [url + ".CHECKSUM"]


def test_offline_mode_uses_local_files_only(tmp_path):
    data, checksum, url = synthetic_archive()
    ensure(tmp_path, FakeFetcher({url: data, url + ".CHECKSUM": checksum}))
    result = ensure(tmp_path, None, offline=True)
    assert result.downloaded is False


def test_offline_mode_fails_without_local_archive(tmp_path):
    with pytest.raises(ArchiveError):
        ensure(tmp_path, None, offline=True)


def test_offline_mode_detects_modified_archive(tmp_path):
    data, checksum, url = synthetic_archive()
    result = ensure(tmp_path, FakeFetcher({url: data, url + ".CHECKSUM": checksum}))
    result.zip_path.write_bytes(data + b"modifie")
    with pytest.raises(ArchiveError):
        ensure(tmp_path, None, offline=True)


class FakeResponse:
    def __init__(self, data):
        self.data = data

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return self.data


def http_error(code):
    return urllib.error.HTTPError("https://example.invalid", code, "erreur", email.message.Message(), None)


def scripted_opener(outcomes):
    calls = []

    def opener(request, timeout):
        calls.append(request.full_url)
        outcome = outcomes[len(calls) - 1]
        if isinstance(outcome, Exception):
            raise outcome
        return FakeResponse(outcome)

    return opener, calls


def test_http_404_stops_without_retry():
    opener, calls = scripted_opener([http_error(404)])
    sleeps = []
    fetcher = HttpFetcher(delay_seconds=1, max_retries=3, sleep=sleeps.append, opener=opener)
    with pytest.raises(ArchiveNotFoundError):
        fetcher("https://example.invalid/a.zip")
    assert len(calls) == 1
    assert sleeps == [1]


@pytest.mark.parametrize("code", [403, 418, 451])
def test_http_access_refused_stops_without_retry(code):
    opener, calls = scripted_opener([http_error(code)])
    fetcher = HttpFetcher(delay_seconds=1, max_retries=3, sleep=lambda s: None, opener=opener)
    with pytest.raises(ArchiveError):
        fetcher("https://example.invalid/a.zip")
    assert len(calls) == 1


def test_server_error_is_retried_with_pause():
    opener, calls = scripted_opener([http_error(503), b"ok"])
    sleeps = []
    fetcher = HttpFetcher(delay_seconds=1, max_retries=3, sleep=sleeps.append, opener=opener)
    assert fetcher("https://example.invalid/a.zip") == b"ok"
    assert len(calls) == 2
    assert sleeps == [1, 2]


def test_gives_up_after_max_retries():
    opener, calls = scripted_opener([http_error(500)] * 3)
    fetcher = HttpFetcher(delay_seconds=1, max_retries=3, sleep=lambda s: None, opener=opener)
    with pytest.raises(ArchiveError):
        fetcher("https://example.invalid/a.zip")
    assert len(calls) == 3


def test_user_agent_is_sent():
    seen = {}

    def opener(request, timeout):
        seen["ua"] = request.get_header("User-agent")
        return FakeResponse(b"ok")

    HttpFetcher(sleep=lambda s: None, opener=opener)("https://example.invalid/a.zip")
    assert seen["ua"].startswith("CryptoTrade-ai-service/")
