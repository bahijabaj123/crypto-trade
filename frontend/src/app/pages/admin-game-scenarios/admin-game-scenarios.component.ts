import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ScenarioAdmin, ScenarioService } from '../../core/services/scenario.service';

/** Données du formulaire (une seule période et un seul intervalle pour tous les actifs). */
interface Formulaire {
  id: string;
  nom: string;
  description: string;
  difficulte: string;
  icone: string;
  couleur: string;
  ordre: number;
  actif: boolean;
  debut: string;
  fin: string;
  intervalle: '1h' | '1day';
  symboles: string[];
}

/** Dégradés proposés (classes Tailwind écrites en entier pour être détectées à la compilation). */
const COULEURS = [
  { nom: 'Orange / Rouge', classes: 'from-orange-500 to-red-500' },
  { nom: 'Bleu / Jaune', classes: 'from-blue-600 to-yellow-500' },
  { nom: 'Jaune / Rouge', classes: 'from-yellow-500 to-red-600' },
  { nom: 'Rouge / Rose', classes: 'from-red-600 to-rose-800' },
  { nom: 'Indigo / Violet', classes: 'from-indigo-600 to-purple-800' },
  { nom: 'Ardoise / Bleu nuit', classes: 'from-slate-600 to-blue-900' },
  { nom: 'Vert / Émeraude', classes: 'from-green-500 to-emerald-700' },
  { nom: 'Cyan / Bleu', classes: 'from-cyan-500 to-blue-700' }
];

@Component({
  selector: 'app-admin-game-scenarios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-game-scenarios.component.html'
})
export class AdminGameScenariosComponent implements OnInit {
  private readonly service = inject(ScenarioService);

