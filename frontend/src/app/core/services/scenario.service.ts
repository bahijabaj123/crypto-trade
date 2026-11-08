import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom, timeout } from 'rxjs';
import { SCENARIOS_CONFIG, ScenarioConfig } from '../models/scenario-config';

const API_URL = 'http://localhost:8081/api'; // même port que le backend (GameRoomController)

/** Un scénario vu par l'admin : ScenarioConfig + état (actif) et position dans la liste. */
export interface ScenarioAdmin extends ScenarioConfig {
  actif: boolean;
  ordre: number;
}

/**
 * Scénarios du jeu.
 * - charger() : au démarrage de l'application, remplace la liste locale (scenario-config.ts)
 *   par les scénarios ACTIFS du backend. Si le backend est éteint ou renvoie une liste vide,
 *   la liste locale reste en place : le jeu fonctionne toujours.
 * - le reste : gestion (CRUD) utilisée par la page Admin.
 */
@Injectable({ providedIn: 'root' })
export class ScenarioService {
  private readonly http = inject(HttpClient);

  async charger(): Promise<void> {
    try {
      const liste = await firstValueFrom(this.http.get<ScenarioConfig[]>(`${API_URL}/scenarios`).pipe(timeout(3000)));
      if (Array.isArray(liste) && liste.length > 0) {
        // On modifie le tableau EXISTANT : tous les écrans qui l'importent voient la nouvelle liste.
        SCENARIOS_CONFIG.splice(0, SCENARIOS_CONFIG.length, ...liste);
      }
    } catch {
      /* backend indisponible : on garde la liste locale */
    }
  }

  lister(): Observable<ScenarioAdmin[]> {
    return this.http.get<ScenarioAdmin[]>(`${API_URL}/admin/scenarios`);
  }

  creer(s: ScenarioAdmin): Observable<ScenarioAdmin> {
    return this.http.post<ScenarioAdmin>(`${API_URL}/admin/scenarios`, s);
  }

  modifier(s: ScenarioAdmin): Observable<ScenarioAdmin> {
    return this.http.put<ScenarioAdmin>(`${API_URL}/admin/scenarios/${s.id}`, s);
  }

  changerActif(id: string, actif: boolean): Observable<ScenarioAdmin> {
    return this.http.put<ScenarioAdmin>(`${API_URL}/admin/scenarios/${id}/actif?valeur=${actif}`, {});
  }

  supprimer(id: string): Observable<void> {
    return this.http.delete<void>(`${API_URL}/admin/scenarios/${id}`);
  }
}
