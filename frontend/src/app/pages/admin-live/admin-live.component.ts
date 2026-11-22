import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import {
  AdminLiveService, DetailSalle, JoueurAdmin, ResumeSondage, SalleAdmin, StatsFormation
} from '../../core/services/admin-live.service';

type Onglet = 'salles' | 'joueurs' | 'classement' | 'formation' | 'retours';

@Component({
  selector: 'app-admin-live',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  template: `
<div class="p-4 md:p-6 space-y-5 text-gray-200">

  <!-- ===== EN-TÊTE ===== -->
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-xl font-bold text-white flex items-center gap-2">
        Suivi en direct
        <span class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
          <span class="w-2 h-2 rounded-full" [class]="enLigne() ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'"></span>
          {{ enLigne() ? 'en direct' : 'hors ligne' }}
        </span>
      </h1>
      <p class="text-xs text-gray-500">Mise à jour toutes les 3 s · dernière : {{ derniereMaj() || '—' }}</p>
    </div>
  </div>

  <!-- ===== KPI ===== -->
  <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
    @for (k of kpis(); track k.label) {
      <div class="rounded-xl border border-gray-800 bg-[#0d121c] px-4 py-3">
        <div class="text-[10px] uppercase tracking-widest text-gray-500">{{ k.label }}</div>
        <div class="text-2xl font-bold mt-1" [class]="k.couleur">{{ k.valeur }}</div>
      </div>
    }
  </div>

  <!-- ===== À SURVEILLER ===== -->
  @if (asurveiller().length) {
    <div class="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
      <div class="text-[11px] uppercase tracking-widest text-amber-300 font-bold mb-1.5">À surveiller</div>
      <div class="flex flex-wrap gap-2">
        @for (j of asurveiller(); track j.salle + j.pseudo) {
          <span class="text-xs px-2.5 py-1 rounded-full border border-amber-500/30 text-amber-200">
            {{ j.pseudo }} · {{ j.salle }} ·
            @if (j.presence === 'ABSENT' || j.presence === 'INACTIF') { inactif depuis {{ j.inactifSec }} s }
            @else { baisse de {{ j.drawdown | number:'1.0-0' }} % }
          </span>
        }
      </div>
    </div>
  }

  <!-- ===== MESSAGE À TOUS ===== -->
  <div class="rounded-xl border border-gray-800 bg-[#0d121c] p-4">
    <div class="text-[11px] uppercase tracking-widest text-gray-400 font-bold mb-2">Message aux joueurs</div>
    <div class="flex flex-wrap gap-2 items-center">
      <select [(ngModel)]="cibleAnnonce"
              class="bg-[#111827] border border-gray-700 rounded-lg px-3 py-2 text-sm">
        <option value="TOUTES">Toutes les salles</option>
        @for (s of salles(); track s.code) { <option [value]="s.code">{{ s.code }}</option> }
      </select>
      <input [(ngModel)]="texteAnnonce" maxlength="200" placeholder="Ex. La séance reprend dans 5 minutes"
             (keyup.enter)="envoyerAnnonce()"
             class="flex-1 min-w-[220px] bg-[#111827] border border-gray-700 rounded-lg px-3 py-2 text-sm placeholder-gray-600" />
      <button (click)="envoyerAnnonce()" [disabled]="!texteAnnonce.trim()"
              class="px-4 py-2 rounded-lg border border-indigo-400/50 text-indigo-300 text-sm font-semibold hover:bg-indigo-500/10 disabled:opacity-40 transition">
        Envoyer
      </button>
    </div>
    <div class="flex flex-wrap gap-2 mt-2">
      @for (m of messagesRapides; track m) {
        <button (click)="texteAnnonce = m"
                class="text-[11px] px-2.5 py-1 rounded-full border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition">
          {{ m }}
        </button>
      }
    </div>
    @if (retour()) { <div class="text-xs text-emerald-300 mt-2">{{ retour() }}</div> }
  </div>

  <!-- ===== ONGLETS ===== -->
  <div class="flex gap-1 border-b border-gray-800">
    @for (o of onglets; track o.id) {
      <button (click)="onglet.set(o.id)"
              class="px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition"
              [class]="onglet() === o.id ? 'border-indigo-400 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'">
        {{ o.label }}
      </button>
    }
  </div>

  <!-- ================= SALLES ================= -->
  @if (onglet() === 'salles') {
    <div class="rounded-xl border border-gray-800 bg-[#0d121c] overflow-x-auto">
      <table class="w-full text-left text-sm min-w-[760px]">
        <thead class="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
          <tr>
            <th class="px-4 py-2.5">Code</th><th class="px-3 py-2.5">Scénario</th><th class="px-3 py-2.5">Hôte</th>
            <th class="px-3 py-2.5">Joueurs</th><th class="px-3 py-2.5">État</th><th class="px-3 py-2.5">Temps restant</th>
            <th class="px-3 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800/70">
          @for (s of salles(); track s.code) {
            <tr class="hover:bg-white/[0.03]">
              <td class="px-4 py-2.5 font-mono font-bold text-white">{{ s.code }}</td>
              <td class="px-3 py-2.5 text-gray-400">{{ s.scenarioId }}</td>
              <td class="px-3 py-2.5 text-amber-300">{{ s.hote }}</td>
              <td class="px-3 py-2.5">{{ s.nbActifs }} <span class="text-gray-600">/ {{ s.nbJoueurs }}</span></td>
              <td class="px-3 py-2.5">
                <span class="px-2 py-0.5 rounded-full text-[11px] font-bold" [class]="badgeEtat(s.etat)">{{ libelleEtat(s.etat) }}</span>
              </td>
              <td class="px-3 py-2.5 font-mono text-gray-300">{{ s.etat === 'EN_COURS' ? mmss(s.tempsRestantSec) : '—' }}</td>
              <td class="px-3 py-2.5 text-right whitespace-nowrap">
                <button (click)="ouvrir(s.code)"
                        class="px-3 py-1 rounded-lg border border-gray-600 text-gray-300 text-xs font-semibold hover:bg-white/5 transition">Voir</button>
                <button (click)="espionner(s.code)"
                        class="ml-1.5 px-3 py-1 rounded-lg border border-indigo-400/50 text-indigo-300 text-xs font-semibold hover:bg-indigo-500/10 transition">👁 Spectateur</button>
                @if (s.etat !== 'FERMEE') {
                  <button (click)="fermerSalle(s)"
                          class="ml-1.5 px-3 py-1 rounded-lg border border-red-500/50 text-red-400 text-xs font-semibold hover:bg-red-500/10 transition">Fermer</button>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="text-center py-8 text-gray-500 italic">Aucune salle pour le moment.</td></tr>
          }
        </tbody>
      </table>
    </div>

    <!-- Détail d'une salle -->
    @if (selection() && detail(); as d) {
      <div class="rounded-xl border border-gray-800 bg-[#0d121c] p-4 space-y-4">
        <div class="flex items-center justify-between">
          <div class="font-bold text-white">Salle {{ d.code }} <span class="text-xs text-gray-500 font-normal">· {{ libelleEtat(d.etat) }}</span></div>
          <button (click)="selection.set(null)" class="text-xs text-gray-500 hover:text-white">Fermer le détail ✕</button>
        </div>

        @if (clesImpacts(d).length || d.impactGlobal) {
          <div class="flex flex-wrap gap-2 text-xs">
            <span class="text-gray-500">Impacts de prix :</span>
            @if (d.impactGlobal) { <span class="px-2 py-0.5 rounded-full bg-gray-800">Marché {{ d.impactGlobal | number:'1.1-1' }} %</span> }
            @for (k of clesImpacts(d); track k) {
              <span class="px-2 py-0.5 rounded-full bg-gray-800">{{ k }} {{ d.impacts[k] | number:'1.1-1' }} %</span>
            }
          </div>
        }

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs min-w-[720px]">
            <thead class="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
              <tr><th class="px-2 py-2">Trader</th><th class="px-2 py-2">Actif</th><th class="px-2 py-2">Quantité</th>
                  <th class="px-2 py-2">Prix moyen</th><th class="px-2 py-2">Stop / Take</th><th class="px-2 py-2">P&amp;L %</th><th class="px-2 py-2"></th></tr>
            </thead>
            <tbody class="divide-y divide-gray-800/60">
              @for (j of joueursDetail(d); track j.pseudo) {
                @if (j.positions.length) {
                  @for (p of j.positions; track p.symbole; let i = $index) {
                    <tr>
                      <td class="px-2 py-1.5 font-bold text-amber-300">{{ i === 0 ? j.pseudo : '' }}</td>
                      <td class="px-2 py-1.5 font-bold">{{ p.symbole }}</td>
                      <td class="px-2 py-1.5 font-mono">{{ p.quantite | number:'1.0-4' }}</td>
                      <td class="px-2 py-1.5 font-mono text-gray-400">{{ p.prixMoyenAchat | number:'1.2-2' }} $</td>
                      <td class="px-2 py-1.5 font-mono">
                        <span class="text-red-400">{{ p.stopLoss ? (p.stopLoss | number:'1.2-2') : '-' }}</span>
                        <span class="text-gray-600"> / </span>
                        <span class="text-green-400">{{ p.takeProfit ? (p.takeProfit | number:'1.2-2') : '-' }}</span>
                      </td>
                      <td class="px-2 py-1.5 font-mono" [class]="j.pnlPct >= 0 ? 'text-green-400' : 'text-red-400'">
                        {{ i === 0 ? ((j.pnlPct >= 0 ? '+' : '') + (j.pnlPct | number:'1.1-1') + ' %') : '' }}
                      </td>
                      <td class="px-2 py-1.5 text-right">
                        @if (i === 0 && !j.exclu) {
                          <button (click)="exclure(d.code, j.pseudo)"
                                  class="px-2 py-0.5 rounded border border-red-500/40 text-red-400 text-[11px] hover:bg-red-500/10">Exclure</button>
                        }
                      </td>
                    </tr>
                  }
                } @else {
                  <tr>
                    <td class="px-2 py-1.5 font-bold text-amber-300">{{ j.pseudo }}</td>
                    <td class="px-2 py-1.5 text-gray-600 italic" colspan="4">aucune position ouverte</td>
                    <td class="px-2 py-1.5 font-mono" [class]="j.pnlPct >= 0 ? 'text-green-400' : 'text-red-400'">{{ (j.pnlPct >= 0 ? '+' : '') + (j.pnlPct | number:'1.1-1') }} %</td>
                    <td class="px-2 py-1.5 text-right">
                      @if (!j.exclu) {
                        <button (click)="exclure(d.code, j.pseudo)"
                                class="px-2 py-0.5 rounded border border-red-500/40 text-red-400 text-[11px] hover:bg-red-500/10">Exclure</button>
                      } @else { <span class="text-[11px] text-red-400">exclu</span> }
                    </td>
                  </tr>
                }
              } @empty {
                <tr><td colspan="7" class="text-center py-4 text-gray-500 italic">Aucun joueur dans cette salle.</td></tr>
              }
            </tbody>
          </table>
        </div>

        <div>
          <div class="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">Derniers événements</div>
          <ul class="text-xs text-gray-400 space-y-0.5 max-h-40 overflow-auto">
            @for (e of evenementsInverses(d); track $index) { <li>{{ e }}</li> }
          </ul>
        </div>
      </div>
    }
  }

  <!-- ================= JOUEURS ================= -->
  @if (onglet() === 'joueurs') {
    <div class="flex flex-wrap gap-2">
      <select [(ngModel)]="filtreSalle" class="bg-[#111827] border border-gray-700 rounded-lg px-3 py-2 text-sm">
        <option value="TOUTES">Toutes les salles</option>
        @for (s of salles(); track s.code) { <option [value]="s.code">{{ s.code }}</option> }
      </select>
      <select [(ngModel)]="filtrePresence" class="bg-[#111827] border border-gray-700 rounded-lg px-3 py-2 text-sm">
        <option value="TOUS">Tous les états</option>
        <option value="ACTIF">En jeu</option>
        <option value="INACTIF">Inactifs</option>
        <option value="ABSENT">Absents</option>
        <option value="TERMINE">Terminés</option>
        <option value="PARTI">Partis</option>
      </select>
    </div>
    <div class="rounded-xl border border-gray-800 bg-[#0d121c] overflow-x-auto">
      <table class="w-full text-left text-sm min-w-[860px]">
        <thead class="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
          <tr>
            <th class="px-4 py-2.5">Joueur</th><th class="px-3 py-2.5">Salle</th><th class="px-3 py-2.5">Présence</th>
            <th class="px-3 py-2.5">Ordres</th><th class="px-3 py-2.5">P&amp;L</th><th class="px-3 py-2.5">Baisse max</th>
            <th class="px-3 py-2.5">Profil</th><th class="px-3 py-2.5 text-right"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800/70">
          @for (j of joueursFiltres(); track j.salle + j.pseudo) {
            <tr class="hover:bg-white/[0.03]" [class.opacity-50]="j.presence === 'PARTI'">
              <td class="px-4 py-2.5 font-bold text-white">{{ j.pseudo }}</td>
              <td class="px-3 py-2.5 font-mono text-gray-400">{{ j.salle }}</td>
              <td class="px-3 py-2.5">
                <span class="px-2 py-0.5 rounded-full text-[11px] font-bold" [class]="badgePresence(j.presence)">{{ libellePresence(j.presence) }}</span>
                @if (j.presence === 'INACTIF' || j.presence === 'ABSENT') { <span class="text-[11px] text-gray-500 ml-1">{{ j.inactifSec }} s</span> }
              </td>
              <td class="px-3 py-2.5 font-mono">{{ j.nbOrdres }}</td>
              <td class="px-3 py-2.5 font-mono" [class]="j.pnlPct >= 0 ? 'text-green-400' : 'text-red-400'">
                {{ j.pnlPct >= 0 ? '+' : '' }}{{ j.pnlPct | number:'1.1-1' }} %
              </td>
              <td class="px-3 py-2.5 font-mono text-gray-300">{{ j.drawdown | number:'1.1-1' }} %</td>
              <td class="px-3 py-2.5"><span class="px-2 py-0.5 rounded-full text-[11px] font-semibold" [class]="badgeProfil(j.profil)">{{ j.profil }}</span></td>
              <td class="px-3 py-2.5 text-right">
                @if (!j.exclu && j.presence !== 'PARTI') {
                  <button (click)="exclure(j.salle, j.pseudo)"
                          class="px-2.5 py-1 rounded-lg border border-red-500/40 text-red-400 text-xs font-semibold hover:bg-red-500/10 transition">Exclure</button>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="8" class="text-center py-8 text-gray-500 italic">Aucun joueur.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- ================= CLASSEMENT ================= -->
  @if (onglet() === 'classement') {
    <div class="flex flex-wrap gap-2 items-center">
      <select [(ngModel)]="salleClassement" class="bg-[#111827] border border-gray-700 rounded-lg px-3 py-2 text-sm">
        <option value="TOUTES">Toute la séance (global)</option>
        @for (s of salles(); track s.code) { <option [value]="s.code">Salle {{ s.code }}</option> }
      </select>
    </div>

    <div class="grid lg:grid-cols-2 gap-4">
      <div class="rounded-xl border border-gray-800 bg-[#0d121c]">
        <div class="px-4 py-2.5 border-b border-gray-800 text-[11px] uppercase tracking-widest text-gray-400 font-bold">Meilleurs P&amp;L</div>
        <ol>
          @for (j of classementPnl(); track j.salle + j.pseudo; let i = $index) {
            <li class="flex items-center gap-3 px-4 py-2 border-b border-gray-800/60 last:border-0">
              <span class="w-6 text-center font-bold" [class]="i === 0 ? 'text-amber-300' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-orange-400' : 'text-gray-600'">{{ i + 1 }}</span>
              <span class="flex-1 font-semibold text-white">{{ j.pseudo }} <span class="text-[11px] text-gray-600 font-mono">{{ j.salle }}</span></span>
              <span class="font-mono font-bold" [class]="j.pnlPct >= 0 ? 'text-green-400' : 'text-red-400'">{{ j.pnlPct >= 0 ? '+' : '' }}{{ j.pnlPct | number:'1.1-1' }} %</span>
            </li>
          } @empty { <li class="px-4 py-6 text-center text-gray-500 italic text-sm">Pas encore de résultats.</li> }
        </ol>
      </div>

      <div class="rounded-xl border border-gray-800 bg-[#0d121c]">
        <div class="px-4 py-2.5 border-b border-gray-800 text-[11px] uppercase tracking-widest text-gray-400 font-bold">Meilleurs scores de comportement</div>
        <ol>
          @for (j of classementScore(); track j.salle + j.pseudo; let i = $index) {
            <li class="flex items-center gap-3 px-4 py-2 border-b border-gray-800/60 last:border-0">
              <span class="w-6 text-center font-bold" [class]="i === 0 ? 'text-amber-300' : 'text-gray-600'">{{ i + 1 }}</span>
              <span class="flex-1 font-semibold text-white">{{ j.pseudo }}
                <span class="text-[11px] ml-1 px-1.5 py-0.5 rounded-full" [class]="badgeProfil(j.profil)">{{ j.profil }}</span></span>
              <span class="font-mono font-bold text-indigo-300">{{ j.score }}/100</span>
            </li>
          } @empty { <li class="px-4 py-6 text-center text-gray-500 italic text-sm">Le score apparaît quand un joueur a terminé sa séance.</li> }
        </ol>
      </div>
    </div>

    <div class="rounded-xl border border-gray-800 bg-[#0d121c] p-4">
      <div class="text-[11px] uppercase tracking-widest text-gray-400 font-bold mb-3">Profils de traders</div>
      @if (profils().length) {
        <div class="space-y-2">
          @for (p of profils(); track p.nom) {
            <div class="flex items-center gap-3 text-sm">
              <span class="w-28 text-gray-300">{{ p.nom }}</span>
              <div class="flex-1 h-2.5 rounded-full bg-gray-800 overflow-hidden">
                <div class="h-full rounded-full bg-indigo-400/70" [style.width.%]="p.pct"></div>
              </div>
              <span class="w-16 text-right font-mono text-gray-400">{{ p.n }} ({{ p.pct | number:'1.0-0' }} %)</span>
            </div>
          }
        </div>
        <p class="text-[11px] text-gray-600 mt-3">
          Calculé d'après le nombre d'ordres, l'usage du stop-loss, la baisse maximale et la concentration du portefeuille.
        </p>
      } @else { <p class="text-sm text-gray-500 italic">Aucun joueur pour le moment.</p> }
    </div>
  }

  <!-- ================= FORMATION ================= -->
  @if (onglet() === 'formation') {
    @if (formation(); as f) {
      <div class="grid lg:grid-cols-2 gap-4">
        <div class="rounded-xl border border-gray-800 bg-[#0d121c]">
          <div class="px-4 py-2.5 border-b border-gray-800 text-[11px] uppercase tracking-widest text-gray-400 font-bold">Leçons : où les gens abandonnent</div>
          <div class="p-4 space-y-3">
            @for (l of f.lecons; track l.id) {
              <div>
                <div class="flex justify-between text-xs mb-1">
                  <span class="text-gray-300">{{ l.id }}</span>
                  <span class="text-gray-500">{{ l.terminees }} terminées / {{ l.ouvertes }} ouvertes ·
                    <span [class]="l.tauxAbandonPct >= 50 ? 'text-red-400' : 'text-amber-300'">{{ l.tauxAbandonPct }} % d'abandon</span></span>
                </div>
                <div class="h-2 rounded-full bg-gray-800 overflow-hidden">
                  <div class="h-full bg-emerald-400/70" [style.width.%]="l.ouvertes ? 100 * l.terminees / l.ouvertes : 0"></div>
                </div>
              </div>
            } @empty { <p class="text-sm text-gray-500 italic">Aucune leçon ouverte pour le moment.</p> }
          </div>
        </div>

        <div class="rounded-xl border border-gray-800 bg-[#0d121c]">
          <div class="px-4 py-2.5 border-b border-gray-800 text-[11px] uppercase tracking-widest text-gray-400 font-bold">Quiz</div>
          <div class="p-4 space-y-3">
            @for (q of f.quiz; track q.id) {
              <div>
                <div class="flex justify-between text-xs mb-1">
                  <span class="text-gray-300">{{ q.id }}</span>
                  <span class="text-gray-500">{{ q.tentatives }} essais · score moyen {{ q.scoreMoyenPct }} % ·
                    <span [class]="q.tauxReussitePct < 50 ? 'text-red-400' : 'text-emerald-300'">{{ q.tauxReussitePct }} % réussite</span></span>
                </div>
                <div class="h-2 rounded-full bg-gray-800 overflow-hidden">
                  <div class="h-full bg-indigo-400/70" [style.width.%]="q.tauxReussitePct"></div>
                </div>
              </div>
            } @empty { <p class="text-sm text-gray-500 italic">Aucun quiz passé pour le moment.</p> }
          </div>
        </div>
      </div>

      <div class="rounded-xl border border-gray-800 bg-[#0d121c]">
        <div class="px-4 py-2.5 border-b border-gray-800 text-[11px] uppercase tracking-widest text-gray-400 font-bold">Questions les plus ratées</div>
        <table class="w-full text-sm text-left">
          <tbody class="divide-y divide-gray-800/70">
            @for (r of f.questionsRatees; track r.quiz + r.question) {
              <tr><td class="px-4 py-2 text-gray-400">{{ r.quiz }}</td><td class="px-3 py-2 text-gray-200">{{ r.question }}</td>
                  <td class="px-4 py-2 text-right font-mono text-red-400">{{ r.ratees }} ratés</td></tr>
            } @empty { <tr><td class="px-4 py-6 text-center text-gray-500 italic">Pas encore de données.</td></tr> }
          </tbody>
        </table>
      </div>
      <p class="text-[11px] text-gray-600">{{ f.evenements }} événements enregistrés depuis le dernier démarrage du serveur.</p>
    } @else {
      <p class="text-sm text-gray-500 italic">Chargement…</p>
    }
  }

  <!-- ================= RETOURS JOUEURS (sondage) ================= -->
  @if (onglet() === 'retours') {
    @if (sondage(); as q) {
      <div class="grid lg:grid-cols-3 gap-4">
        <div class="rounded-xl border border-gray-800 bg-[#0d121c] p-5 text-center">
          <div class="text-[10px] uppercase tracking-widest text-gray-500">Note moyenne</div>
          <div class="text-5xl font-bold text-white mt-2">{{ q.nb ? (q.moyenne | number:'1.1-1') : '—' }}<span class="text-xl text-gray-500"> / 5</span></div>
          <div class="text-amber-300 text-xl mt-1 tracking-widest">{{ etoiles(q.moyenne) }}</div>
          <div class="text-xs text-gray-500 mt-2">{{ q.nb }} réponse(s)</div>
        </div>
        <div class="rounded-xl border border-gray-800 bg-[#0d121c] p-5 lg:col-span-2">
          <div class="text-[11px] uppercase tracking-widest text-gray-400 font-bold mb-3">Répartition des notes</div>
          @for (n of [5,4,3,2,1]; track n) {
            <div class="flex items-center gap-3 text-sm mb-1.5">
              <span class="w-8 text-gray-400">{{ n }} ★</span>
              <div class="flex-1 h-2.5 rounded-full bg-gray-800 overflow-hidden">
                <div class="h-full rounded-full bg-amber-300/70" [style.width.%]="q.nb ? 100 * q.repartition[n - 1] / q.nb : 0"></div>
              </div>
              <span class="w-8 text-right font-mono text-gray-400">{{ q.repartition[n - 1] }}</span>
            </div>
          }
        </div>
      </div>

      <div class="rounded-xl border border-gray-800 bg-[#0d121c] p-4">
        <div class="text-[11px] uppercase tracking-widest text-gray-400 font-bold mb-2">Ce qui a gêné le plus</div>
        <div class="flex flex-wrap gap-2">
          @for (t of q.tags; track t.tag) {
            <span class="px-3 py-1 rounded-full border border-gray-700 text-sm text-gray-300">{{ t.tag }} <b class="text-white">{{ t.n }}</b></span>
          } @empty { <span class="text-sm text-gray-500 italic">Aucune piste cochée pour le moment.</span> }
        </div>
      </div>

      <div class="rounded-xl border border-gray-800 bg-[#0d121c]">
        <div class="px-4 py-2.5 border-b border-gray-800 text-[11px] uppercase tracking-widest text-gray-400 font-bold">Commentaires</div>
        <ul class="divide-y divide-gray-800/70">
          @for (r of q.commentaires; track r.ts + r.pseudo) {
            <li class="px-4 py-3">
              <div class="flex items-center gap-2 text-xs mb-1">
                <span class="font-bold text-white">{{ r.pseudo }}</span>
                <span class="text-gray-600 font-mono">{{ r.salle }}</span>
                <span class="text-amber-300">{{ etoiles(r.note) }}</span>
              </div>
              <p class="text-sm text-gray-200">{{ r.commentaire }}</p>
              @if (r.tags.length) { <p class="text-[11px] text-gray-500 mt-1">{{ r.tags.join(' · ') }}</p> }
            </li>
          } @empty { <li class="px-4 py-6 text-center text-gray-500 italic text-sm">Pas encore de commentaire.</li> }
        </ul>
      </div>
    } @else { <p class="text-sm text-gray-500 italic">Chargement…</p> }
  }
</div>
  `
})
export class AdminLiveComponent implements OnInit, OnDestroy {
  private readonly api = inject(AdminLiveService);
  private readonly router = inject(Router);
  private sub?: Subscription;

