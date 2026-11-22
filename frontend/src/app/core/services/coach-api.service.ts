import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';
import { API_URL } from '../../core/api.config';
export interface ReponseCoach { reponse: string | null; source: 'llm' | 'local'; raison?: string | null; }

/** Appelle le backend (qui détient la clé Groq). En cas d'échec : source = 'local' → le front utilise son coach interne. */
@Injectable({ providedIn: 'root' })
export class CoachApiService {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_URL}/api/coach`;

  demander(pseudo: string, question: string, contexte: unknown, faitsLocaux: string,
           historique: { role: 'user' | 'bot'; texte: string }[]): Observable<ReponseCoach> {
    return this.http.post<ReponseCoach>(`${this.url}/ask`, {
      pseudo, question, contexte: JSON.stringify(contexte), faitsLocaux,
      historique: historique.slice(-6).map(h => ({ role: h.role, texte: h.texte }))
    }).pipe(
      timeout(25000),
      map(r => r ?? { reponse: null, source: 'local' as const }),
      catchError(() => of({ reponse: null, source: 'local' as const, raison: 'backend injoignable' }))
    );
  }
}