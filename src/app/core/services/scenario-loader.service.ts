import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CandleData } from '../models/kline.model';

export interface Scenario {
  id: string;
  nom: string;
  description: string;
  dateDebut: string;
  dateFin: string;
  actifs: string[];
  donnees: { [symbol: string]: CandleData[] }; // Les données sont maintenant un dictionnaire
}

@Injectable({
  providedIn: 'root'
})
export class ScenarioLoaderService {
  constructor(private http: HttpClient) {}

  chargerScenario(id: string): Observable<Scenario> {
    return this.http.get<Scenario>(`/scenarios/${id}.json`);
  }
}