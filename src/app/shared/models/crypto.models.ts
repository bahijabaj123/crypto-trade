/**
 * Les formats de données échangés avec le backend Spring Boot.
 * Ils correspondent aux "DTO" Java du dossier backend/dto.
 */

export type SensOrdre = 'ACHAT' | 'VENTE';
export type TypeOrdre = 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT';
export type StatutPosition = 'OUVERTE' | 'FERMEE';

export interface PositionVue {
  id: number;
  symbole: string;
  quantite: number;
  quantiteTotaleAchetee: number;
  prixMoyenAchat: number;
  prixActuel: number | null;
  valeurActuelle: number;
  pnlLatent: number;
  pnlLatentPourcent: number;
  pnlRealise: number;
  statut: StatutPosition;
  dateOuverture: string;
  dateFermeture: string | null;
  prixDisponible: boolean;
}

export interface PortefeuilleVue {
  id: number;
  mode: 'LIBRE' | 'FORMATION';
  soldeInitial: number;
  soldeDisponible: number;
  valeurPositions: number;
  valeurTotale: number;
  pnlTotal: number;
  pnlTotalPourcent: number;
  positionsOuvertes: PositionVue[];
  positionsFermees: PositionVue[];
}

export interface TransactionVue {
  id: number;
  ordreId: number;
  symbole: string;
  sens: SensOrdre;
  quantite: number;
  prix: number;
  montant: number;
  date: string;
}

export type StatutOrdre = 'EXECUTE' | 'EN_ATTENTE' | 'ANNULE' | 'REJETE';

export interface OrdreVue {
  id: number;
  symbole: string;
  sens: SensOrdre;
  type: TypeOrdre;
  quantite: number;
  /** Seuil (limite, stop-loss ou take-profit) ; null pour un ordre au prix du marché. */
  prixDeclenchement: number | null;
  /** null tant que l'ordre n'est pas exécuté. */
  prixExecution: number | null;
  montant: number | null;
  statut: StatutOrdre;
  /** Raison du rejet, sinon null. */
  motif: string | null;
  date: string;
  dateExecution: string | null;
}

export interface OrdreRequest {
  symbole: string;
  sens: SensOrdre;
  type?: TypeOrdre;
  quantite: number;
  /** Obligatoire pour LIMIT, STOP_LOSS et TAKE_PROFIT. */
  prixDeclenchement?: number;
}

export interface ResultatOrdre {
  ordre: OrdreVue;
  soldeDisponible: number;
  message: string;
}

export interface PrixVue {
  symbole: string;
  prix: number;
  /** Variation sur 24 h en %, null si indisponible. */
  variation24h: number | null;
}

export interface PointValeur {
  date: string;
  valeur: number;
}

export interface ErreurApi {
  status: number;
  message: string;
  horodatage: string;
}

/** Part d'une crypto dans la valeur du portefeuille. */
export interface ExpositionVue {
  symbole: string;
  valeur: number;
  poidsPct: number;
}

export type NiveauRisque = 'FAIBLE' | 'MODERE' | 'ELEVE' | 'INDISPONIBLE';

/** Indicateurs de performance et de risque du portefeuille (null = historique des prix indisponible). */
export interface AnalyseRisque {
  valeurTotale: number;
  investiPct: number;
  rendementPct: number;
  volatiliteAnnuellePct: number | null;
  var95Pct: number | null;
  var95Usdt: number | null;
  sharpe: number | null;
  drawdownMaxPct: number | null;
  hhi: number;
  diversification: 'BONNE' | 'MOYENNE' | 'FAIBLE' | 'AUCUNE';
  expositionMaxPct: number;
  actifPlusExpose: string | null;
  expositions: ExpositionVue[];
  scoreRisque: number | null;
  niveauRisque: NiveauRisque;
  explications: string[];
  suggestion: string | null;
  joursHistorique: number;
}

export interface ApercuRequest {
  symbole: string;
  sens: SensOrdre;
  quantite: number;
  /** Prix prévu (ordre limite). Sinon le prix du marché est utilisé. */
  prix?: number;
}

/** Évaluation du risque AVANT un ordre : le portefeuille avant / après. */
export interface ApercuRisque {
  autorise: boolean;
  niveau: 'OK' | 'ATTENTION' | 'REFUSE';
  messages: string[];
  expositionAvantPct: number;
  expositionApresPct: number;
  hhiAvant: number;
  hhiApres: number;
  var95PctAvant: number | null;
  var95PctApres: number | null;
  var95UsdtAvant: number | null;
  var95UsdtApres: number | null;
  quantiteMax: number | null;
}

/** Simulation de crash : "et si le marché perdait X % ?" */
export interface ScenarioChoc {
  chocPct: number;
  valeurAvant: number;
  perteUsdt: number;
  valeurApres: number;
  perteDuPortefeuillePct: number;
  details: { symbole: string; perteUsdt: number }[];
}

/** Une ligne du carnet du marché : un prix, la quantité proposée, et le cumul depuis le meilleur prix. */
export interface NiveauCarnet {
  prix: number;
  quantite: number;
  cumul: number;
}

/** Carnet d'ordres du marché (Binance) : acheteurs et vendeurs du moment. */
export interface CarnetVue {
  symbole: string;
  achats: NiveauCarnet[];
  ventes: NiveauCarnet[];
  meilleurAchat: number;
  meilleurVente: number;
  ecart: number;
  ecartPct: number;
  prixMilieu: number;
  volumeAchats: number;
  volumeVentes: number;
  /** Part des acheteurs dans le volume total (en %). */
  pressionAchatPct: number;
}

/** Une bougie (chandelier) : ce qu'a fait le prix pendant une période. */
export interface BougieVue {
  /** Début de la période, en millisecondes. */
  temps: number;
  ouverture: number;
  haut: number;
  bas: number;
  cloture: number;
  volume: number;
}

export type IntervalleBougie = '5m' | '15m' | '1h' | '4h' | '1d';

/** Un jour de l'éventail de projection : valeurs aux percentiles 5, 25, 50, 75 et 95. */
export interface PointProjection {
  jour: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

/** Projection Monte-Carlo : 1 000 futurs possibles du portefeuille (ce n'est pas une prédiction). */
export interface ProjectionRisque {
  disponible: boolean;
  message: string;
  jours: number;
  simulations: number;
  joursHistorique: number;
  valeurInitiale: number;
  pireCas: number;
  casMedian: number;
  meilleurCas: number;
  probabilitePertePct: number;
  probabilitePerte10Pct: number;
  trajectoire: PointProjection[];
}
