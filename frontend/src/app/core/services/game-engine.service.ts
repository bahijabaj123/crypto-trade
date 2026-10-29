import { Injectable, signal } from '@angular/core';
import { CandleData } from '../models/kline.model';

export interface GamePosition {
  symbole: string;
  quantite: number;
  prixMoyenAchat: number;
  totalInvesti: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
}

export interface GameState {
  solde: number;
  positions: GamePosition[];
  tempsActuel: number;
  tempsRestantSecondes: number;
  jeuEnCours: boolean;
  jeuTermine: boolean;
}

const SOLDE_INITIAL = 10000;

@Injectable({ providedIn: 'root' })
export class GameEngineService {
  readonly state = signal<GameState>({
    solde: SOLDE_INITIAL,
    positions: [],
    tempsActuel: 0,
    tempsRestantSecondes: 0,
    jeuEnCours: false,
    jeuTermine: false,
  });

  private toutesLesDonnees: { [symbol: string]: CandleData[] } = {};
  private actifs: string[] = [];
  private timerId: any = null;

  demarrerJeu(donnees: { [symbol: string]: CandleData[] }, dureeMinutes: number, actifs: string[]): void {
    this.arreterJeu();
    this.toutesLesDonnees = donnees;
    this.actifs = actifs;

    const nbreBougies = donnees[actifs[0]].length;
    // Vitesse : combien de bougies passent par seconde ?
    const bougiesParSeconde = nbreBougies / (dureeMinutes * 60);
    
    this.state.set({
      solde: SOLDE_INITIAL,
      positions: [],
      tempsActuel: 0,
      tempsRestantSecondes: dureeMinutes * 60, // Temps en secondes réelles
      jeuEnCours: true,
      jeuTermine: false,
    });

    let dernierTick = Date.now();

    this.timerId = setInterval(() => {
      const maintenant = Date.now();
      const deltaSecondes = (maintenant - dernierTick) / 1000;
      dernierTick = maintenant;

      const s = this.state();
      
      // 1. Mise à jour du temps restant
      let nouveauTempsRestant = s.tempsRestantSecondes - deltaSecondes;
      if (nouveauTempsRestant <= 0) {
        nouveauTempsRestant = 0;
        this.terminerJeu();
        return;
      }

      // 2. Mise à jour de l'index des bougies (avance en fonction de la vitesse)
      let nouvelIndex = s.tempsActuel + (bougiesParSeconde * deltaSecondes);
      
      // 3. Vérification des Stop-Loss / Take-Profit
      this.verifierStopLossTakeProfit(Math.floor(nouvelIndex));

      this.state.update(prev => ({
        ...prev,
        tempsActuel: Math.min(nouvelIndex, nbreBougies - 1),
        tempsRestantSecondes: nouveauTempsRestant
      }));
      
    }, 100); // Mise à jour toutes les 100ms pour que le chrono soit fluide
  }

  private verifierStopLossTakeProfit(indexActuel: number): void {
    const s = this.state();
    let soldeModifie = s.solde;
    let positionsModifiees = [...s.positions];
    let aVendre = false;

    positionsModifiees.forEach(pos => {
      const prixActuel = this.getPrixActuel(pos.symbole);
      if (!prixActuel) return;

      // Si le Stop-Loss est touché
      if (pos.stopLoss && prixActuel <= pos.stopLoss) {
        soldeModifie += prixActuel * pos.quantite;
        pos.quantite = 0; // On vend tout
        aVendre = true;
      }
      // Si le Take-Profit est touché
      else if (pos.takeProfit && prixActuel >= pos.takeProfit) {
        soldeModifie += prixActuel * pos.quantite;
        pos.quantite = 0; // On vend tout
        aVendre = true;
      }
    });

    if (aVendre) {
      // On nettoie les positions qui sont à 0
      positionsModifiees = positionsModifiees.filter(p => p.quantite > 0);
      this.state.update(prev => ({ ...prev, solde: soldeModifie, positions: positionsModifiees }));
    }
  }

  arreterJeu(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private terminerJeu(): void {
    this.arreterJeu();
    this.state.update(s => ({ ...s, jeuEnCours: false, jeuTermine: true }));
  }

   getPrixActuel(symbol: string): number | null {
    const data = this.toutesLesDonnees[symbol];
    if (!data || data.length === 0) return null; // 👈 Vérification ajoutée
    
    const index = Math.floor(this.state().tempsActuel);
    const safeIndex = Math.min(index, data.length - 1);
    
    if (!data[safeIndex]) return null; // 👈 Double sécurité
    return data[safeIndex].close;
  }

  acheter(quantite: number, symbol: string, sl?: number, tp?: number): { succes: boolean; message: string } {
    const prix = this.getPrixActuel(symbol);
    if (!prix) return { succes: false, message: 'Prix indisponible.' };
    const montant = prix * quantite;
    if (this.state().solde < montant) return { succes: false, message: 'Fonds insuffisants.' };

    const positions = [...this.state().positions];
    const pos = positions.find(p => p.symbole === symbol);
    
    if (pos) {
      const total = pos.totalInvesti + montant;
      pos.quantite += quantite;
      pos.prixMoyenAchat = total / pos.quantite;
      pos.totalInvesti = total;
      if (sl) pos.stopLoss = sl;
      if (tp) pos.takeProfit = tp;
    } else {
      positions.push({ symbole: symbol, quantite, prixMoyenAchat: prix, totalInvesti: montant, stopLoss: sl, takeProfit: tp });
    }

    this.state.update(s => ({ ...s, solde: s.solde - montant, positions }));
    return { succes: true, message: `Achat de ${quantite} ${symbol} à ${prix.toFixed(2)} $.` };
  }

  vendre(quantite: number, symbol: string): { succes: boolean; message: string } {
    const prix = this.getPrixActuel(symbol);
    const pos = this.state().positions.find(p => p.symbole === symbol);
    if (!prix || !pos || pos.quantite < quantite) return { succes: false, message: 'Actif insuffisant.' };
    
    const montant = prix * quantite;
    pos.quantite -= quantite;
    if (pos.quantite <= 0) this.state.update(s => ({ ...s, positions: s.positions.filter(p => p.symbole !== symbol) }));

    this.state.update(s => ({ ...s, solde: s.solde + montant }));
    return { succes: true, message: `Vente de ${quantite} ${symbol} à ${prix.toFixed(2)} $.` };
  }

  getValeurTotale(): number {
    let total = this.state().solde;
    for (const pos of this.state().positions) {
      const prix = this.getPrixActuel(pos.symbole) || pos.prixMoyenAchat;
      total += prix * pos.quantite;
    }
    return total;
  }

  getPnl(): number {
    return this.getValeurTotale() - SOLDE_INITIAL;
  }
}