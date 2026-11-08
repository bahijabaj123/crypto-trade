import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, firstValueFrom, tap, timeout } from 'rxjs';

export const API_BASE = 'http://localhost:8081/api';
const CLE_SESSION = 'cryptotrade.session';

export type RoleUtilisateur = 'ADMIN' | 'JOUEUR';

export interface UtilisateurVue {
  id: number;
  nom: string;
  email: string;
  role: RoleUtilisateur;
  actif: boolean;
  dateCreation: string;
  derniereConnexion: string | null;
}

interface AuthReponse {
  jeton: string;
  utilisateur: UtilisateurVue;
}

/**
 * Connexion de l'utilisateur.
 * La session (jeton + profil) est gardée dans le navigateur (localStorage) pour survivre au rechargement.
 * Les « signals » préviennent les écrans dès que la personne se connecte ou se déconnecte.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly session = signal<AuthReponse | null>(this.lireSession());

  readonly utilisateur = computed(() => this.session()?.utilisateur ?? null);
  readonly estConnecte = computed(() => this.session() !== null);
  readonly estAdmin = computed(() => this.session()?.utilisateur.role === 'ADMIN');

  get jeton(): string | null {
    return this.session()?.jeton ?? null;
  }

  connecter(email: string, motDePasse: string): Observable<AuthReponse> {
    return this.http.post<AuthReponse>(`${API_BASE}/auth/login`, { email, motDePasse })
      .pipe(tap(r => this.enregistrer(r)));
  }

  inscrire(nom: string, email: string, motDePasse: string): Observable<AuthReponse> {
    return this.http.post<AuthReponse>(`${API_BASE}/auth/register`, { nom, email, motDePasse })
      .pipe(tap(r => this.enregistrer(r)));
  }

  changerMotDePasse(ancienMotDePasse: string, nouveauMotDePasse: string): Observable<void> {
    return this.http.put<void>(`${API_BASE}/auth/mot-de-passe`, { ancienMotDePasse, nouveauMotDePasse });
  }

  deconnecter(versConnexion = true): void {
    this.session.set(null);
    try { localStorage.removeItem(CLE_SESSION); } catch { /* stockage indisponible */ }
    if (versConnexion) this.router.navigate(['/signin']);
  }

  /**
   * Au démarrage : si un jeton est gardé, on vérifie auprès du serveur qu'il est encore valable
   * (compte bloqué, jeton expiré...). Backend éteint : on garde la session telle quelle.
   */
  async verifier(): Promise<void> {
    if (!this.session()) return;
    try {
      const moi = await firstValueFrom(this.http.get<UtilisateurVue>(`${API_BASE}/auth/me`).pipe(timeout(3000)));
      this.enregistrer({ jeton: this.session()!.jeton, utilisateur: moi });
    } catch (e: unknown) {
      const statut = (e as { status?: number })?.status;
      if (statut === 401 || statut === 403) this.deconnecter(false);
    }
  }

  private enregistrer(r: AuthReponse): void {
    this.session.set(r);
    try { localStorage.setItem(CLE_SESSION, JSON.stringify(r)); } catch { /* stockage indisponible */ }
  }

  private lireSession(): AuthReponse | null {
    try {
      const brut = localStorage.getItem(CLE_SESSION);
      if (!brut) return null;
      const s = JSON.parse(brut) as AuthReponse;
      return s?.jeton && s?.utilisateur ? s : null;
    } catch {
      return null;
    }
  }
}
