import { Component, ElementRef, HostListener, ViewChild, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

interface Resultat {
  titre: string;
  rubrique: string;
  path: string;
  mots?: string;   // mots-clés en plus du titre
}

/** Pages de l'application (mêmes chemins que le menu de gauche + quelques raccourcis). */
const PAGES: Resultat[] = [
  { titre: 'Dashboard Marchés', rubrique: 'Dashboard', path: '/dashboard', mots: 'accueil tableau de bord' },
  { titre: 'Marché Crypto', rubrique: 'Marchés', path: '/market/crypto', mots: 'bitcoin ethereum cours prix' },
  { titre: 'Marché Actions', rubrique: 'Marchés', path: '/market/stocks', mots: 'bourse apple microsoft' },
  { titre: 'Marché Forex', rubrique: 'Marchés', path: '/market/forex', mots: 'devises change eur usd' },
  { titre: 'Marché Matières premières', rubrique: 'Marchés', path: '/market/commodities', mots: 'petrole or brent wti' },
  { titre: 'Passer un ordre', rubrique: 'Trading', path: '/trading', mots: 'acheter vendre achat vente trade' },
  { titre: 'Carnet d’ordres', rubrique: 'Trading', path: '/trading/orderbook', mots: 'orderbook vendeurs acheteurs' },
  { titre: 'Stop-loss / Take-profit', rubrique: 'Trading', path: '/trading/risk', mots: 'risque' },
  { titre: 'Mes positions', rubrique: 'Portefeuille', path: '/portfolio', mots: 'portefeuille solde' },
  { titre: 'Historique des transactions', rubrique: 'Portefeuille', path: '/history', mots: 'ordres transactions' },
  { titre: 'Salle de Marché : jouer', rubrique: 'Jeu', path: '/game', mots: 'jeu defi multijoueur salle scenario partie' },
  { titre: 'Analyse technique', rubrique: 'Analyse', path: '/analysis', mots: 'indicateurs rsi macd' },
  { titre: 'Backtesting', rubrique: 'Analyse', path: '/backtesting', mots: 'strategie test' },
  { titre: 'Comparaison d’actifs', rubrique: 'Analyse', path: '/analysis/compare' },
  { titre: 'Prédictions IA', rubrique: 'Intelligence Artificielle', path: '/ai', mots: 'prediction intelligence artificielle ia' },
  { titre: 'Agent de trading', rubrique: 'Intelligence Artificielle', path: '/ai/agent', mots: 'ia robot' },
  { titre: 'Analyse de sentiment', rubrique: 'Intelligence Artificielle', path: '/ai/sentiment', mots: 'actualites news' },
  { titre: 'Explicabilité (XAI)', rubrique: 'Intelligence Artificielle', path: '/xai', mots: 'explication shap' },
  { titre: 'Stress Testing : scénarios', rubrique: 'Stress Testing', path: '/stress-testing', mots: 'choc crise' },
  { titre: 'Stress Testing : résultats', rubrique: 'Stress Testing', path: '/stress-testing/results' },
  { titre: 'Stress Testing : comparaison', rubrique: 'Stress Testing', path: '/stress-testing/compare' },
  { titre: 'Formation : modules', rubrique: 'Formation', path: '/learning', mots: 'cours apprendre' },
  { titre: 'Quiz', rubrique: 'Formation', path: '/quiz', mots: 'questions test' },
  { titre: 'Progression', rubrique: 'Formation', path: '/learning/progress', mots: 'badge niveau' },
  { titre: 'Graphique en chandeliers', rubrique: 'Graphiques', path: '/charts/candles', mots: 'bougies' },
  { titre: 'Indicateurs', rubrique: 'Graphiques', path: '/charts/indicators' },
  { titre: 'Mon compte', rubrique: 'Profil', path: '/profile', mots: 'profil utilisateur' },
  { titre: 'Connexion', rubrique: 'Authentification', path: '/signin', mots: 'login se connecter' },
  { titre: 'Inscription', rubrique: 'Authentification', path: '/signup', mots: 'creer un compte' },
  { titre: 'Admin : utilisateurs', rubrique: 'Administration', path: '/admin/users', mots: 'comptes roles' },
  { titre: 'Admin : scénarios du jeu', rubrique: 'Administration', path: '/admin/game-scenarios', mots: 'jeu salle de marche' },
  { titre: 'Admin : modèles IA', rubrique: 'Administration', path: '/admin/ai-models' },
  { titre: 'Admin : scénarios de stress', rubrique: 'Administration', path: '/admin/stress-scenarios' },
  { titre: 'Admin : statistiques', rubrique: 'Administration', path: '/admin/stats', mots: 'stats' }
];

/** Quelques cryptos : mène à la fiche de l'actif. */
const SYMBOLES = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'SOLUSDT', 'DOGEUSDT', 'ADAUSDT', 'LTCUSDT',
  'AVAXUSDT', 'DOTUSDT', 'LINKUSDT'];
const ACTIFS: Resultat[] = SYMBOLES.map(s => ({
  titre: `${s.replace('USDT', '')} / USDT`, rubrique: 'Actif', path: `/market/detail/${s}`, mots: s
}));
const TOUT: Resultat[] = [...PAGES, ...ACTIFS];

