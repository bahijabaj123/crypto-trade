import { Injectable, signal } from '@angular/core';
import { CandleData } from '../models/kline.model';
import { OrdreJoueur } from '../models/news-scenarios';

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

/**
 * IMPACT DE MARCHÉ (mode solo) : un ordre déplace le prix.
 *  - impact = COEF_IMPACT × (montant de l'ordre / capital initial), plafonné à IMPACT_MAX
 *  - un achat pousse le prix vers le haut, une vente vers le bas
 *  - l'effet s'estompe peu à peu : il est divisé par e tous les TAU_FRACTION × (durée du scénario)
 * Valeurs choisies pour que l'effet soit bien VISIBLE sur la courbe (démonstration).
 */
const COEF_IMPACT = 0.4;      // ordre = 25 % du capital  ->  +10 % sur le prix
const IMPACT_MAX = 0.25;      // plafond : jamais plus de 25 % pour un seul ordre
const TAU_FRACTION = 0.06;    // durée de vie de l'effet = 6 % du scénario

/** Un ordre passé par le joueur : à quelle bougie, de combien de %. */
interface ImpactOrdre { index: number; delta: number; }

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

  // Impact de marché
  /** Historique des ordres du joueur (sert à mesurer sa réaction aux actualités). */
  ordres: OrdreJoueur[] = [];
  /** Vitesse de la simulation : bougies qui défilent par seconde réelle. */
  bougiesParSeconde = 1;

  private impactActif = false;
  private tau = 1;
  private impacts: { [symbol: string]: ImpactOrdre[] } = {};
  private versionImpact = 0;
  private cacheBougies: { [symbol: string]: { cle: string; bougies: CandleData[] } } = {};

  /** impact = true : les ordres du joueur déplacent la courbe (solo). En multijoueur on passe false. */
  demarrerJeu(donnees: { [symbol: string]: CandleData[] }, dureeMinutes: number, actifs: string[], impact = false): void {
    this.arreterJeu();
    this.impactActif = impact;
    this.ordres = [];
    this.impacts = {};
    this.cacheBougies = {};
    this.versionImpact++;
    this.toutesLesDonnees = donnees;
    this.actifs = actifs;

    const nbreBougies = donnees[actifs[0]].length;
    this.tau = Math.max(1, nbreBougies * TAU_FRACTION);
    // Vitesse : combien de bougies passent par seconde ?
    const bougiesParSeconde = nbreBougies / (dureeMinutes * 60);
    this.bougiesParSeconde = bougiesParSeconde;
    
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

  /** Coefficient multiplicatif dû aux ordres du joueur à la bougie i (1 = aucun effet). */
  private facteurImpact(symbol: string, i: number): number {
    const liste = this.impacts[symbol];
    if (!this.impactActif || !liste || liste.length === 0) return 1;
    let somme = 0;
    for (const o of liste) {
      if (i >= o.index) somme += o.delta * Math.exp(-(i - o.index) / this.tau);
    }
    return Math.max(0.05, 1 + somme);
  }

  getPrixActuel(symbol: string): number | null {
    const data = this.toutesLesDonnees[symbol];
    if (!data || data.length === 0) return null;

    const index = Math.floor(this.state().tempsActuel);
    const safeIndex = Math.min(index, data.length - 1);

    if (!data[safeIndex]) return null;
    return data[safeIndex].close * this.facteurImpact(symbol, safeIndex);
  }

  /** Bougies affichées jusqu'à l'instant présent, AVEC l'effet des ordres du joueur. */
  getBougiesAvecImpact(symbol: string): CandleData[] {
    const data = this.toutesLesDonnees[symbol] || [];
    const fin = Math.min(Math.floor(this.state().tempsActuel), data.length - 1);
    if (fin < 0) return [];
    if (!this.impactActif || !(this.impacts[symbol]?.length)) return data.slice(0, fin + 1);

    // Cache : on ne recalcule que si la bougie courante ou les ordres ont changé
    const cle = fin + '|' + this.versionImpact;
    const c = this.cacheBougies[symbol];
    if (c && c.cle === cle) return c.bougies;

    const bougies = data.slice(0, fin + 1).map((b, i) => {
      const f = this.facteurImpact(symbol, i);
      return f === 1 ? b : { ...b, open: b.open * f, high: b.high * f, low: b.low * f, close: b.close * f };
    });
    this.cacheBougies[symbol] = { cle, bougies };
    return bougies;
  }

  /** Enregistre l'effet d'un ordre sur le prix (sens = +1 achat, -1 vente). Renvoie le % appliqué. */
  private appliquerImpact(symbol: string, montant: number, sens: 1 | -1): number {
    if (!this.impactActif) return 0;
    const delta = sens * Math.min(IMPACT_MAX, COEF_IMPACT * (montant / SOLDE_INITIAL));
    const index = Math.floor(this.state().tempsActuel);
    (this.impacts[symbol] ||= []).push({ index, delta });
    this.versionImpact++;
    return delta * 100;
  }

  acheter(quantite: number, symbol: string, sl?: number, tp?: number): { succes: boolean; message: string } {
    const prix = this.getPrixActuel(symbol);
    if (!prix) return { succes: false, message: 'Prix indisponible.' };
    // L'ordre est exécuté au prix déjà déplacé par sa propre taille (glissement), pour éviter un gain gratuit
    const impactPrevu = this.impactActif ? Math.min(IMPACT_MAX, COEF_IMPACT * (prix * quantite / SOLDE_INITIAL)) : 0;
    const prixExec = prix * (1 + impactPrevu);
    const montant = prixExec * quantite;
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
      positions.push({ symbole: symbol, quantite, prixMoyenAchat: prixExec, totalInvesti: montant, stopLoss: sl, takeProfit: tp });
    }

    this.state.update(s => ({ ...s, solde: s.solde - montant, positions }));
    this.ordres.push({ sens: 'ACHAT', symbole: symbol, index: Math.floor(this.state().tempsActuel) });
    const pct = this.appliquerImpact(symbol, prix * quantite, 1);
    return { succes: true, message: `Achat de ${quantite} ${symbol} à ${prixExec.toFixed(2)} $.` + (pct ? ` Impact marché : +${pct.toFixed(1)} %.` : '') };
  }

  vendre(quantite: number, symbol: string): { succes: boolean; message: string } {
    const prix = this.getPrixActuel(symbol);
    const pos = this.state().positions.find(p => p.symbole === symbol);
    if (!prix || !pos || pos.quantite < quantite) return { succes: false, message: 'Actif insuffisant.' };
    
    const impactPrevu = this.impactActif ? Math.min(IMPACT_MAX, COEF_IMPACT * (prix * quantite / SOLDE_INITIAL)) : 0;
    const prixExec = prix * (1 - impactPrevu);
    const montant = prixExec * quantite;
    pos.quantite -= quantite;
    if (pos.quantite <= 0) this.state.update(s => ({ ...s, positions: s.positions.filter(p => p.symbole !== symbol) }));

    this.state.update(s => ({ ...s, solde: s.solde + montant }));
    this.ordres.push({ sens: 'VENTE', symbole: symbol, index: Math.floor(this.state().tempsActuel) });
    const pct = this.appliquerImpact(symbol, prix * quantite, -1);
    return { succes: true, message: `Vente de ${quantite} ${symbol} à ${prixExec.toFixed(2)} $.` + (pct ? ` Impact marché : ${pct.toFixed(1)} %.` : '') };
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