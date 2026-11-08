import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, switchMap } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';

export interface Player {
  pseudo: string;
  pnl: number;
  actif: boolean;    // false = a quitté ou s'est déconnecté (abandon)
  termine: boolean;  // true = a fini sa séance et envoyé son score
}

export interface Room {
  code: string;
  scenarioId: string;
  joueurs: Player[];            // le premier joueur est l'hôte
  evenements: string[];
  statut: 'EN_COURS' | 'TERMINE';
  dureeMinutes: number;         // durée de la séance choisie par l'hôte
  demarree: boolean;            // true quand l'hôte a lancé la partie
}

const API_URL = 'http://localhost:8081/api/game/rooms'; // 👈 Vérifie le port de ton backend

@Injectable({
  providedIn: 'root'
})
export class GameMultiplayerService {
  readonly currentRoom = signal<Room | null>(null);
  private pollingSub: any;
  public readonly currentRoom$ = toObservable(this.currentRoom);

  constructor(private http: HttpClient) {}

  creerSalle(scenarioId: string, pseudo: string, dureeMinutes = 15): Observable<Room> {
    return this.http.post<Room>(API_URL, { pseudo, scenarioId, dureeMinutes });
  }

  // L'hôte lance la partie : tous les joueurs de la salle démarrent en même temps
  demarrerPartie(code: string, pseudo: string): Observable<Room> {
    return this.http.post<Room>(`${API_URL}/${code}/start`, { pseudo });
  }

  rejoindreSalle(code: string, pseudo: string): Observable<Room> {
    return this.http.post<Room>(`${API_URL}/${code}/join`, { pseudo });
  }

  // Met à jour le score à la fin de la partie
  envoyerScore(code: string, pseudo: string, pnl: number): Observable<Room> {
    return this.http.post<Room>(`${API_URL}/${code}/score`, { pseudo, pnl });
  }

  // Demande l'état de la salle toutes les 2 secondes (Polling)
  demarrerPolling(code: string): void {
    this.arreterPolling();
    this.pollingSub = interval(2000)
      .pipe(switchMap(() => this.http.get<Room>(`${API_URL}/${code}`)))
      .subscribe({
        next: (room) => this.currentRoom.set(room),
        error: (err) => console.error('Erreur polling:', err)
      });
  }

  arreterPolling(): void {
    if (this.pollingSub) {
      this.pollingSub.unsubscribe();
      this.pollingSub = null;
    }
  }

  envoyerAction(code: string, pseudo: string, action: string, symbole: string, prix: number) {
  return this.http.post(`${API_URL}/${code}/action`, { pseudo, action, symbole, prix });
}

// 3. La méthode pour quitter la salle
quitterSalleApi(code: string, pseudo: string) {
    return this.http.post(`${API_URL}/${code}/leave`, { pseudo });
  }

  // Quand quelqu'un ferme l'onglet (utilisation de navigator.sendBeacon pour que ça marche même si l'onglet se ferme)
  signalerDeconnexion(code: string, pseudo: string) {
    const data = new Blob([JSON.stringify({ pseudo })], { type: 'application/json' });
    navigator.sendBeacon(`${API_URL}/${code}/leave`, data);
  }

    envoyerHeartbeat(code: string, pseudo: string) {
    return this.http.post(`${API_URL}/${code}/heartbeat`, { pseudo }).subscribe();
  }
  
}