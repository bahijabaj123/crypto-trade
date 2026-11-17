import { Injectable, signal, computed, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import {
  BotEtat, BotOrdre, Personnalite, creerBot, decider, appliquerExecution, valeurBot
} from './bot-engine';

const ORDRE_PERSONNALITES: Personnalite[] = ['paniqueux', 'suiveur', 'contrarien', 'baleine', 'teneur'];
const PSEUDOS = ['Kira_Trade', 'MoonBoy', 'Sage_42', 'Orca', 'Atlas_MM', 'Neo_Hodl', 'Zéphyr', 'DiamondK', 'Lynx', 'Titan'];
const MAX_RATTRAPAGE = 10;   // ticks rejoués au maximum si l'onglet était en veille

export interface ConfigBots {
  graine: string;                                  // ex : code de la salle + id du scénario => même bots chez tous
  nbBots: number;                                  // 1 à 10
  capitalJoueur: number;                           // capital de départ d'un joueur
  debutMs?: number;                                // instant de départ commun (ms) ; défaut = maintenant
  symbole: string;
  /** Prix du scénario au tick t (historique, identique pour tous les joueurs). */
  prixReference: (tick: number) => number;
  /** Applique l'ordre dans TON marché (avec ton impact de prix) et renvoie le prix exécuté, ou null si refusé. */
  executerOrdre: (ordre: BotOrdre, bot: BotEtat) => number | null;
}
export interface MessageBot { botId: string; auteur: string; texte: string; tick: number; }

@Injectable({ providedIn: 'root' })
export class LiveBotsService implements OnDestroy {
  readonly bots = signal<BotEtat[]>([]);
  readonly classement = computed(() => this.bots().slice().sort((a, b) => this.valeur(b) - this.valeur(a)));
  readonly ordres$ = new Subject<BotOrdre & { auteur: string; prixExecute: number }>();
  readonly messages$ = new Subject<MessageBot>();

  private cfg?: ConfigBots;
  private timer?: ReturnType<typeof setInterval>;
  private tickCourant = 0;
  private debut = 0;
  private historique: number[] = [];
  private dernierPrix = 0;

  demarrer(cfg: ConfigBots): void {
    this.arreter();
    this.cfg = cfg;
    this.debut = cfg.debutMs ?? Date.now();
    this.historique = [cfg.prixReference(0)];
    this.tickCourant = 0;
    this.dernierPrix = this.historique[0];
    const n = Math.max(1, Math.min(cfg.nbBots, PSEUDOS.length));
    this.bots.set(Array.from({ length: n }, (_, i) =>
      creerBot(`bot${i}`, PSEUDOS[i], ORDRE_PERSONNALITES[i % ORDRE_PERSONNALITES.length], cfg.capitalJoueur, this.historique[0])));
    this.timer = setInterval(() => this.avancer(), 1000);
  }

  arreter(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  ngOnDestroy(): void { this.arreter(); }

  valeur(b: BotEtat): number { return valeurBot(b, this.dernierPrix || 1); }

  personnaliteLabel(p: Personnalite): string {
    return { paniqueux: 'Paniqueux', suiveur: 'Suiveur', contrarien: 'Contrarien', baleine: 'Baleine', teneur: 'Teneur de marché' }[p];
  }

  private avancer(): void {
    if (!this.cfg) return;
    const cible = Math.floor((Date.now() - this.debut) / 1000);
    const depart = Math.max(this.tickCourant + 1, cible - MAX_RATTRAPAGE + 1);
    for (let t = depart; t <= cible; t++) this.tick(t);
  }

  private tick(t: number): void {
    const cfg = this.cfg!;
    // complète l'historique (ticks sautés = on rejoue la référence, pas d'ordres)
    for (let i = this.historique.length; i <= t; i++) this.historique.push(cfg.prixReference(i));
    this.tickCourant = t;
    const prix = this.historique[t];
    this.dernierPrix = prix;

    const liste = this.bots().slice();
    for (let i = 0; i < liste.length; i++) {
      const d = decider(cfg.graine, liste[i], { tick: t, prix, historique: this.historique });
      let b: BotEtat = { ...liste[i], ...d.etat, prochainTick: d.prochainTick };
      if (d.ordre) {
        const px = cfg.executerOrdre(d.ordre, b);
        if (px !== null) {
          b = appliquerExecution(b, d.ordre, px);
          this.ordres$.next({ ...d.ordre, auteur: b.nom, prixExecute: px });
          if (d.ordre.sens === 'VENTE') b = { ...b, dernierTickVente: t };
        }
      }
      if (d.message) this.messages$.next({ botId: b.id, auteur: b.nom, texte: d.message, tick: t });
      liste[i] = b;
    }
    this.bots.set(liste);
  }
}