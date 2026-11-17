import { Injectable } from '@angular/core';

/**
 * COACH CONTEXTUEL (étape 1) — aucune clé d'API : toutes les réponses sont calculées
 * à partir de l'état réel de la partie (positions, prix, chocs, ordres).
 * Même interface plus tard pour l'étape 2 (LLM) : repondre(question, ctx) -> texte.
 */

export interface CtxPosition {
  symbole: string; quantite: number; prixMoyen: number; prixActuel: number;
  valeur: number; pnlPct: number; stopLoss?: number | null; partPortefeuille: number; // 0..1
}
export interface CtxOrdre { sens: 'ACHAT' | 'VENTE'; symbole: string; index: number; prixAlors: number; prixActuel: number; }
export interface CtxCoach {
  valeurTotale: number; solde: number; pnl: number; pnlPct: number;
  positions: CtxPosition[];
  actifCourant: string;
  variation: Record<string, number>;        // % depuis le début de la séance
  choc: Record<string, number>;             // % de choc cumulé (MJ + joueurs + bots)
  variationRecente: Record<string, number>; // % sur les ~10 dernières bougies
  evenementContexte: string;                // bandeau « Contexte »
  flux: string[];                           // derniers événements de la salle (plus récent d'abord)
  ordres: CtxOrdre[];
}
export interface Alerte { id: string; niveau: 'info' | 'attention' | 'danger'; texte: string; }

export interface FinPartie {
  pnl: number; pnlPct: number; valeur: number; ordres: CtxOrdre[];
  drawdownMax: number;        // % (positif)
  concentrationMax: number;   // 0..1
  stopLossUtilise: boolean; nbOrdres: number;
  marchePct: number;          // rendement buy & hold du marché sur la séance
}
export interface ScoreComportement { total: number; risque: number; diversification: number; discipline: number; sangFroid: number; aucunTrade: boolean; }
export interface Debrief { meilleure: string; pire: string; risque: string; cours: string; }

const LEXIQUE: { cles: string[]; titre: string; texte: string }[] = [
  { cles: ['stop-loss', 'stop loss', 'stoploss'], titre: 'Stop-loss', texte: 'Ordre qui vend automatiquement ta position si le prix tombe à un seuil que tu fixes. Il limite la perte maximale par trade. Règle courante : ne pas risquer plus de 1 à 2 % du capital par trade.' },
  { cles: ['take-profit', 'take profit', 'takeprofit'], titre: 'Take-profit', texte: 'Ordre qui vend automatiquement quand le gain visé est atteint. Il évite de « rendre » un gain par avidité.' },
  { cles: ['diversif'], titre: 'Diversification', texte: 'Répartir le capital sur plusieurs actifs pour qu\'une seule mauvaise nouvelle ne ruine pas tout. Attention : en krach, les cryptos chutent souvent ensemble (corrélation qui monte vers 1).' },
  { cles: ['var ', 'value at risk', 'valeur a risque'], titre: 'VaR', texte: 'Perte maximale qu\'on ne dépasse pas avec une probabilité donnée (ex. 95 %) sur un horizon donné. Elle ne dit rien de ce qui arrive dans les 5 % restants : c\'est pour ça qu\'on regarde aussi la perte moyenne au-delà (Expected Shortfall).' },
  { cles: ['volatilit'], titre: 'Volatilité', texte: 'Mesure de l\'ampleur des variations du prix (écart-type des rendements). Plus elle est élevée, plus le risque, mais aussi les opportunités, sont grands.' },
  { cles: ['fomo'], titre: 'FOMO', texte: 'Fear Of Missing Out : acheter parce que « ça monte et je ne veux pas rater ça ». C\'est typiquement acheter près d\'un sommet.' },
  { cles: ['liquidit'], titre: 'Liquidité', texte: 'Facilité à acheter ou vendre sans bouger le prix. Dans cette salle, un gros ordre déplace le prix : c\'est l\'impact de marché.' },
  { cles: ['impact'], titre: 'Impact de marché', texte: 'Un gros ordre déplace le prix contre toi : tu achètes plus cher, tu vends moins cher. Plus l\'ordre est gros par rapport à la liquidité, plus l\'effet est fort. Découper un gros ordre en plusieurs petits limite ce coût.' },
  { cles: ['krach', 'crash'], titre: 'Krach', texte: 'Chute rapide et massive des prix, souvent amplifiée par des ventes de panique et des liquidations en cascade. Les stop-loss et une exposition modérée sont tes meilleures protections.' },
  { cles: ['levier'], titre: 'Effet de levier', texte: 'Trader avec de l\'argent emprunté : il amplifie gains ET pertes. Une baisse de 20 % sur une position à levier ×5 efface tout le capital engagé.' },
  { cles: ['pnl', 'profit and loss'], titre: 'P&L', texte: 'Profit and Loss : gain ou perte. Latent tant que la position est ouverte, réalisé quand tu la fermes.' }
];

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
const f1 = (n: number) => n.toFixed(1);
const sg = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(1);

