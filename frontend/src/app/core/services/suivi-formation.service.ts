import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_URL } from '../api.config';

/** Envoie des événements anonymes de formation à l'admin. Silencieux en cas d'erreur : ne bloque jamais l'app. */
@Injectable({ providedIn: 'root' })
export class SuiviFormationService {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_URL}/api/stats/formation`;
  private readonly dejaOuvertes = new Set<string>();

  leconOuverte(lessonId: string): void {
    if (this.dejaOuvertes.has(lessonId)) return;       // une seule fois par session
    this.dejaOuvertes.add(lessonId);
    this.envoyer({ type: 'LECON_OUVERTE', cle: lessonId });
  }

  leconTerminee(lessonId: string): void {
    this.envoyer({ type: 'LECON_TERMINEE', cle: lessonId });
  }

  quiz(quizId: string, score: number, total: number, reussi: boolean, questionsRatees: string[]): void {
    this.envoyer({ type: 'QUIZ', cle: quizId, score, total, reussi, questionsRatees });
  }

  private envoyer(corps: object): void {
    try { this.http.post(this.url, corps).subscribe({ error: () => {} }); } catch { /* ignoré */ }
  }
}