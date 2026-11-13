/**
 * Contrats JSON du service FastAPI : health, model-info, predict-1.0 et xai-1.0.
 * Ils correspondent aux réponses de ai-service, pas aux DTO Spring Boot.
 */

export type EtatIa = 'HAUSSE' | 'BAISSE' | 'ATTENDRE';
export type OrigineXai = 'modele_reel' | 'synthetique';
export type DirectionShap = 'vers_hausse' | 'vers_baisse' | 'neutre';
export type SanteIaStatus = 'UP' | 'DOWN';

/** Enveloppe d'erreur uniforme de l'API IA. */
export interface ErreurIa {
  status: number;
  code: string;
  message: string;
  horodatage: string;
}

export type CodeErreurIa =
  | 'ENTREE_INVALIDE'
  | 'SYMBOLE_NON_PRIS_EN_CHARGE'
  | 'INTROUVABLE'
  | 'METHODE_NON_AUTORISEE'
  | 'MODELE_INDISPONIBLE'
  | 'MARCHE_INDISPONIBLE'
  | 'MARCHE_DELAI_DEPASSE'
  | 'DONNEES_MARCHE_INVALIDES'
  | 'HISTORIQUE_INSUFFISANT'
  | 'DONNEES_NON_A_JOUR'
  | 'EXPLICATION_INCOHERENTE'
  | 'ERREUR_INTERNE'
  | 'SERVEUR_ARRETE';

/** Famille d'erreur pour l'affichage, sans inventer une prédiction. */
export type FamilleErreurIa =
  | 'serveur_arrete'
  | 'modele_indisponible'
  | 'donnees_perimees'
  | 'marche_indisponible'
  | 'erreur_marche'
  | 'explication_incoherente'
  | 'entree_invalide'
  | 'inconnue';

export interface SanteIa {
  status: SanteIaStatus;
  modele_charge: boolean;
  horodatage: string;
}

export interface ModeleReferenceIa {
  dataset_id: string;
  experiment: string;
  trial_id: string;
  sha256_model: string;
  sha256_selection: string;
}

export interface ModelePublicIa extends ModeleReferenceIa {
  type: string;
  integrite: string;
}

export interface PolitiqueIa {
  signal_autorise: boolean;
  couverture_cible: number | null;
  marge: number | null;
  seuil_hausse: number | null;
  seuil_baisse: number | null;
  regle: string;
}

export interface VariableModeleIa {
  feature: string;
  label_fr: string;
  description_fr: string;
  groupe: string;
  groupe_label_fr: string;
  unite: string;
}

export interface VersionsIa {
  schema_predict: string;
  schema_xai: string;
  'scikit-learn': string | null;
  shap: string | null;
}

export interface ModelInfoIa {
  dataset_id: string;
  symbol: string;
  interval: string;
  horizon_heures: number;
  modele: ModelePublicIa;
  politique: PolitiqueIa;
  variables: VariableModeleIa[];
  versions: VersionsIa;
  avertissements: string[];
}

export interface PredictionBloc {
  probability_up: number;
  signal_authorized: boolean;
  margin: number | null;
  threshold_up: number | null;
  threshold_down: number | null;
  state: EtatIa;
}

export interface SourceDonneesIa {
  provider: string;
  candles_requested: number;
  candles_used: number;
  all_closed: boolean;
  discarded_open: number;
  consecutive: boolean;
  last_segment_length: number;
  gaps: number;
  first_open_time_utc: string;
  last_open_time_utc: string;
  binance_server_time_utc: string;
}

export interface ContributionXai {
  rank: number;
  feature: string;
  label_fr: string;
  group: string;
  unit: string;
  value: number;
  value_display: string;
  contribution: number;
  direction: DirectionShap;
}

export interface GroupeXai {
  group: string;
  label_fr: string;
  features: string[];
  contribution: number;
}

export interface ExplicationXai {
  method: string;
  library: string | null;
  output_space: string;
  base_value: number;
  contributions_sum: number;
  additivity_error: number;
  tolerance: number;
  contributions: ContributionXai[];
  groups: GroupeXai[];
  top_k: number;
}

/** Réponse xai-1.0, présente seulement si explain=true. */
export interface XaiResponse {
  schema_version: 'xai-1.0';
  data_origin: OrigineXai;
  symbol: string;
  interval: string;
  candle_open_time_utc: string;
  decision_time_utc: string;
  model: ModeleReferenceIa;
  prediction: PredictionBloc;
  explanation: ExplicationXai;
  summary_fr: string;
  warnings: string[];
}

/** Réponse predict-1.0. */
export interface PredictResponse {
  schema_version: 'predict-1.0';
  mode: 'temps_reel';
  symbol: string;
  interval: string;
  candle_open_time_utc: string;
  decision_time_utc: string;
  valid_until_utc: string;
  prediction: PredictionBloc;
  model: ModeleReferenceIa;
  data_source: SourceDonneesIa;
  explication: XaiResponse | null;
  warnings: string[];
}
