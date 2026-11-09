"""Tests de bout en bout de la collecte, sans réseau.

Les archives sont synthétiques (fausses bougies) et écrites uniquement dans tmp_path :
elles ne doivent jamais servir à entraîner un modèle.
"""

import csv
import hashlib
import json

from cryptotrade_ai.config import DataPaths
from cryptotrade_ai.data.binance_archive import ArchiveNotFoundError, archive_url
from cryptotrade_ai.data.collect import build_plan, main, run_collection
from cryptotrade_ai.data.klines import month_start_ms
from synthetic_klines import make_month_rows, make_zip_bytes

NOW_MS = month_start_ms(2026, 10)
DEC_2024_MS = month_start_ms(2024, 12)
JAN_2025_MS = month_start_ms(2025, 1)


class FakeFetcher:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def __call__(self, url):
        self.calls.append(url)
        if url not in self.responses:
            raise ArchiveNotFoundError(f"Archive introuvable (HTTP 404) : {url}")
        return self.responses[url]


def synthetic_responses():
    """Décembre 2024 en millisecondes, janvier 2025 en microsecondes, comme Binance Spot."""
    responses = {}
    for year, month, unit in ((2024, 12, "ms"), (2025, 1, "us")):
        name = f"BTCUSDT-1h-{year}-{month:02d}"
        data = make_zip_bytes(f"{name}.csv", make_month_rows(year, month, unit))
        url = archive_url("BTCUSDT", "1h", year, month)
        responses[url] = data
        responses[url + ".CHECKSUM"] = f"{hashlib.sha256(data).hexdigest()}  {name}.zip\n".encode()
    return responses


def collect(tmp_path, fetcher=None, offline=False, now_ms=NOW_MS):
    return run_collection(
        symbol="BTCUSDT",
        interval="1h",
        start="2024-12",
        end="2025-01",
        paths=DataPaths(tmp_path),
        offline=offline,
        fetcher=fetcher,
        now_ms=now_ms,
    )


def read_clean_csv(tmp_path):
    with (tmp_path / "processed" / "BTCUSDT-1h-2024-12_2025-01.csv").open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def test_full_collection_normalizes_both_timestamp_units(tmp_path):
    report = collect(tmp_path, FakeFetcher(synthetic_responses()))

    assert report["statut"] == "OK", report["erreurs"] + report["avertissements"]
    assert [m["unite_detectee"] for m in report["mois"]] == ["ms", "us"]
    assert report["qualite"]["bougies_attendues"] == 744 * 2
    assert report["qualite"]["bougies_manquantes"] == 0

    rows = read_clean_csv(tmp_path)
    assert len(rows) == 744 * 2
    assert rows[0]["open_time"] == str(DEC_2024_MS)
    assert rows[744]["open_time"] == str(JAN_2025_MS)
    assert rows[744]["close_time"] == str(JAN_2025_MS + 3_599_999)
    assert rows[744]["open_time_utc"] == "2025-01-01T00:00:00.000Z"
    open_times = [int(r["open_time"]) for r in rows]
    assert all(b - a == 3_600_000 for a, b in zip(open_times, open_times[1:]))

    saved = json.loads((tmp_path / "reports" / "BTCUSDT-1h-2024-12_2025-01.quality.json").read_text("utf-8"))
    assert saved["statut"] == "OK"
    assert len(list((tmp_path / "raw").rglob("*.zip"))) == 2


def test_offline_rerun_uses_kept_archives(tmp_path):
    collect(tmp_path, FakeFetcher(synthetic_responses()))
    report = collect(tmp_path, offline=True)
    assert report["statut"] == "OK"
    assert all(m["telecharge_cette_fois"] is False for m in report["mois"])


def test_missing_archive_fails_without_inventing_data(tmp_path):
    responses = synthetic_responses()
    january = archive_url("BTCUSDT", "1h", 2025, 1)
    del responses[january]
    del responses[january + ".CHECKSUM"]

    report = collect(tmp_path, FakeFetcher(responses))

    assert report["statut"] == "ECHEC"
    assert report["sorties"]["csv"] is None
    assert not (tmp_path / "processed").exists()
    assert any("2025-01" in e for e in report["erreurs"])
    assert (tmp_path / "reports" / "BTCUSDT-1h-2024-12_2025-01.quality.json").is_file()


def test_checksum_mismatch_fails(tmp_path):
    responses = synthetic_responses()
    january = archive_url("BTCUSDT", "1h", 2025, 1)
    responses[january] = responses[january] + b"corrompu"

    report = collect(tmp_path, FakeFetcher(responses))

    assert report["statut"] == "ECHEC"
    assert not (tmp_path / "processed").exists()
    assert not list((tmp_path / "raw").rglob("BTCUSDT-1h-2025-01.zip"))


def test_unfinished_period_is_refused_before_any_request(tmp_path):
    fetcher = FakeFetcher(synthetic_responses())
    report = collect(tmp_path, fetcher, now_ms=JAN_2025_MS + 3_600_000)
    assert report["statut"] == "ECHEC"
    assert fetcher.calls == []


def test_build_plan_lists_urls_without_network(tmp_path):
    plan = build_plan(symbol="BTCUSDT", interval="1h", start="2024-12", end="2025-01", paths=DataPaths(tmp_path))
    assert [url for url, _ in plan] == [
        "https://data.binance.vision/data/spot/monthly/klines/BTCUSDT/1h/BTCUSDT-1h-2024-12.zip",
        "https://data.binance.vision/data/spot/monthly/klines/BTCUSDT/1h/BTCUSDT-1h-2025-01.zip",
    ]
    assert list(tmp_path.iterdir()) == []


def test_default_plan_covers_2020_01_to_2026_09(tmp_path):
    plan = build_plan(symbol="BTCUSDT", interval="1h", start="2020-01", end="2026-09", paths=DataPaths(tmp_path))
    assert len(plan) == 81
    assert plan[0][0].endswith("BTCUSDT-1h-2020-01.zip")
    assert plan[-1][0].endswith("BTCUSDT-1h-2026-09.zip")


def test_cli_dry_run_writes_nothing(tmp_path, capsys):
    target = tmp_path / "donnees"
    code = main(["--dry-run", "--data-dir", str(target), "--start", "2024-12", "--end", "2025-01"])
    assert code == 0
    assert not target.exists()
    assert "Aucun téléchargement" in capsys.readouterr().out