@Injectable({ providedIn: 'root' })
export class CoachService {
  /** Alertes déjà émises (id -> instant) pour ne pas se répéter. */
  private emises = new Map<string, number>();
  private readonly PAUSE_MS = 60_000;

  readonly suggestions = [
    'Quel est mon risque ?',
    'Pourquoi le prix bouge ?',
    'Mon pire trade ?',
    'Explique l\'événement',
    'Que dois-je faire ?'
  ];

  /* ------------------------------------------------------------ ALERTES PROACTIVES */
  alertes(ctx: CtxCoach): Alerte[] {
    const out: Alerte[] = [];
    const total = ctx.valeurTotale || 1;

    for (const p of ctx.positions) {
      if (p.partPortefeuille >= 0.7)
        out.push({ id: 'conc-' + p.symbole, niveau: 'danger',
          texte: `${p.symbole} représente ${Math.round(p.partPortefeuille * 100)} % de ton portefeuille. Si cet actif chute de 20 %, tu perds ${f1(p.partPortefeuille * 20)} % au total. Pense à alléger ou à diversifier.` });
      if (!p.stopLoss && p.partPortefeuille >= 0.3)
        out.push({ id: 'sl-' + p.symbole, niveau: 'attention',
          texte: `Ta position ${p.symbole} (${Math.round(p.partPortefeuille * 100)} % du portefeuille) n'a pas de stop-loss. Un krach soudain n'aurait aucune limite.` });
      const choc = ctx.choc[p.symbole] ?? 0;
      if (choc <= -10)
        out.push({ id: 'choc-' + p.symbole + '-' + Math.round(choc / 10), niveau: 'danger',
          texte: `Choc de ${f1(choc)} % sur ${p.symbole}, que tu détiens (${Math.round(p.partPortefeuille * 100)} % du portefeuille). Vends-tu, tiens-tu, ou renforces-tu ? Décide avec un plan, pas par panique.` });
      if (choc >= 10)
        out.push({ id: 'pump-' + p.symbole + '-' + Math.round(choc / 10), niveau: 'info',
          texte: `${p.symbole} bondit de ${sg(choc)} %. Tu as un gain latent de ${sg(p.pnlPct)} % : un take-profit permettrait de le sécuriser.` });
    }
    if (ctx.solde / total < 0.05 && ctx.positions.length > 0)
      out.push({ id: 'cash', niveau: 'attention', texte: 'Il te reste moins de 5 % de cash : tu ne pourras pas saisir une opportunité ni renforcer en cas de baisse.' });

    // FOMO : dernier ordre = achat après une hausse brutale
    const dernier = ctx.ordres[ctx.ordres.length - 1];
    if (dernier && dernier.sens === 'ACHAT' && (ctx.variationRecente[dernier.symbole] ?? 0) >= 8)
      out.push({ id: 'fomo-' + ctx.ordres.length, niveau: 'attention',
        texte: `Tu viens d'acheter ${dernier.symbole} après une hausse de ${sg(ctx.variationRecente[dernier.symbole])} %. Attention au FOMO : acheter près d'un pic est le piège classique.` });

    // Sur-trading
    if (ctx.ordres.length >= 10 && ctx.ordres.length % 5 === 0)
      out.push({ id: 'overtrade-' + ctx.ordres.length, niveau: 'info',
        texte: `${ctx.ordres.length} ordres passés. Trader trop souvent augmente les frais et les erreurs : as-tu un plan ?` });

    // filtre : n'émettre que les nouvelles / hors pause
    const now = Date.now();
    return out.filter(a => {
      const t = this.emises.get(a.id);
      if (t && now - t < this.PAUSE_MS * (a.id.startsWith('conc') || a.id.startsWith('sl') ? 3 : 1)) return false;
      this.emises.set(a.id, now);
      return true;
    });
  }

