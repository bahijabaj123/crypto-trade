import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, catchError, exhaustMap, interval, timer } from 'rxjs';

import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { BadgeComponent } from '../../shared/components/ui/badge/badge.component';
import { CarnetVue, NiveauCarnet, OrdreVue } from '../../shared/models/crypto.models';
import { CryptoApiService, messageErreur } from '../../shared/services/crypto-api.service';
import { LIBELLE_STATUT, LIBELLE_TYPE, conditionOrdre, couleurStatut } from '../../shared/utils/ordres';

import { MarketService } from '../../core/services/market.service';
import { SimulatedOrder, SimulatedOrdersService, SimulatedMarket } from '../../core/services/simulated-orders.service';

type Filtre = 'TOUS' | 'EN_ATTENTE' | 'EXECUTE' | 'AUTRES';

const CRYPTOS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT'];

@Component({
  selector: 'app-orderbook',
  imports: [DatePipe, DecimalPipe, RouterLink, BadgeComponent, PageBreadcrumbComponent],
  styleUrl: './orderbook.component.css',
  templateUrl: './orderbook.component.html',
})
export class OrderbookComponent {
  private readonly api = inject(CryptoApiService);
  public readonly marketService = inject(MarketService);
  public readonly simulatedOrders = inject(SimulatedOrdersService);

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

  // ---------- 1. Carnet du marché (Crypto)
  readonly cryptos = CRYPTOS;
  readonly symboleCarnet = signal('BTCUSDT'); // Toujours un symbole Crypto ici !
  readonly carnet = signal<CarnetVue | null>(null);
  readonly erreurCarnet = signal<string | null>(null);
  
  // ---------- 2. Faux carnet (Autres marchés)
  readonly prixAutresMarches = signal<number | null>(null);
  readonly symboleAutresMarches = signal<string>('');

  readonly cumulMax = computed(() => {
    const c = this.carnet();
    return c ? Math.max(c.volumeAchats, c.volumeVentes, 1e-12) : 1;
  });

  readonly ventesAffichees = computed(() => [...(this.carnet()?.ventes ?? [])].reverse());

  // ---------- 3. Mes ordres
  readonly ordres = signal<OrdreVue[]>([]);
  readonly ordresSimules = signal<SimulatedOrder[]>([]);
  readonly filtre = signal<Filtre>('TOUS');
  readonly filtreCrypto = signal<string>('TOUTES');
  readonly erreur = signal<string | null>(null);
  readonly chargement = signal(true);
  readonly annulationEnCours = signal<number | null>(null);

  readonly activeMarket = signal(this.marketService.activeMarket);
  readonly isCrypto = computed(() => this.activeMarket() === 'crypto');

  readonly cryptosDesOrdres = computed(() => {
    const symboles = this.isCrypto()
      ? this.ordres().map(o => o.symbole)
      : this.ordresSimules().map(o => o.symbole);
    return [...new Set(symboles)].sort();
  });

  readonly stats = computed(() => {
    if (this.isCrypto()) {
      const liste = this.ordres();
      const executes = liste.filter(o => o.statut === 'EXECUTE');
      return {
        total: liste.length,
        enAttente: liste.filter(o => o.statut === 'EN_ATTENTE').length,
        executes: executes.length,
        annulesRejetes: liste.filter(o => o.statut === 'ANNULE' || o.statut === 'REJETE').length,
        volumeExecute: executes.reduce((s, o) => s + (o.montant ?? 0), 0),
      };
    } else {
      const liste = this.ordresSimules();
      return {
        total: liste.length,
        enAttente: 0,
        executes: liste.length,
        annulesRejetes: 0,
        volumeExecute: liste.reduce((s, o) => s + o.montantTotal, 0),
      };
    }
  });

  readonly nbEnAttente = computed(() =>
    this.isCrypto() ? this.ordres().filter(o => o.statut === 'EN_ATTENTE').length : 0
  );

