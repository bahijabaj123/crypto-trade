"""Séries d'heures continues et trous horaires (jamais comblés)."""

from __future__ import annotations

from collections.abc import Sequence

from cryptotrade_ai.data.klines import ms_to_utc_iso
from cryptotrade_ai.dataset import DatasetError


def _step(open_times: Sequence[int], i: int, interval_ms: int) -> int:
    step = open_times[i] - open_times[i - 1]
    if step <= 0:
        raise DatasetError(f"Horodatages non strictement croissants à {ms_to_utc_iso(open_times[i])}")
    if step % interval_ms:
        raise DatasetError(f"Écart non multiple de l'intervalle avant {ms_to_utc_iso(open_times[i])}")
    return step


def segment_bounds(open_times: Sequence[int], interval_ms: int) -> list[tuple[int, int]]:
    """Bornes ``(début, fin exclue)`` des séries où deux bougies successives sont espacées d'un intervalle."""
    if not open_times:
        return []
    bounds = []
    start = 0
    for i in range(1, len(open_times)):
        if _step(open_times, i, interval_ms) != interval_ms:
            bounds.append((start, i))
            start = i
    bounds.append((start, len(open_times)))
    return bounds


def segment_positions(bounds: Sequence[tuple[int, int]]) -> list[int]:
    """Position (à partir de 1) de chaque bougie dans sa série continue."""
    positions: list[int] = []
    for start, end in bounds:
        positions.extend(range(1, end - start + 1))
    return positions


def find_gaps(open_times: Sequence[int], interval_ms: int) -> list[dict]:
    """Trous entre deux bougies présentes : heures absentes, listées sans être créées."""
    gaps = []
    for i in range(1, len(open_times)):
        step = _step(open_times, i, interval_ms)
        if step > interval_ms:
            gaps.append(
                {
                    "premiere_heure_manquante_utc": ms_to_utc_iso(open_times[i - 1] + interval_ms),
                    "derniere_heure_manquante_utc": ms_to_utc_iso(open_times[i] - interval_ms),
                    "heures_manquantes": step // interval_ms - 1,
                }
            )
    return gaps
