import { Component, OnDestroy, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SCENARIOS_CONFIG, ScenarioConfig } from '../../../core/models/scenario-config';
import { GameMultiplayerService, Room } from '../../../core/services/game-multiplayer.service';
import { AuthService } from '../../../core/services/auth.service';
import { InvitationSalleComponent } from '../../../shared/components/invitation-salle/invitation-salle.component';

/** Nombre minimum de joueurs pour lancer (garder la même valeur que JOUEURS_MIN dans GameRoomController.java). */
const JOUEURS_MIN = 2;
const CLE_PSEUDO = 'cryptotrade.pseudo';

@Component({
  selector: 'app-game-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule, InvitationSalleComponent],
  templateUrl: './game-lobby.component.html',
  styleUrls: ['./game-lobby.component.css']
})
export class GameLobbyComponent implements OnDestroy {
  private readonly router = inject(Router);
  private readonly mp = inject(GameMultiplayerService);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  readonly scenarios: ScenarioConfig[] = SCENARIOS_CONFIG;
  readonly durees = [5, 15, 30, 60];
  readonly joueursMin = JOUEURS_MIN;

  onglet: 'creer' | 'rejoindre' = 'creer';
  pseudo = '';
  codeSaisi = '';
  scenarioSelectionne = SCENARIOS_CONFIG[0].id;
  dureeChoisie = 15;
  messageErreur = '';
  enCours = false;
  codeCopie = false;
  invitationRecue = false;

  // 👇 NOUVEAU : Mode Live ou Classique
  isLiveMode = false;
  private navigue = false;

  constructor() {
    this.mp.arreterPolling();
    this.mp.currentRoom.set(null);

    try { this.pseudo = localStorage.getItem(CLE_PSEUDO) ?? ''; } catch { /* stockage indisponible */ }
    const nom = this.auth.utilisateur()?.nom;
    if (!this.pseudo && nom) this.pseudo = nom.slice(0, 20);

    // 👇 Lecture du paramètre ?mode=live
    this.route.queryParams.subscribe(params => {
      this.isLiveMode = params['mode'] === 'live';
    });

    const codeInvite = (this.route.snapshot.queryParamMap.get('salle') ?? '').trim().toUpperCase();
    if (/^[A-Z0-9-]{3,20}$/.test(codeInvite)) {
      this.codeSaisi = codeInvite;
      this.onglet = 'rejoindre';
      this.invitationRecue = true;
    }

    effect(() => {
      const room = this.mp.currentRoom();
      if (room?.demarree && !this.navigue) this.entrerDansLaPartie(room);
    });
  }

  // ---------- Etat affiché ----------

  get salle(): Room | null {
    return this.mp.currentRoom();
  }

  get scenarioDeLaSalle(): ScenarioConfig | undefined {
    return this.scenarios.find(s => s.id === this.salle?.scenarioId);
  }

  get estHote(): boolean {
    const r = this.salle;
    return !!r && r.joueurs.length > 0 && r.joueurs[0].pseudo === this.pseudo.trim();
  }

  get joueursManquants(): number {
    return Math.max(0, JOUEURS_MIN - (this.salle?.joueurs.length ?? 0));
  }

  get peutLancer(): boolean {
    return this.estHote && this.joueursManquants === 0 && !this.enCours;
  }

  // ---------- Actions ----------

  creerSalle(): void {
    if (!this.pseudoValide()) return;
    this.enCours = true;
    this.messageErreur = '';
    this.mp.creerSalle(this.scenarioSelectionne, this.pseudo.trim(), this.dureeChoisie).subscribe({
      next: (room) => { this.ouvrirSalle(room); },
      error: () => { this.erreurServeur(); }
    });
  }

  rejoindreSalle(): void {
    if (!this.pseudoValide()) return;
    const code = this.codeSaisi.trim().toUpperCase();
    if (!code) { this.messageErreur = 'Entrez le code de la salle.'; return; }
    this.enCours = true;
    this.messageErreur = '';
    this.mp.rejoindreSalle(code, this.pseudo.trim()).subscribe({
      next: (room) => {
        if (room.demarree) {
          this.enCours = false;
          this.messageErreur = 'Cette partie a déjà commencé.';
          return;
        }
        this.ouvrirSalle(room);
      },
      error: () => {
        this.enCours = false;
        this.messageErreur = 'Salle introuvable. Vérifiez le code ou que le backend est lancé sur le port 8081.';
      }
    });
  }

  lancerPartie(): void {
    const room = this.salle;
    if (!room || !this.peutLancer) return;
    this.enCours = true;
    this.mp.demarrerPartie(room.code, this.pseudo.trim()).subscribe({
      next: (r) => {
        this.enCours = false;
        this.mp.currentRoom.set(r);
      },
      error: () => {
        this.enCours = false;
        this.messageErreur = `Impossible de lancer : il faut au moins ${JOUEURS_MIN} joueurs et seul l'hôte peut démarrer.`;
      }
    });
  }

  quitterSalle(): void {
    const room = this.salle;
    if (room) this.mp.quitterSalleApi(room.code, this.pseudo.trim()).subscribe({ error: () => { /* ignoré */ } });
    this.mp.arreterPolling();
    this.mp.currentRoom.set(null);
    this.messageErreur = '';
  }

  async copierCode(): Promise<void> {
    const code = this.salle?.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.codeCopie = true;
      setTimeout(() => { this.codeCopie = false; }, 2000);
    } catch { /* presse-papiers indisponible : le code reste affiché */ }
  }

  ngOnDestroy(): void {
    if (!this.navigue) this.mp.arreterPolling();
  }

  // ---------- Interne ----------

  private ouvrirSalle(room: Room): void {
    this.enCours = false;
    this.mp.currentRoom.set(room);
    this.mp.demarrerPolling(room.code);
    try { localStorage.setItem(CLE_PSEUDO, this.pseudo.trim()); } catch { /* ignoré */ }
  }

  // 👇 LA MÉTHODE MODIFIÉE POUR LE MODE LIVE
  private entrerDansLaPartie(room: Room): void {
    this.navigue = true;
    
    // On choisit la route selon le mode
    const baseRoute = this.isLiveMode ? '/game/live' : '/game/play';
    
    this.router.navigate([baseRoute, room.scenarioId], {
      queryParams: { 
        duree: room.dureeMinutes || 15, 
        room: room.code, 
        pseudo: this.pseudo.trim() 
      }
    });
  }

  private pseudoValide(): boolean {
    const p = this.pseudo.trim();
    if (p.length < 2 || p.length > 20) {
      this.messageErreur = 'Choisissez un pseudo de 2 à 20 caractères.';
      return false;
    }
    return true;
  }

  private erreurServeur(): void {
    this.enCours = false;
    this.messageErreur = 'Erreur serveur. Vérifiez que le backend est lancé sur le port 8081.';
  }
}