"""Collecte des bougies Binance Spot depuis les archives mensuelles officielles.

Étapes : téléchargement (ou réutilisation) des ZIP -> vérification SHA-256 ->
lecture -> normalisation des horodatages en ms UTC -> contrôles qualité ->
CSV nettoyé + rapport qualité JSON.

En cas d'erreur bloquante, aucun CSV n'est écrit et aucune donnée n'est inventée :
seul le rapport (statut « ECHEC ») est produit.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import re
import time
from pathlib import Path

from cryptotrade_ai import __version__
from cryptotrade_ai.config import (
    BINANCE_DATA_BASE_URL,
    DEFAULT_END_MONTH,
    DEFAULT_INTERVAL,
    DEFAULT_START_MONTH,
    DEFAULT_SYMBOL,
    MAX_RETRIES,
    REQUEST_DELAY_SECONDS,
    REQUEST_TIMEOUT_SECONDS,
    DataPaths,
    resolve_data_dir,
)
from cryptotrade_ai.data.binance_archive import (
    ArchiveError,
    Fetcher,
    HttpFetcher,
    archive_dir,
    archive_filename,
    archive_url,
    ensure_archive,
    read_csv_from_zip,
    sha256_file,
)
from cryptotrade_ai.data.klines import (
    INTERVAL_MS,
    KLINE_COLUMNS,
    Kline,
    KlineDataError,
    RowIssue,
    check_quality,
    count_issues_by_reason,
    expected_unit_for_month,
    iter_months,
    month_start_ms,
    ms_to_utc_iso,
    next_month,
    normalize_rows,
    parse_month,
    read_kline_csv,
    utc_iso_to_ms,
)

LOG = logging.getLogger("cryptotrade_ai.collect")

CLEAN_CSV_COLUMNS = (*KLINE_COLUMNS, "open_time_utc", "close_time_utc", "source_file")
MAX_DETAILED_ISSUES = 100

STATUS_OK = "OK"
STATUS_WARNINGS = "OK_AVEC_AVERTISSEMENTS"
STATUS_FAILED = "ECHEC"


def validate_symbol(symbol: str) -> str:
    value = symbol.strip().upper()
    if not re.fullmatch(r"[A-Z0-9]{5,20}", value):
        raise ValueError(f"Symbole invalide : {symbol!r}")
    return value


def validate_interval(interval: str) -> int:
    if interval not in INTERVAL_MS:
        raise ValueError(f"Intervalle non pris en charge : {interval!r} ({', '.join(INTERVAL_MS)})")
    return INTERVAL_MS[interval]


def output_base_name(symbol: str, interval: str, start: str, end: str) -> str:
    return f"{symbol}-{interval}-{start}_{end}"


def build_plan(
    *, symbol: str, interval: str, start: str, end: str, paths: DataPaths
) -> list[tuple[str, Path]]:
    """Liste (URL, destination locale) des archives prévues, sans aucun accès réseau."""
    symbol = validate_symbol(symbol)
    validate_interval(interval)
    target_dir = archive_dir(paths.raw, symbol, interval)
    return [
        (archive_url(symbol, interval, y, m), target_dir / archive_filename(symbol, interval, y, m))
        for y, m in iter_months(parse_month(start), parse_month(end))
    ]


def run_collection(
    *,
    symbol: str,
    interval: str,
    start: str,
    end: str,
    paths: DataPaths,
    offline: bool = False,
    reference_time_ms: int | None = None,
    fetcher: Fetcher | None = None,
    now_ms: int | None = None,
) -> dict:
    """Exécute la collecte complète et retourne le rapport qualité (aussi écrit sur disque)."""
    symbol = validate_symbol(symbol)
    interval_ms = validate_interval(interval)
    start_month, end_month = parse_month(start), parse_month(end)
    months = iter_months(start_month, end_month)
    period_start_ms = month_start_ms(*start_month)
    period_end_ms = month_start_ms(*next_month(*end_month))
    if now_ms is None:
        now_ms = int(time.time() * 1000)
    reference = period_end_ms if reference_time_ms is None else reference_time_ms

    errors: list[str] = []
    warnings: list[str] = []
    month_reports: list[dict] = []

    if period_end_ms > now_ms:
        errors.append(
            "La période demandée n'est pas terminée : le dernier mois doit être entièrement écoulé."
        )
    if reference > now_ms:
        errors.append("La date de référence est dans le futur.")
    if reference <= period_start_ms:
        errors.append("La date de référence est antérieure au début de la période.")

    all_klines: list[Kline] = []
    all_issues: list[RowIssue] = []

    if not errors:
        if not offline and fetcher is None:
            fetcher = HttpFetcher()
        for year, month in months:
            info, klines, issues = _process_month(
                symbol, interval, interval_ms, year, month, paths, fetcher, offline, errors, warnings
            )
            month_reports.append(info)
            all_klines.extend(klines)
            all_issues.extend(issues)

    quality = check_quality(
        all_klines,
        interval_ms=interval_ms,
        period_start_ms=period_start_ms,
        period_end_ms=period_end_ms,
        reference_time_ms=min(reference, period_end_ms),
    )

    if all_issues:
        warnings.append(f"{len(all_issues)} ligne(s) invalide(s) exclue(s) : {count_issues_by_reason(all_issues)}")
    if quality.duplicates_conflicting:
        errors.append(
            f"{len(quality.duplicates_conflicting)} horodatage(s) en double avec des valeurs différentes"
        )
    if quality.duplicates_identical:
        warnings.append(f"{quality.duplicates_identical} doublon(s) identique(s) supprimé(s)")
    if quality.non_chronological:
        warnings.append(f"{quality.non_chronological} ligne(s) hors ordre chronologique (série retriée)")
    if quality.outside_period:
        warnings.append(f"{quality.outside_period} bougie(s) hors période exclue(s)")
    if quality.not_closed:
        warnings.append(f"{quality.not_closed} bougie(s) non clôturée(s) exclue(s)")
    if quality.missing_candles and all_klines:
        warnings.append(
            f"{quality.missing_candles} bougie(s) manquante(s) réparties en {len(quality.gaps)} trou(s), "
            "non comblé(s)"
        )
    if quality.zero_volume:
        warnings.append(f"{quality.zero_volume} bougie(s) avec un volume nul (conservées)")
    if quality.taker_above_volume:
        warnings.append(f"{quality.taker_above_volume} bougie(s) avec un volume taker > volume total")
    if not errors and not quality.clean:
        errors.append("Aucune bougie valide après contrôle.")

    base_name = output_base_name(symbol, interval, start, end)
    csv_path = paths.processed / f"{base_name}.csv"
    report_path = paths.reports / f"{base_name}.quality.json"

    csv_output: dict | None = None
    if not errors:
        _write_clean_csv(csv_path, quality.clean)
        csv_output = {"chemin": str(csv_path), "sha256": sha256_file(csv_path), "lignes": len(quality.clean)}

    status = STATUS_FAILED if errors else (STATUS_WARNINGS if warnings else STATUS_OK)
    report = {
        "statut": status,
        "version_script": __version__,
        "genere_le_utc": ms_to_utc_iso(now_ms),
        "source": {
            "site": BINANCE_DATA_BASE_URL,
            "marche": "spot",
            "granularite_archive": "monthly",
            "verification": "SHA-256 comparé au fichier .CHECKSUM officiel",
        },
        "parametres": {
            "symbole": symbol,
            "intervalle": interval,
            "mois_debut": start,
            "mois_fin": end,
            "debut_periode_utc": ms_to_utc_iso(period_start_ms),
            "fin_periode_exclue_utc": ms_to_utc_iso(period_end_ms),
            "reference_cloture_utc": ms_to_utc_iso(min(reference, period_end_ms)),
            "mode_hors_ligne": offline,
        },
        "normalisation_horodatages": {
            "unite_sortie": "millisecondes",
            "fuseau": "UTC",
            "regle": "unité détectée par ordre de grandeur (13 chiffres = ms, 16 chiffres = µs), "
            "µs divisées par 1000",
        },
        "mois": month_reports,
        "qualite": {
            "bougies_lues_valides": len(all_klines),
            "lignes_invalides_par_raison": count_issues_by_reason(all_issues),
            "lignes_invalides_detail": [
                {
                    "fichier": i.source_file,
                    "ligne": i.line,
                    "raison": i.reason,
                    "open_time_utc": ms_to_utc_iso(i.open_time) if i.open_time is not None else None,
                }
                for i in all_issues[:MAX_DETAILED_ISSUES]
            ],
            "lignes_non_chronologiques": quality.non_chronological,
            "doublons_identiques_supprimes": quality.duplicates_identical,
            "doublons_conflictuels_utc": [ms_to_utc_iso(t) for t in quality.duplicates_conflicting],
            "hors_periode_exclues": quality.outside_period,
            "non_cloturees_exclues": quality.not_closed,
            "bougies_attendues": quality.expected_candles,
            "bougies_conservees": len(quality.clean),
            "bougies_manquantes": quality.missing_candles,
            "trous": quality.gaps,
            "volume_nul": quality.zero_volume,
            "bougies_plates": quality.flat,
            "taker_superieur_au_volume": quality.taker_above_volume,
            "premiere_ouverture_utc": ms_to_utc_iso(quality.clean[0].open_time) if quality.clean else None,
            "derniere_ouverture_utc": ms_to_utc_iso(quality.clean[-1].open_time) if quality.clean else None,
        },
        "sorties": {
            "csv": csv_output,
            "remarque": None if csv_output else "CSV non écrit à cause d'erreur(s) bloquante(s).",
            "rapport": str(report_path),
        },
        "erreurs": errors,
        "avertissements": warnings,
    }
    _write_json(report_path, report)
    return report


def _process_month(
    symbol: str,
    interval: str,
    interval_ms: int,
    year: int,
    month: int,
    paths: DataPaths,
    fetcher: Fetcher | None,
    offline: bool,
    errors: list[str],
    warnings: list[str],
) -> tuple[dict, list[Kline], list[RowIssue]]:
    label = f"{year:04d}-{month:02d}"
    filename = archive_filename(symbol, interval, year, month)
    info: dict = {"mois": label, "fichier": filename, "url": archive_url(symbol, interval, year, month)}
    LOG.info("Mois %s : %s", label, filename)

    try:
        archive = ensure_archive(
            symbol=symbol,
            interval=interval,
            year=year,
            month=month,
            raw_dir=paths.raw,
            fetcher=fetcher,
            offline=offline,
        )
        text = read_csv_from_zip(archive.zip_path, filename.removesuffix(".zip") + ".csv")
        rows, header_skipped = read_kline_csv(text)
        parsed = normalize_rows(
            rows,
            source_file=filename,
            year=year,
            month=month,
            interval_ms=interval_ms,
            first_line_number=2 if header_skipped else 1,
        )
    except (ArchiveError, KlineDataError) as exc:
        info["erreur"] = str(exc)
        errors.append(f"{label} : {exc}")
        return info, [], []

    expected_unit = expected_unit_for_month(year, month)
    info.update(
        {
            "sha256": archive.sha256,
            "checksum_verifie": True,
            "telecharge_cette_fois": archive.downloaded,
            "entete_ignoree": header_skipped,
            "lignes_lues": len(rows),
            "lignes_valides": len(parsed.klines),
            "unite_detectee": parsed.unit,
            "unite_attendue": expected_unit,
        }
    )
    if archive.checksum_changed:
        warnings.append(f"{label} : le CHECKSUM officiel a changé depuis le dernier téléchargement")
    if not rows:
        errors.append(f"{label} : archive vide")
    if parsed.unit and parsed.unit != expected_unit:
        warnings.append(
            f"{label} : horodatages en {parsed.unit} alors que {expected_unit} était attendu "
            "(conversion faite d'après l'ordre de grandeur)"
        )
    return info, parsed.klines, parsed.issues


def _write_clean_csv(path: Path, klines: list[Kline]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".part")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(CLEAN_CSV_COLUMNS)
        for kline in klines:
            writer.writerow(
                (*kline.fields, ms_to_utc_iso(kline.open_time), ms_to_utc_iso(kline.close_time), kline.source_file)
            )
    os.replace(temporary, path)


def _write_json(path: Path, content: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".part")
    temporary.write_text(json.dumps(content, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Télécharge, vérifie et nettoie les bougies Binance Spot (archives mensuelles officielles)."
    )
    parser.add_argument("--symbol", default=DEFAULT_SYMBOL, help=f"Paire (défaut {DEFAULT_SYMBOL})")
    parser.add_argument("--interval", default=DEFAULT_INTERVAL, help=f"Intervalle (défaut {DEFAULT_INTERVAL})")
    parser.add_argument("--start", default=DEFAULT_START_MONTH, help=f"Premier mois AAAA-MM (défaut {DEFAULT_START_MONTH})")
    parser.add_argument("--end", default=DEFAULT_END_MONTH, help=f"Dernier mois inclus AAAA-MM (défaut {DEFAULT_END_MONTH})")
    parser.add_argument("--data-dir", default=None, help="Dossier des données (défaut ai-service/data)")
    parser.add_argument("--offline", action="store_true", help="Utilise uniquement les archives déjà présentes")
    parser.add_argument("--dry-run", action="store_true", help="Affiche les URL prévues sans rien télécharger")
    parser.add_argument(
        "--reference-time",
        default=None,
        help="Exclut les bougies clôturées à partir de cette date UTC (ex. 2026-10-01T00:00:00Z). "
        "Défaut : fin de la période.",
    )
    parser.add_argument("--delay", type=float, default=REQUEST_DELAY_SECONDS, help="Pause entre requêtes (s)")
    parser.add_argument("--timeout", type=float, default=REQUEST_TIMEOUT_SECONDS, help="Délai max par requête (s)")
    parser.add_argument("--retries", type=int, default=MAX_RETRIES, help="Tentatives max par fichier")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    try:
        paths = DataPaths(resolve_data_dir(args.data_dir))
        if args.dry_run:
            plan = build_plan(symbol=args.symbol, interval=args.interval, start=args.start, end=args.end, paths=paths)
            print(f"{len(plan)} archive(s) prévue(s) (+ 1 fichier .CHECKSUM chacune). Aucun téléchargement effectué.")
            for url, destination in plan:
                print(f"  {url}\n    -> {destination}")
            return 0
        if args.delay < 0.5:
            raise ValueError("--delay doit être d'au moins 0,5 seconde pour rester respectueux du serveur")
        reference = utc_iso_to_ms(args.reference_time) if args.reference_time else None
        fetcher = None if args.offline else HttpFetcher(args.delay, args.timeout, args.retries)
        report = run_collection(
            symbol=args.symbol,
            interval=args.interval,
            start=args.start,
            end=args.end,
            paths=paths,
            offline=args.offline,
            reference_time_ms=reference,
            fetcher=fetcher,
        )
    except ValueError as exc:
        LOG.error("%s", exc)
        return 2

    print(f"Statut : {report['statut']}")
    for message in report["erreurs"]:
        print(f"  ERREUR : {message}")
    for message in report["avertissements"]:
        print(f"  AVERTISSEMENT : {message}")
    if report["sorties"]["csv"]:
        print(f"CSV nettoyé : {report['sorties']['csv']['chemin']} ({report['sorties']['csv']['lignes']} lignes)")
    print(f"Rapport qualité : {report['sorties']['rapport']}")
    return 1 if report["statut"] == STATUS_FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
