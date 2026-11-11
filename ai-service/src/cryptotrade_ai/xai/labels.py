"""Libellés français, unités et groupes des 17 variables du dataset BTCUSDT-1h-v1.

Les noms viennent de ``cryptotrade_ai.dataset.features.FEATURE_NAMES`` (source unique,
identique à config_used.json) : toute différence est détectée à l'import.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from cryptotrade_ai.dataset.features import FEATURE_NAMES
from cryptotrade_ai.xai import XaiError

# Unités : comment lire la valeur brute d'une variable.
UNITS = {
    "rendement_log": "rendement logarithmique, affiché en % de variation du prix",
    "ecart_type_log": "écart-type de rendements logarithmiques horaires, affiché en %",
    "log_ratio_prix": "logarithme d'un rapport de prix, affiché en %",
    "ecart_relatif": "écart relatif au prix moyen, affiché en %",
    "points_rsi": "indice de 0 à 100",
    "rapport_prix": "valeur rapportée au prix de clôture, affichée en % du prix",
    "log_ratio_activite": "logarithme d'un rapport à la moyenne 24 h, affiché en multiple de la moyenne",
    "fraction": "part entre 0 et 1, affichée en %",
    "cyclique": "composante cyclique de l'heure UTC, entre -1 et 1",
}


@dataclass(frozen=True)
class FeatureLabel:
    name: str
    label_fr: str
    description_fr: str
    unit: str
    group: str


@dataclass(frozen=True)
class FeatureGroup:
    name: str
    label_fr: str
    features: tuple[str, ...]


_LABELS = (
    FeatureLabel("ret_1h", "Rendement de la dernière heure", "ln(clôture t / clôture t-1h)", "rendement_log", "rendements_recents"),
    FeatureLabel("ret_1h_lag1", "Rendement de l'heure précédente", "rendement horaire de t-1h", "rendement_log", "rendements_recents"),
    FeatureLabel("ret_1h_lag2", "Rendement d'il y a deux heures", "rendement horaire de t-2h", "rendement_log", "rendements_recents"),
    FeatureLabel("ret_6h", "Rendement sur 6 heures", "ln(clôture t / clôture t-6h)", "rendement_log", "tendance"),
    FeatureLabel("ret_24h", "Rendement sur 24 heures", "ln(clôture t / clôture t-24h)", "rendement_log", "tendance"),
    FeatureLabel("volatility_6h", "Volatilité sur 6 heures", "écart-type des 6 derniers rendements horaires", "ecart_type_log", "volatilite"),
    FeatureLabel("volatility_24h", "Volatilité sur 24 heures", "écart-type des 24 derniers rendements horaires", "ecart_type_log", "volatilite"),
    FeatureLabel("hl_range", "Amplitude haut-bas de la bougie", "ln(plus haut / plus bas) de la bougie t", "log_ratio_prix", "volatilite"),
    FeatureLabel("rsi_14", "RSI 14", "indice de force relative de Wilder sur 14 heures", "points_rsi", "momentum"),
    FeatureLabel("macd_hist_rel", "Histogramme MACD relatif", "histogramme MACD 12/26/9 divisé par la clôture", "rapport_prix", "momentum"),
    FeatureLabel("dist_sma_24", "Écart à la moyenne 24 h", "clôture / moyenne mobile 24 h - 1", "ecart_relatif", "tendance"),
    FeatureLabel("dist_sma_72", "Écart à la moyenne 72 h", "clôture / moyenne mobile 72 h - 1", "ecart_relatif", "tendance"),
    FeatureLabel("quote_volume_rel_24h", "Volume échangé relatif", "ln(volume en USDT / sa moyenne 24 h)", "log_ratio_activite", "activite"),
    FeatureLabel("trades_rel_24h", "Nombre de transactions relatif", "ln(transactions / leur moyenne 24 h)", "log_ratio_activite", "activite"),
    FeatureLabel("taker_buy_ratio", "Part des achats agressifs", "volume acheté au marché / volume total", "fraction", "activite"),
    FeatureLabel("hour_sin", "Heure de la journée (sinus)", "sin(2π × heure UTC / 24)", "cyclique", "heure"),
    FeatureLabel("hour_cos", "Heure de la journée (cosinus)", "cos(2π × heure UTC / 24)", "cyclique", "heure"),
)

_GROUP_LABELS = {
    "rendements_recents": "Rendements des dernières heures",
    "tendance": "Tendance du prix",
    "volatilite": "Volatilité",
    "momentum": "Indicateurs de momentum",
    "activite": "Activité du marché",
    "heure": "Heure de la journée",
}

LABELS: dict[str, FeatureLabel] = {label.name: label for label in _LABELS}
GROUPS: tuple[FeatureGroup, ...] = tuple(
    FeatureGroup(name, label, tuple(f for f in FEATURE_NAMES if LABELS[f].group == name))
    for name, label in _GROUP_LABELS.items()
)


def check_labels(feature_names: tuple[str, ...] = FEATURE_NAMES) -> None:
    """Vérifie que chaque variable a exactement un libellé, une unité et un groupe connus."""
    names = tuple(label.name for label in _LABELS)
    if names != tuple(feature_names):
        raise XaiError(f"Libellés XAI désalignés avec les variables du dataset : {names} != {tuple(feature_names)}")
    for label in _LABELS:
        if label.unit not in UNITS:
            raise XaiError(f"Unité inconnue pour {label.name} : {label.unit}")
        if label.group not in _GROUP_LABELS:
            raise XaiError(f"Groupe inconnu pour {label.name} : {label.group}")
    grouped = [f for group in GROUPS for f in group.features]
    if sorted(grouped) != sorted(feature_names) or any(not group.features for group in GROUPS):
        raise XaiError("Chaque variable doit appartenir à exactement un groupe non vide")


check_labels()


def display_value(feature: str, value: float) -> str:
    """Valeur lisible en français (virgule décimale). Les logarithmes sont reconvertis en variations."""
    if feature not in LABELS:
        raise XaiError(f"Variable inconnue : {feature!r}")
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise XaiError(f"Valeur non finie pour {feature} : {value!r}")
    unit = LABELS[feature].unit
    if unit in ("rendement_log", "log_ratio_prix"):
        text = f"{(math.exp(value) - 1) * 100:+.2f} %"
    elif unit in ("ecart_type_log", "fraction"):
        text = f"{value * 100:.2f} %"
    elif unit in ("ecart_relatif", "rapport_prix"):
        text = f"{value * 100:+.3f} %"
    elif unit == "points_rsi":
        text = f"{value:.1f}"
    elif unit == "log_ratio_activite":
        text = f"× {math.exp(value):.2f} la moyenne 24 h"
    else:
        text = f"{value:+.3f}"
    return text.replace(".", ",")
