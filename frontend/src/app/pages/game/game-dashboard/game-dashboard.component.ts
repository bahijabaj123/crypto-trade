import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, interval } from 'rxjs';

// Services
import { GameEngineService } from '../../../core/services/game-engine.service';
import { GameAnalysisService, PlayerProfile } from '../../../core/services/game-analysis.service';
import { HistoricalDataService } from '../../../core/services/historical-data.service';
import { GameMultiplayerService, Room } from '../../../core/services/game-multiplayer.service';
import { SCENARIOS_CONFIG, ScenarioConfig } from '../../../core/models/scenario-config';
import { ScenarioLoaderService, Scenario } from '../../../core/services/scenario-loader.service';
import { CandleData } from '../../../core/models/kline.model';

// Composants
import { GameLineChartComponent } from '../components/game-line-chart/game-line-chart.component';

@Component({
  selector: 'app-game-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, GameLineChartComponent],
  templateUrl: './game-dashboard.component.html',
  styleUrls: ['./game-dashboard.component.css']
})
export class GameDashboardComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly loader = inject(ScenarioLoaderService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly analysis = inject(GameAnalysisService);
  private readonly historical = inject(HistoricalDataService);
  public readonly engine = inject(GameEngineService);
  public readonly mpService = inject(GameMultiplayerService);

  // Timers
  private heartbeatSub: any;

  // État du jeu
  public scenarioConfig: ScenarioConfig | null = null;
  public scenario: Scenario | null = null;
  public actifSelectionne = 'BTCUSDT';
  public actifsAffiches: string[] = [];
  public quantite = 1;
  public stopLoss: number | null = null;
  public takeProfit: number | null = null;
  public message = '';
  public erreurChargement = '';
  public afficherModaleQuitter = false;
  public profilFinal: PlayerProfile | null = null;

  // Multijoueur
  public roomCode: string | null = null;
  public pseudo: string | null = null;
  public evenementsAutres: string[] = [];

  // Signaux exposés
  public readonly state = this.engine.state;
  public readonly currentRoom = this.mpService.currentRoom;

  ngOnInit(): void {
    this.engine.arreterJeu();
    
    // Récupération de l'URL
    this.roomCode = this.route.snapshot.queryParamMap.get('room');
    this.pseudo = this.route.snapshot.queryParamMap.get('pseudo');

    const id = this.route.snapshot.paramMap.get('scenarioId');
    const duree = Number(this.route.snapshot.queryParamMap.get('duree')) || 15;

    if (!id) { this.router.navigate(['/game']); return; }
    
    // Chargement du scénario
    this.chargerScenario(id, duree);

    // Configuration Multijoueur
    if (this.roomCode) {
      this.mpService.demarrerPolling(this.roomCode);
      
      // 1. On écoute les mises à jour (actions des autres)
      this.mpService.currentRoom$.subscribe((room: Room | null) => {
        if (room) {
          this.evenementsAutres = room.evenements ? room.evenements.slice(-5) : [];
          
          // Si la salle est terminée (déconnexion d'un joueur)
          if (room.statut === 'TERMINE' && this.state().jeuEnCours) {
            this.engine.arreterJeu();
          }
          this.cdr.detectChanges();
        }
      });

      // 2. Heartbeat (Toutes les 3 secondes, on dit "Je suis là")
      this.heartbeatSub = interval(3000).subscribe(() => {
        if (this.roomCode && this.pseudo) {
          this.mpService.envoyerHeartbeat(this.roomCode, this.pseudo);
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.engine.arreterJeu();
    
    // On coupe le heartbeat
    if (this.heartbeatSub) {
      this.heartbeatSub.unsubscribe();
    }

    // On prévient le serveur qu'on quitte
    if (this.roomCode) {
      this.mpService.arreterPolling();
      if (this.pseudo) {
        this.mpService.quitterSalleApi(this.roomCode, this.pseudo).subscribe();
      }
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    // On prévient aussi le serveur si on ferme brutalement l'onglet
    if (this.roomCode && this.pseudo) {
      this.mpService.signalerDeconnexion(this.roomCode, this.pseudo);
    }
  }

  private chargerScenario(id: string, dureeMinutes: number): void {
    const config = SCENARIOS_CONFIG.find(s => s.id === id);
    if (!config) { 
      this.erreurChargement = "Scénario introuvable."; 
      this.cdr.detectChanges();
      return; 
    }
    this.scenarioConfig = config;

    const requetes = config.requetes.map(req => this.historical.chargerHistorique(req));

    forkJoin(requetes).subscribe({
      next: (resultats) => {
        const donnees: { [symbol: string]: CandleData[] } = {};
        const actifs: string[] = [];

        config.requetes.forEach((req, index) => {
          if (resultats[index] && resultats[index].length > 0) {
            donnees[req.symbol] = resultats[index];
            actifs.push(req.symbol);
          }
        });

        if (actifs.length === 0) {
          this.erreurChargement = "Impossible de charger les données.";
          this.cdr.detectChanges();
          return;
        }

        this.scenario = {
          id: config.id,
          nom: config.nom,
          description: config.description,
          dateDebut: config.requetes[0].startDate,
          dateFin: config.requetes[0].endDate,
          actifs: actifs,
          donnees: donnees
        };

        this.actifSelectionne = actifs[0];
        this.actifsAffiches = [actifs[0]]; 
        
        this.engine.demarrerJeu(donnees, dureeMinutes, actifs);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Erreur forkJoin:', err);
        this.erreurChargement = "Erreur lors du chargement des données.";
        this.cdr.detectChanges();
      }
    });
  }

  public toggleActif(symbol: string) {
    if (this.actifsAffiches.includes(symbol)) {
      if (this.actifsAffiches.length > 1) {
        this.actifsAffiches = this.actifsAffiches.filter(s => s !== symbol);
      }
    } else {
      this.actifsAffiches.push(symbol);
    }
  }

  public formatTemps(secondes: number): string {
    const m = Math.floor(secondes / 60);
    const s = Math.floor(secondes % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  public acheter(): void {
    if (!this.scenario) return;
    this.message = this.engine.acheter(
      this.quantite, 
      this.actifSelectionne, 
      this.stopLoss || undefined, 
      this.takeProfit || undefined
    ).message;

    // Envoi de l'action au backend
    if (this.roomCode && this.pseudo) {
      const prix = this.engine.getPrixActuel(this.actifSelectionne) || 0;
      this.mpService.envoyerAction(this.roomCode, this.pseudo, 'ACHETÉ', this.actifSelectionne, prix).subscribe();
    }

    setTimeout(() => { this.message = ''; }, 3000);
  }

  public vendre(): void {
    if (!this.scenario) return;
    this.message = this.engine.vendre(this.quantite, this.actifSelectionne).message;

    // Envoi de l'action au backend
    if (this.roomCode && this.pseudo) {
      const prix = this.engine.getPrixActuel(this.actifSelectionne) || 0;
      this.mpService.envoyerAction(this.roomCode, this.pseudo, 'VENDU', this.actifSelectionne, prix).subscribe();
    }

    setTimeout(() => { this.message = ''; }, 3000);
  }

  public analyserFinDeJeu(): void {
    if (!this.profilFinal) {
      const aUtiliseStopLoss = this.state().positions.some(p => p.stopLoss || p.takeProfit);
      
      this.profilFinal = this.analysis.analyserPerformance(
        this.engine.getPnl(),
        this.state().positions,
        !!aUtiliseStopLoss
      );

      // Envoi du score
      if (this.roomCode && this.pseudo) {
        this.mpService.envoyerScore(this.roomCode, this.pseudo, this.engine.getPnl()).subscribe();
      }
    }
  }

  public allerAuCours(): void {
    if (this.profilFinal) {
      this.router.navigate(['/learning'], { queryParams: { cours: this.profilFinal.coursId } });
    }
  }

  public quitterJeu(): void { 
    this.afficherModaleQuitter = true; 
  }
  
  public confirmerQuitter(): void { 
    this.afficherModaleQuitter = false; 
    this.engine.arreterJeu();
    
    // On prévient le serveur explicitement
    if (this.roomCode && this.pseudo) {
      this.mpService.quitterSalleApi(this.roomCode, this.pseudo).subscribe();
    }

    this.router.navigateByUrl('/game').then(() => {
      console.log('Redirection vers le lobby');
    }).catch(err => {
      console.error('Erreur de redirection', err);
      window.location.href = '/game';
    });
  }
  
  public annulerQuitter(): void { 
    this.afficherModaleQuitter = false; 
  }

  public getBougiesActives(actif: string) {
    if (!this.scenario) return [];
    const data = this.scenario.donnees[actif] || [];
    const index = Math.min(this.state().tempsActuel, data.length - 1);
    return data.slice(0, index + 1);
  }

  public getCouleur(actif: string): string {
    const couleurs: { [key: string]: string } = {
      'BTCUSDT': '#f59e0b', 'ETHUSDT': '#8b5cf6', 'BNBUSDT': '#eab308', 'XRPUSDT': '#0ea5e9',
      'AAPL': '#a3e635', 'MSFT': '#f43f5e', 'JPM': '#3b82f6',
      'EUR/USD': '#6366f1', 'GBP/USD': '#14b8a6', 'WTI': '#f97316'
    };
    return couleurs[actif] || '#ffffff';
  }
}