  reinitialiser(): void { this.emises.clear(); }

  /* ------------------------------------------------------------ FIN DE PARTIE */
  scoreComportement(f: FinPartie): ScoreComportement {
    const cl = (x: number) => Math.max(0, Math.min(1, x));
    const risque = f.stopLossUtilise ? 25 : 8;
    const diversification = Math.round(25 * (1 - cl((f.concentrationMax - 0.3) / 0.7)));
    const discipline = f.nbOrdres <= 15 ? 25 : Math.max(0, 25 - (f.nbOrdres - 15) * 2);
    const sangFroid = Math.round(25 * (1 - cl((f.drawdownMax - 10) / 30)));
    const aucunTrade = f.nbOrdres === 0;
    return { total: aucunTrade ? 0 : risque + diversification + discipline + sangFroid, risque, diversification, discipline, sangFroid, aucunTrade };
  }

  debrief(f: FinPartie): Debrief {
    if (!f.nbOrdres) return { meilleure: 'Tu n\'as passé aucun ordre.', pire: 'Observer est une décision, mais on n\'apprend qu\'en pratiquant.', risque: 'Aucun risque pris, aucun gain possible.', cours: 'Fondamentaux : « Market Order » dans la Formation Trading.' };
    const notes = f.ordres.map(o => ({ o, r: (o.sens === 'ACHAT' ? o.prixActuel / o.prixAlors : o.prixAlors / o.prixActuel) * 100 - 100 })).sort((a, b) => a.r - b.r);
    const fmt = (n: { o: CtxOrdre; r: number }) => `${n.o.sens === 'ACHAT' ? 'Achat' : 'Vente'} ${n.o.symbole} à ${n.o.prixAlors.toFixed(2)} $ → ${sg(n.r)} % jusqu'à la fin`;
    const vsMarche = f.pnlPct - f.marchePct;
    const risque = `Baisse maximale de ${f1(f.drawdownMax)} %, concentration max ${Math.round(f.concentrationMax * 100)} %, stop-loss ${f.stopLossUtilise ? 'utilisé' : 'jamais utilisé'}. ` +
      `Tu fais ${vsMarche >= 0 ? f1(vsMarche) + ' pts de mieux' : f1(-vsMarche) + ' pts de moins'} que le marché (${sg(f.marchePct)} %).`;
    const cours = !f.stopLossUtilise ? 'Gestion des Risques : Stop Loss et Position sizing.'
      : f.concentrationMax > 0.7 ? 'Gestion des Risques : Diversification.'
      : f.drawdownMax > 25 ? 'Gestion des Risques : Drawdown.' : 'Trading Avancé : Sharpe et VaR.';
    return { meilleure: fmt(notes[notes.length - 1]), pire: fmt(notes[0]), risque, cours };
  }