  readonly couleurs = COULEURS;
  readonly difficultes = ['Facile', 'Moyen', 'Difficile', 'Extrême'];
  readonly symbolesCourants = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'SOLUSDT', 'DOGEUSDT', 'LTCUSDT',
    'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT'];
  readonly symbolesMax = 8;

  // Angular 22 : les composants ne se rafraîchissent que si une valeur « signal » change.
  readonly scenarios = signal<ScenarioAdmin[]>([]);
  readonly chargement = signal(true);
  readonly erreur = signal('');
  readonly message = signal('');

  readonly formulaire = signal<Formulaire | null>(null);
  readonly enEdition = signal(false);          // false = création
  readonly enregistrement = signal(false);
  readonly erreurFormulaire = signal('');
  readonly idASupprimer = signal<string | null>(null);

  readonly nbActifs = computed(() => this.scenarios().filter(s => s.actif).length);

  ngOnInit(): void {
    this.recharger();
  }

  // ---------- Liste ----------

  recharger(): void {
    this.chargement.set(true);
    this.erreur.set('');
    this.service.lister().subscribe({
      next: (liste) => { this.scenarios.set(liste); this.chargement.set(false); },
      error: () => {
        this.chargement.set(false);
        this.erreur.set('Impossible de joindre le backend (port 8081). Vérifiez qu’il est lancé.');
      }
    });
  }

  periode(s: ScenarioAdmin): string {
    const r = s.requetes?.[0];
    return r ? `${r.startDate} → ${r.endDate} (${r.interval})` : '—';
  }

  basculerActif(s: ScenarioAdmin): void {
    this.service.changerActif(s.id, !s.actif).subscribe({
      next: (maj) => {
        this.scenarios.update(l => l.map(x => x.id === s.id ? { ...x, actif: maj.actif } : x));
        this.annoncer(maj.actif ? `« ${s.nom} » est visible dans le jeu.` : `« ${s.nom} » est masqué du jeu.`);
      },
      error: (e) => { this.erreur.set(this.texteErreur(e)); }
    });
  }

  demanderSuppression(id: string): void { this.idASupprimer.set(id); }
  annulerSuppression(): void { this.idASupprimer.set(null); }

  confirmerSuppression(s: ScenarioAdmin): void {
    this.service.supprimer(s.id).subscribe({
      next: () => {
        this.idASupprimer.set(null);
        this.scenarios.update(l => l.filter(x => x.id !== s.id));
        this.annoncer(`« ${s.nom} » a été supprimé.`);
      },
      error: (e) => { this.idASupprimer.set(null); this.erreur.set(this.texteErreur(e)); }
    });
  }

  // ---------- Formulaire ----------

  nouveau(): void {
    this.enEdition.set(false);
    this.erreurFormulaire.set('');
    this.formulaire.set({
      id: '', nom: '', description: '', difficulte: 'Difficile', icone: '📉', couleur: COULEURS[0].classes,
      ordre: this.scenarios().length + 1, actif: true, debut: '', fin: '', intervalle: '1h',
      symboles: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT']
    });
  }

  modifier(s: ScenarioAdmin): void {
    const premiere = s.requetes?.[0];
    this.enEdition.set(true);
    this.erreurFormulaire.set('');
    this.formulaire.set({
      id: s.id, nom: s.nom, description: s.description, difficulte: s.difficulte, icone: s.icone,
      couleur: s.couleur, ordre: s.ordre, actif: s.actif,
      debut: premiere?.startDate ?? '', fin: premiere?.endDate ?? '',
      intervalle: premiere?.interval === '1day' ? '1day' : '1h',
      symboles: (s.requetes ?? []).map(r => r.symbol)
    });
  }

  fermer(): void {
    this.formulaire.set(null);
    this.erreurFormulaire.set('');
  }

  ajouterSymbole(): void {
    const f = this.formulaire();
    if (f && f.symboles.length < this.symbolesMax) f.symboles.push('');
  }

  retirerSymbole(i: number): void {
    this.formulaire()?.symboles.splice(i, 1);
  }

  /** Nombre de bougies que le jeu téléchargera (Binance : 1000 maximum). */
  get nbBougies(): number {
    const f = this.formulaire();
    if (!f || !f.debut || !f.fin) return 0;
    const jours = Math.round((new Date(f.fin).getTime() - new Date(f.debut).getTime()) / 86400000);
    if (!(jours > 0)) return 0;
    return f.intervalle === '1h' ? jours * 24 : jours;
  }

  /** Mise en forme du symbole saisi : majuscules, sans espaces. */
  nettoyerSymbole(i: number): void {
    const f = this.formulaire();
    if (!f) return;
    f.symboles[i] = f.symboles[i].toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  enregistrer(): void {
    const f = this.formulaire();
    if (!f) return;

    const symboles = f.symboles.map(s => s.trim()).filter(s => s.length > 0);
    if (new Set(symboles).size !== symboles.length) {
      this.erreurFormulaire.set('Un actif est présent deux fois.');
      return;
    }
    if (symboles.length === 0) {
      this.erreurFormulaire.set('Ajoutez au moins un actif.');
      return;
    }
    if (!f.debut || !f.fin) {
      this.erreurFormulaire.set('Choisissez la date de début et la date de fin.');
      return;
    }

    const scenario: ScenarioAdmin = {
      id: f.id.trim(),
      nom: f.nom,
      description: f.description,
      difficulte: f.difficulte,
      icone: f.icone,
      couleur: f.couleur,
      marche: 'Crypto',
      actif: f.actif,
      ordre: Number(f.ordre) || 0,
      requetes: symboles.map(symbol => ({
        source: 'binance' as const, symbol, startDate: f.debut, endDate: f.fin, interval: f.intervalle
      }))
    };

    this.enregistrement.set(true);
    this.erreurFormulaire.set('');
    const appel = this.enEdition() ? this.service.modifier(scenario) : this.service.creer(scenario);
    appel.subscribe({
      next: () => {
        this.enregistrement.set(false);
        this.annoncer(this.enEdition() ? `« ${scenario.nom} » a été modifié.` : `« ${scenario.nom} » a été créé.`);
        this.fermer();
        this.recharger();
      },
      error: (e) => {
        this.enregistrement.set(false);
        this.erreurFormulaire.set(this.texteErreur(e));
      }
    });
  }

  // ---------- Interne ----------

  /** Affiche un message de réussite et rafraîchit la liste vue par le jeu (même navigateur). */
  private annoncer(texte: string): void {
    this.message.set(texte);
    this.service.charger();
    setTimeout(() => { if (this.message() === texte) this.message.set(''); }, 4000);
  }

  private texteErreur(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      if (e.status === 0) return 'Impossible de joindre le backend (port 8081).';
      const m = e.error?.message;
      if (typeof m === 'string' && m) return m;
    }
    return 'Une erreur est survenue.';
  }
}
