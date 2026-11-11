import { Component, OnDestroy, OnInit, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, switchMap } from 'rxjs';

import { ContributionXai, EtatIa, PredictResponse } from '../../models/ia.models';
import { IaApiError, IaApiService, toIaApiError } from '../../services/ia-api.service';

const TOLERANCE_COHERENCE = 1e-12;

/** Panneau de conseil : prédiction live BTCUSDT 1 h, sans ordre. */
@Component({
  selector: 'app-ai-advisor-panel',
  templateUrl: './ai-advisor-panel.component.html',
  styles: `
    :host {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
      height: 100%;
      flex-direction: column;
    }
    .corps-advisor {
      scrollbar-width: thin;
      scrollbar-color: #2b3139 transparent;
    }
    .corps-advisor::-webkit-scrollbar {
      width: 8px;
    }
    .corps-advisor::-webkit-scrollbar-thumb {
      background: #2b3139;
      border-radius: 999px;
    }
    details > summary::-webkit-details-marker {
      display: none;
    }
  `,
})
export class AiAdvisorPanelComponent implements OnInit, OnDestroy {
  private readonly api = inject(IaApiService);
  private readonly demandes = new Subject<void>();

  readonly fermer = output<void>();
  readonly chargement = signal(false);
  readonly erreur = signal<IaApiError | null>(null);
  readonly payload = signal<PredictResponse | null>(null);
  readonly maintenant = signal(Date.now());

  readonly perimee = computed(() => estPerimee(this.payload(), this.maintenant()));
  readonly shapOk = computed(() => explicationCoherente(this.payload()));
  readonly topContributions = computed(() => cinqPremieres(this.payload()));
  readonly avertissements = computed(() => avertissementsUniques(this.payload()));

  private horloge: ReturnType<typeof setInterval> | undefined;

  constructor() {
    this.demandes
      .pipe(
        switchMap(() => {
          this.chargement.set(true);
          this.erreur.set(null);
          return this.api.predict(true).pipe(
            catchError((err: unknown) => {
              this.payload.set(null);
              this.erreur.set(toIaApiError(err));
              this.chargement.set(false);
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((reponse) => {
        this.payload.set(reponse);
        this.chargement.set(false);
        this.maintenant.set(Date.now());
      });
  }

  ngOnInit(): void {
    this.charger();
    this.horloge = setInterval(() => this.maintenant.set(Date.now()), 1000);
  }

  ngOnDestroy(): void {
    this.demandes.complete();
    if (this.horloge !== undefined) {
      clearInterval(this.horloge);
      this.horloge = undefined;
    }
  }

  charger(): void {
    this.demandes.next();
  }

  classeBadge(etat: EtatIa): string {
    const base = 'inline-flex rounded-full border px-3 py-1 text-sm font-semibold';
    if (etat === 'HAUSSE') {
      return `${base} bg-crypto-green/15 text-crypto-green border-crypto-green/40`;
    }
    if (etat === 'BAISSE') {
      return `${base} bg-crypto-red/15 text-crypto-red border-crypto-red/40`;
    }
    return `${base} bg-crypto-yellow/15 text-crypto-yellow border-crypto-yellow/40`;
  }

  libelleIntervalle(interval: string): string {
    return interval.replace(/(\d+)h\b/i, '$1 h');
  }

  formatUtc(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    const texte = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'UTC',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
    return `${texte} UTC`;
  }

  formatPct(valeur: number): string {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    }).format(valeur * 100);
  }

  formatPoints(contribution: number): string {
    const points = contribution * 100;
    const corps = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(points));
    return `${points >= 0 ? '+' : '−'}${corps} pt`;
  }

  largeurBarre(contribution: number): number {
    const max = Math.max(...this.topContributions().map((ligne) => Math.abs(ligne.contribution)), 1e-12);
    return Math.min(100, (Math.abs(contribution) / max) * 100);
  }

  titreErreur(erreur: IaApiError): string {
    switch (erreur.famille) {
      case 'serveur_arrete':
        return 'Serveur IA indisponible';
      case 'modele_indisponible':
        return 'Modèle indisponible';
      case 'donnees_perimees':
        return 'Données Binance périmées';
      case 'marche_indisponible':
        return 'Marché indisponible';
      case 'erreur_marche':
        return 'Réponse de marché invalide';
      case 'explication_incoherente':
        return 'Explication incohérente';
      default:
        return 'Erreur du conseiller';
    }
  }
}

function estPerimee(payload: PredictResponse | null, maintenant: number): boolean {
  if (!payload) {
    return false;
  }
  const fin = Date.parse(payload.valid_until_utc);
  return Number.isFinite(fin) && fin <= maintenant;
}

function explicationCoherente(payload: PredictResponse | null): boolean {
  if (!payload?.explication) {
    return false;
  }
  const predite = payload.prediction;
  const expliquee = payload.explication.prediction;
  if (expliquee.state !== predite.state) {
    return false;
  }
  return Math.abs(expliquee.probability_up - predite.probability_up) <= TOLERANCE_COHERENCE;
}

function cinqPremieres(payload: PredictResponse | null): ContributionXai[] {
  const explication = payload?.explication?.explanation;
  if (!explication) {
    return [];
  }
  const limite = Number.isInteger(explication.top_k) ? explication.top_k : 5;
  return explication.contributions.slice(0, limite);
}

function avertissementsUniques(payload: PredictResponse | null): string[] {
  if (!payload) {
    return [];
  }
  const vus = new Set<string>();
  const liste: string[] = [];
  for (const avis of [...payload.warnings, ...(payload.explication?.warnings ?? [])]) {
    if (!vus.has(avis)) {
      vus.add(avis);
      liste.push(avis);
    }
  }
  return liste;
}
