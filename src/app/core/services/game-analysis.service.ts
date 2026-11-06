import { Injectable } from '@angular/core';
import { GamePosition } from './game-engine.service';

export interface PlayerProfile {
  niveau: 'DEBUTANT' | 'INTERMEDIAIRE' | 'EXPERT';
  points: number;
  recommandation: string;
  coursId: string;
}

@Injectable({
  providedIn: 'root'
})
export class GameAnalysisService {

  analyserPerformance(pnl: number, positions: GamePosition[], aUtiliseStopLoss: boolean): PlayerProfile {
    let points = 0;

    // 1. Analyse du P&L (Le plus important)
    if (pnl > 1000) points += 50;
    else if (pnl > 0) points += 30;
    else if (pnl > -1000) points += 10;

    // 2. Analyse du risque (Stop-Loss)
    if (aUtiliseStopLoss) points += 30;
    
    // 3. Analyse de la diversification (a-t-il acheté plusieurs actifs ?)
    const actifsUniques = new Set(positions.map(p => p.symbole)).size;
    if (actifsUniques >= 2) points += 20;

    // 4. Détermination du profil et de la recommandation
    if (points >= 80) {
      return {
        niveau: 'EXPERT',
        points,
        recommandation: "Excellent ! Vous maîtrisez le risque. Passez au niveau supérieur avec les stratégies avancées.",
        coursId: 'strategie-avancee'
      };
    } else if (points >= 40) {
      return {
        niveau: 'INTERMEDIAIRE',
        points,
        recommandation: "Bon travail, mais vous pouvez mieux faire. Apprenez à utiliser les Stop-Loss pour protéger vos gains.",
        coursId: 'gestion-risque'
      };
    } else {
      return {
        niveau: 'DEBUTANT',
        points,
        recommandation: "Vous avez subi de lourdes pertes. Commencez par les bases : comprendre le marché et la diversification.",
        coursId: 'bases-trading'
      };
    }
  }
}