  readonly onglets: { id: Onglet; label: string }[] = [
    { id: 'salles', label: 'Salles actives' },
    { id: 'joueurs', label: 'Joueurs connectés' },
    { id: 'classement', label: 'Classement' },
    { id: 'formation', label: 'Formation' },
    { id: 'retours', label: 'Retours joueurs' },
  ];
  readonly messagesRapides = [
    'La séance reprend dans 5 minutes',
    'Plus que 2 minutes !',
    'Pensez à utiliser le stop-loss',
    'Fin de séance, merci à tous !',
  ];

  readonly onglet = signal<Onglet>('salles');
  readonly salles = signal<SalleAdmin[]>([]);
  readonly joueurs = signal<JoueurAdmin[]>([]);
  readonly detail = signal<DetailSalle | null>(null);
  readonly formation = signal<StatsFormation | null>(null);
  readonly sondage = signal<ResumeSondage | null>(null);
  readonly selection = signal<string | null>(null);
  readonly enLigne = signal(false);
  readonly derniereMaj = signal('');
  readonly retour = signal('');

  cibleAnnonce = 'TOUTES';
  texteAnnonce = '';
  filtreSalle = 'TOUTES';
  filtrePresence = 'TOUS';
  salleClassement = 'TOUTES';

  // ---------- indicateurs ----------
  readonly kpis = computed(() => {
    const s = this.salles(), j = this.joueurs();
    const actives = s.filter(x => x.etat === 'EN_COURS' || x.etat === 'ATTENTE').length;
    const enJeu = j.filter(x => x.presence === 'ACTIF').length;
    const alertes = j.filter(x => x.presence === 'INACTIF' || x.presence === 'ABSENT').length;
    const ordres = j.reduce((a, x) => a + x.nbOrdres, 0);
    return [
      { label: 'Salles actives', valeur: actives, couleur: 'text-white' },
      { label: 'Joueurs en jeu', valeur: enJeu, couleur: 'text-emerald-300' },
      { label: 'Inactifs / absents', valeur: alertes, couleur: alertes ? 'text-amber-300' : 'text-gray-400' },
      { label: 'Terminés', valeur: j.filter(x => x.presence === 'TERMINE').length, couleur: 'text-indigo-300' },
      { label: 'Ordres passés', valeur: ordres, couleur: 'text-white' },
    ];
  });