  readonly mesOrdresSurCarnet = computed(() => {
    if (!this.isCrypto()) return [];
    const c = this.carnet();
    const milieu = c?.prixMilieu ?? null;
    return this.ordres()
      .filter(o => o.statut === 'EN_ATTENTE' && o.symbole === this.symboleCarnet() && o.prixDeclenchement !== null)
      .map(o => ({
        ordre: o,
        distancePct: milieu !== null && o.prixDeclenchement !== null
          ? ((o.prixDeclenchement - milieu) / milieu) * 100
          : null,
      }));
  });

  readonly ordresFiltresSarra = computed<OrdreVue[]>(() => {
    const f = this.filtre();
    const filtreSym = this.filtreCrypto();
    if (!this.isCrypto()) return [];
    return this.ordres().filter(o => {
      if (filtreSym !== 'TOUTES' && o.symbole !== filtreSym) return false;
      if (f === 'TOUS') return true;
      if (f === 'AUTRES') return o.statut === 'ANNULE' || o.statut === 'REJETE';
      return o.statut === f;
    });
  });

  readonly ordresFiltresSimules = computed<SimulatedOrder[]>(() => {
    const f = this.filtre();
    const filtreSym = this.filtreCrypto();
    if (this.isCrypto()) return [];
    return this.ordresSimules().filter(o => {
      if (filtreSym !== 'TOUTES' && o.symbole !== filtreSym) return false;
      if (f === 'TOUS') return true;
      if (f === 'EXECUTE') return o.statut === 'EXECUTE';
      return false;
    });
  });

  readonly totalFiltres = computed(() =>
    this.isCrypto() ? this.ordresFiltresSarra().length : this.ordresFiltresSimules().length
  );

