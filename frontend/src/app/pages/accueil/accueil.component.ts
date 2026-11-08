import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

type Choix = 'former' | 'trader' | 'jouer' | 'assurer';

interface Option {
  id: Choix;
  titre: string;
  accroche: string;
  route: string;
  couleur: string;      // classe de teinte (bordure / glow)
  texte: string;        // classe de couleur du texte / icône
  fond: string;         // classe de fond de l'icône
  icone: string;        // chemin(s) SVG (trait)
  plan: string[];
  bouton: string;
}

/**
 * Page d'accueil (route '') : bienvenue personnalisée + "que voulez-vous faire aujourd'hui ?".
 * Aucun chiffre inventé : tout est calculé (heure, jour, état des marchés) ou statique.
 */
@Component({
  selector: 'app-accueil',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
  <div class="relative min-h-[calc(100vh-9.5rem)] overflow-x-clip p-4 sm:p-6">

    <!-- Ambiance -->
    <div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div class="halo absolute -top-24 left-1/4 h-96 w-96 rounded-full bg-brand-500/20 blur-[120px]"></div>
      <div class="halo absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-crypto-purple/20 blur-[130px]" style="animation-delay:-5s"></div>
    </div>

    <!-- ===== HERO ===== -->
    <section class="relative overflow-hidden rounded-3xl border border-crypto-border bg-crypto-card p-6 sm:p-9">
      <svg class="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full opacity-40" viewBox="0 0 800 160" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="aireHero" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#465fff" stop-opacity=".35"/><stop offset="1" stop-color="#465fff" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path class="trace" d="M0 120 L60 104 L120 112 L180 80 L240 90 L300 54 L360 66 L420 36 L480 52 L540 24 L600 40 L660 14 L720 26 L800 6"
              fill="none" stroke="#465fff" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
        <path d="M0 120 L60 104 L120 112 L180 80 L240 90 L300 54 L360 66 L420 36 L480 52 L540 24 L600 40 L660 14 L720 26 L800 6 L800 160 L0 160Z" fill="url(#aireHero)"/>
      </svg>

      <div class="relative max-w-3xl">
        <p class="mb-3 inline-flex items-center gap-2 rounded-full border border-crypto-border bg-crypto-bg/60 px-3 py-1 text-xs font-medium text-crypto-text-muted">
          <span class="crypto-live-dot"></span>
          {{ dateLongue() }} · {{ heure() }}
        </p>

        <h1 class="text-3xl font-black leading-tight text-crypto-text sm:text-5xl">
          {{ salutation() }},
          <span class="bg-gradient-to-r from-brand-400 via-crypto-purple to-crypto-green bg-clip-text text-transparent">{{ prenom() }}</span>
        </h1>

        <p class="mt-4 text-base leading-relaxed text-crypto-text-muted sm:text-lg">
          Bienvenue dans <strong class="text-crypto-text">TradeLAB</strong>. C'est une belle journée pour se former
          ou pour trader. Que voulez-vous faire aujourd'hui&nbsp;?
        </p>

        <!-- État des marchés -->
        <div class="mt-5 flex flex-wrap gap-2">
          @for (m of marches(); track m.nom) {
            <span class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
                  [class]="m.ouvert ? 'border-crypto-green/30 bg-crypto-green/10 text-crypto-green' : 'border-crypto-red/30 bg-crypto-red/10 text-crypto-red'">
              <span class="h-1.5 w-1.5 rounded-full" [class]="m.ouvert ? 'bg-crypto-green animate-pulse' : 'bg-crypto-red'"></span>
              {{ m.nom }} : {{ m.ouvert ? 'ouvert' : 'fermé' }}
            </span>
          }
        </div>
      </div>
    </section>

    <!-- ===== QUE VOULEZ-VOUS FAIRE ? ===== -->
    <section class="mt-6" aria-labelledby="titre-choix">
      <h2 id="titre-choix" class="mb-3 text-sm font-bold uppercase tracking-widest text-crypto-text-muted">Je veux aujourd'hui…</h2>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        @for (o of options; track o.id) {
          <button type="button" (click)="choix.set(o.id)" [attr.aria-pressed]="choix() === o.id"
                  class="carte group relative overflow-hidden rounded-2xl border bg-crypto-card p-5 text-left transition-all duration-300 hover:-translate-y-1"
                  [class]="choix() === o.id ? o.couleur + ' shadow-lg' : 'border-crypto-border hover:' + o.couleur">
            <span class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3"
                  [class]="o.fond + ' ' + o.texte">
              <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" [innerHTML]="o.icone"></svg>
            </span>
            <h3 class="text-lg font-extrabold text-crypto-text">{{ o.titre }}</h3>
            <p class="mt-1 text-sm leading-snug text-crypto-text-muted">{{ o.accroche }}</p>
            <span class="mt-4 inline-flex items-center gap-1 text-xs font-bold transition-all group-hover:gap-2" [class]="o.texte">
              {{ choix() === o.id ? 'Sélectionné' : 'Choisir' }}
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </span>
          </button>
        }
      </div>

      <!-- Plan du jour -->
      @if (optionChoisie(); as o) {
        <div class="mt-4 grid grid-cols-1 gap-4 rounded-2xl border border-crypto-border bg-crypto-card p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center animate-fadeIn">
          <div>
            <p class="text-xs font-bold uppercase tracking-widest" [class]="o.texte">Votre plan du jour · {{ o.titre }}</p>
            <ol class="mt-3 space-y-2">
              @for (e of o.plan; track $index) {
                <li class="flex items-start gap-3 text-sm text-crypto-text">
                  <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black" [class]="o.fond + ' ' + o.texte">{{ $index + 1 }}</span>
                  <span>{{ e }}</span>
                </li>
              }
            </ol>
          </div>
          <a [routerLink]="o.route"
             class="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-crypto-purple px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/30 transition hover:-translate-y-0.5 hover:shadow-brand-500/50">
            {{ o.bouton }}
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </a>
        </div>
      }
    </section>

    <!-- ===== DÉFI + LE SAVIEZ-VOUS ===== -->
    <section class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <a [routerLink]="defi().route"
         class="group rounded-2xl border border-crypto-border bg-crypto-card p-5 transition hover:-translate-y-1 hover:border-crypto-yellow/60 hover:shadow-lg">
        <p class="text-xs font-bold uppercase tracking-widest text-crypto-yellow">Défi du jour</p>
        <h3 class="mt-2 text-lg font-extrabold text-crypto-text">{{ defi().titre }}</h3>
        <p class="mt-1 text-sm text-crypto-text-muted">{{ defi().texte }}</p>
        <span class="mt-3 inline-flex items-center gap-1 text-xs font-bold text-crypto-yellow transition-all group-hover:gap-2">
          Relever le défi
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </span>
      </a>

      <div class="rounded-2xl border border-crypto-border bg-crypto-card p-5">
        <p class="text-xs font-bold uppercase tracking-widest text-crypto-blue">Le saviez-vous&nbsp;?</p>
        <p class="mt-2 text-sm leading-relaxed text-crypto-text">{{ astuce() }}</p>
        <button type="button" (click)="astuceSuivante()"
                class="mt-3 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-crypto-text-muted transition hover:bg-crypto-card-hover hover:text-crypto-text">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>
          Une autre
        </button>
      </div>
    </section>

    <p class="mt-6 text-center text-xs text-crypto-text-muted">Simulation pédagogique : aucun argent réel n'est engagé.</p>
  </div>
  `,
  styles: [`
    @keyframes halo { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,20px) scale(1.12); } }
    @keyframes trace { from { stroke-dasharray: 1600; stroke-dashoffset: 1600; } to { stroke-dasharray: 1600; stroke-dashoffset: 0; } }
    .halo { animation: halo 14s ease-in-out infinite; }
    .trace { animation: trace 3.5s ease-out forwards; }
    @media (prefers-reduced-motion: reduce) { .halo, .trace { animation: none; } }
  `]
})
export class AccueilComponent implements OnDestroy {
  private readonly auth = inject(AuthService);

  private readonly maintenant = signal(new Date());
  private readonly minuteur = setInterval(() => this.maintenant.set(new Date()), 60_000);
  ngOnDestroy(): void { clearInterval(this.minuteur); }

  readonly choix = signal<Choix>('former');

  // ---------- Utilisateur ----------
  /** TODO : si votre AuthService expose le nom ailleurs, adaptez cette seule ligne. */
  readonly prenom = computed(() => {
    const a: any = this.auth;
    const u = a.utilisateur?.() ?? a.user?.() ?? a.currentUser?.() ?? a.profil?.() ?? null;
    const nom: string = u?.prenom ?? u?.nom ?? u?.name ?? u?.fullName ?? u?.username ?? '';
    const premier = String(nom).trim().split(/\s+/)[0];
    return premier ? premier.charAt(0).toUpperCase() + premier.slice(1) : 'trader';
  });

  // ---------- Heure / date ----------
  readonly salutation = computed(() => {
    const h = this.maintenant().getHours();
    return h >= 5 && h < 12 ? 'Bonjour' : h >= 12 && h < 18 ? 'Bon après-midi' : 'Bonsoir';
  });
  readonly dateLongue = computed(() =>
    this.maintenant().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  readonly heure = computed(() =>
    this.maintenant().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));

  /** Mêmes règles que le dashboard : crypto 24/7, autres marchés du lundi au vendredi, 8h à 18h. */
  readonly marches = computed(() => {
    const d = this.maintenant();
    const we = d.getDay() === 0 || d.getDay() === 6;
    const seance = !we && d.getHours() >= 8 && d.getHours() < 18;
    return [
      { nom: 'Crypto', ouvert: true },
      { nom: 'Actions', ouvert: seance },
      { nom: 'Forex', ouvert: !we },
      { nom: 'Matières premières', ouvert: seance }
    ];
  });

  // ---------- Choix du jour ----------
  readonly options: Option[] = [
    {
      id: 'former', titre: 'Me former', accroche: 'Cours, quiz et progression adaptés à votre niveau.',
      route: '/learning', couleur: 'border-brand-500', texte: 'text-brand-400', fond: 'bg-brand-500/10',
      icone: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9 7h7M9 11h5"/>',
      plan: ['Ouvrez un module adapté à votre niveau.', 'Faites le quiz pour valider ce que vous avez compris.', 'Mettez-le en pratique dans la salle de marché.'],
      bouton: 'Ouvrir la formation'
    },
    {
      id: 'trader', titre: 'Trader', accroche: 'Cours en direct, carnet d\'ordres et portefeuille virtuel.',
      route: '/dashboard', couleur: 'border-crypto-green', texte: 'text-crypto-green', fond: 'bg-crypto-green/10',
      icone: '<path d="M7 4v3"/><rect x="5" y="7" width="4" height="8" rx="1"/><path d="M7 15v3"/><path d="M17 3v4"/><rect x="15" y="7" width="4" height="10" rx="1"/><path d="M17 17v4"/>',
      plan: ['Regardez le pouls du marché sur le dashboard.', 'Choisissez un actif et placez un ordre avec stop-loss.', 'Suivez vos positions dans le portefeuille.'],
      bouton: 'Aller au marché'
    },
    {
      id: 'jouer', titre: 'Jouer', accroche: 'Revivez une crise historique, seul ou avec vos amis.',
      route: '/game', couleur: 'border-crypto-purple', texte: 'text-crypto-purple', fond: 'bg-crypto-purple/10',
      icone: '<path d="M6 11h4M8 9v4"/><path d="M15 12h.01M18 10h.01"/><path d="M17.3 5H6.7a4 4 0 0 0-3.9 3.1l-1.2 5.6a3.4 3.4 0 0 0 5.9 2.9L9 15h6l1.6 1.6a3.4 3.4 0 0 0 5.9-2.9l-1.2-5.6A4 4 0 0 0 17.3 5z"/>',
      plan: ['Choisissez un scénario (Covid, FTX, Ukraine…).', 'Créez une salle ou rejoignez celle d\'un ami.', 'Recevez l\'analyse du coach et le cours recommandé.'],
      bouton: 'Entrer en salle de marché'
    },
    {
      id: 'assurer', titre: 'Devenir assureur', accroche: 'Tarifez, provisionnez et pilotez la solvabilité.',
      route: '/actuariat', couleur: 'border-crypto-yellow', texte: 'text-crypto-yellow', fond: 'bg-crypto-yellow/10',
      icone: '<path d="M12 3a9 9 0 0 0-9 9h18a9 9 0 0 0-9-9z"/><path d="M12 12v7a2 2 0 0 0 4 0"/><path d="M12 3V2"/>',
      plan: ['Calculez la prime d\'un contrat sur votre portefeuille.', 'Estimez les provisions avec le triangle de sinistres.', 'Pilotez votre capital en mode assureur.'],
      bouton: 'Ouvrir l\'actuariat'
    }
  ];
  readonly optionChoisie = computed(() => this.options.find(o => o.id === this.choix()) ?? null);

  // ---------- Défi et astuce du jour (déterministes : même jour, même contenu) ----------
  private jourAnnee(): number {
    const d = this.maintenant();
    return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
  }

  private readonly defis = [
    { titre: 'Zéro panique', texte: 'Rejouez la crise du Covid sans vendre dans les 3 premiers jours.', route: '/game' },
    { titre: 'Toujours protégé', texte: 'Placez un ordre avec stop-loss et take-profit.', route: '/trading' },
    { titre: 'Diversifiez', texte: 'Détenez au moins 3 actifs de marchés différents.', route: '/dashboard' },
    { titre: 'Assureur prudent', texte: 'Gardez votre solvabilité au-dessus de 150 % pendant 5 ans.', route: '/mode-assureur' },
    { titre: 'Un module par jour', texte: 'Terminez un module de formation et son quiz.', route: '/learning' },
    { titre: 'Comprenez le risque', texte: 'Lancez un scénario de stress testing sur votre portefeuille.', route: '/stress-testing' }
  ];
  readonly defi = computed(() => this.defis[this.jourAnnee() % this.defis.length]);

  private readonly astuces = [
    'Une provision de sinistres sert à payer des accidents déjà survenus mais pas encore réglés.',
    'La diversification réduit le risque total sans réduire forcément le rendement attendu.',
    'Un stop-loss limite votre perte maximale avant même d\'entrer en position.',
    'Le ratio combiné d\'un assureur est rentable s\'il reste sous 100 %.',
    'Le marché des cryptos ne ferme jamais, contrairement aux actions et aux matières premières.',
    'La volatilité mesure l\'ampleur des variations de prix, pas leur direction.',
    'La réassurance partage le risque avec un autre assureur, au prix d\'une partie de la prime.',
    'Un backtest montre ce qu\'une stratégie aurait fait dans le passé, pas ce qu\'elle fera.'
  ];
  private readonly decalage = signal(0);
  readonly astuce = computed(() => this.astuces[(this.jourAnnee() + this.decalage()) % this.astuces.length]);
  astuceSuivante(): void { this.decalage.update(v => v + 1); }
}