import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE } from './auth.service';

export interface SalleAdmin {
  code: string; scenarioId: string; hote: string;
  nbJoueurs: number; nbActifs: number;
  etat: 'ATTENTE' | 'EN_COURS' | 'TERMINEE' | 'FERMEE';
  tempsRestantSec: number; dureeMinutes: number; creeMs: number; annonce: string | null;
}

export interface JoueurAdmin {
  pseudo: string; salle: string; etatSalle: string;
  presence: 'ACTIF' | 'INACTIF' | 'ABSENT' | 'PARTI' | 'TERMINE' | 'ATTENTE';
  inactifSec: number; nbOrdres: number; pnl: number; pnlPct: number; valeur: number;
  drawdown: number; concentration: number; stopLoss: boolean; score: number;
  profil: string; termine: boolean; exclu: boolean; nbPositions: number;
}

export interface PositionAdmin { symbole: string; quantite: number; prixMoyenAchat: number; stopLoss: number; takeProfit: number; prixActuel: number; }
export interface DetailSalle {
  code: string; etat: string; impactGlobal: number; impacts: Record<string, number>;
  joueurs: { pseudo: string; pnl: number; pnlPct: number; valeur: number; nbOrdres: number; actif: boolean; termine: boolean; exclu: boolean; positions: PositionAdmin[] }[];
  evenements: string[];
  scenarioId: string; dureeMinutes: number; tempsRestantSec: number;
  messages: { pseudo: string; texte: string; bot: boolean; ts: number }[];
}

export interface SentimentJoueur {
  pseudo: string; humeur: string; score: number; panique: number; achatBaisse: number; fomo: number;
  fluxNetPct: number; agitation: number; drawdown: number; pnlPct: number; nbOrdres: number; explication: string;
}
export interface SentimentSalle {
  indice: number; libelle: string; resume: string; joueurs: SentimentJoueur[];
  chocsRecents: { ts: number; type: string; valeur: number; symbole: string }[];
}

export interface ResumeSondage {
  nb: number; moyenne: number; repartition: number[];
  tags: { tag: string; n: number }[];
  commentaires: { pseudo: string; salle: string; note: number; commentaire: string; tags: string[]; ts: number }[];
}

export interface StatsFormation {
  evenements: number;
  lecons: { id: string; ouvertes: number; terminees: number; abandons: number; tauxAbandonPct: number }[];
  quiz: { id: string; tentatives: number; reussites: number; tauxReussitePct: number; scoreMoyenPct: number }[];
  questionsRatees: { quiz: string; question: string; ratees: number }[];
}

@Injectable({ providedIn: 'root' })
export class AdminLiveService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/admin/live`;

  salles() { return this.http.get<SalleAdmin[]>(`${this.base}/salles`); }
  joueurs() { return this.http.get<JoueurAdmin[]>(`${this.base}/joueurs`); }
  detail(code: string) { return this.http.get<DetailSalle>(`${this.base}/${code}/detail`); }
  fermer(code: string) { return this.http.post<void>(`${this.base}/${code}/fermer`, {}); }
  exclure(code: string, pseudo: string) { return this.http.post<void>(`${this.base}/${code}/exclure`, { pseudo }); }
  annonce(code: string | null, texte: string) { return this.http.post<number>(`${this.base}/annonce`, { code, texte }); }
  sentiment(code: string) { return this.http.get<SentimentSalle>(`${this.base}/${code}/sentiment`); }
  sondage() { return this.http.get<ResumeSondage>(`${this.base}/sondage`); }
  formation() { return this.http.get<StatsFormation>(`${this.base}/formation`); }
}