import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { AdminLiveService, DetailSalle, SentimentJoueur, SentimentSalle } from '../../core/services/admin-live.service';

interface LignePosition {
  pseudo: string; premiere: boolean; symbole: string; quantite: number; prixMoyenAchat: number;
  prixActuel: number; valeur: number; pnl: number; pnlPct: number; stopLoss: number; takeProfit: number;
}

/**
 * Mode spectateur : l'administrateur (ou un prof) regarde une salle en direct.
 *  - il N'EST PAS ajouté à la liste des joueurs : personne ne le voit ;
 *  - il n'utilise que des lectures (GET) : il ne peut pas influencer les prix ;
 *  - il voit les positions ouvertes de tous les traders et l'humeur de la salle.
 */
@Component({
  selector: 'app-admin-spectateur',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe, RouterLink],
  template: `
<div class="p-4 md:p-6 space-y-5 text-gray-200">

  <!-- ===== EN-TÊTE ===== -->
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <a routerLink="/admin/live" class="text-xs text-gray-500 hover:text-white">← Retour au suivi en direct</a>
      <h1 class="text-xl font-bold text-white mt-1 flex flex-wrap items-center gap-2">
        Salle <span class="font-mono">{{ code }}</span>
        @if (detail(); as d) {
          <span class="px-2 py-0.5 rounded-full text-[11px] font-bold" [class]="badgeEtat(d.etat)">{{ libelleEtat(d.etat) }}</span>
          @if (d.etat === 'EN_COURS') { <span class="font-mono text-sm text-gray-300">{{ mmss(d.tempsRestantSec) }}</span> }
          <span class="text-xs text-gray-500 font-normal">{{ d.scenarioId }}</span>
        }
      </h1>
    </div>
    <div class="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border border-indigo-400/40 bg-indigo-500/10 text-indigo-200">
      👁 Mode spectateur · invisible pour les joueurs · aucune influence sur les prix
    </div>
  </div>

  @if (erreur()) {
    <div class="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{{ erreur() }}</div>
  }

  <div class="grid xl:grid-cols-3 gap-5">

    <!-- ================= COLONNE GAUCHE : POSITIONS ================= -->
    <div class="xl:col-span-2 space-y-5">

      @if (detail(); as d) {
        @if (impactsActifs().length) {
          <div class="flex flex-wrap gap-2 text-xs items-center">
            <span class="text-gray-500">Chocs de prix en cours :</span>
            @for (i of impactsActifs(); track i.nom) {
              <span class="px-2 py-0.5 rounded-full bg-gray-800" [class]="i.valeur >= 0 ? 'text-green-300' : 'text-red-300'">
                {{ i.nom }} {{ i.valeur >= 0 ? '+' : '' }}{{ i.valeur | number:'1.1-1' }} %
              </span>
            }
          </div>
        }
      }

      <div class="rounded-xl border border-gray-800 bg-[#0d121c]">
        <div class="px-4 py-2.5 border-b border-gray-800 flex items-center justify-between">
          <span class="text-[11px] uppercase tracking-widest text-gray-400 font-bold">Positions ouvertes de la salle</span>
          <span class="text-[11px] text-gray-500">{{ lignes().length }} position(s) · {{ nbTraders() }} trader(s)</span>
        </div>
        <div class="overflow-x-auto max-h-[28rem]">
          <table class="w-full text-left text-xs min-w-[820px]">
            <thead class="text-[10px] uppercase tracking-wider text-gray-500 sticky top-0 bg-[#0d121c]">
              <tr>
                <th class="px-3 py-2">Trader</th><th class="px-3 py-2">Actif</th><th class="px-3 py-2">Quantité</th>
                <th class="px-3 py-2">Prix moyen</th><th class="px-3 py-2">Prix actuel</th><th class="px-3 py-2">Valeur</th>
                <th class="px-3 py-2">P&amp;L</th><th class="px-3 py-2">P&amp;L %</th><th class="px-3 py-2">Stop / Take</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-800/60">
              @for (l of lignes(); track l.pseudo + l.symbole) {
                <tr class="hover:bg-white/[0.03]" [class.border-t-2]="l.premiere" [class.border-gray-700]="l.premiere">
                  <td class="px-3 py-2 font-bold text-amber-300">{{ l.premiere ? l.pseudo : '' }}</td>
                  <td class="px-3 py-2 font-bold">{{ l.symbole }}</td>
                  <td class="px-3 py-2 font-mono">{{ l.quantite | number:'1.0-4' }}</td>
                  <td class="px-3 py-2 font-mono text-gray-400">{{ l.prixMoyenAchat | number:'1.2-2' }} $</td>
                  <td class="px-3 py-2 font-mono">{{ l.prixActuel ? (l.prixActuel | number:'1.2-2') + ' $' : '—' }}</td>
                  <td class="px-3 py-2 font-mono">{{ l.prixActuel ? (l.valeur | number:'1.0-0') + ' $' : '—' }}</td>
                  <td class="px-3 py-2 font-mono font-bold" [class]="l.pnl >= 0 ? 'text-green-400' : 'text-red-400'">
                    {{ l.prixActuel ? ((l.pnl >= 0 ? '+' : '') + (l.pnl | number:'1.0-0') + ' $') : '—' }}
                  </td>
                  <td class="px-3 py-2">
                    @if (l.prixActuel) {
                      <span class="px-2 py-0.5 rounded-full text-[11px] font-bold"
                            [class]="l.pnlPct >= 0 ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'">
                        {{ l.pnlPct >= 0 ? '+' : '' }}{{ l.pnlPct | number:'1.1-1' }} %
                      </span>
                    }
                  </td>
                  <td class="px-3 py-2 font-mono text-[11px]">
                    <span class="text-red-400">{{ l.stopLoss ? (l.stopLoss | number:'1.2-2') : '-' }}</span>
                    <span class="text-gray-600"> / </span>
                    <span class="text-green-400">{{ l.takeProfit ? (l.takeProfit | number:'1.2-2') : '-' }}</span>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="9" class="text-center py-8 text-gray-500 italic">Aucun trader n'a de position ouverte pour le moment.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Flux + chat en lecture seule -->
      <div class="grid md:grid-cols-2 gap-5">
        <div class="rounded-xl border border-gray-800 bg-[#0d121c]">
          <div class="px-4 py-2.5 border-b border-gray-800 text-[11px] uppercase tracking-widest text-gray-400 font-bold">Flux d'événements</div>
          <ul class="p-3 text-xs text-gray-400 space-y-1 h-56 overflow-auto">
            @for (e of evenements(); track $index) { <li>{{ e }}</li> }
            @empty { <li class="italic text-gray-600">Rien pour le moment.</li> }
          </ul>
        </div>
        <div class="rounded-xl border border-gray-800 bg-[#0d121c]">
          <div class="px-4 py-2.5 border-b border-gray-800 text-[11px] uppercase tracking-widest text-gray-400 font-bold">Chat (lecture seule)</div>
          <ul class="p-3 text-xs space-y-1 h-56 overflow-auto">
            @for (m of messages(); track m.ts + m.pseudo) {
              <li><b [class]="m.bot ? 'text-indigo-300' : 'text-amber-300'">{{ m.pseudo }}</b> <span class="text-gray-300">{{ m.texte }}</span></li>
            } @empty { <li class="italic text-gray-600">Aucun message.</li> }
          </ul>
        </div>
      </div>
    </div>

    <!-- ================= COLONNE DROITE : SENTIMENT ================= -->
    <div class="space-y-5">
      @if (sentiment(); as s) {
        <div class="rounded-xl border border-gray-800 bg-[#0d121c] p-5">
          <div class="text-[11px] uppercase tracking-widest text-gray-400 font-bold mb-3">Humeur de la salle</div>
          <div class="flex items-end justify-between">
            <div class="text-5xl font-bold" [class]="couleurIndice(s.indice)">{{ s.indice }}</div>
            <div class="text-right">
              <div class="text-lg font-semibold" [class]="couleurIndice(s.indice)">{{ s.libelle }}</div>
              <div class="text-[11px] text-gray-500">0 = peur · 100 = avidité</div>
            </div>
          </div>
          <div class="relative h-3 rounded-full mt-3 overflow-visible"
               style="background: linear-gradient(90deg,#ef4444,#f59e0b 45%,#9ca3af 50%,#84cc16 60%,#22c55e)">
            <div class="absolute -top-1 w-1.5 h-5 rounded bg-white shadow" [style.left.%]="s.indice" style="transform:translateX(-50%)"></div>
          </div>
          <p class="text-sm text-gray-300 mt-4">{{ s.resume }}</p>
          @if (s.chocsRecents.length) {
            <p class="text-[11px] text-gray-600 mt-3">
              Chocs récents du MJ :
              @for (c of s.chocsRecents; track c.ts) { <span class="ml-1">{{ c.type }} {{ c.valeur >= 0 ? '+' : '' }}{{ c.valeur }}% ({{ c.symbole }})</span> }
            </p>
          }
        </div>

        <div class="rounded-xl border border-gray-800 bg-[#0d121c]">
          <div class="px-4 py-2.5 border-b border-gray-800 text-[11px] uppercase tracking-widest text-gray-400 font-bold">Comportement de chaque trader</div>
          <ul class="divide-y divide-gray-800/60">
            @for (j of s.joueurs; track j.pseudo) {
              <li class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-white">{{ j.pseudo }}</span>
                  <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold" [class]="badgeHumeur(j.humeur)">{{ j.humeur }}</span>
                  <span class="ml-auto font-mono text-xs" [class]="couleurIndice(j.score)">{{ j.score }}</span>
                </div>
                <div class="h-1.5 rounded-full bg-gray-800 mt-2 overflow-hidden">
                  <div class="h-full rounded-full" [class]="fondIndice(j.score)" [style.width.%]="j.score"></div>
                </div>
                <p class="text-[11px] text-gray-500 mt-1.5">{{ j.explication }}</p>
              </li>
            } @empty { <li class="px-4 py-6 text-center text-gray-500 italic text-sm">Aucun trader actif.</li> }
          </ul>
        </div>
        <p class="text-[11px] text-gray-600">
          Analyse calculée d'après les ordres de chaque trader et les chocs du MJ : ventes juste après une chute (panique),
          achats après une hausse (FOMO), achats pendant la baisse (sang-froid), déséquilibre achats/ventes et agitation.
        </p>
      } @else {
        <p class="text-sm text-gray-500 italic">Analyse en cours…</p>
      }

      <!-- Message à cette salle -->
      <div class="rounded-xl border border-gray-800 bg-[#0d121c] p-4">
        <div class="text-[11px] uppercase tracking-widest text-gray-400 font-bold mb-2">Message à cette salle</div>
        <div class="flex gap-2">
          <input [(ngModel)]="texteMessage" maxlength="200" (keyup.enter)="envoyerMessage()" placeholder="Ex. Pensez à diversifier"
                 class="flex-1 bg-[#111827] border border-gray-700 rounded-lg px-3 py-2 text-sm placeholder-gray-600" />
          <button (click)="envoyerMessage()" [disabled]="!texteMessage.trim()"
                  class="px-3 py-2 rounded-lg border border-indigo-400/50 text-indigo-300 text-sm font-semibold hover:bg-indigo-500/10 disabled:opacity-40">Envoyer</button>
        </div>
        <p class="text-[11px] text-gray-600 mt-1.5">Ce message s'affiche chez les joueurs (en tant que « ADMIN ») : il rend votre présence visible.</p>
      </div>
    </div>
  </div>
</div>
  `
})
export class AdminSpectateurComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(AdminLiveService);
  private sub?: Subscription;

  code = '';
  texteMessage = '';

  readonly detail = signal<DetailSalle | null>(null);
  readonly sentiment = signal<SentimentSalle | null>(null);
  readonly erreur = signal('');

  /** Une ligne par position ouverte, tous traders confondus (l'hôte/MJ, 1er de la liste, ne trade pas). */
  readonly lignes = computed<LignePosition[]>(() => {
    const d = this.detail();
    if (!d) return [];
    const out: LignePosition[] = [];
    for (const j of d.joueurs.slice(1)) {
      (j.positions ?? []).forEach((p, i) => {
        const prix = p.prixActuel || 0;
        const valeur = prix * p.quantite;
        const pnl = prix ? (prix - p.prixMoyenAchat) * p.quantite : 0;
        out.push({
          pseudo: j.pseudo, premiere: i === 0, symbole: p.symbole, quantite: p.quantite,
          prixMoyenAchat: p.prixMoyenAchat, prixActuel: prix, valeur, pnl,
          pnlPct: prix && p.prixMoyenAchat ? (prix / p.prixMoyenAchat - 1) * 100 : 0,
          stopLoss: p.stopLoss, takeProfit: p.takeProfit
        });
      });
    }
    return out;
  });
  readonly nbTraders = computed(() => new Set(this.lignes().map(l => l.pseudo)).size);
  readonly evenements = computed(() => [...(this.detail()?.evenements ?? [])].reverse());
  readonly messages = computed(() => [...(this.detail()?.messages ?? [])].reverse());
  readonly impactsActifs = computed(() => {
    const d = this.detail();
    if (!d) return [];
    const out: { nom: string; valeur: number }[] = [];
    if (Math.abs(d.impactGlobal) >= 0.05) out.push({ nom: 'Marché', valeur: d.impactGlobal });
    for (const k of Object.keys(d.impacts ?? {})) {
      const v = d.impacts[k] ?? 0;
      if (Math.abs(v) >= 0.05) out.push({ nom: k, valeur: v });
    }
    return out;
  });

  ngOnInit(): void {
    this.code = this.route.snapshot.paramMap.get('code') ?? '';
    this.rafraichir();
    this.sub = interval(2000).subscribe(() => this.rafraichir());
  }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  private rafraichir(): void {
    this.api.detail(this.code).subscribe({
      next: d => { this.detail.set(d); this.erreur.set(''); },
      error: () => this.erreur.set("Salle introuvable (elle a peut-être été fermée ou le serveur a redémarré).")
    });
    this.api.sentiment(this.code).subscribe({ next: s => this.sentiment.set(s), error: () => {} });
  }

  envoyerMessage(): void {
    const t = this.texteMessage.trim();
    if (!t) return;
    this.api.annonce(this.code, t).subscribe({ next: () => { this.texteMessage = ''; } });
  }

  mmss(sec: number): string {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  libelleEtat(e: string): string {
    return ({ ATTENTE: 'En attente', EN_COURS: 'En cours', TERMINEE: 'Terminée', FERMEE: 'Fermée' } as Record<string, string>)[e] ?? e;
  }
  badgeEtat(e: string): string {
    return ({
      ATTENTE: 'bg-gray-500/15 text-gray-300', EN_COURS: 'bg-emerald-500/15 text-emerald-300',
      TERMINEE: 'bg-indigo-500/15 text-indigo-300', FERMEE: 'bg-red-500/15 text-red-300'
    } as Record<string, string>)[e] ?? 'bg-gray-500/15 text-gray-300';
  }
  couleurIndice(v: number): string {
    return v < 25 ? 'text-red-400' : v < 45 ? 'text-orange-400' : v <= 55 ? 'text-gray-300' : v <= 75 ? 'text-lime-400' : 'text-green-400';
  }
  fondIndice(v: number): string {
    return v < 25 ? 'bg-red-400' : v < 45 ? 'bg-orange-400' : v <= 55 ? 'bg-gray-400' : v <= 75 ? 'bg-lime-400' : 'bg-green-400';
  }
  badgeHumeur(h: SentimentJoueur['humeur']): string {
    return ({
      Paniqué: 'bg-red-500/15 text-red-300', Anxieux: 'bg-orange-500/15 text-orange-300', Inquiet: 'bg-amber-500/15 text-amber-300',
      Neutre: 'bg-gray-500/15 text-gray-300', Observateur: 'bg-gray-500/15 text-gray-400',
      Confiant: 'bg-lime-500/15 text-lime-300', 'Sang-froid': 'bg-emerald-500/15 text-emerald-300', Euphorique: 'bg-green-500/15 text-green-300'
    } as Record<string, string>)[h] ?? 'bg-gray-500/15 text-gray-300';
  }
}