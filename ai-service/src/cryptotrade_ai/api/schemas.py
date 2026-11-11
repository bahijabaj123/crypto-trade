"""Schémas JSON publics de l'API IA : santé, identité du modèle, prédiction predict-1.0.

Aucune donnée de bougie n'est acceptée en entrée. Les chemins locaux et secrets sont exclus.
"""

from __future__ import annotations

from typing import Any

from cryptotrade_ai.api.service import PREDICT_SCHEMA
from cryptotrade_ai.dataset.features import FEATURE_NAMES
from cryptotrade_ai.live.binance_rest import LIVE_INTERVAL, LIVE_SYMBOL
from cryptotrade_ai.training.artifacts import library_versions
from cryptotrade_ai.xai.labels import GROUPS, LABELS
from cryptotrade_ai.xai.schema import SCHEMA_VERSION as XAI_SCHEMA
from cryptotrade_ai.xai.schema import WARNING_MODEL_NOT_MARKET, WARNING_NO_PROFIT

ALLOWED_PREDICT_PARAMS = frozenset({"symbol", "explain"})
HORIZON_HOURS = 1
MODEL_TYPE = "RandomForestClassifier"
INTEGRITY_VERIFIED = "verifiee_au_demarrage"
GROUP_LABELS = {group.name: group.label_fr for group in GROUPS}


def health_payload(*, available: bool, horodatage: str) -> dict[str, Any]:
    """État du service, sans interroger le marché."""
    if available:
        return {"status": "UP", "modele_charge": True, "horodatage": horodatage}
    return {"status": "DOWN", "modele_charge": False, "horodatage": horodatage}


def public_model_info(service: Any) -> dict[str, Any]:
    """Informations pédagogiques du modèle figé chargé en mémoire : 17 variables et seuils."""
    frozen = service.frozen
    policy = frozen.policy
    reference = frozen.reference.as_dict()
    shap_library = getattr(getattr(service, "explainer", None), "library", None)
    shap_version = None
    if isinstance(shap_library, str) and shap_library.lower().startswith("shap "):
        shap_version = shap_library.split(" ", 1)[1]
    elif isinstance(shap_library, str):
        shap_version = shap_library
    signal = bool(policy.signal_authorized)
    margin = float(policy.margin) if signal and policy.margin is not None else None
    versions = library_versions()
    return {
        "dataset_id": reference["dataset_id"],
        "symbol": frozen.symbol,
        "interval": LIVE_INTERVAL,
        "horizon_heures": HORIZON_HOURS,
        "modele": {
            "type": MODEL_TYPE,
            "experiment": reference["experiment"],
            "trial_id": reference["trial_id"],
            "sha256_model": reference["sha256_model"],
            "sha256_selection": reference["sha256_selection"],
            "integrite": INTEGRITY_VERIFIED,
        },
        "politique": {
            "signal_autorise": signal,
            "couverture_cible": policy.target_coverage,
            "marge": margin,
            "seuil_hausse": 0.5 + margin if margin is not None else None,
            "seuil_baisse": 0.5 - margin if margin is not None else None,
            "regle": policy.as_dict()["regle"],
        },
        "variables": [
            {
                "feature": name,
                "label_fr": LABELS[name].label_fr,
                "description_fr": LABELS[name].description_fr,
                "groupe": LABELS[name].group,
                "groupe_label_fr": GROUP_LABELS[LABELS[name].group],
                "unite": LABELS[name].unit,
            }
            for name in FEATURE_NAMES
        ],
        "versions": {
            "schema_predict": PREDICT_SCHEMA,
            "schema_xai": XAI_SCHEMA,
            "scikit-learn": versions.get("scikit-learn"),
            "shap": shap_version,
        },
        "avertissements": [WARNING_MODEL_NOT_MARKET, WARNING_NO_PROFIT],
    }


def assert_predict_query_allowed(names: set[str]) -> None:
    """Refuse tout paramètre autre que symbol et explain (pas de bougies en entrée)."""
    extra = set(names) - ALLOWED_PREDICT_PARAMS
    if extra:
        from cryptotrade_ai.api.errors import ApiError, CODE_INVALID_INPUT, MSG_UNKNOWN_PARAM

        raise ApiError(400, CODE_INVALID_INPUT, MSG_UNKNOWN_PARAM)


def parse_symbol(raw: str | None, *, provided: bool) -> str:
    """N'accepte que BTCUSDT ; absent → BTCUSDT. Jamais une liste de bougies."""
    from cryptotrade_ai.api.errors import ApiError, CODE_UNSUPPORTED_SYMBOL, MSG_UNSUPPORTED_SYMBOL

    if not provided:
        return LIVE_SYMBOL
    symbol = str(raw or "").strip().upper()
    if symbol != LIVE_SYMBOL:
        raise ApiError(400, CODE_UNSUPPORTED_SYMBOL, MSG_UNSUPPORTED_SYMBOL)
    return symbol


def parse_explain(raw: str | None) -> bool:
    """``explain`` facultatif, false par défaut ; seules les valeurs true et false sont lues."""
    from cryptotrade_ai.api.errors import ApiError, CODE_INVALID_INPUT, MSG_EXPLAIN

    if raw is None or str(raw).strip() == "":
        return False
    value = str(raw).strip().lower()
    if value == "true":
        return True
    if value == "false":
        return False
    raise ApiError(400, CODE_INVALID_INPUT, MSG_EXPLAIN)