  readonly asurveiller = computed(() =>
    this.joueurs().filter(j =>
      j.etatSalle === 'EN_COURS' && !j.termine &&
      (j.presence === 'INACTIF' || j.presence === 'ABSENT' || j.drawdown >= 20)
    ).slice(0, 12));

  readonly joueursFiltres = computed(() =>
    this.joueurs().filter(j =>
      (this.filtreSalle === 'TOUTES' || j.salle === this.filtreSalle) &&
      (this.filtrePresence === 'TOUS' || j.presence === this.filtrePresence)));

  private joueursClassement(): JoueurAdmin[] {
    return this.joueurs().filter(j => this.salleClassement === 'TOUTES' || j.salle === this.salleClassement);
  }
  classementPnl(): JoueurAdmin[] {
    return this.joueursClassement().filter(j => j.nbOrdres > 0 || j.termine)
      .sort((a, b) => b.pnlPct - a.pnlPct).slice(0, 10);
  }
  classementScore(): JoueurAdmin[] {
    return this.joueursClassement().filter(j => j.termine && j.score > 0)
      .sort((a, b) => b.score - a.score).slice(0, 10);
  }
  profils(): { nom: string; n: number; pct: number }[] {
    const l = this.joueursClassement();
    const cnt = new Map<string, number>();
    l.forEach(j => cnt.set(j.profil, (cnt.get(j.profil) ?? 0) + 1));
    return [...cnt.entries()].map(([nom, n]) => ({ nom, n, pct: l.length ? 100 * n / l.length : 0 }))
      .sort((a, b) => b.n - a.n);
  }