  constructor() {
    this.marketService.activeMarket$.subscribe((market) => {
      this.activeMarket.set(market);
      
      // On réinitialise l'erreur quand on change de marché
      this.erreurCarnet.set(null);
      this.carnet.set(null);

      // Si on revient sur la crypto, on force le symbole à BTCUSDT pour être sûr
      if (market === 'crypto') {
        this.symboleCarnet.set('BTCUSDT');
        this.api.getCarnet('BTCUSDT', 10).subscribe({
          next: (c) => this.carnet.set(c),
          error: (e) => this.erreurCarnet.set(messageErreur(e))
        });
      }
      
      this.charger();
    });

    interval(5_000).pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.isCrypto()) this.charger();
    });

    // Boucle pour le carnet Crypto
    timer(0, 2_000)
      .pipe(
        exhaustMap(() => {
          if (!this.isCrypto()) return EMPTY;
          return this.api.getCarnet(this.symboleCarnet(), 10).pipe(
            catchError((e) => {
              this.erreurCarnet.set(messageErreur(e));
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((c) => {
        if (c.symbole === this.symboleCarnet()) {
          this.carnet.set(c);
          this.erreurCarnet.set(null);
        }
      });

    // Boucle pour le faux carnet (Autres marchés)
        // Boucle pour le faux carnet
    timer(0, 2000).pipe(takeUntilDestroyed()).subscribe(() => {
      if (!this.isCrypto()) {
        this.marketService.getTickers().subscribe(tickers => {
          const found = tickers[0];
          if (found) {
            this.prixAutresMarches.set(found.price);
            this.symboleAutresMarches.set(found.symbol);
          } else {
             // 👇 Si l'API plante, on met un prix par défaut
             this.prixAutresMarches.set(347.73);
             this.symboleAutresMarches.set('AAPL');
          }
        });
      }
    });
  }

  changerMarche(market: 'crypto' | 'stocks' | 'forex' | 'commodities'): void {
    this.marketService.setActiveMarket(market);
  }

  choisirSymbole(code: string): void {
    this.symboleCarnet.set(code);
    this.carnet.set(null);
    this.api.getCarnet(code, 10).subscribe({
      next: (c) => { if (c.symbole === this.symboleCarnet()) this.carnet.set(c); },
      error: (e) => this.erreurCarnet.set(messageErreur(e)),
    });
  }

  largeurBarre(cumul: number, maxPersonnalise?: number): number {
    const max = maxPersonnalise ?? this.cumulMax();
    return Math.min(100, (cumul / max) * 100);
  }

  charger(): void {
    this.chargement.set(true);
    if (this.isCrypto()) {
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
    } else {
      const market = this.activeMarket() as SimulatedMarket;
      this.ordresSimules.set(this.simulatedOrders.getByMarket(market));
      this.erreur.set(null);
      this.chargement.set(false);
    }
  }

  annuler(ordre: OrdreVue): void {
    if (!this.isCrypto()) return;
    this.annulationEnCours.set(ordre.id);
    this.api.annulerOrdre(ordre.id).subscribe({
      next: () => { this.annulationEnCours.set(null); this.charger(); },
      error: (e) => {
        this.erreur.set(messageErreur(e));
        this.annulationEnCours.set(null);
        this.charger();
      },
    });
  }

  viderOrdresSimules(): void {
    if (this.isCrypto()) return;
    const market = this.activeMarket() as SimulatedMarket;
    this.simulatedOrders.clearMarket(market);
    this.charger();
  }

  genererFauxCarnet(prixActuel: number, decimales: number = 2): CarnetVue {
    const achats: NiveauCarnet[] = [];
    const ventes: NiveauCarnet[] = [];
    let cumulAchats = 0;
    let cumulVentes = 0;

    const spread = prixActuel * 0.001;
    const pas = prixActuel * 0.0001;

    for (let i = 1; i <= 10; i++) {
      const prixAchat = prixActuel - (spread / 2) - (i * pas);
      const qteAchat = Math.random() * 100 + 10;
      cumulAchats += qteAchat;
      achats.push({
        prix: parseFloat(prixAchat.toFixed(decimales)),
        quantite: parseFloat(qteAchat.toFixed(4)),
        cumul: parseFloat(cumulAchats.toFixed(4)),
      });

      const prixVente = prixActuel + (spread / 2) + (i * pas);
      const qteVente = Math.random() * 100 + 10;
      cumulVentes += qteVente;
      ventes.push({
        prix: parseFloat(prixVente.toFixed(decimales)),
        quantite: parseFloat(qteVente.toFixed(4)),
        cumul: parseFloat(cumulVentes.toFixed(4)),
      });
    }

    const totalVolume = cumulAchats + cumulVentes;
    
    return {
      symbole: this.symboleAutresMarches(), // On utilise la variable séparée !
      achats: achats,
      ventes: ventes,
      meilleurAchat: achats[0].prix,
      meilleurVente: ventes[0].prix,
      ecart: parseFloat((ventes[0].prix - achats[0].prix).toFixed(decimales)),
      ecartPct: parseFloat(((ventes[0].prix - achats[0].prix) / prixActuel * 100).toFixed(4)),
      prixMilieu: parseFloat(((achats[0].prix + ventes[0].prix) / 2).toFixed(decimales)),
      volumeAchats: parseFloat(cumulAchats.toFixed(4)),
      volumeVentes: parseFloat(cumulVentes.toFixed(4)),
      pressionAchatPct: parseFloat(((cumulAchats / totalVolume) * 100).toFixed(1)),
    };
  }

  exporterCsv(): void {
    let entetes: string[];
    let lignes: (string | number)[][];
    let nomFichier: string;

    if (this.isCrypto()) {
      entetes = ['N°', 'Date', 'Symbole', 'Sens', 'Type', 'Quantité', 'Condition', 'Prix exécution', 'Montant', 'Statut', 'Motif'];
      lignes = this.ordresFiltresSarra().map(o => [
        o.id, o.date, o.symbole, o.sens, LIBELLE_TYPE[o.type], o.quantite,
        conditionOrdre(o), o.prixExecution ?? '', o.montant ?? '', LIBELLE_STATUT[o.statut], o.motif ?? '',
      ]);
      nomFichier = 'mes-ordres-crypto.csv';
    } else {
      entetes = ['ID', 'Date', 'Marché', 'Symbole', 'Sens', 'Type', 'Quantité', 'Prix exécution', 'Montant', 'Statut'];
      lignes = this.ordresFiltresSimules().map(o => [
        o.id, o.date, o.market, o.symbole, o.sens, o.type, o.quantite, o.prixExecution, o.montantTotal, o.statut,
      ]);
      nomFichier = `mes-ordres-${this.activeMarket()}.csv`;
    }

    const csv = [entetes, ...lignes]
      .map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomFichier;
    a.click();
    URL.revokeObjectURL(url);
  }
}