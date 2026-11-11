"""Explication TreeSHAP d'une prédiction du modèle figé : python scripts\\explain_prediction.py --help

Mode ``historique`` : une seule bougie de la VALIDATION 2025, lue par load_development_data ;
toute bougie du test final (ou hors validation) est refusée. Le choix automatique de la
bougie n'utilise que les probabilités du modèle, jamais les cibles ni les rendements futurs.

Mode ``temps-reel`` : prévu pour expliquer la dernière bougie close, à partir de variables
calculées en direct ; il n'est pas encore implémenté et n'aura pas de limite de date.

Ce script n'écrit aucun fichier et n'exécute aucun ordre.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import numpy as np  # noqa: E402

from cryptotrade_ai.config import resolve_data_dir  # noqa: E402
from cryptotrade_ai.data.binance_archive import sha256_file  # noqa: E402
from cryptotrade_ai.data.klines import ms_to_utc_iso, utc_iso_to_ms  # noqa: E402
from cryptotrade_ai.training import TrainingError  # noqa: E402
from cryptotrade_ai.training.artifacts import SELECTION_FILE, models_root, read_json  # noqa: E402
from cryptotrade_ai.training.config import DEFAULT_TRAINING_CONFIG_PATH, TrainingConfigError, load_training_config  # noqa: E402
from cryptotrade_ai.training.data_loading import load_development_data  # noqa: E402
from cryptotrade_ai.training.decision import ATTENDRE, decide  # noqa: E402
from cryptotrade_ai.xai import XaiError  # noqa: E402
from cryptotrade_ai.xai.explainer import LocalExplainer, load_frozen_model  # noqa: E402

FROZEN_EXPERIMENT = "20261108T122920Z-c3c17310"
FROZEN_TRIAL = "random_forest-max_depth4-min_samples_leaf200"
MODE_HISTORICAL = "historique"
MODE_REALTIME = "temps-reel"
TOP = 5
REPRODUCIBILITY_TOLERANCE = 1e-12
EXIT_REFUSED = 3
EXIT_NOT_IMPLEMENTED = 4


class HistoricalAccessError(XaiError):
    """Bougie refusée en mode historique (test final, entraînement ou hors dataset)."""


def check_historical_time(open_ms: int, bounds_utc: dict) -> None:
    """Seules les bougies de la validation sont explicables en mode historique."""
    bounds = {name: (utc_iso_to_ms(start), utc_iso_to_ms(end)) for name, (start, end) in bounds_utc.items()}
    start, end = bounds["validation"]
    if start <= open_ms < end:
        return
    when = ms_to_utc_iso(open_ms)
    test_start, test_end = bounds["test"]
    if test_start <= open_ms < test_end:
        raise HistoricalAccessError(
            f"{when} appartient au test final 2026, déjà évalué une fois : explication historique refusée"
        )
    if bounds["train"][0] <= open_ms < bounds["train"][1]:
        raise HistoricalAccessError(f"{when} appartient à l'entraînement : seule la validation 2025 est autorisée ici")
    raise HistoricalAccessError(
        f"{when} est hors du dataset : les bougies récentes relèveront du mode temps réel (non implémenté)"
    )


def choose_index(open_time: np.ndarray, states: np.ndarray, requested_ms: int | None) -> int:
    """Bougie demandée, sinon la première bougie chronologique avec HAUSSE ou BAISSE, sinon la première."""
    if requested_ms is not None:
        matches = np.flatnonzero(open_time == requested_ms)
        if not len(matches):
            raise HistoricalAccessError(f"{ms_to_utc_iso(requested_ms)} absente du dataset de validation")
        return int(matches[0])
    signals = np.flatnonzero(states != ATTENDRE)
    return int(signals[0]) if len(signals) else 0


def explain_historical(args) -> int:
    config_path = Path(args.config).resolve()
    data_dir = resolve_data_dir(args.data_dir)
    if args.open_time is not None and not args.open_time.strip():
        raise ValueError("--open-time vide : indiquer une ouverture UTC, ex. 2025-03-01T14:00:00.000Z, ou omettre l'option")
    requested_ms = utc_iso_to_ms(args.open_time) if args.open_time is not None else None
    timings = {}

    clock = time.perf_counter()
    frozen = load_frozen_model(
        data_dir, config_path=config_path, expected_experiment=FROZEN_EXPERIMENT, expected_trial=FROZEN_TRIAL
    )
    timings["chargement et contrôle du modèle figé"] = time.perf_counter() - clock
    dataset = frozen_dataset(data_dir, frozen)
    if requested_ms is not None:
        check_historical_time(requested_ms, dataset["bornes_ensembles_utc"])

    clock = time.perf_counter()
    data = load_development_data(data_dir, load_training_config(config_path))
    timings["lecture de la validation (load_development_data)"] = time.perf_counter() - clock
    bounds = data.identity.split_bounds_utc
    if data.identity.dataset_sha256 != dataset["sha256_dataset_csv"] or bounds != dataset["bornes_ensembles_utc"]:
        raise XaiError("Le dataset diffère de celui de la sélection figée")
    if tuple(data.identity.features) != frozen.features:
        raise XaiError("Ordre des variables du dataset différent de celui du modèle figé")

    validation = data.validation
    clock = time.perf_counter()
    probabilities = frozen.model.predict_proba(validation.X)[:, 1]
    states = decide(probabilities, frozen.policy)
    timings[f"probabilités des {len(validation.X)} bougies de validation"] = time.perf_counter() - clock

    index = choose_index(validation.open_time, states, requested_ms)
    open_ms = int(validation.open_time[index])
    check_historical_time(open_ms, bounds)
    values = dict(zip(frozen.features, (float(v) for v in validation.X[index])))

    clock = time.perf_counter()
    explainer = LocalExplainer(frozen)
    timings["initialisation de TreeSHAP"] = time.perf_counter() - clock
    clock = time.perf_counter()
    payload = explainer.explain(values, candle_open_time_ms=open_ms, top_k=TOP)
    timings["explication de la bougie (predict_proba + TreeSHAP)"] = time.perf_counter() - clock
    clock = time.perf_counter()
    again = explainer.explain(values, candle_open_time_ms=open_ms, top_k=TOP)
    timings["seconde explication (contrôle de reproductibilité)"] = time.perf_counter() - clock

    if not same_explanation(payload, again):
        raise XaiError("Deux explications de la même bougie diffèrent : résultat non reproductible")
    if abs(payload["prediction"]["probability_up"] - probabilities[index]) > REPRODUCIBILITY_TOLERANCE:
        raise XaiError("Probabilité de l'explication différente de celle calculée sur toute la validation")

    _print_report(payload, frozen, index, len(validation.X), states, requested_ms is None, timings)
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


def same_explanation(first: dict, second: dict) -> bool:
    """Même état, mêmes variables dans le même ordre, valeurs égales à REPRODUCIBILITY_TOLERANCE près.

    Avec n_jobs=-1, predict_proba additionne les arbres en parallèle dans un ordre variable :
    la probabilité peut changer au dernier bit (~1e-16) d'un appel à l'autre.
    """
    rows = zip(first["explanation"]["contributions"], second["explanation"]["contributions"])
    return (
        first["prediction"]["state"] == second["prediction"]["state"]
        and abs(first["prediction"]["probability_up"] - second["prediction"]["probability_up"]) <= REPRODUCIBILITY_TOLERANCE
        and all(
            a["feature"] == b["feature"] and abs(a["contribution"] - b["contribution"]) <= REPRODUCIBILITY_TOLERANCE
            for a, b in rows
        )
    )


def frozen_dataset(data_dir: Path, frozen) -> dict:
    """Bloc ``dataset`` de selection.json, relu seulement si son SHA-256 est celui déjà contrôlé."""
    path = models_root(data_dir, frozen.reference.dataset_id) / SELECTION_FILE
    if sha256_file(path) != frozen.reference.sha256_selection:
        raise XaiError("selection.json a changé depuis le chargement du modèle figé")
    return read_json(path)["dataset"]


def _print_report(payload, frozen, index, n_rows, states, automatic, timings) -> None:
    prediction, explanation = payload["prediction"], payload["explanation"]
    p, base = prediction["probability_up"], explanation["base_value"]
    print("=== Explication XAI réelle — mode historique (validation 2025) ===")
    print(f"Modèle figé       : {frozen.reference.trial_id} ({frozen.reference.experiment})")
    print(f"SHA-256 modèle    : {frozen.reference.sha256_model}")
    print(f"SHA-256 sélection : {frozen.reference.sha256_selection}")
    n_signals = int((states != ATTENDRE).sum())
    if not automatic:
        rule = "demandée explicitement"
    elif not prediction["signal_authorized"]:
        rule = "première bougie de 2025 (signal désactivé par la politique figée : aucune HAUSSE ni BAISSE possible)"
    elif n_signals == 0:
        rule = "première bougie de 2025 (aucune bougie HAUSSE ou BAISSE sur la validation)"
    else:
        rule = "première bougie de 2025 avec HAUSSE ou BAISSE (choix sur les seules probabilités)"
    print(f"Bougie            : n° {index + 1} / {n_rows} — {rule}")
    print(f"Signaux sur 2025  : {n_signals} bougies HAUSSE ou BAISSE sur {n_rows}")
    print(f"Ouverture (UTC)   : {payload['candle_open_time_utc']}")
    print(f"Décision (UTC)    : {payload['decision_time_utc']} (clôture de la bougie)")
    print(f"Probabilité hausse: {p:.6f} ({p * 100:.2f} %)")
    if prediction["signal_authorized"]:
        print(f"Seuils figés      : HAUSSE si p >= {prediction['threshold_up']:.6f} ; BAISSE si p <= {prediction['threshold_down']:.6f}")
    else:
        print("Seuils figés      : aucun — signal désactivé par la politique figée, l'état est toujours ATTENDRE")
    print(f"État              : {prediction['state']}")
    print(f"Valeur de base    : {base:.6f} ({base * 100:.2f} %)")
    print(f"Top {TOP} contributions (points de probabilité) :")
    for row in explanation["contributions"][:TOP]:
        print(
            f"  {row['rank']}. {row['label_fr']:<34} {row['feature']:<22} valeur {row['value_display']:<26}"
            f" {row['contribution'] * 100:+.4f} pt  {row['direction']}"
        )
    rest = sum(r["contribution"] for r in explanation["contributions"][TOP:])
    print(f"  ... 12 autres variables : {rest * 100:+.4f} pt au total")
    print(f"Somme des 17      : {explanation['contributions_sum']:+.6f}")
    print(f"Base + somme      : {base + explanation['contributions_sum']:.12f}")
    print(f"Erreur additivité : {explanation['additivity_error']:.3e} (tolérance {explanation['tolerance']:.0e})")
    print(f"Résumé            : {payload['summary_fr']}")
    for warning in payload["warnings"]:
        print(f"Avertissement     : {warning}")
    print("Temps de calcul :")
    for step, seconds in timings.items():
        print(f"  {step:<52} {seconds * 1000:9.1f} ms")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Explique une prédiction du modèle figé (TreeSHAP), sans écrire de fichier.")
    parser.add_argument("--mode", choices=(MODE_HISTORICAL, MODE_REALTIME), default=MODE_HISTORICAL)
    parser.add_argument("--open-time", default=None, help="Ouverture UTC d'une bougie de validation, ex. 2025-03-01T14:00:00.000Z")
    parser.add_argument("--config", default=str(DEFAULT_TRAINING_CONFIG_PATH))
    parser.add_argument("--data-dir", default=None)
    parser.add_argument("--json", action="store_true", help="Affiche aussi la réponse xai-1.0 complète")
    args = parser.parse_args(argv)
    if args.mode == MODE_REALTIME:
        print("Mode temps réel non implémenté : il expliquera la dernière bougie close, calculée en direct.")
        return EXIT_NOT_IMPLEMENTED
    try:
        return explain_historical(args)
    except HistoricalAccessError as exc:
        print(f"REFUSÉ : {exc}")
        return EXIT_REFUSED
    except TrainingConfigError as exc:
        print(f"ERREUR DE CONFIGURATION : {exc}")
        return 2
    except (XaiError, TrainingError, ValueError) as exc:
        print(f"ERREUR : {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
