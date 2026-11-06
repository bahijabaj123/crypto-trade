import { Injectable } from '@angular/core';
import { FormationStoredState } from '../models/formation.models';

const STORAGE_KEY = 'cryptotrade-formation-v1';

@Injectable({ providedIn: 'root' })
export class FormationStorageService {
  load(): FormationStoredState | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as FormationStoredState;
    } catch {
      return null;
    }
  }

  save(state: FormationStoredState): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
}