  // ---------- cycle de vie ----------
  ngOnInit(): void {
    this.rafraichir();
    this.sub = interval(3000).subscribe(() => this.rafraichir());
  }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  private rafraichir(): void {
    this.api.salles().subscribe({
      next: s => { this.salles.set(s); this.enLigne.set(true); this.derniereMaj.set(new Date().toLocaleTimeString('fr-FR')); },
      error: () => this.enLigne.set(false)
    });
    this.api.joueurs().subscribe({ next: j => this.joueurs.set(j), error: () => {} });
    const code = this.selection();
    if (code) this.api.detail(code).subscribe({ next: d => this.detail.set(d), error: () => this.detail.set(null) });
    if (this.onglet() === 'formation') this.api.formation().subscribe({ next: f => this.formation.set(f), error: () => {} });
    if (this.onglet() === 'retours') this.api.sondage().subscribe({ next: q => this.sondage.set(q), error: () => {} });
  }

  // ---------- actions ----------
  espionner(code: string): void { this.router.navigate(['/admin/live', code]); }

  ouvrir(code: string): void {
    this.selection.set(code);
    this.api.detail(code).subscribe({ next: d => this.detail.set(d), error: () => this.detail.set(null) });
  }

  fermerSalle(s: SalleAdmin): void {
    if (!confirm(`Fermer la salle ${s.code} ? Les joueurs seront renvoyés au lobby.`)) return;
    this.api.fermer(s.code).subscribe({ next: () => { this.signaler(`Salle ${s.code} fermée.`); this.rafraichir(); } });
  }

