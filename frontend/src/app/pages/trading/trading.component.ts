import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, debounceTime, interval, exhaustMap, of, switchMap, timer } from 'rxjs';

import { CandleChartComponent } from '../../shared/components/candle-chart/candle-chart.component';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { BadgeComponent } from '../../shared/components/ui/badge/badge.component';
import { ApercuRisque, OrdreVue, PortefeuilleVue, PrixVue, SensOrdre, TypeOrdre } from '../../shared/models/crypto.models';
import { CryptoApiService, messageErreur } from '../../shared/services/crypto-api.service';
import { LIBELLE_STATUT, LIBELLE_TYPE, conditionOrdre, couleurStatut } from '../../shared/utils/ordres';

interface CryptoChoix {
  code: string;
  nom: string;
}

/** Les cryptos proposées pour la démo (toutes cotées sur Binance en USDT). */
const CRYPTOS: CryptoChoix[] = [
  { code: 'BTCUSDT', nom: 'Bitcoin' },
  { code: 'ETHUSDT', nom: 'Ethereum' },
  { code: 'SOLUSDT', nom: 'Solana' },
  { code: 'BNBUSDT', nom: 'BNB' },
  { code: 'XRPUSDT', nom: 'XRP' },
  { code: 'ADAUSDT', nom: 'Cardano' },
];

@Component({
  selector: 'app-trading',
  imports: [DatePipe, DecimalPipe, FormsModule, RouterLink, BadgeComponent, CandleChartComponent, PageBreadcrumbComponent],
  templateUrl: './trading.component.html',
  styleUrl: './trading.component.css',
})
export class TradingComponent {
  private readonly api = inject(CryptoApiService);

  readonly cryptos = CRYPTOS;
  readonly libelleType = LIBELLE_TYPE;
  readonly libelleStatut = LIBELLE_STATUT;
  readonly couleurStatut = couleurStatut;
  readonly conditionOrdre = conditionOrdre;

  // Le formulaire
  symbole = 'BTCUSDT';
  sens: SensOrdre = 'ACHAT';
  quantite: number | null = null;
  /** Au prix du marché (MARKET) ou à un prix choisi (LIMIT). Stop-loss et take-profit : page dédiée. */
  type: Extract<TypeOrdre, 'MARKET' | 'LIMIT'> = 'MARKET';
  prixLimite: number | null = null;

  // Les données chargées depuis le backend
  readonly prix = signal<PrixVue[]>([]);
  readonly portefeuille = signal<PortefeuilleVue | null>(null);
  readonly ordres = signal<OrdreVue[]>([]);
  readonly erreurMarche = signal<string | null>(null);
  readonly retour = signal<{ type: 'succes' | 'erreur'; texte: string } | null>(null);
  readonly envoiEnCours = signal(false);

  /** Évaluation du risque de l'ordre en cours de saisie (null tant que le formulaire est incomplet). */
  readonly apercu = signal<ApercuRisque | null>(null);
  private readonly demandeApercu = new Subject<void>();

