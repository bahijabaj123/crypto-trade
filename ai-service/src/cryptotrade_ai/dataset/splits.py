"""Découpage chronologique avec purge et embargo.

Un exemple ``t`` utilise les bougies de ``t - (W - 1)`` à ``t + horizon`` (W = historique minimum).
Pour chaque ensemble suivi d'un autre, un exemple n'est conservé que si
``t <= fin - embargo``, avec ``embargo >= W + horizon`` : la cible reste dans son ensemble
et aucune bougie n'est partagée entre les fenêtres de deux ensembles. Les exemples du
dernier ensemble doivent avoir leur cible avant la fin de la période.
Les variables d'un exemple de validation ou de test utilisent normalement les bougies
passées de l'ensemble précédent : c'est de l'information connue au moment t.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from cryptotrade_ai.data.klines import ms_to_utc_iso


@dataclass(frozen=True)
class SplitBounds:
    name: str
    start_ms: int
    end_ms: int


def assign_split(
    open_time: int, splits: Sequence[SplitBounds], *, interval_ms: int, horizon: int, embargo: int
) -> tuple[str | None, str | None]:
    """Retourne ``(ensemble, None)`` ou ``(None, raison d'exclusion)``."""
    for index, bounds in enumerate(splits):
        if not bounds.start_ms <= open_time < bounds.end_ms:
            continue
        if index < len(splits) - 1:
            if open_time > bounds.end_ms - embargo * interval_ms:
                return None, "embargo"
        elif open_time + horizon * interval_ms >= bounds.end_ms:
            return None, "cible_hors_periode"
        return bounds.name, None
    return None, "hors_periode"


def check_boundaries(
    times_by_split: Mapping[str, Sequence[int]],
    splits: Sequence[SplitBounds],
    *,
    interval_ms: int,
    horizon: int,
    min_history: int,
) -> list[dict]:
    """Vérifie à chaque frontière que les fenêtres (variables + cible) des deux ensembles sont disjointes."""
    results = []
    for before, after in zip(splits, splits[1:]):
        times_before = times_by_split.get(before.name) or []
        times_after = times_by_split.get(after.name) or []
        if not times_before or not times_after:
            results.append({"de": before.name, "vers": after.name, "ok": False, "detail": "ensemble vide"})
            continue
        last_window_end = max(times_before) + horizon * interval_ms
        first_window_start = min(times_after) - (min_history - 1) * interval_ms
        results.append(
            {
                "de": before.name,
                "vers": after.name,
                "derniere_bougie_utilisee_avant_utc": ms_to_utc_iso(last_window_end),
                "premiere_bougie_utilisee_apres_utc": ms_to_utc_iso(first_window_start),
                "bougies_libres_entre_fenetres": (first_window_start - last_window_end) // interval_ms - 1,
                "cibles_avant_frontiere": last_window_end < after.start_ms,
                "ok": last_window_end < first_window_start and last_window_end < after.start_ms,
            }
        )
    return results
