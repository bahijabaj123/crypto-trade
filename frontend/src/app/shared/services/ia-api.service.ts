import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import {
  CodeErreurIa,
  ErreurIa,
  FamilleErreurIa,
  ModelInfoIa,
  PredictResponse,
  SanteIa,
} from '../models/ia.models';
import { IA_API_URL, IA_INTERVAL, IA_SYMBOL } from './ia-api-config';

/** Erreur typée du conseiller IA : jamais une prédiction inventée. */
export class IaApiError extends Error {
  readonly famille: FamilleErreurIa;
  readonly status: number;
  readonly code: CodeErreurIa | string;
  readonly horodatage: string | null;

  constructor(init: {
    famille: FamilleErreurIa;
    message: string;
    status: number;
    code: CodeErreurIa | string;
    horodatage?: string | null;
  }) {
    super(init.message);
    this.name = 'IaApiError';
    this.famille = init.famille;
    this.status = init.status;
    this.code = init.code;
    this.horodatage = init.horodatage ?? null;
  }
}

/**
 * Client HTTP du service FastAPI.
 * Lecture seule : health, model-info, predict. Aucun ordre, aucune bougie envoyée.
 */
@Injectable({ providedIn: 'root' })
export class IaApiService {
  private readonly http = inject(HttpClient);
  readonly symbol = IA_SYMBOL;
  readonly interval = IA_INTERVAL;

  health(): Observable<SanteIa> {
    return this.http.get<SanteIa>(`${IA_API_URL}/health`).pipe(catchError(relayerErreurIa));
  }

  modelInfo(): Observable<ModelInfoIa> {
    return this.http.get<ModelInfoIa>(`${IA_API_URL}/model-info`).pipe(catchError(relayerErreurIa));
  }

  /** Dernière heure close BTCUSDT 1 h. ``explain`` ajoute le JSON xai-1.0. */
  predict(explain: boolean): Observable<PredictResponse> {
    return this.http
      .get<PredictResponse>(`${IA_API_URL}/predict`, {
        params: {
          symbol: IA_SYMBOL,
          explain: explain ? 'true' : 'false',
        },
      })
      .pipe(catchError(relayerErreurIa));
  }
}

export function relayerErreurIa(erreur: unknown): Observable<never> {
  return throwError(() => toIaApiError(erreur));
}

/** Traduit une erreur HTTP en IaApiError, sans fabriquer de prédiction. */
export function toIaApiError(erreur: unknown): IaApiError {
  if (erreur instanceof IaApiError) {
    return erreur;
  }
  if (!(erreur instanceof HttpErrorResponse)) {
    return new IaApiError({
      famille: 'inconnue',
      message: 'Une erreur inattendue s\'est produite.',
      status: 0,
      code: 'ERREUR_INTERNE',
    });
  }
  if (erreur.status === 0) {
    return new IaApiError({
      famille: 'serveur_arrete',
      message:
        "Le conseiller IA n'est pas joignable. Vérifiez que FastAPI écoute sur 127.0.0.1:8000.",
      status: 0,
      code: 'SERVEUR_ARRETE',
    });
  }
  const corps = lireCorpsErreur(erreur.error);
  const code = corps?.code ?? `HTTP_${erreur.status}`;
  const message = corps?.message || `Erreur du service IA (${erreur.status}).`;
  return new IaApiError({
    famille: familleDepuisCode(code, erreur.status),
    message,
    status: erreur.status,
    code,
    horodatage: corps?.horodatage ?? null,
  });
}

function lireCorpsErreur(raw: unknown): Partial<ErreurIa> | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Partial<ErreurIa>;
  }
  return null;
}

function familleDepuisCode(code: string, status: number): FamilleErreurIa {
  switch (code) {
    case 'MODELE_INDISPONIBLE':
      return 'modele_indisponible';
    case 'DONNEES_NON_A_JOUR':
      return 'donnees_perimees';
    case 'MARCHE_INDISPONIBLE':
    case 'MARCHE_DELAI_DEPASSE':
    case 'HISTORIQUE_INSUFFISANT':
      return 'marche_indisponible';
    case 'DONNEES_MARCHE_INVALIDES':
      return 'erreur_marche';
    case 'EXPLICATION_INCOHERENTE':
      return 'explication_incoherente';
    case 'ENTREE_INVALIDE':
    case 'SYMBOLE_NON_PRIS_EN_CHARGE':
      return 'entree_invalide';
    default:
      if (status === 503) {
        return 'modele_indisponible';
      }
      if (status === 502 || status === 504) {
        return status === 502 ? 'erreur_marche' : 'marche_indisponible';
      }
      return 'inconnue';
  }
}
