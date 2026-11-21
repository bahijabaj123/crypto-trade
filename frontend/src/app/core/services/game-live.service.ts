import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { interval, Subscription } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class GameLiveService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:8081/api/game/live';

  public readonly currentRoom = signal<any>(null);
  private pollingSub?: Subscription;

  creerSalle(scenarioId: string, pseudo: string, dureeMinutes: number) {
    return this.http.post<any>(this.apiUrl, { scenarioId, pseudo, dureeMinutes });
  }
  rejoindreSalle(code: string, pseudo: string) {
    return this.http.post<any>(`${this.apiUrl}/${code}/join`, { pseudo });
  }

  demarrerPolling(code: string) {
    this.arreterPolling();
    this.pollingSub = interval(1000).subscribe(() => {
      this.http.get<any>(`${this.apiUrl}/${code}`).subscribe({
        next: room => this.currentRoom.set(room),
        error: () => { /* on garde le dernier état */ }
      });
    });
  }
  arreterPolling() { this.pollingSub?.unsubscribe(); this.pollingSub = undefined; }

  envoyerAction(code: string, pseudo: string, action: string, quantite: number, symbole: string, prix: number, bot = false) {
    return this.http.post<any>(`${this.apiUrl}/${code}/action`, { pseudo, action, quantite, symbole, prix, bot });
  }
  envoyerEvenementMJ(code: string, type: string, valeur: number, texte: string, symbole = 'TOUS') {
    return this.http.post<any>(`${this.apiUrl}/${code}/event`, { type, valeur, texte, symbole });
  }
  envoyerMessage(code: string, pseudo: string, texte: string, bot = false) {
    return this.http.post<any>(`${this.apiUrl}/${code}/message`, { pseudo, texte, bot });
  }
  envoyerResultat(code: string, pseudo: string, r: { pnl: number; pnlPct: number; valeur: number; nbOrdres: number; stopLoss: boolean; drawdown: number; score: number }) {
    return this.http.post<any>(`${this.apiUrl}/${code}/result`, { pseudo, ...r });
  }
  demarrerPartie(code: string, pseudo: string) {
    return this.http.post<any>(`${this.apiUrl}/${code}/start`, { pseudo });
  }
  quitterSalle(code: string, pseudo: string) {
    return this.http.post<any>(`${this.apiUrl}/${code}/leave`, { pseudo });
  }
  envoyerPositions(code: string, pseudo: string, positions: any[]) {
  return this.http.post<any>(`${this.apiUrl}/${code}/positions`, { pseudo, positions });
}
}