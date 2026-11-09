"""Contrôles qualité du dataset et éléments statistiques du rapport."""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Iterable, Sequence
from datetime import datetime, timezone

from cryptotrade_ai.data.klines import ms_to_utc_iso
from cryptotrade_ai.dataset.continuity import segment_bounds
from cryptotrade_ai.dataset.features import FEATURE_NAMES, FORBIDDEN_INPUT_COLUMNS, compute_features_by_segment
from cryptotrade_ai.dataset.source import Candle


def _period_key(open_time: int, fmt: str) -> str:
    return datetime.fromtimestamp(open_time // 1000, tz=timezone.utc).strftime(fmt)


def class_balance(examples: Sequence) -> dict:
    total = len(examples)
    ups = sum(e.target for e in examples)
    return {
        "exemples": total,
        "hausses": ups,
        "baisses_ou_egalites": total - ups,
        "taux_hausse": round(ups / total, 6) if total else None,
        "egalites": sum(1 for e in examples if e.tie),
    }


def balance_by_period(examples: Sequence, fmt: str) -> dict[str, dict]:
    groups: dict[str, list] = defaultdict(list)
    for example in examples:
        groups[_period_key(example.open_time, fmt)].append(example)
    return {key: class_balance(groups[key]) for key in sorted(groups)}


def feature_statistics(examples: Sequence) -> dict[str, dict]:
    stats = {}
    for column, name in enumerate(FEATURE_NAMES):
        values = [e.features[column] for e in examples]
        if not values:
            stats[name] = None
            continue
        mean = sum(values) / len(values)
        stats[name] = {
            "min": min(values),
            "max": max(values),
            "moyenne": mean,
            "ecart_type": math.sqrt(sum((v - mean) ** 2 for v in values) / len(values)),
        }
    return stats


def group_ranges(times: Iterable[int], interval_ms: int) -> list[dict]:
    """Regroupe des horodatages consécutifs en plages lisibles."""
    ranges: list[list[int]] = []
    for t in sorted(times):
        if ranges and t == ranges[-1][1] + interval_ms:
            ranges[-1][1] = t
        else:
            ranges.append([t, t])
    return [
        {"debut_utc": ms_to_utc_iso(a), "fin_utc": ms_to_utc_iso(b), "heures": (b - a) // interval_ms + 1}
        for a, b in ranges
    ]


def causality_sample(examples: Sequence) -> list[int]:
    """Indices de bougies à auditer : premier, milieu et dernier exemple de chaque ensemble."""
    by_split: dict[str, list] = defaultdict(list)
    for example in examples:
        by_split[example.split].append(example.index)
    sample: set[int] = set()
    for indices in by_split.values():
        sample.update((indices[0], indices[len(indices) // 2], indices[-1]))
    return sorted(sample)


def audit_causality(
    candles: Sequence[Candle],
    positions: Sequence[int],
    full_features: Sequence[tuple[float, ...] | None],
    indices: Sequence[int],
    *,
    interval_ms: int,
    ddof: int,
) -> dict:
    """Recalcule les variables en ne gardant que les bougies jusqu'à t : elles doivent être identiques."""
    mismatches = []
    for i in indices:
        prefix = candles[i - positions[i] + 1 : i + 1]
        recomputed = compute_features_by_segment(
            prefix, segment_bounds([k.open_time for k in prefix], interval_ms), ddof=ddof
        )[-1]
        if recomputed != full_features[i]:
            mismatches.append(ms_to_utc_iso(candles[i].open_time))
    return {
        "methode": "variables recalculées sans aucune bougie postérieure à t, comparaison exacte",
        "points_verifies_utc": [ms_to_utc_iso(candles[i].open_time) for i in indices],
        "ecarts_utc": mismatches,
        "ok": bool(indices) and not mismatches,
    }


def _check(name: str, ok: bool, detail: str) -> dict:
    return {"controle": name, "ok": bool(ok), "detail": detail}


def run_checks(
    *,
    examples: Sequence,
    candles: Sequence[Candle],
    config,
    excluded_total: int,
    boundaries: Sequence[dict],
    causality: dict,
) -> list[dict]:
    interval_ms, horizon, history = config.interval_ms, config.horizon, config.min_history
    times = [e.open_time for e in examples]
    by_time = {k.open_time: k for k in candles}
    bounds = {b.name: b for b in config.splits}

    target_ok = True
    for e in examples:
        future = by_time.get(e.open_time + horizon * interval_ms)
        current = candles[e.index]
        if future is None or e.target != int(future.close > current.close) or e.fwd_return != math.log(future.close / current.close):
            target_ok = False
            break

    history_ok = all(
        e.index >= history - 1 and candles[e.index - history + 1].open_time == e.open_time - (history - 1) * interval_ms
        for e in examples
    )
    in_bounds_ok = all(
        bounds[e.split].start_ms <= e.open_time and e.open_time + horizon * interval_ms < bounds[e.split].end_ms
        for e in examples
    )
    counts = {name: sum(1 for e in examples if e.split == name) for name in bounds}

    return [
        _check(
            "comptage_coherent",
            len(examples) + excluded_total == len(candles),
            f"{len(examples)} exemples + {excluded_total} exclus = {len(candles)} bougies",
        ),
        _check(
            "horodatages_uniques_et_croissants",
            all(b > a for a, b in zip(times, times[1:])),
            "un seul exemple par heure, ordre strictement croissant",
        ),
        _check("cibles_binaires", all(e.target in (0, 1) for e in examples), "cible dans {0, 1}"),
        _check(
            "valeurs_finies",
            all(math.isfinite(x) for e in examples for x in e.features) and all(math.isfinite(e.fwd_return) for e in examples),
            "aucune valeur NaN ou infinie dans les variables et fwd_return_1h",
        ),
        _check(
            "variables_autorisees_uniquement",
            tuple(config.features) == FEATURE_NAMES and not set(FEATURE_NAMES) & FORBIDDEN_INPUT_COLUMNS,
            "liste explicite de 17 variables, aucune colonne interdite",
        ),
        _check("cible_t_plus_1h_exacte", target_ok, "cible recalculée depuis la bougie ouverte exactement à t + 1h"),
        _check("historique_continu", history_ok, f"{history} bougies consécutives jusqu'à t pour chaque exemple"),
        _check("exemples_dans_leurs_bornes", in_bounds_ok, "t et sa cible dans les bornes de leur ensemble"),
        _check("ensembles_non_vides", all(counts.values()), f"effectifs : {counts}"),
        _check(
            "embargo_fenetres_disjointes",
            bool(boundaries) and all(b["ok"] for b in boundaries),
            "aucune bougie partagée entre ensembles ; cibles avant la frontière",
        ),
        _check("audit_causalite", causality["ok"], f"écarts : {causality['ecarts_utc']}"),
    ]
