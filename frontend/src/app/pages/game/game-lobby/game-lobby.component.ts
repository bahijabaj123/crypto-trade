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

/**
 * Lobby unique de la Salle de Marché : le jeu est uniquement multijoueur.
 * 1) on choisit un pseudo, 2) on crée une salle (scénario + durée) ou on rejoint avec un code,
 * 3) salle d'attente, 4) l'hôte lance la partie et tout le monde démarre en même temps.
 */
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
  /** Vrai si on est arrivé par un lien d'invitation (/game?salle=CODE). */
  invitationRecue = false;

  private navigue = false;

  constructor() {
    // Le service est partagé : on repart toujours d'un lobby propre (pas de salle d'une ancienne partie)
    this.mp.arreterPolling();
    this.mp.currentRoom.set(null);

    try { this.pseudo = localStorage.getItem(CLE_PSEUDO) ?? ''; } catch { /* stockage indisponible */ }
    // Si le joueur est connecté et n'a pas encore de pseudo, on propose son nom
    const nom = this.auth.utilisateur()?.nom;
    if (!this.pseudo && nom) this.pseudo = nom.slice(0, 20);

    // Lien d'invitation : /game?salle=DEFI-AB12 -> onglet « Rejoindre » avec le code déjà rempli
    const codeInvite = (this.route.snapshot.queryParamMap.get('salle') ?? '').trim().toUpperCase();
    if (/^[A-Z0-9-]{3,20}$/.test(codeInvite)) {
      this.codeSaisi = codeInvite;
      this.onglet = 'rejoindre';
      this.invitationRecue = true;
    }

    // Dès que l'hôte lance la partie, tous les joueurs de la salle entrent dans le jeu
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
        this.mp.currentRoom.set(r); // l'effet du constructeur lance la navigation
      },
      error: () => {
        this.enCours = false;
        this.messageErreur = `Impossible de lancer : il faut au moins ${JOUEURS_MIN} joueurs et seul l'hôte peut démarrer.`;
      }
    });
  }

  quitterSalle(): void {
    // On sort de la liste des joueurs (avant le début, la salle continue pour les autres)
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
    // Si on part vers la partie, c'est le dashboard qui reprend le polling
    if (!this.navigue) this.mp.arreterPolling();
  }

  // ---------- Interne ----------

  private ouvrirSalle(room: Room): void {
    this.enCours = false;
    this.mp.currentRoom.set(room);
    this.mp.demarrerPolling(room.code);
    try { localStorage.setItem(CLE_PSEUDO, this.pseudo.trim()); } catch { /* ignoré */ }
  }

  private entrerDansLaPartie(room: Room): void {
    this.navigue = true;
    this.router.navigate(['/game/play', room.scenarioId], {
      queryParams: { duree: room.dureeMinutes || 15, room: room.code, pseudo: this.pseudo.trim() }
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
