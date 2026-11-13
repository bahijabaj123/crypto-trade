"""17 variables de la dernière bougie close, calculées comme le constructeur de dataset.

Les formules RSI, MACD, SMA, etc. ne sont pas recopiées : on appelle
``compute_features_by_segment``. Après un trou, les indicateurs repartent de zéro.

Une fenêtre longue (jusqu'à 1000 klines demandées) réduit l'effet d'initialisation des
indicateurs récursifs. Cela ne garantit pas l'égalité avec l'historique complet du dataset
depuis 2020 : cette précision reste à vérifier sur la validation 2025.
"""

from __future__ import annotations

import math
from collections.abc import Mapping

from cryptotrade_ai.data.klines import INTERVAL_MS
from cryptotrade_ai.dataset.continuity import segment_bounds
from cryptotrade_ai.dataset.features import (
    FEATURE_NAMES,
    FORBIDDEN_INPUT_COLUMNS,
    compute_features_by_segment,
    required_history,
)
from cryptotrade_ai.live import HistoryError, MarketDataError
from cryptotrade_ai.live.binance_rest import LIVE_INTERVAL
from cryptotrade_ai.live.candles import ClosedSeries, closed_series_from_klines

# Convention figée du dataset BTCUSDT-1h-v1 (config/datasets/btcusdt_1h_v1.json).
VOLATILITY_DDOF = 0
INTERVAL_MS_1H = INTERVAL_MS[LIVE_INTERVAL]


def live_feature_values(series: ClosedSeries, *, ddof: int = VOLATILITY_DDOF) -> dict[str, float]:
    """Dict des 17 variables, dans l'ordre de ``FEATURE_NAMES``. Cible et futur exclus."""
    if ddof != VOLATILITY_DDOF:
        raise HistoryError(f"ddof={ddof} : {VOLATILITY_DDOF} (convention du dataset) attendu")
    candles = series.candles
    if len(candles) < required_history():
        raise HistoryError(f"{len(candles)} bougies closes, {required_history()} exigées")
    bounds = segment_bounds([c.open_time for c in candles], INTERVAL_MS_1H)
    values = compute_features_by_segment(candles, bounds, ddof=ddof)
    last = values[-1]
    if last is None:
        raise HistoryError(
            f"Variables indéfinies : {series.last_segment_length} bougies depuis le dernier trou, "
            f"{required_history()} nécessaires"
        )
    if len(last) != len(FEATURE_NAMES):
        raise HistoryError(f"{len(last)} variables calculées, {len(FEATURE_NAMES)} attendues")
    if any(not math.isfinite(v) for v in last):
        raise HistoryError("Au moins une des 17 variables n'est pas finie : prédiction refusée")
    named = {name: float(value) for name, value in zip(FEATURE_NAMES, last, strict=True)}
    return as_model_inputs(named)


def as_model_inputs(values: Mapping[str, float]) -> dict[str, float]:
    """Refuse toute colonne interdite (cible, futur, prix bruts) et tout nom hors des 17 variables."""
    forbidden = sorted(set(values) & FORBIDDEN_INPUT_COLUMNS)
    if forbidden:
        raise MarketDataError(f"Colonnes interdites en entrée du modèle : {forbidden}")
    missing = [name for name in FEATURE_NAMES if name not in values]
    unexpected = sorted(set(values) - set(FEATURE_NAMES))
    if missing or unexpected:
        raise MarketDataError(f"Variables manquantes {missing} ou inattendues {unexpected}")
    ordered: dict[str, float] = {}
    for name in FEATURE_NAMES:
        value = values[name]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
            raise HistoryError(f"{name} : nombre fini attendu")
        ordered[name] = float(value)
    return ordered


def features_from_klines(rows: list, *, server_time_ms: int) -> tuple[ClosedSeries, dict[str, float]]:
    """Enchaîne validation des bougies closes et calcul des 17 variables."""
    series = closed_series_from_klines(rows, server_time_ms=server_time_ms)
    return series, live_feature_values(series)