  /* ------------------------------------------------------------ RÉPONSES */
  repondre(question: string, ctx: CtxCoach): string {
    const q = norm(question);

    // 1) concept pédagogique : « c'est quoi X ? »
    for (const l of LEXIQUE)
      if (l.cles.some(c => q.includes(norm(c)))) return `${l.titre} — ${l.texte}`;

    // salutations
    if (/^(bonjour|salut|hello|coucou|hey|bonsoir|cc)\b/.test(q))
      return `Salut ! Ta valeur : ${ctx.valeurTotale.toFixed(0)} $ (${sg(ctx.pnlPct)} %). Demande-moi ton risque, pourquoi un prix bouge, ou un concept (stop-loss, VaR…).`;

    // 2) intentions liées à la partie
    if (/(risque|expos|danger|protege)/.test(q)) return this.risque(ctx);
    if (/(pourquoi|prix|chute|baisse|monte|hausse|bouge|explos|effondr)/.test(q) && !/(perdu|perte)/.test(q)) return this.pourquoiPrix(ctx, this.actifCite(q, ctx));
    if (/(pire|meilleur|erreur|decision|trade)/.test(q)) return this.decisions(ctx);
    if (/(evenement|contexte|news|actualite|se passe)/.test(q)) return this.evenement(ctx);
    if (/(perdu|perte|pourquoi.*pnl)/.test(q)) return this.pourquoiPerte(ctx);
    if (/(score|pnl|combien|gagne|resultat)/.test(q)) return this.score(ctx);
    if (/(faire|conseil|strategie|dois|quoi)/.test(q)) return this.conseil(ctx);
    if (/(cours|formation|apprendre)/.test(q)) return this.cours(ctx);

    return 'Je peux t\'aider sur : ton risque, pourquoi un prix bouge, tes meilleures et pires décisions, l\'événement en cours, ou un concept (stop-loss, VaR, FOMO, impact…). Essaie un des boutons ci-dessous.';
  }

  private risque(c: CtxCoach): string {
    if (!c.positions.length) return `Tu n'as aucune position : ton risque est nul, mais ton cash (${c.solde.toFixed(0)} $) ne travaille pas. Si tu entres, commence par une petite taille (10 à 20 % du capital).`;
    const top = [...c.positions].sort((a, b) => b.partPortefeuille - a.partPortefeuille)[0];
    const sansSL = c.positions.filter(p => !p.stopLoss);
    const expo = c.positions.reduce((s, p) => s + p.partPortefeuille, 0);
    let t = `Exposition totale : ${Math.round(expo * 100)} % du portefeuille investi.\nPlus grosse position : ${top.symbole} (${Math.round(top.partPortefeuille * 100)} %).`;
    t += `\nSi ${top.symbole} perd 20 %, tu perds environ ${f1(top.partPortefeuille * 20)} % du total.`;
    t += sansSL.length ? `\nSans stop-loss : ${sansSL.map(p => p.symbole).join(', ')}.` : '\nToutes tes positions ont un stop-loss : bien.';
    t += c.positions.length === 1 ? '\nTu n\'as qu\'un actif : aucune diversification.' : '';
    return t;
  }

  /** Actif cité dans la question (eth, bitcoin…) ; sinon l'actif sélectionné. */
  private actifCite(q: string, c: CtxCoach): string {
    const alias: Record<string, string> = { bitcoin: 'BTC', ethereum: 'ETH', ether: 'ETH', ripple: 'XRP', solana: 'SOL', dogecoin: 'DOGE', litecoin: 'LTC', binance: 'BNB' };
    for (const sym of Object.keys(c.variation)) {
      const court = sym.replace(/USDT$/, '').toLowerCase();
      if (new RegExp('\\b' + court + '\\b').test(q)) return sym;
    }
    for (const [nom, court] of Object.entries(alias)) {
      if (q.includes(nom)) { const s = Object.keys(c.variation).find(k => k.startsWith(court)); if (s) return s; }
    }
    return c.actifCourant;
  }

  private pourquoiPrix(c: CtxCoach, s: string = c.actifCourant): string {
    const v = c.variation[s] ?? 0, choc = c.choc[s] ?? 0;
    const base = ((1 + v / 100) / (1 + choc / 100) - 1) * 100;
    let t = `${s} : ${sg(v)} % depuis le début de la séance.`;
    t += `\n• Marché historique : ${sg(base)} %`;
    t += `\n• Chocs de la salle (MJ, joueurs, bots) : ${sg(choc)} %`;
    const recents = c.flux.filter(e => /ÉVÉNEMENT|NEWS|🤖|ACHETÉ|VENDU/.test(e)).slice(0, 3);
    if (recents.length) t += `\nDerniers faits :\n- ` + recents.join('\n- ');
    if (Math.abs(choc) < 1) t += `\nLe mouvement vient surtout du scénario historique, pas des joueurs.`;
    return t;
  }

