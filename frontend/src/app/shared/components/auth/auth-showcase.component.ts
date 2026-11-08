import { Component } from '@angular/core';

/**
 * Panneau visuel commun aux pages Connexion et Inscription (TradeLAB).
 * Purement décoratif : aucune logique métier.
 *
 * PHOTOS : déposez 4 images dans  src/assets/auth/  (crypto.jpg, actions.jpg, matieres.jpg, forex.jpg).
 * Tant qu'elles n'existent pas, une illustration dessinée en SVG s'affiche à la place.
 */
@Component({
  selector: 'app-auth-showcase',
  standalone: true,
  template: `
    <section class="relative isolate flex h-full min-w-0 flex-col justify-between gap-5 overflow-hidden border-l border-white/5 bg-[#070b14] px-8 py-8 xl:px-12 xl:py-10">

      <!-- Fond : halos + grille + chandeliers animés -->
      <div class="absolute inset-0 -z-10" aria-hidden="true">
        <div class="halo absolute -top-24 -left-24 h-96 w-96 rounded-full bg-brand-500/25 blur-[110px]"></div>
        <div class="halo absolute -bottom-24 right-0 h-96 w-96 rounded-full bg-purple-600/20 blur-[120px]" style="animation-delay:-4s"></div>
        <div class="absolute inset-0 opacity-[0.07]"
             style="background-image:linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px);background-size:44px 44px"></div>
        <svg class="absolute bottom-0 left-0 w-full h-1/2 opacity-40" viewBox="0 0 600 200" preserveAspectRatio="none">
          <defs>
            <linearGradient id="aire" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#465fff" stop-opacity=".45"/><stop offset="1" stop-color="#465fff" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path class="trace" d="M0 150 L50 130 L100 142 L150 100 L200 112 L250 70 L300 86 L350 44 L400 60 L450 30 L500 48 L550 18 L600 28"
                fill="none" stroke="#465fff" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
          <path d="M0 150 L50 130 L100 142 L150 100 L200 112 L250 70 L300 86 L350 44 L400 60 L450 30 L500 48 L550 18 L600 28 L600 200 L0 200Z" fill="url(#aire)"/>
        </svg>
        <div class="absolute bottom-0 left-0 right-0 flex h-1/3 items-end justify-around px-4 opacity-30">
          @for (b of bougies; track $index) {
            <div class="bougie relative w-2 rounded-sm" [style.height.%]="b.h" [style.animation-delay.s]="b.d"
                 [class]="b.up ? 'bg-success-500' : 'bg-error-500'">
              <span class="absolute left-1/2 -top-2 h-[calc(100%+1rem)] w-px -translate-x-1/2" [class]="b.up ? 'bg-success-500' : 'bg-error-500'"></span>
            </div>
          }
        </div>
      </div>

      <!-- Marque -->
      <header class="flex items-center gap-3">
        <img src="assets/brand/tradelab-symbole.png" alt="" aria-hidden="true" class="h-14 w-auto shrink-0 select-none drop-shadow-[0_4px_14px_rgba(70,95,255,0.35)]">
        <span class="text-2xl font-black tracking-tight text-white">Trade<span class="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-purple-400">LAB</span></span>
      </header>

      <!-- Accroche -->
      <div class="max-w-xl">
        <p class="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-gray-300 backdrop-blur">
          <span class="h-1.5 w-1.5 rounded-full bg-success-500 animate-pulse"></span>
          Le simulateur de salle de marché
        </p>
        <h2 class="text-2xl font-black leading-tight text-white xl:text-4xl">
          Êtes-vous prêt à plonger dans l'univers des marchés&nbsp;?
        </h2>
        <p class="mt-3 text-sm text-gray-400 leading-relaxed [@media(max-height:760px)]:hidden">
          Tradez, assurez, stressez, apprenez. Quatre marchés, un seul terrain de jeu, sans aucun risque réel.
        </p>
      </div>

      <!-- Les 4 marchés -->
      <div class="flex flex-col gap-3">
        @for (m of marches; track m.id) {
          <article class="carte group relative h-[4.75rem] shrink-0 overflow-hidden rounded-2xl border border-white/10 xl:h-20"
                   [style.--teinte]="m.couleur">
            <div class="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                 [style.background-image]="'url(' + m.photo + ')'" [style.background-color]="m.fond"></div>
            <div class="absolute inset-0" [style.background]="'linear-gradient(135deg,' + m.fond + 'cc,' + m.couleur + '33)'"></div>

            <!-- illustration de secours -->
            <svg class="absolute right-3 top-1/2 h-14 w-14 -translate-y-1/2 opacity-80 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3"
                 viewBox="0 0 100 100" aria-hidden="true">
              @switch (m.id) {
                @case ('crypto') {
                  <circle cx="50" cy="50" r="34" fill="none" [attr.stroke]="m.couleur" stroke-width="5"/>
                  <circle cx="50" cy="50" r="24" fill="none" [attr.stroke]="m.couleur" stroke-width="2" stroke-dasharray="4 5"/>
                  <text x="50" y="62" text-anchor="middle" font-size="34" font-weight="800" [attr.fill]="m.couleur">B</text>
                }
                @case ('actions') {
                  <rect x="14" y="58" width="14" height="28" rx="3" [attr.fill]="m.couleur" opacity=".5"/>
                  <rect x="36" y="42" width="14" height="44" rx="3" [attr.fill]="m.couleur" opacity=".7"/>
                  <rect x="58" y="26" width="14" height="60" rx="3" [attr.fill]="m.couleur" opacity=".85"/>
                  <rect x="80" y="10" width="14" height="76" rx="3" [attr.fill]="m.couleur"/>
                }
                @case ('matieres') {
                  <path d="M12 78 24 54h34l12 24z" [attr.fill]="m.couleur"/>
                  <path d="M42 54 52 34h30l10 20z" [attr.fill]="m.couleur" opacity=".7"/>
                  <path d="M24 54h34l-3 6H27z" fill="white" opacity=".25"/>
                }
                @case ('forex') {
                  <text x="8" y="44" font-size="30" font-weight="800" [attr.fill]="m.couleur">$</text>
                  <text x="48" y="44" font-size="30" font-weight="800" [attr.fill]="m.couleur" opacity=".8">€</text>
                  <text x="22" y="82" font-size="30" font-weight="800" [attr.fill]="m.couleur" opacity=".65">£</text>
                  <text x="62" y="82" font-size="30" font-weight="800" [attr.fill]="m.couleur" opacity=".5">¥</text>
                }
              }
            </svg>

            <div class="relative flex h-full flex-col justify-center px-5 pr-20">
              <h3 class="text-base font-extrabold text-white">{{ m.nom }}</h3>
              <p class="text-xs leading-snug text-white/75">{{ m.texte }}</p>
            </div>
            <span class="liseré absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100"
                  [style.background]="m.couleur"></span>
          </article>
        }
      </div>

      <!-- Bandeau défilant (symboles, sans valeurs) -->
      <div class="overflow-hidden border-t border-white/10 pt-3 [@media(max-height:700px)]:hidden" aria-hidden="true">
        <div class="defile flex w-max gap-8 text-xs font-semibold tracking-wider text-gray-500">
          @for (r of [1, 2]; track r) {
            @for (s of symboles; track s) { <span>{{ s }}</span> }
          }
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }
    @keyframes halo { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,20px) scale(1.15); } }
    @keyframes trace { from { stroke-dasharray: 1400; stroke-dashoffset: 1400; } to { stroke-dasharray: 1400; stroke-dashoffset: 0; } }
    @keyframes monte { from { transform: scaleY(.2); } to { transform: scaleY(1); } }
    @keyframes defile { to { transform: translateX(-50%); } }
    .halo { animation: halo 14s ease-in-out infinite; }
    .trace { animation: trace 3.5s ease-out forwards; }
    .bougie { transform-origin: bottom; animation: monte 1.2s ease-out both; }
    .defile { animation: defile 40s linear infinite; }
    .carte { box-shadow: 0 0 0 0 transparent; transition: box-shadow .3s, transform .3s, border-color .3s; }
    .carte:hover { transform: translateY(-4px); border-color: var(--teinte); box-shadow: 0 12px 30px -10px var(--teinte); }
    @media (prefers-reduced-motion: reduce) { .halo, .trace, .bougie, .defile { animation: none; } }
  `]
})
export class AuthShowcaseComponent {
  readonly marches = [
    { id: 'crypto', nom: 'Crypto', texte: 'Cours en direct, 24h/24 et 7j/7.', couleur: '#f59e0b', fond: '#1a1204', photo: '/assets/auth/crypto.jpg' },
    { id: 'actions', nom: 'Actions', texte: 'Les grandes valeurs mondiales.', couleur: '#465fff', fond: '#0a1030', photo: '/assets/auth/actions.jpg' },
    { id: 'matieres', nom: 'Matières premières', texte: 'Or, pétrole, gaz, cuivre.', couleur: '#facc15', fond: '#1c1704', photo: '/assets/auth/matieres.jpg' },
    { id: 'forex', nom: 'Forex', texte: 'Les paires de devises majeures.', couleur: '#14b8a6', fond: '#04201d', photo: '/assets/auth/forex.jpg' }
  ];

  readonly symboles = ['BTC', 'ETH', 'SOL', 'AAPL', 'MSFT', 'JPM', 'EUR/USD', 'GBP/USD', 'XAU/USD', 'WTI', 'BRENT', 'BNB', 'XRP', 'DOGE'];

  /** Chandeliers décoratifs, déterministes (pas d'aléa : rendu identique à chaque chargement). */
  readonly bougies = Array.from({ length: 36 }, (_, i) => ({
    h: 25 + Math.round(Math.abs(Math.sin(i * 1.7) * 55 + Math.cos(i * 0.6) * 20)),
    up: Math.sin(i * 2.3) > -0.2,
    d: i * 0.03
  }));
}