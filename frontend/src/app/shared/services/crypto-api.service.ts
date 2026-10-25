import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  AnalyseRisque,
  ApercuRequest,
  ApercuRisque,
  BougieVue,
  CarnetVue,
  ErreurApi,
  OrdreRequest,
  OrdreVue,
  PointValeur,
  PortefeuilleVue,
  ProjectionRisque,
  PrixVue,
  ResultatOrdre,
  ScenarioChoc,
  TransactionVue,
} from '../models/crypto.models';
import { API_URL } from './api-config';

/** Toutes les demandes au backend (portefeuille, ordres, prix) passent par ce service. */
@Injectable({ providedIn: 'root' })
export class CryptoApiService {
  private readonly http = inject(HttpClient);

  getPortefeuille(): Observable<PortefeuilleVue> {
    return this.http.get<PortefeuilleVue>(`${API_URL}/portefeuille`);
  }

  getTransactions(): Observable<TransactionVue[]> {
    return this.http.get<TransactionVue[]>(`${API_URL}/transactions`);
  }

  getOrdres(): Observable<OrdreVue[]> {
    return this.http.get<OrdreVue[]>(`${API_URL}/ordres`);
  }

  passerOrdre(demande: OrdreRequest): Observable<ResultatOrdre> {
    return this.http.post<ResultatOrdre>(`${API_URL}/ordres`, demande);
  }

  /** Annule un ordre en attente. */
  annulerOrdre(id: number): Observable<OrdreVue> {
    return this.http.delete<OrdreVue>(`${API_URL}/ordres/${id}`);
  }

  /** Courbe de la valeur totale du portefeuille dans le temps. */
  getHistoriqueValeur(): Observable<PointValeur[]> {
    return this.http.get<PointValeur[]>(`${API_URL}/portefeuille/historique-valeur`);
  }

  /** Rendement, volatilité, VaR, Sharpe, drawdown, exposition, HHI, score de risque. */
  getRisque(): Observable<AnalyseRisque> {
    return this.http.get<AnalyseRisque>(`${API_URL}/portefeuille/risque`);
  }

  /** Évaluation du risque d'un ordre AVANT de le passer (rien n'est exécuté). */
  apercuRisque(demande: ApercuRequest): Observable<ApercuRisque> {
    return this.http.post<ApercuRisque>(`${API_URL}/risque/apercu`, demande);
  }

  /** Perte du portefeuille si le marché crypto chute de `choc` %. */
  getScenario(choc: number): Observable<ScenarioChoc> {
    return this.http.get<ScenarioChoc>(`${API_URL}/portefeuille/scenario`, { params: { choc } });
  }

  /** Carnet d'ordres du marché : les meilleurs acheteurs et vendeurs. */
  getCarnet(symbole: string, profondeur = 10): Observable<CarnetVue> {
    return this.http.get<CarnetVue>(`${API_URL}/marche/carnet/${symbole}`, { params: { profondeur } });
  }

  /** Chandeliers d'une crypto (du plus ancien au plus récent). */
  getBougies(symbole: string, intervalle: string, limite = 60): Observable<BougieVue[]> {
    return this.http.get<BougieVue[]>(`${API_URL}/marche/bougies/${symbole}`, {
      params: { intervalle, limite },
    });
  }

  /** Projection Monte-Carlo du portefeuille sur `jours` jours. */
  getProjection(jours: number): Observable<ProjectionRisque> {
    return this.http.get<ProjectionRisque>(`${API_URL}/portefeuille/projection`, { params: { jours } });
  }

  getPrix(symboles: string[]): Observable<PrixVue[]> {
    return this.http.get<PrixVue[]>(`${API_URL}/marche/prix`, {
      params: { symboles: symboles.join(',') },
    });
  }
}

/** Transforme une erreur HTTP en phrase lisible pour l'utilisateur. */
export function messageErreur(erreur: unknown): string {
  if (erreur instanceof HttpErrorResponse) {
    if (erreur.status === 0) {
      return "Impossible de joindre le serveur. Vérifiez que le backend est lancé (et que le port dans api-config.ts est le bon).";
    }
    const corps = erreur.error as Partial<ErreurApi> | null;
    if (corps && typeof corps.message === 'string') {
      return corps.message;
    }
    return `Erreur du serveur (${erreur.status}).`;
  }
  return 'Une erreur inattendue est survenue.';
}
