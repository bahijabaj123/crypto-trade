/**
 * MOTEUR DE DÉCISION DES BOTS (TypeScript pur : aucune dépendance Angular).
 *
 * Principe : à chaque tick (1 s), pour chaque bot, decider() renvoie au plus UN ordre.
 * La décision est une fonction PURE de (graine, tick, état du bot, prix de référence du scénario) :
 *   -> deux navigateurs qui connaissent la même graine et le même tick prennent les mêmes décisions.
 * Les signaux utilisent le prix de RÉFÉRENCE (trajectoire historique du scénario, identique pour tous),
 * jamais les ordres des joueurs humains : c'est ce qui garde les bots synchronisés sans serveur.
 *
 * Les seuils sont exprimés en "sigmas" (écarts-types de la volatilité récente) et non en pourcentages :
 * le comportement reste le même que le scénario soit calme (2021) ou violent (Covid).
 */

export type Personnalite = 'paniqueux' | 'suiveur' | 'contrarien' | 'baleine' | 'teneur';
export type Sens = 'ACHAT' | 'VENTE';
export type PhaseBaleine = 'repos' | 'accumulation' | 'pompe' | 'distribution';

export interface BotEtat {
  id: string;
  nom: string;
  personnalite: Personnalite;
  cash: number;
  quantite: number;
  coutTotal: number;            // pour le prix moyen d'achat
  prochainTick: number;         // prochain tick de décision
  dernierTickVente: number;     // pour le "rachat trop tard" du paniqueux
  enRetrait: boolean;           // teneur de marché qui s'est retiré
  phase: PhaseBaleine;          // baleine uniquement
  phaseDebutTick: number;
  prixDebutPhase: number;
  nbAchatsPhase: number;
  nbOrdres: number;
}

export interface Observation {
  tick: number;
  prix: number;                         // prix de référence au tick courant (pour dimensionner l'ordre)
  historique: readonly number[];        // prix de référence, un par tick, index = tick
}

export interface BotOrdre {
  botId: string;
  sens: Sens;
  quantite: number;
  prix: number;
  raison: string;
}

export interface Decision {
  ordre: BotOrdre | null;
  message: string | null;
  prochainTick: number;
  etat: Partial<BotEtat>;               // changements d'état internes (phase, retrait...)
}

