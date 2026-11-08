import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, RoleUtilisateur, UtilisateurVue } from './auth.service';

export interface StatsAdmin {
  utilisateursTotal: number; administrateurs: number; joueurs: number; comptesBloques: number;
  ordresTotal: number; ordresExecutes: number; ordresEnAttente: number; ordresAnnules: number;
  volumeExecute: number; portefeuilles: number; transactions: number;
  scenariosTotal: number; scenariosActifs: number; evenementsJournal: number;
}

export interface LigneJournal {
  id: number;
  date: string;
  acteur: string;
  action: string;
  details: string;
}

/** Appels de l'espace administrateur (le jeton est ajouté automatiquement par authInterceptor). */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  stats(): Observable<StatsAdmin> {
    return this.http.get<StatsAdmin>(`${API_BASE}/admin/stats`);
  }

  utilisateurs(): Observable<UtilisateurVue[]> {
    return this.http.get<UtilisateurVue[]>(`${API_BASE}/admin/utilisateurs`);
  }

  changerRole(id: number, role: RoleUtilisateur): Observable<UtilisateurVue> {
    return this.http.put<UtilisateurVue>(`${API_BASE}/admin/utilisateurs/${id}/role?valeur=${role}`, {});
  }

  changerActif(id: number, actif: boolean): Observable<UtilisateurVue> {
    return this.http.put<UtilisateurVue>(`${API_BASE}/admin/utilisateurs/${id}/actif?valeur=${actif}`, {});
  }

  journal(limite: number): Observable<LigneJournal[]> {
    return this.http.get<LigneJournal[]>(`${API_BASE}/admin/journal?limite=${limite}`);
  }
}

/** Texte lisible d'une erreur HTTP : message du serveur si présent. */
export function texteErreur(e: unknown, defaut = 'Une erreur est survenue.'): string {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) return 'Impossible de joindre le backend (port 8081).';
    const m = e.error?.message;
    if (typeof m === 'string' && m) return m;
  }
  return defaut;
}
