import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, catchError, exhaustMap, interval, timer } from 'rxjs';

import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { BadgeComponent } from '../../shared/components/ui/badge/badge.component';
import { CarnetVue, OrdreVue } from '../../shared/models/crypto.models';
import { CryptoApiService, messageErreur } from '../../shared/services/crypto-api.service';
import { LIBELLE_STATUT, LIBELLE_TYPE, conditionOrdre, couleurStatut } from '../../shared/utils/ordres';

type Filtre = 'TOUS' | 'EN_ATTENTE' | 'EXECUTE' | 'AUTRES';

const CRYPTOS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT'];

/**
 * Page « Carnet d'ordres » en deux parties :
 *  1. le carnet du MARCHÉ (acheteurs et vendeurs en direct sur Binance)
 *  2. MES ordres (historique, ordres en attente, annulation, export)
 */
@Component({
  selector: 'app-orderbook',
  imports: [DatePipe, DecimalPipe, RouterLink, BadgeComponent, PageBreadcrumbComponent],
  styleUrl: './orderbook.component.css',
  templateUrl: './orderbook.component.html',
})
export class OrderbookComponent {
  private readonly api = inject(CryptoApiService);

  readonly libelleType = LIBELLE_TYPE;
  readonly libelleStatut = LIBELLE_STATUT;
  readonly couleurStatut = couleurStatut;
  readonly conditionOrdre = conditionOrdre;

  readonly filtres: { code: Filtre; nom: string }[] = [
    { code: 'TOUS', nom: 'Tous' },
    { code: 'EN_ATTENTE', nom: 'En attente' },
    { code: 'EXECUTE', nom: 'Exécutés' },
    { code: 'AUTRES', nom: 'Annulés / rejetés' },
  ];

  // ---------- 1. Carnet du marché
  readonly cryptos = CRYPTOS;
  readonly symboleCarnet = signal('BTCUSDT');
  readonly carnet = signal<CarnetVue | null>(null);
  readonly erreurCarnet = signal<string | null>(null);

  /** Plus grand cumul affiché : sert à dessiner les barres de profondeur à la bonne échelle. */
  readonly cumulMax = computed(() => {
    const c = this.carnet();
    return c ? Math.max(c.volumeAchats, c.volumeVentes, 1e-12) : 1;
  });

  /** Les vendeurs sont affichés du plus cher (haut) au moins cher (bas), comme sur une vraie plateforme. */
  readonly ventesAffichees = computed(() => [...(this.carnet()?.ventes ?? [])].reverse());

  // ---------- 2. Mes ordres
  readonly ordres = signal<OrdreVue[]>([]);
  readonly filtre = signal<Filtre>('TOUS');
  readonly filtreCrypto = signal<string>('TOUTES');
  readonly erreur = signal<string | null>(null);
  readonly chargement = signal(true);
  readonly annulationEnCours = signal<number | null>(null);

  readonly cryptosDesOrdres = computed(() => [...new Set(this.ordres().map((o) => o.symbole))].sort());

  readonly ordresFiltres = computed(() => {
    const f = this.filtre();
    const crypto = this.filtreCrypto();
    return this.ordres().filter((o) => {
      if (crypto !== 'TOUTES' && o.symbole !== crypto) return false;
      if (f === 'TOUS') return true;
      if (f === 'AUTRES') return o.statut === 'ANNULE' || o.statut === 'REJETE';
      return o.statut === f;
    });
  });

  readonly nbEnAttente = computed(() => this.ordres().filter((o) => o.statut === 'EN_ATTENTE').length);

  /** Chiffres clés affichés en haut de « Mes ordres ». */
  readonly stats = computed(() => {
    const liste = this.ordres();
    const executes = liste.filter((o) => o.statut === 'EXECUTE');
    return {
      total: liste.length,
      enAttente: liste.filter((o) => o.statut === 'EN_ATTENTE').length,
      executes: executes.length,
      annulesRejetes: liste.filter((o) => o.statut === 'ANNULE' || o.statut === 'REJETE').length,
      volumeExecute: executes.reduce((somme, o) => somme + (o.montant ?? 0), 0),
    };
  });

  /** Mes ordres en attente sur la crypto du carnet, avec leur distance au prix du marché. */
  readonly mesOrdresSurCarnet = computed(() => {
    const c = this.carnet();
    const milieu = c?.prixMilieu ?? null;
    return this.ordres()
      .filter((o) => o.statut === 'EN_ATTENTE' && o.symbole === this.symboleCarnet() && o.prixDeclenchement !== null)
      .map((o) => ({
        ordre: o,
        distancePct: milieu !== null && o.prixDeclenchement !== null ? ((o.prixDeclenchement - milieu) / milieu) * 100 : null,
      }));
  });

  constructor() {
    this.charger();
    // Un ordre en attente peut être exécuté à tout moment par le backend
    interval(5_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.charger());

    // Le carnet du marché bouge vite : on le rafraîchit toutes les 2 s (exhaustMap : jamais 2 demandes en même temps)
    timer(0, 2_000)
      .pipe(
        exhaustMap(() =>
          this.api.getCarnet(this.symboleCarnet(), 10).pipe(
            catchError((e) => {
              this.erreurCarnet.set(messageErreur(e));
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((c) => {
        // on ignore une réponse tardive qui concerne l'ancienne crypto
        if (c.symbole === this.symboleCarnet()) {
          this.carnet.set(c);
          this.erreurCarnet.set(null);
        }
      });
  }

  choisirSymbole(code: string): void {
    this.symboleCarnet.set(code);
    this.carnet.set(null);
    this.api.getCarnet(code, 10).subscribe({
      next: (c) => {
        if (c.symbole === this.symboleCarnet()) this.carnet.set(c);
      },
      error: (e) => this.erreurCarnet.set(messageErreur(e)),
    });
  }

  /** Largeur de la barre de profondeur d'une ligne (en % de la largeur de la cellule). */
  largeurBarre(cumul: number): number {
    return Math.min(100, (cumul / this.cumulMax()) * 100);
  }

  charger(): void {
    this.api.getOrdres().subscribe({
      next: (liste) => {
        this.ordres.set(liste);
        this.erreur.set(null);
        this.chargement.set(false);
      },
      error: (e) => {
        this.erreur.set(messageErreur(e));
        this.chargement.set(false);
      },
    });
  }

  annuler(ordre: OrdreVue): void {
    this.annulationEnCours.set(ordre.id);
    this.api.annulerOrdre(ordre.id).subscribe({
      next: () => {
        this.annulationEnCours.set(null);
        this.charger();
      },
      error: (e) => {
        this.erreur.set(messageErreur(e));
        this.annulationEnCours.set(null);
        this.charger();
      },
    });
  }

  /** Télécharge les ordres affichés dans un fichier CSV (s'ouvre dans Excel). */
  exporterCsv(): void {
    const entetes = ['N°', 'Date', 'Crypto', 'Sens', 'Type', 'Quantité', 'Condition', 'Prix exécution', 'Montant', 'Statut', 'Motif'];
    const lignes = this.ordresFiltres().map((o) => [
      o.id,
      o.date,
      o.symbole,
      o.sens,
      LIBELLE_TYPE[o.type],
      o.quantite,
      conditionOrdre(o),
      o.prixExecution ?? '',
      o.montant ?? '',
      LIBELLE_STATUT[o.statut],
      o.motif ?? '',
    ]);
    const csv = [entetes, ...lignes]
      .map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    // le BOM (﻿) permet à Excel d'afficher correctement les accents
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = 'mes-ordres.csv';
    lien.click();
    URL.revokeObjectURL(url);
  }
}