/* ---------------------------------------------------------------- aléa déterministe */
function hacher(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Générateur propre à (graine, bot, tick) : ne dépend jamais de l'ordre dans lequel on appelle les bots. */
export function rngPour(graine: string, botId: string, tick: number): () => number {
  return mulberry32(hacher(`${graine}|${botId}|${tick}`));
}

/* ---------------------------------------------------------------- indicateurs */
const MIN_HISTORIQUE = 30;   // pas de décision avant d'avoir 30 ticks d'historique (échauffement)

function sigmaTick(h: readonly number[], t: number, n = 120): number {
  const d = Math.max(1, t - n + 1);
  let s = 0, s2 = 0, k = 0;
  for (let i = d; i <= t; i++) {
    const r = Math.log(h[i] / h[i - 1]);
    s += r; s2 += r * r; k++;
  }
  if (k < 2) return 0;
  const m = s / k;
  return Math.sqrt(Math.max(s2 / k - m * m, 0));
}
/** Rendement sur m ticks exprimé en sigmas : -2 = baisse deux fois plus forte que "normale". */
function zRet(h: readonly number[], t: number, m: number, sig: number): number {
  const i = Math.max(0, t - m);
  if (sig <= 0) return 0;
  return Math.log(h[t] / h[i]) / (sig * Math.sqrt(Math.max(t - i, 1)));
}
function zMoyenne(h: readonly number[], t: number, n: number): number {
  const d = Math.max(0, t - n + 1);
  let s = 0, s2 = 0;
  const k = t - d + 1;
  for (let i = d; i <= t; i++) { s += h[i]; s2 += h[i] * h[i]; }
  const m = s / k, sd = Math.sqrt(Math.max(s2 / k - m * m, 0));
  return sd > 0 ? (h[t] - m) / sd : 0;
}
function arrondi(q: number): number { return Math.floor(q * 10000) / 10000; }

/* ---------------------------------------------------------------- phrases (gratuit, prévisible, vivant) */
const PHRASES: Record<string, string[]> = {
  paniqueux_vend: ['Je sors, ça sent mauvais.', 'Trop risqué, je vends tout.', 'Ça chute ! Je ne reste pas.'],
  paniqueux_rachete: ['Finalement ça remonte, je reviens.', 'Je rachète... un peu tard peut-être.'],
  suiveur_achete: ['Ça monte, je suis le mouvement.', 'Tout le monde achète, moi aussi.'],
  suiveur_vend: ['La tendance se retourne, je coupe.', 'Le vent tourne, je sors.'],
  contrarien_achete: ['Ça baisse : c\'est une occasion.', 'Je renforce, le prix est cassé.'],
  contrarien_vend: ['Trop haut, je prends mes gains.', 'Le marché s\'emballe, je vends.'],
  baleine_accumule: ['...', 'Rien à voir ici.'],
  baleine_pompe: ['Un gros ordre arrive.', 'Je pousse le marché.'],
  baleine_distribue: ['Je prends mes bénéfices.', 'Merci pour la liquidité.'],
  teneur_retrait: ['Trop de volatilité, je me retire.', 'Je retire mes offres le temps que ça se calme.'],
  teneur_retour: ['Le calme revient, je reprends mes cotations.']
};
function phrase(cle: string, rand: () => number): string {
  const l = PHRASES[cle] ?? [''];
  return l[Math.floor(rand() * l.length)];
}

/* ---------------------------------------------------------------- paramètres par personnalité */
export const PARAMS = {
  paniqueux:  { periode: 3, seuilChute: -2.0, seuilRebond: 1.5, attenteRachat: 40, partVente: 1.0, partRachat: 0.5 },
  suiveur:    { periode: 5, seuil: 1.5, partAchat: 0.25, partVente: 0.6 },
  contrarien: { periode: 5, expositionMax: 0.6, seuilAchat: -1.5, seuilAchatFort: -2.5, partAchat: 0.2, partAchatFort: 0.35, seuilVente: 1.5, partVente: 0.5 },
  baleine:    { periode: 4, reposTicks: 120, achatsAccumulation: 3, partAccumulation: 0.10, partPompe: 0.45,
                gainCible: 0.012, dureeMaxDistribution: 80, stop: -0.02, partVenteParOrdre: 0.34 },
  teneur:     { periode: 3, cibleActif: 0.5, bande: 0.05, partOrdre: 0.04, ratioVolRetrait: 2.0 }
} as const;

/** Part de l'actif dans le portefeuille initial, et capital relatif, par personnalité. */
export const PROFIL_INITIAL: Record<Personnalite, { partActif: number; capitalX: number }> = {
  paniqueux: { partActif: 0.5, capitalX: 1 },
  suiveur: { partActif: 0.5, capitalX: 1 },
  contrarien: { partActif: 0.5, capitalX: 1 },
  baleine: { partActif: 0.0, capitalX: 3 },      // la baleine a plus de capital : c'est ce qui la rend dangereuse
  teneur: { partActif: 0.5, capitalX: 2 }
};

export function creerBot(id: string, nom: string, perso: Personnalite, capitalJoueur: number, prixInitial: number): BotEtat {
  const p = PROFIL_INITIAL[perso];
  const capital = capitalJoueur * p.capitalX;
  const valeurActif = capital * p.partActif;
  const quantite = arrondi(valeurActif / prixInitial);
  return {
    id, nom, personnalite: perso,
    cash: capital - quantite * prixInitial, quantite, coutTotal: quantite * prixInitial,
    prochainTick: MIN_HISTORIQUE, dernierTickVente: -9999, enRetrait: false,
    phase: 'repos', phaseDebutTick: 0, prixDebutPhase: prixInitial, nbAchatsPhase: 0, nbOrdres: 0
  };
}

export function valeurBot(b: BotEtat, prix: number): number { return b.cash + b.quantite * prix; }

/* ---------------------------------------------------------------- décision */
export function decider(graine: string, bot: BotEtat, obs: Observation): Decision {
  const { tick, prix, historique: h } = obs;
  const rand = rngPour(graine, bot.id, tick);
  const base = { ordre: null as BotOrdre | null, message: null as string | null, etat: {} as Partial<BotEtat> };

  if (tick < bot.prochainTick || tick < MIN_HISTORIQUE) return { ...base, prochainTick: Math.max(bot.prochainTick, MIN_HISTORIQUE) };

  const sig = sigmaTick(h, tick);
  const periode = PARAMS[bot.personnalite].periode;
  const prochainTick = tick + periode + (rand() < 0.5 ? 0 : 1);   // un peu d'irrégularité
  const valeurTotale = valeurBot(bot, prix);

  const acheter = (part: number, raison: string): BotOrdre | null => {
    const valeur = Math.min(bot.cash, valeurTotale * part);
    const q = arrondi(valeur / prix);
    return q > 0 ? { botId: bot.id, sens: 'ACHAT', quantite: q, prix, raison } : null;
  };
  const vendre = (partPosition: number, raison: string): BotOrdre | null => {
    const q = arrondi(bot.quantite * partPosition);
    return q > 0 ? { botId: bot.id, sens: 'VENTE', quantite: q, prix, raison } : null;
  };

  /* ----- Le Paniqueux : vend sur une chute brutale, rachète tard après le rebond ----- */
  if (bot.personnalite === 'paniqueux') {
    const P = PARAMS.paniqueux;
    const z = zRet(h, tick, 20, sig);
    if (bot.quantite > 0 && z <= P.seuilChute) {
      const o = vendre(P.partVente, `chute de ${z.toFixed(1)} sigmas`);
      if (o) return { ordre: o, message: phrase('paniqueux_vend', rand), prochainTick, etat: { dernierTickVente: tick } };
    }
    if (bot.quantite === 0 && tick - bot.dernierTickVente >= P.attenteRachat && zRet(h, tick, 40, sig) >= P.seuilRebond) {
      const o = acheter(P.partRachat, 'rachat après rebond');
      if (o) return { ordre: o, message: phrase('paniqueux_rachete', rand), prochainTick, etat: {} };
    }
    return { ...base, prochainTick };
  }

  /* ----- Le Suiveur : achète ce qui monte, vend ce qui baisse ----- */
  if (bot.personnalite === 'suiveur') {
    const P = PARAMS.suiveur;
    const z30 = zRet(h, tick, 30, sig), z90 = zRet(h, tick, 90, sig);
    if (z30 >= P.seuil && z90 > 0) {
      const o = acheter(P.partAchat, `tendance haussière (${z30.toFixed(1)} sigmas)`);
      if (o) return { ordre: o, message: phrase('suiveur_achete', rand), prochainTick, etat: {} };
    }
    if (z30 <= -P.seuil && bot.quantite > 0) {
      const o = vendre(P.partVente, `tendance baissière (${z30.toFixed(1)} sigmas)`);
      if (o) return { ordre: o, message: phrase('suiveur_vend', rand), prochainTick, etat: {} };
    }
    return { ...base, prochainTick };
  }

  /* ----- Le Contrarien : achète les baisses (même en cascade), vend les excès ----- */
  if (bot.personnalite === 'contrarien') {
    const P = PARAMS.contrarien;
    const z = zMoyenne(h, tick, 60);
    const expo = (bot.quantite * prix) / valeurTotale;
    if (z <= P.seuilAchat && expo < P.expositionMax) {
      const o = acheter(z <= P.seuilAchatFort ? P.partAchatFort : P.partAchat, `prix ${z.toFixed(1)} sigmas sous sa moyenne`);
      if (o) return { ordre: o, message: phrase('contrarien_achete', rand), prochainTick, etat: {} };
    }
    const prixMoyen = bot.quantite > 0 ? bot.coutTotal / bot.quantite : 0;
    if (bot.quantite > 0 && (z >= P.seuilVente || (prixMoyen > 0 && prix / prixMoyen - 1 > 0.03))) {
      const o = vendre(P.partVente, 'prise de gains');
      if (o) return { ordre: o, message: phrase('contrarien_vend', rand), prochainTick, etat: {} };
    }
    return { ...base, prochainTick };
  }

  /* ----- La Baleine : accumule discrètement, pousse le prix, vend dans l'euphorie ----- */
  if (bot.personnalite === 'baleine') {
    const P = PARAMS.baleine;
    const duree = tick - bot.phaseDebutTick;
    if (bot.phase === 'repos') {
      if (duree >= P.reposTicks && Math.abs(zRet(h, tick, 30, sig)) < 1.5)
        return { ...base, prochainTick, etat: { phase: 'accumulation', phaseDebutTick: tick, prixDebutPhase: prix, nbAchatsPhase: 0 } };
      return { ...base, prochainTick };
    }
    if (bot.phase === 'accumulation') {
      if (bot.nbAchatsPhase >= P.achatsAccumulation)
        return { ...base, prochainTick, etat: { phase: 'pompe', phaseDebutTick: tick } };
      const o = acheter(P.partAccumulation, 'accumulation discrète');
      if (!o) return { ...base, prochainTick, etat: { phase: 'repos', phaseDebutTick: tick } };
      return { ordre: o, message: phrase('baleine_accumule', rand), prochainTick: tick + 12, etat: { nbAchatsPhase: bot.nbAchatsPhase + 1 } };
    }
    if (bot.phase === 'pompe') {
      const o = acheter(P.partPompe, 'gros ordre pour pousser le prix');
      return { ordre: o, message: o ? phrase('baleine_pompe', rand) : null, prochainTick: tick + 6,
               etat: { phase: 'distribution', phaseDebutTick: tick, prixDebutPhase: prix } };
    }
    // distribution
    const gain = prix / bot.prixDebutPhase - 1;
    const prixMoyen = bot.quantite > 0 ? bot.coutTotal / bot.quantite : prix;
    const perte = prix / prixMoyen - 1;
    if (bot.quantite > 0 && (gain >= P.gainCible || duree >= P.dureeMaxDistribution || perte <= P.stop)) {
      const part = bot.quantite * prix < valeurTotale * 0.02 ? 1 : P.partVenteParOrdre;
      const o = vendre(part, 'distribution');
      const fini = !o || arrondi(bot.quantite * (1 - part)) === 0;
      return { ordre: o, message: o ? phrase('baleine_distribue', rand) : null, prochainTick: tick + 4,
               etat: fini ? { phase: 'repos', phaseDebutTick: tick } : {} };
    }
    if (bot.quantite === 0) return { ...base, prochainTick, etat: { phase: 'repos', phaseDebutTick: tick } };
    return { ...base, prochainTick };
  }

  /* ----- Le Teneur de marché : garde ~50 % en actif, se retire si la volatilité explose ----- */
  {
    const P = PARAMS.teneur;
    const sigLong = sigmaTick(h, tick, 600);
    const volEleve = sigLong > 0 && sig / sigLong > P.ratioVolRetrait;
    if (volEleve && !bot.enRetrait)
      return { ...base, message: phrase('teneur_retrait', rand), prochainTick, etat: { enRetrait: true } };
    if (!volEleve && bot.enRetrait)
      return { ...base, message: phrase('teneur_retour', rand), prochainTick, etat: { enRetrait: false } };
    if (volEleve) return { ...base, prochainTick };
    const part = (bot.quantite * prix) / valeurTotale;
    if (part > P.cibleActif + P.bande) {
      const o = vendre(Math.min(1, (valeurTotale * P.partOrdre) / (bot.quantite * prix)), 'rééquilibrage');
      if (o) return { ordre: o, message: null, prochainTick, etat: {} };
    }
    if (part < P.cibleActif - P.bande) {
      const o = acheter(P.partOrdre, 'rééquilibrage');
      if (o) return { ordre: o, message: null, prochainTick, etat: {} };
    }
    return { ...base, prochainTick };
  }
}

/** Applique l'exécution d'un ordre à l'état du bot (prix exécuté = prix après impact). */
export function appliquerExecution(bot: BotEtat, o: BotOrdre, prixExecute: number): BotEtat {
  const valeur = o.quantite * prixExecute;
  if (o.sens === 'ACHAT') {
    if (valeur > bot.cash + 1e-9) return bot;
    return { ...bot, cash: bot.cash - valeur, quantite: bot.quantite + o.quantite, coutTotal: bot.coutTotal + valeur, nbOrdres: bot.nbOrdres + 1 };
  }
  const q = Math.min(o.quantite, bot.quantite);
  const prixMoyen = bot.quantite > 0 ? bot.coutTotal / bot.quantite : 0;
  return { ...bot, cash: bot.cash + q * prixExecute, quantite: bot.quantite - q,
           coutTotal: Math.max(bot.coutTotal - prixMoyen * q, 0), nbOrdres: bot.nbOrdres + 1 };
}