  exclure(code: string, pseudo: string): void {
    if (!confirm(`Exclure ${pseudo} de la salle ${code} ?`)) return;
    this.api.exclure(code, pseudo).subscribe({ next: () => { this.signaler(`${pseudo} a été exclu.`); this.rafraichir(); } });
  }

  envoyerAnnonce(): void {
    const t = this.texteAnnonce.trim();
    if (!t) return;
    this.api.annonce(this.cibleAnnonce === 'TOUTES' ? null : this.cibleAnnonce, t).subscribe({
      next: n => { this.signaler(`Message envoyé à ${n} salle(s).`); this.texteAnnonce = ''; }
    });
  }

  private signaler(msg: string): void {
    this.retour.set(msg);
    setTimeout(() => this.retour.set(''), 4000);
  }

  // ---------- helpers d'affichage ----------
  etoiles(n: number): string {
    const k = Math.round(n);
    return '★'.repeat(Math.max(0, Math.min(5, k))) + '☆'.repeat(5 - Math.max(0, Math.min(5, k)));
  }
  mmss(sec: number): string {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  clesImpacts(d: DetailSalle): string[] {
    return Object.keys(d.impacts ?? {}).filter(k => Math.abs(d.impacts[k] ?? 0) >= 0.05);
  }
  joueursDetail(d: DetailSalle) { return d.joueurs.slice(1); }   // le 1er est l'hôte (il ne trade pas)
  evenementsInverses(d: DetailSalle): string[] { return [...d.evenements].reverse(); }

  libelleEtat(e: string): string {
    return ({ ATTENTE: 'En attente', EN_COURS: 'En cours', TERMINEE: 'Terminée', FERMEE: 'Fermée' } as Record<string, string>)[e] ?? e;
  }
  badgeEtat(e: string): string {
    return ({
      ATTENTE: 'bg-gray-500/15 text-gray-300', EN_COURS: 'bg-emerald-500/15 text-emerald-300',
      TERMINEE: 'bg-indigo-500/15 text-indigo-300', FERMEE: 'bg-red-500/15 text-red-300'
    } as Record<string, string>)[e] ?? 'bg-gray-500/15 text-gray-300';
  }
  libellePresence(p: string): string {
    return ({ ACTIF: 'En jeu', INACTIF: 'Inactif', ABSENT: 'Absent ?', PARTI: 'Parti', TERMINE: 'Terminé', ATTENTE: 'En attente' } as Record<string, string>)[p] ?? p;
  }
  badgePresence(p: string): string {
    return ({
      ACTIF: 'bg-emerald-500/15 text-emerald-300', INACTIF: 'bg-amber-500/15 text-amber-300',
      ABSENT: 'bg-red-500/15 text-red-300', PARTI: 'bg-gray-500/15 text-gray-400',
      TERMINE: 'bg-indigo-500/15 text-indigo-300', ATTENTE: 'bg-gray-500/15 text-gray-300'
    } as Record<string, string>)[p] ?? 'bg-gray-500/15 text-gray-300';
  }
  badgeProfil(p: string): string {
    return ({
      Prudent: 'bg-emerald-500/15 text-emerald-300', Équilibré: 'bg-sky-500/15 text-sky-300',
      Patient: 'bg-teal-500/15 text-teal-300', Impulsif: 'bg-red-500/15 text-red-300',
      Risqué: 'bg-orange-500/15 text-orange-300', Concentré: 'bg-amber-500/15 text-amber-300',
      Observateur: 'bg-gray-500/15 text-gray-400'
    } as Record<string, string>)[p] ?? 'bg-gray-500/15 text-gray-300';
  }
}