/** minuscules, sans accents ni apostrophes : « Carnet d’ordres » correspond à « carnet d ordres » */
function normaliser(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Barre de recherche de l'en-tête : cherche une page ou un actif (Ctrl+K pour la sélectionner). */
@Component({
  selector: 'app-header-search',
  standalone: true,
  template: `
    <div class="relative">
      <span class="absolute -translate-y-1/2 pointer-events-none left-4 top-1/2">
        <svg class="fill-gray-500 dark:fill-gray-400" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path fill-rule="evenodd" clip-rule="evenodd"
            d="M3.04175 9.37363C3.04175 5.87693 5.87711 3.04199 9.37508 3.04199C12.8731 3.04199 15.7084 5.87693 15.7084 9.37363C15.7084 12.8703 12.8731 15.7053 9.37508 15.7053C5.87711 15.7053 3.04175 12.8703 3.04175 9.37363ZM9.37508 1.54199C5.04902 1.54199 1.54175 5.04817 1.54175 9.37363C1.54175 13.6991 5.04902 17.2053 9.37508 17.2053C11.2674 17.2053 13.003 16.5344 14.357 15.4176L17.177 18.238C17.4699 18.5309 17.9448 18.5309 18.2377 18.238C18.5306 17.9451 18.5306 17.4703 18.2377 17.1774L15.418 14.3573C16.5365 13.0033 17.2084 11.2669 17.2084 9.37363C17.2084 5.04817 13.7011 1.54199 9.37508 1.54199Z"
            fill="" />
        </svg>
      </span>
      <input #champ type="text" autocomplete="off" role="combobox" aria-label="Rechercher une page ou un actif"
        [attr.aria-expanded]="ouvert() && resultats().length > 0"
        placeholder="Rechercher une page ou un actif…"
        [value]="requete()"
        (input)="saisir($any($event.target).value)"
        (focus)="ouvert.set(true)"
        (keydown)="touche($event)"
        class="dark:bg-dark-900 h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pl-12 pr-14 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 xl:w-[430px]" />
      <span class="pointer-events-none absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-[7px] py-[4.5px] text-xs -tracking-[0.2px] text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        <span>Ctrl</span><span>K</span>
      </span>

      @if (ouvert() && requete().trim().length > 0) {
        <ul role="listbox"
          class="absolute left-0 right-0 top-full z-[100000] mt-2 max-h-80 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900">
          @for (r of resultats(); track r.path; let i = $index) {
            <li role="option" [attr.aria-selected]="i === actif()">
              <button type="button" (mousedown)="$event.preventDefault()" (click)="aller(r)" (mouseenter)="actif.set(i)"
                class="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm"
                [class]="i === actif() ? 'bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white' : 'text-gray-700 dark:text-gray-300'">
                <span>{{ r.titre }}</span>
                <span class="shrink-0 text-xs text-gray-400">{{ r.rubrique }}</span>
              </button>
            </li>
          } @empty {
            <li class="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">Aucun résultat pour « {{ requete() }} ».</li>
          }
        </ul>
      }
    </div>
  `
})
export class HeaderSearchComponent {
  private readonly router = inject(Router);
  private readonly hote = inject(ElementRef<HTMLElement>);

  @ViewChild('champ') champ?: ElementRef<HTMLInputElement>;

  readonly requete = signal('');
  readonly ouvert = signal(false);
  readonly actif = signal(0);

  /** Résultats : chaque mot tapé doit se retrouver dans le titre, la rubrique ou les mots-clés. */
  readonly resultats = computed<Resultat[]>(() => {
    const mots = normaliser(this.requete()).split(' ').filter(m => m.length > 0);
    if (mots.length === 0) return [];
    return TOUT
      .filter(r => {
        const texte = normaliser(`${r.titre} ${r.rubrique} ${r.mots ?? ''}`);
        return mots.every(m => texte.includes(m));
      })
      .slice(0, 8);
  });

  saisir(valeur: string): void {
    this.requete.set(valeur);
    this.actif.set(0);
    this.ouvert.set(true);
  }

  touche(e: KeyboardEvent): void {
    const n = this.resultats().length;
    if (e.key === 'ArrowDown' && n > 0) { e.preventDefault(); this.actif.set((this.actif() + 1) % n); }
    else if (e.key === 'ArrowUp' && n > 0) { e.preventDefault(); this.actif.set((this.actif() - 1 + n) % n); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const r = this.resultats()[this.actif()];
      if (r) this.aller(r);
    } else if (e.key === 'Escape') {
      this.requete.set('');
      this.ouvert.set(false);
      this.champ?.nativeElement.blur();
    }
  }

  aller(r: Resultat): void {
    this.requete.set('');
    this.ouvert.set(false);
    this.champ?.nativeElement.blur();
    this.router.navigateByUrl(r.path);
  }

  /** Ctrl+K (ou Cmd+K) : place le curseur dans la recherche. */
  @HostListener('document:keydown', ['$event'])
  raccourci(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.champ?.nativeElement.focus();
      this.champ?.nativeElement.select();   // le texte précédent est remplacé dès qu'on tape
    }
  }

  /** Un clic en dehors de la barre ferme la liste. */
  @HostListener('document:click', ['$event'])
  clicAilleurs(e: MouseEvent): void {
    if (!this.hote.nativeElement.contains(e.target as Node)) this.ouvert.set(false);
  }
}
