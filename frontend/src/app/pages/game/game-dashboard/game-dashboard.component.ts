import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, interval } from 'rxjs';
import html2canvas from 'html2canvas';

// Services
import { GameEngineService, GamePosition } from '../../../core/services/game-engine.service';
import { GameAnalysisService, PlayerProfile } from '../../../core/services/game-analysis.service';
import { HistoricalDataService } from '../../../core/services/historical-data.service';
import { GameMultiplayerService, Room, Player } from '../../../core/services/game-multiplayer.service';
import { SCENARIOS_CONFIG, ScenarioConfig } from '../../../core/models/scenario-config';
import { ScenarioLoaderService, Scenario } from '../../../core/services/scenario-loader.service';
import { CandleData } from '../../../core/models/kline.model';

// Composants
import { GameLineChartComponent } from '../components/game-line-chart/game-line-chart.component';


// Faits historiques affichés dans le bandeau « Contexte » (ordre chronologique obligatoire)
const EVENEMENTS: { [scenarioId: string]: { date: string; texte: string }[] } = {
  'covid-crypto': [
    { date: '2020-03-03', texte: '3 mars 2020 : la Fed baisse ses taux en urgence. Les marchés restent nerveux.' },
    { date: '2020-03-09', texte: '9 mars 2020 : guerre des prix du pétrole, les bourses plongent et Wall Street suspend les échanges.' },
    { date: '2020-03-11', texte: '11 mars 2020 : l\'OMS déclare la pandémie de Covid-19.' },
    { date: '2020-03-12', texte: '12 mars 2020 : « jeudi noir », ventes de panique sur toutes les classes d\'actifs, y compris le Bitcoin.' },
    { date: '2020-03-15', texte: '15 mars 2020 : la Fed ramène ses taux proches de zéro et relance ses achats d\'actifs.' },
    { date: '2020-03-16', texte: '16 mars 2020 : le Dow Jones connaît sa pire séance depuis 1987.' }
  ],
  'ukraine-2022': [
    { date: '2022-02-21', texte: '21 février 2022 : la Russie reconnaît les républiques séparatistes de Donetsk et Louhansk. Les tensions montent.' },
    { date: '2022-02-24', texte: '24 février 2022 : la Russie envahit l’Ukraine. Ventes de panique sur tous les marchés.' },
    { date: '2022-02-26', texte: '26 février 2022 : l’Occident annonce l’exclusion de banques russes du système SWIFT.' },
    { date: '2022-02-28', texte: '28 février 2022 : le rouble s’effondre, la banque centrale russe double son taux directeur à 20 %.' },
    { date: '2022-03-08', texte: '8 mars 2022 : les États-Unis annoncent un embargo sur le pétrole russe.' }
  ],
  'bulle-2017-2018': [
    { date: '2017-12-17', texte: '17 décembre 2017 : le Bitcoin atteint son record, près de 20 000 $.' },
    { date: '2017-12-22', texte: '22 décembre 2017 : forte correction, le Bitcoin repasse sous 12 000 $.' },
    { date: '2018-01-16', texte: '16 janvier 2018 : rumeurs de régulation en Corée du Sud et en Chine, nouvelle chute.' },
    { date: '2018-02-05', texte: '5 février 2018 : les marchés actions chutent aussi, le Bitcoin passe sous 7 000 $.' }
  ],
  'chine-2021': [
    { date: '2021-05-12', texte: '12 mai 2021 : Elon Musk annonce que Tesla n’accepte plus le Bitcoin à cause de son impact écologique.' },
    { date: '2021-05-18', texte: '18 mai 2021 : la Chine interdit aux institutions financières les services liés aux cryptomonnaies.' },
    { date: '2021-05-19', texte: '19 mai 2021 : journée de panique, le Bitcoin perd plus de 30 % en quelques heures.' },
    { date: '2021-05-21', texte: '21 mai 2021 : la Chine annonce vouloir réprimer le minage de Bitcoin.' }
  ],
  'luna-2022': [
    { date: '2022-05-07', texte: '7 mai 2022 : l’UST (stablecoin de Terra) commence à perdre sa parité avec le dollar.' },
    { date: '2022-05-09', texte: '9 mai 2022 : spirale de ventes, Luna s’effondre et le marché entier plonge.' },
    { date: '2022-05-12', texte: '12 mai 2022 : Luna ne vaut presque plus rien, Tether baisse brièvement sous 1 $.' },
    { date: '2022-05-13', texte: '13 mai 2022 : Terra suspend sa blockchain.' }
  ],
  'ftx-2022': [
    { date: '2022-11-02', texte: '2 novembre 2022 : CoinDesk révèle que le bilan d’Alameda Research repose sur le jeton FTT de FTX.' },
    { date: '2022-11-06', texte: '6 novembre 2022 : le patron de Binance annonce vendre ses FTT. Ruée sur les retraits chez FTX.' },
    { date: '2022-11-08', texte: '8 novembre 2022 : FTX suspend les retraits, Binance renonce à la racheter.' },
    { date: '2022-11-11', texte: '11 novembre 2022 : FTX se déclare en faillite.' }
  ]
};

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

  // Pour la capture d'écran
  @ViewChild('modaleResultat') modaleResultat!: ElementRef<HTMLDivElement>;

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

  // Design : sens de l'ordre, durée totale (barre de progression)
  public sens: 'ACHAT' | 'VENTE' = 'ACHAT';
  public dureeTotaleSecondes = 0;

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

    // Le jeu est uniquement multijoueur : sans salle ni pseudo, retour au lobby
    if (!this.roomCode || !this.pseudo) { this.router.navigate(['/game']); return; }

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
          
          // Si la salle est terminée (déconnexion d'un joueur ou fin de partie)
          if (room.statut === 'TERMINE' && this.state().jeuEnCours) {
            this.engine.arreterJeu();
          }
          this.cdr.detectChanges();
        }
      });

      // 2. Heartbeat (Toutes les 3 secondes, on dit "Je suis là")
      // 👇 On envoie un premier heartbeat IMMEDIATEMENT pour éviter le bug de déconnexion au début
      if (this.pseudo) {
        this.mpService.envoyerHeartbeat(this.roomCode, this.pseudo);
      }

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
    this.dureeTotaleSecondes = dureeMinutes * 60;

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


  // =====================================================
  // AFFICHAGE (design de la salle de jeu)
  // =====================================================

  /** Date historique simulée à cet instant (ms), ou null si pas de données. */
  public get dateMarche(): number | null {
    if (!this.scenario) return null;
    const data = this.scenario.donnees[this.scenario.actifs[0]] || [];
    if (data.length === 0) return null;
    const i = Math.min(Math.floor(this.state().tempsActuel), data.length - 1);
    return data[i]?.time ?? null;
  }

  /** Format de date : avec l'heure si les bougies sont plus fines qu'un jour. */
  public get formatDate(): string {
    const data = this.scenario ? (this.scenario.donnees[this.scenario.actifs[0]] || []) : [];
    const journalier = data.length > 1 && (data[1].time - data[0].time) >= 86400000;
    return journalier ? 'dd/MM/yyyy' : 'dd/MM/yyyy HH:mm';
  }

  /** Dernier fait historique atteint ; à défaut, la description du scénario. */
  public get evenementActuel(): string {
    let texte = this.scenario?.description ?? '';
    const t = this.dateMarche;
    const liste = EVENEMENTS[this.scenario?.id ?? ''] ?? [];
    if (t !== null) {
      for (const e of liste) {
        if (new Date(e.date).getTime() <= t) texte = e.texte;
      }
    }
    return texte;
  }

  /** Avancement de la séance (0 à 100). */
  public get progressionPct(): number {
    if (!this.dureeTotaleSecondes) return 0;
    const p = (1 - this.state().tempsRestantSecondes / this.dureeTotaleSecondes) * 100;
    return Math.min(100, Math.max(0, p));
  }

  /** Variation de l'actif depuis le début du scénario, en %. */
  public variationPct(actif: string): number {
    const data = this.scenario?.donnees[actif];
    const prix = this.engine.getPrixActuel(actif);
    if (!data || data.length === 0 || !prix || !data[0].close) return 0;
    return (prix / data[0].close - 1) * 100;
  }

  public get pnlPct(): number {
    const initial = this.engine.getValeurTotale() - this.engine.getPnl();
    return initial ? (this.engine.getPnl() / initial) * 100 : 0;
  }

  public getPosition(actif: string): GamePosition | undefined {
    return this.state().positions.find(p => p.symbole === actif);
  }

  public prixActuel(actif: string): number {
    return this.engine.getPrixActuel(actif) || 0;
  }

  public pnlPosition(pos: GamePosition): number {
    return (this.prixActuel(pos.symbole) - pos.prixMoyenAchat) * pos.quantite;
  }

  public pnlPctPosition(pos: GamePosition): number {
    return pos.prixMoyenAchat ? (this.prixActuel(pos.symbole) / pos.prixMoyenAchat - 1) * 100 : 0;
  }

  public get coutEstime(): number {
    return this.prixActuel(this.actifSelectionne) * (this.quantite || 0);
  }

  public get messageErreur(): boolean {
    return /insuffisant|indisponible/i.test(this.message);
  }

  /** Classement final (multijoueur), du meilleur au moins bon. */
  public get classement(): Player[] {
    // Les joueurs qui ont abandonné sont classés en dernier
    return [...(this.currentRoom()?.joueurs ?? [])].sort((a, b) => {
      const ra = a.actif || a.termine ? 0 : 1;
      const rb = b.actif || b.termine ? 0 : 1;
      return ra !== rb ? ra - rb : b.pnl - a.pnl;
    });
  }

  /** Clic sur un onglet d'actif : affiche/masque son graphique et le sélectionne pour l'ordre. */
  public selectionnerOnglet(actif: string): void {
    this.toggleActif(actif);
    if (this.actifsAffiches.includes(actif)) this.actifSelectionne = actif;
  }

  /** Raccourcis 25 % / 50 % / 75 % / MAX pour la quantité. */
  public setQuantitePct(pct: number): void {
    const prix = this.engine.getPrixActuel(this.actifSelectionne);
    if (!prix) return;
    const max = this.sens === 'ACHAT'
      ? this.state().solde / prix
      : (this.getPosition(this.actifSelectionne)?.quantite ?? 0);
    this.quantite = Math.floor(max * pct * 10000) / 10000;
  }

  public executer(): void {
    if (this.sens === 'ACHAT') this.acheter(); else this.vendre();
  }

  /** Clôture toute la position d'un actif en un clic. */
  public fermerPosition(pos: GamePosition): void {
    if (!this.scenario) return;
    const prix = this.prixActuel(pos.symbole);
    this.message = this.engine.vendre(pos.quantite, pos.symbole).message;

    if (this.roomCode && this.pseudo) {
      this.mpService.envoyerAction(this.roomCode, this.pseudo, 'VENDU', pos.symbole, prix).subscribe();
    }
    setTimeout(() => { this.message = ''; }, 3000);
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
    
    // On prévient le serveur seulement si on abandonne en cours de partie
    // (une fois la séance terminée, ce n'est pas un abandon : les autres joueurs voient encore le classement)
    if (this.roomCode && this.pseudo && !this.state().jeuTermine) {
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
      'LTCUSDT': '#94a3b8', 'DOGEUSDT': '#d4a017', 'SOLUSDT': '#14f195',
      'AAPL': '#a3e635', 'MSFT': '#f43f5e', 'JPM': '#3b82f6',
      'EUR/USD': '#6366f1', 'GBP/USD': '#14b8a6', 'WTI': '#f97316',
      'BRENT': '#f59e0b', 'XAU/USD': '#facc15', 'USD/CAD': '#14b8a6', 'USD/RUB': '#ef4444',
      'BTC/USD': '#f59e0b', 'LTC/USD': '#94a3b8', 'XRP/USD': '#0ea5e9', 'DOGE/USD': '#eab308'
    };
    return couleurs[actif] || '#ffffff';
  }

  // ============================================================
  // TÉLÉCHARGEMENT DU RÉSULTAT EN IMAGE
  // ============================================================
  public telechargerResultat(): void {
    if (!this.modaleResultat) {
      console.error('Modale non trouvée dans le DOM');
      return;
    }

    const element = this.modaleResultat.nativeElement;
    
    html2canvas(element, { 
      backgroundColor: '#0a0e17', 
      scale: 2,
      useCORS: true 
    }).then(canvas => {
      const link = document.createElement('a');
      link.download = `resultat-simulation-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }).catch(err => {
      console.error('Erreur lors de la capture:', err);
    });
  }
}