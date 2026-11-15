import { Component, OnDestroy, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SCENARIOS_CONFIG, ScenarioConfig } from '../../../core/models/scenario-config';
import { GameLiveService } from '../../../core/services/game-live.service';
import { AuthService } from '../../../core/services/auth.service';

const CLE_PSEUDO = 'cryptotrade.pseudo';

/** Lobby de la Salle Vivante : pas de "lancer la partie" — on entre directement.
 *  Créateur => role=HOST (Meneur de Jeu, ne trade pas). Rejoindre => role=PLAYER. */
@Component({
  selector: 'app-game-live-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './game-live-lobby.component.html',
  styleUrls: ['./game-live-lobby.component.css']
})
export class GameLiveLobbyComponent implements OnDestroy {
  private readonly router = inject(Router);
  private readonly live = inject(GameLiveService);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  readonly scenarios: ScenarioConfig[] = SCENARIOS_CONFIG;
  readonly durees = [5, 15, 30, 60];

  onglet: 'creer' | 'rejoindre' = 'creer';
  pseudo = '';
  codeSaisi = '';
  scenarioSelectionne = SCENARIOS_CONFIG[0].id;
  dureeChoisie = 15;
  messageErreur = '';
  enCours = false;
  codeCopie = false;
  private navigue = false;

  constructor() {
    try { this.pseudo = localStorage.getItem(CLE_PSEUDO) ?? ''; } catch { }
    const nom = this.auth.utilisateur()?.nom;
    if (!this.pseudo && nom) this.pseudo = nom.slice(0, 20);
    const code = (this.route.snapshot.queryParamMap.get('salle') ?? '').trim().toUpperCase();
    if (/^[A-Z0-9-]{3,20}$/.test(code)) { this.codeSaisi = code; this.onglet = 'rejoindre'; }

    this.live.arreterPolling();
    this.live.currentRoom.set(null);
    // dès que l'hôte lance la partie, tout le monde est envoyé dans la salle
    effect(() => {
      const r = this.live.currentRoom();
      if (r?.demarree && !this.navigue) this.entrerDansLaPartie(r);
    });
  }

  get salle(): any { return this.live.currentRoom(); }
  get scenarioDeLaSalle(): ScenarioConfig | undefined { return this.scenarios.find(s => s.id === this.salle?.scenarioId); }
  get estHote(): boolean { const r = this.salle; return !!r && r.joueurs?.length > 0 && r.joueurs[0].pseudo === this.pseudo.trim(); }
  get joueursManquants(): number { return Math.max(0, 2 - (this.salle?.joueurs?.length ?? 0)); }
  get peutLancer(): boolean { return this.estHote && this.joueursManquants === 0 && !this.enCours; }

  lancerPartie(): void {
    const r = this.salle;
    if (!r || !this.peutLancer) return;
    this.enCours = true;
    this.live.demarrerPartie(r.code, this.pseudo.trim()).subscribe({
      next: room => { this.enCours = false; this.live.currentRoom.set(room); },
      error: () => this.erreur('Impossible de lancer la partie.')
    });
  }

  quitterSalle(): void {
    const r = this.salle;
    if (r) this.live.quitterSalle(r.code, this.pseudo.trim()).subscribe({ error: () => {} });
    this.live.arreterPolling();
    this.live.currentRoom.set(null);
    this.messageErreur = '';
  }

  async copierCode(): Promise<void> {
    const c = this.salle?.code; if (!c) return;
    try { await navigator.clipboard.writeText(c); this.codeCopie = true; setTimeout(() => this.codeCopie = false, 2000); } catch { }
  }

  ngOnDestroy(): void { if (!this.navigue) this.live.arreterPolling(); }

  creerSalle(): void {
    if (!this.pseudoValide()) return;
    this.enCours = true; this.messageErreur = '';
    this.live.creerSalle(this.scenarioSelectionne, this.pseudo.trim(), Number(this.dureeChoisie)).subscribe({
      next: room => this.entrer(room, 'HOST'),
      error: () => this.erreur('Erreur serveur. Vérifiez que le backend tourne sur le port 8081.')
    });
  }

  rejoindreSalle(): void {
    if (!this.pseudoValide()) return;
    const code = this.codeSaisi.trim().toUpperCase();
    if (!code) { this.messageErreur = 'Entrez le code de la salle.'; return; }
    this.enCours = true; this.messageErreur = '';
    this.live.rejoindreSalle(code, this.pseudo.trim()).subscribe({
      next: room => this.entrer(room, 'PLAYER'),
      error: () => this.erreur('Salle introuvable. Vérifiez le code (LIVE-XXXX) ou que le backend est lancé.')
    });
  }

  /** Création / jonction : on reste dans le lobby (salle d'attente) et on suit la salle en direct. */
  private entrer(room: any, _role: 'HOST' | 'PLAYER'): void {
    this.enCours = false;
    try { localStorage.setItem(CLE_PSEUDO, this.pseudo.trim()); } catch { }
    this.live.currentRoom.set(room);
    this.live.demarrerPolling(room.code);
  }

  private entrerDansLaPartie(room: any): void {
    this.navigue = true;
    const role = room.joueurs?.[0]?.pseudo === this.pseudo.trim() ? 'HOST' : 'PLAYER';
    this.router.navigate(['/game/live', room.scenarioId], {
      queryParams: { duree: room.dureeMinutes || 15, room: room.code, pseudo: this.pseudo.trim(), role }
    });
  }
  private erreur(m: string): void { this.enCours = false; this.messageErreur = m; }
  private pseudoValide(): boolean {
    const p = this.pseudo.trim();
    if (p.length < 2 || p.length > 20) { this.messageErreur = 'Choisissez un pseudo de 2 à 20 caractères.'; return false; }
    return true;
  }
}