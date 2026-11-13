"""Cible binaire : la clôture de la bougie ouverte exactement à t + 1h est-elle supérieure à celle de t ?"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from cryptotrade_ai.dataset.source import Candle

TARGET_COLUMN = "target_up_1h"
FWD_RETURN_COLUMN = "fwd_return_1h"


@dataclass(frozen=True, slots=True)
class Target:
    up: int
    fwd_return: float
    tie: bool
    target_open_time: int


def build_targets(candles: Sequence[Candle], *, interval_ms: int, horizon: int = 1) -> list[Target | None]:
    """Recherche par horodatage exact ; ``None`` si la bougie t + horizon n'existe pas.

    Égalité des clôtures -> 0. ``fwd_return`` = ln(C(t+1h) / C(t)), réservé à l'évaluation.
    """
    by_time = {k.open_time: k for k in candles}
    targets: list[Target | None] = []
    for candle in candles:
        future = by_time.get(candle.open_time + horizon * interval_ms)
        if future is None:
            targets.append(None)
            continue
        targets.append(
            Target(
                up=1 if future.close > candle.close else 0,
                fwd_return=math.log(future.close / candle.close),
                tie=future.close == candle.close,
                target_open_time=future.open_time,
            )
        )
    return targets
