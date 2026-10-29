import { Component, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GameMultiplayerService, Room } from '../../../core/services/game-multiplayer.service';

@Component({
  selector: 'app-game-multiplayer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './game-multiplayer.component.html',
  styleUrls: ['./game-multiplayer.component.css']
})
export class GameMultiplayerComponent implements OnDestroy {
  private readonly mpService = inject(GameMultiplayerService);
  private readonly router = inject(Router);

  // Variables
  public pseudo = '';
  public codeSaisi = '';
  public scenarioChoisi = 'covid-crypto';
  public messageErreur = '';

  public get salleActive(): Room | null {
    return this.mpService.currentRoom();
  }

  creerSalle() {
    if (!this.pseudo) { 
      this.messageErreur = "Veuillez entrer un pseudo avant de créer une salle."; 
      return; 
    }
    this.messageErreur = '';
    this.mpService.creerSalle(this.scenarioChoisi, this.pseudo).subscribe({
      next: (room) => {
        this.mpService.currentRoom.set(room);
        this.mpService.demarrerPolling(room.code);
      },
      error: (err) => {
        console.error(err);
        this.messageErreur = "Erreur serveur. Vérifiez que le backend est lancé sur le port 8081.";
      }
    });
  }

  rejoindreSalle() {
    if (!this.pseudo || !this.codeSaisi) { 
      this.messageErreur = "Entrez un pseudo et un code."; 
      return; 
    }
    this.messageErreur = '';
    this.mpService.rejoindreSalle(this.codeSaisi, this.pseudo).subscribe({
      next: (room) => {
        this.mpService.currentRoom.set(room);
        this.mpService.demarrerPolling(room.code);
      },
      error: () => this.messageErreur = "Salle introuvable ou erreur serveur."
    });
  }

  lancerPartie() {
    if (this.salleActive) {
      this.mpService.arreterPolling();
      this.router.navigate(['/game/play', this.salleActive.scenarioId], { 
        queryParams: { duree: 15, room: this.salleActive.code, pseudo: this.pseudo } 
      });
    }
  }

  quitterSalle() {
    this.mpService.arreterPolling();
    this.mpService.currentRoom.set(null);
  }

  ngOnDestroy(): void {
    this.mpService.arreterPolling();
  }
}