  private decisions(c: CtxCoach): string {
    if (!c.ordres.length) return 'Tu n\'as encore passé aucun ordre : rien à analyser.';
    const notes = c.ordres.map(o => ({
      o, r: (o.sens === 'ACHAT' ? o.prixActuel / o.prixAlors : o.prixAlors / o.prixActuel) * 100 - 100
    })).sort((a, b) => a.r - b.r);
    const pire = notes[0], meilleur = notes[notes.length - 1];
    const fmt = (n: typeof pire) => `${n.o.sens === 'ACHAT' ? 'Achat' : 'Vente'} ${n.o.symbole} à ${n.o.prixAlors.toFixed(2)} $ → ${sg(n.r)} % depuis`;
    return `Meilleure décision : ${fmt(meilleur)}.\nPire décision : ${fmt(pire)}.\n` +
      (pire.r < -5 ? 'Pour la pire : avais-tu un stop-loss ou un plan de sortie ?' : 'Aucune erreur majeure pour l\'instant.');
  }

  private evenement(c: CtxCoach): string {
    let t = `Contexte : ${c.evenementContexte}`;
    const f = c.flux.filter(e => /ÉVÉNEMENT|NEWS/.test(e))[0];
    if (f) t += `\nDernier événement du MJ : ${f}`;
    const expo = c.positions.map(p => `${p.symbole} ${Math.round(p.partPortefeuille * 100)} %`).join(', ');
    t += expo ? `\nTon exposition : ${expo}. Réagis selon ton plan, pas à l'émotion.` : '\nTu n\'as pas de position : tu observes, c\'est aussi une décision.';
    return t;
  }

  private pourquoiPerte(c: CtxCoach): string {
    if (c.pnl >= 0) return `Tu n'es pas en perte : ${sg(c.pnl)} $ (${sg(c.pnlPct)} %).`;
    const pires = [...c.positions].sort((a, b) => a.pnlPct - b.pnlPct)[0];
    let t = `Perte actuelle : ${c.pnl.toFixed(2)} $ (${f1(c.pnlPct)} %).`;
    if (pires) t += `\nLa plus touchée : ${pires.symbole} (${sg(pires.pnlPct)} %).`;
    if (c.positions.some(p => !p.stopLoss)) t += '\nTu n\'as pas de stop-loss sur toutes tes positions : c\'est la première cause de grosses pertes.';
    const choc = c.positions.map(p => ({ s: p.symbole, v: c.choc[p.symbole] ?? 0 })).sort((a, b) => a.v - b.v)[0];
    if (choc && choc.v <= -5) t += `\n${choc.s} a subi un choc de ${f1(choc.v)} % dans la salle.`;
    return t;
  }

  private score(c: CtxCoach): string {
    return `Valeur totale : ${c.valeurTotale.toFixed(2)} $ — P&L ${sg(c.pnl)} $ (${sg(c.pnlPct)} %). Cash : ${c.solde.toFixed(2)} $.`;
  }

  private conseil(c: CtxCoach): string {
    const L: string[] = [];
    const top = [...c.positions].sort((a, b) => b.partPortefeuille - a.partPortefeuille)[0];
    if (top && top.partPortefeuille > 0.6) L.push(`Allège ${top.symbole} : il pèse ${Math.round(top.partPortefeuille * 100)} %.`);
    for (const p of c.positions.filter(p => !p.stopLoss)) L.push(`Place un stop-loss sur ${p.symbole} (par ex. à ${(p.prixActuel * 0.93).toFixed(2)} $, soit -7 %).`);
    for (const p of c.positions.filter(p => p.pnlPct > 10)) L.push(`${p.symbole} est à ${sg(p.pnlPct)} % : envisage de sécuriser une partie du gain.`);
    if (!c.positions.length) L.push('Commence petit (10 à 20 % du capital) sur un actif, avec un stop-loss.');
    if (!L.length) L.push('Ton portefeuille est équilibré : garde ton plan et évite de sur-trader.');
    return L.map(x => '• ' + x).join('\n') + '\n(Conseil pédagogique, pas un conseil financier.)';
  }

  private cours(c: CtxCoach): string {
    if (c.positions.some(p => !p.stopLoss)) return 'Je te recommande le module « Gestion des risques » (stop-loss, taille de position) dans la Formation.';
    return 'Je te recommande le module « Psychologie du trader » dans la Formation pour travailler la discipline.';
  }
}