  constructor() {
    this.chargerCompte();

    // Évaluation du risque : on attend 0,4 s après la dernière frappe, puis on interroge le backend
    this.demandeApercu
      .pipe(
        debounceTime(400),
        switchMap(() => {
          if (this.quantite === null || this.quantite <= 0) return of(null);
          if (this.type === 'LIMIT' && !(this.prixLimite !== null && this.prixLimite > 0)) return of(null);
          return this.api
            .apercuRisque({
              symbole: this.symbole,
              sens: this.sens,
              quantite: this.quantite,
              ...(this.type === 'LIMIT' && this.prixLimite !== null ? { prix: this.prixLimite } : {}),
            })
            .pipe(catchError(() => of(null))); // l'aperçu est une aide : en cas d'erreur on ne bloque pas
        }),
        takeUntilDestroyed(),
      )
      .subscribe((a) => this.apercu.set(a));

    // Un ordre limite peut s'exécuter en arrière-plan : on rafraîchit solde et ordres toutes les 5 s
    interval(5_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.chargerCompte());

    // Les prix sont actualisés toutes les 5 secondes
    timer(0, 5_000)
      .pipe(
        exhaustMap(() =>
          this.api.getPrix(this.cryptos.map((c) => c.code)).pipe(
            catchError((e) => {
              this.erreurMarche.set(messageErreur(e));
              return EMPTY; // on réessaiera au prochain tour
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((liste) => {
        this.prix.set(liste);
        this.erreurMarche.set(null);
      });
  }

  /** Recharge le solde, les positions et les derniers ordres. */
  chargerCompte(): void {
    this.api.getPortefeuille().subscribe({
      next: (p) => this.portefeuille.set(p),
      error: (e) => this.erreurMarche.set(messageErreur(e)),
    });
    this.api.getOrdres().subscribe({
      next: (liste) => this.ordres.set(liste.slice(0, 8)),
      error: () => this.ordres.set([]),
    });
  }

  prixSelectionne(): number | null {
    return this.prix().find((p) => p.symbole === this.symbole)?.prix ?? null;
  }

  montantEstime(): number | null {
    const prix = this.prixSelectionne();
    if (prix === null || this.quantite === null || this.quantite <= 0) return null;
    const prixUtilise = this.type === 'LIMIT' && this.prixLimite !== null && this.prixLimite > 0 ? this.prixLimite : prix;
    return prixUtilise * this.quantite;
  }

  /** Quantité de la crypto choisie que l'utilisateur détient déjà (utile pour vendre). */
  quantitePossedee(): number {
    const pos = this.portefeuille()?.positionsOuvertes.find((p) => p.symbole === this.symbole);
    return pos ? pos.quantite : 0;
  }

  formulaireValide(): boolean {
    if (this.quantite === null || this.quantite <= 0) return false;
    return this.type === 'MARKET' || (this.prixLimite !== null && this.prixLimite > 0);
  }

  /** À appeler dès que le formulaire change : relance l'évaluation du risque. */
  majApercu(): void {
    this.demandeApercu.next();
  }

  choisir(code: string): void {
    this.symbole = code;
    this.retour.set(null);
    this.majApercu();
  }

  changerType(type: 'MARKET' | 'LIMIT'): void {
    this.type = type;
    this.retour.set(null);
    this.majApercu();
  }

  changerSens(sens: SensOrdre): void {
    this.sens = sens;
    this.retour.set(null);
    this.majApercu();
  }

  /** Remplit la quantité avec le maximum accepté par la règle d'exposition. */
  utiliserQuantiteMax(): void {
    const max = this.apercu()?.quantiteMax;
    if (max !== null && max !== undefined && max > 0) {
      this.quantite = max;
      this.majApercu();
    }
  }

  couleurApercu(niveau: ApercuRisque['niveau']): string {
    if (niveau === 'REFUSE') {
      return 'border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/15 dark:text-error-400';
    }
    if (niveau === 'ATTENTION') {
      return 'border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/15 dark:text-orange-400';
    }
    return 'border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/15 dark:text-success-500';
  }

  passerOrdre(): void {
    if (this.quantite === null || this.quantite <= 0) return;

    this.envoiEnCours.set(true);
    this.retour.set(null);

    this.api
      .passerOrdre({
        symbole: this.symbole,
        sens: this.sens,
        type: this.type,
        quantite: this.quantite,
        ...(this.type === 'LIMIT' && this.prixLimite !== null ? { prixDeclenchement: this.prixLimite } : {}),
      })
      .subscribe({
        next: (resultat) => {
          this.retour.set({ type: 'succes', texte: resultat.message });
          this.quantite = null;
          this.prixLimite = null;
          this.apercu.set(null);
          this.envoiEnCours.set(false);
          this.chargerCompte();
        },
        error: (e) => {
          this.retour.set({ type: 'erreur', texte: messageErreur(e) });
          this.envoiEnCours.set(false);
        },
      });
  }
}
