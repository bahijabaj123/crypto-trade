import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { MarketType, } from './market.service';

export type SimulatedMarket = 'stocks' | 'forex' | 'commodities';

export interface SimulatedOrder {
  id: string;
  date: string;              // ISO 8601
  market: SimulatedMarket;
  symbole: string;
  sens: 'ACHAT' | 'VENTE';
  type: 'MARKET' | 'LIMIT';
  quantite: number;
  prixExecution: number;
  montantTotal: number;
  statut: 'EXECUTE' | 'ANNULE';
}

const STORAGE_KEY = 'crypto-trade-simulated-orders';

@Injectable({ providedIn: 'root' })
export class SimulatedOrdersService {

  private ordersSubject = new BehaviorSubject<SimulatedOrder[]>(this.loadFromStorage());
  orders$: Observable<SimulatedOrder[]> = this.ordersSubject.asObservable();

  /** Tous les ordres simulés (tous marchés confondus) */
  getAll(): SimulatedOrder[] {
    return this.ordersSubject.value;
  }

  /** Ordres filtrés par marché */
  getByMarket(market: SimulatedMarket): SimulatedOrder[] {
    return this.ordersSubject.value.filter(o => o.market === market);
  }

  /** Ajoute un nouvel ordre exécuté */
  addOrder(order: SimulatedOrder): void {
    const updated = [order, ...this.ordersSubject.value];
    this.persist(updated);
    this.ordersSubject.next(updated);
  }

  /** Vide tous les ordres (utile pour reset) */
  clear(): void {
    this.persist([]);
    this.ordersSubject.next([]);
  }

  /** Vide uniquement les ordres d'un marché */
  clearMarket(market: SimulatedMarket): void {
    const updated = this.ordersSubject.value.filter(o => o.market !== market);
    this.persist(updated);
    this.ordersSubject.next(updated);
  }

  // ---------- Persistance ----------
  private loadFromStorage(): SimulatedOrder[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private persist(orders: SimulatedOrder[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    } catch (e) {
      console.warn('localStorage indisponible', e);
    }
  }
}