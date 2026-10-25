import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SimulatedMarket, SimulatedOrder } from './simulated-orders.service';

export interface SimulatedPosition {
  symbole: string;
  market: SimulatedMarket;
  quantite: number;
  prixMoyenAchat: number;
  totalInvesti: number;
}

interface PortfolioState {
  soldeDisponible: number;
  positions: SimulatedPosition[];
}

const STORAGE_KEY = 'crypto-trade-simulated-portfolio';
const SOLDE_INITIAL = 10000; // 10 000 $ virtuels pour les autres marchés

@Injectable({ providedIn: 'root' })
export class SimulatedPortfolioService {
  private stateSubject = new BehaviorSubject<PortfolioState>(this.loadFromStorage());
  state$: Observable<PortfolioState> = this.stateSubject.asObservable();

  get soldeDisponible(): number {
    return this.stateSubject.value.soldeDisponible;
  }

  get positions(): SimulatedPosition[] {
    return this.stateSubject.value.positions;
  }

  /** Enregistre un nouvel ordre (achat ou vente) */
  enregistrerOrdre(ordre: SimulatedOrder): boolean {
    const state = this.stateSubject.value;
    let nouveauSolde = state.soldeDisponible;
    let nouvellesPositions = [...state.positions];

    const positionExistante = nouvellesPositions.find(p => p.symbole === ordre.symbole);

    if (ordre.sens === 'ACHAT') {
      if (nouveauSolde < ordre.montantTotal) {
        return false; // Fonds insuffisants
      }
      nouveauSolde -= ordre.montantTotal;

      if (positionExistante) {
        const nouveauTotal = positionExistante.totalInvesti + ordre.montantTotal;
        const nouvelleQte = positionExistante.quantite + ordre.quantite;
        positionExistante.prixMoyenAchat = nouveauTotal / nouvelleQte;
        positionExistante.totalInvesti = nouveauTotal;
        positionExistante.quantite = nouvelleQte;
      } else {
        nouvellesPositions.push({
          symbole: ordre.symbole,
          market: ordre.market,
          quantite: ordre.quantite,
          prixMoyenAchat: ordre.prixExecution,
          totalInvesti: ordre.montantTotal,
        });
      }
    } else {
      // VENTE
      if (!positionExistante || positionExistante.quantite < ordre.quantite) {
        return false; // Pas assez d'actifs à vendre
      }
      nouveauSolde += ordre.montantTotal;

      positionExistante.quantite -= ordre.quantite;
      positionExistante.totalInvesti -= (positionExistante.prixMoyenAchat * ordre.quantite);

      // Si la position tombe à 0, on la supprime
      if (positionExistante.quantite <= 0.000001) {
        nouvellesPositions = nouvellesPositions.filter(p => p.symbole !== ordre.symbole);
      }
    }

    this.saveToStorage({ soldeDisponible: nouveauSolde, positions: nouvellesPositions });
    return true;
  }

  private loadFromStorage(): PortfolioState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { soldeDisponible: SOLDE_INITIAL, positions: [] };
  }

  private saveToStorage(state: PortfolioState): void {
    this.stateSubject.next(state);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('localStorage indisponible', e);
    }
  }
}