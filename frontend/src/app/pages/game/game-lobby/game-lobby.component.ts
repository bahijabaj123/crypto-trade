import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SCENARIOS_CONFIG, ScenarioConfig } from '../../../core/models/scenario-config';

@Component({
  selector: 'app-game-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './game-lobby.component.html',
  styleUrls: ['./game-lobby.component.css']
})
export class GameLobbyComponent {
  constructor(private router: Router) {}

  readonly scenarios: ScenarioConfig[] = SCENARIOS_CONFIG;
  scenarioSelectionne = 'covid-crash';
  dureeChoisie = 15;

  lancerJeu() {
    this.router.navigate(['/game/play', this.scenarioSelectionne], { 
      queryParams: { duree: this.dureeChoisie } 
    });
  }
}