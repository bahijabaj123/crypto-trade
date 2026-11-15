import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef, HostListener, ViewChild, ElementRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import html2canvas from 'html2canvas';

// Services
import { GameEngineService, GamePosition } from '../../../core/services/game-engine.service';
import { GameAnalysisService, PlayerProfile } from '../../../core/services/game-analysis.service';
import { HistoricalDataService } from '../../../core/services/historical-data.service';
import { SCENARIOS_CONFIG, ScenarioConfig } from '../../../core/models/scenario-config';
import { ScenarioLoaderService, Scenario } from '../../../core/services/scenario-loader.service';
import { CandleData } from '../../../core/models/kline.model';
import { LiveRoomService } from '../../../core/services/live-room.service';
import { Subscription } from 'rxjs';
import { LiveBotsService } from '../../../core/services/bots/live-bots.service';
import { GameLiveService } from '../../../core/services/game-live.service';

// Composants
import { GameLineChartComponent } from '../components/game-line-chart/game-line-chart.component';

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
  selector: 'app-game-live',
  standalone: true,
  imports: [CommonModule, FormsModule, GameLineChartComponent],
  templateUrl: './game-live.component.html',
  styleUrls: ['./game-live.component.css']
})
export class GameLiveComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly loader = inject(ScenarioLoaderService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly analysis = inject(GameAnalysisService);
  private readonly historical = inject(HistoricalDataService);
  public readonly engine = inject(GameEngineService);
  
  public readonly liveRoom = inject(LiveRoomService);
  public readonly liveBots = inject(LiveBotsService);
  public readonly liveService = inject(GameLiveService);

  @ViewChild('modaleResultat') modaleResultat!: ElementRef<HTMLDivElement>;

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
  public evenementsEnrichis: { texte: string, impact: string | null, isPositif: boolean }[] = [];
  public sens: 'ACHAT' | 'VENTE' = 'ACHAT';
  public dureeTotaleSecondes = 0;
  
  public chatBotMessages: { role: 'user' | 'bot', texte: string }[] = [];
  public questionChatbot = '';
  public chatbotOuvert = false;

  public panneauMJouvert = false;
  public newsInput = '';

  public role: string | null = null;
  public messageChat = '';
  public roomCode: string | null = null;
  public pseudo: string | null = null;

  public readonly state = this.engine.state;
  public readonly currentRoom = this.liveService.currentRoom;

  private subsBots: Subscription[] = [];

  constructor() {
    // Synchronise l'état partagé du backend : prix impacté + flux d'événements
    effect(() => {
      const room = this.liveService.currentRoom();
      if (!room) return;
      this.liveRoom.impactPrix.set(room.impactPrix ?? 0);
      const raw: string[] = room.evenements ? room.evenements.slice(-10) : [];
      this.evenementsEnrichis = raw.map(ev => {
        const m = ev.match(/impact ([+-][\d.]+)%/);
        const v = m ? parseFloat(m[1]) : null;
        return { texte: ev, impact: m ? `${v! >= 0 ? '+' : ''}${m[1].replace(/^\+/, '')}%` : null, isPositif: v === null ? true : v >= 0 };
      });
    });
  }

  ngOnInit(): void {
    this.engine.arreterJeu();
    
    this.roomCode = this.route.snapshot.queryParamMap.get('room');
    this.pseudo = this.route.snapshot.queryParamMap.get('pseudo');
    this.role = this.route.snapshot.queryParamMap.get('role');

    if (!this.roomCode || !this.pseudo) { this.router.navigate(['/game']); return; }

    const id = this.route.snapshot.paramMap.get('scenarioId');
    const duree = Number(this.route.snapshot.queryParamMap.get('duree')) || 15;

    if (!id) { this.router.navigate(['/game']); return; }
    
    this.chargerScenario(id, duree);

    if (this.roomCode) {
      this.liveService.demarrerPolling(this.roomCode);
    }
  }

  ngOnDestroy(): void {
    this.engine.arreterJeu();
    this.liveBots.arreter();
    this.subsBots.forEach(s => s.unsubscribe());
    this.liveService.arreterPolling();

    if (this.roomCode && this.pseudo) {
      this.liveService.quitterSalle(this.roomCode, this.pseudo).subscribe();
    }
  }

  public get isAdmin(): boolean {
    return this.role === 'HOST';   // lu dans l'URL : disponible dès le chargement
  }

  public togglePanneauMJ() {
    this.panneauMJouvert = !this.panneauMJouvert;
  }

  public declencherCrash(pourcentage: number) {
    if (this.roomCode) this.liveService.envoyerEvenementMJ(this.roomCode, pourcentage > 0 ? 'PUMP' : 'CRASH', pourcentage, '').subscribe();
  }

  public forcerBot(personnalite: string, sens: string) {
    const nomBot = personnalite === 'paniqueux' ? 'Kira_Trade' : 'Orca';
    if (this.roomCode) this.liveService.envoyerEvenementMJ(this.roomCode, 'BOT_FORCE', sens === 'VENTE' ? -8 : 8, nomBot).subscribe();
  }

  public injecterNews() {
    if (!this.newsInput.trim() || !this.roomCode) return;
    this.liveService.envoyerEvenementMJ(this.roomCode, 'NEWS', -10, this.newsInput).subscribe();
    this.newsInput = '';
  }

  public envoyerMessageChat() {
    const t = this.messageChat.trim();
    if (!t || !this.roomCode || !this.pseudo) return;
    this.liveService.envoyerMessage(this.roomCode, this.pseudo, t).subscribe();
    this.messageChat = '';
  }

  public get messagesChat(): any[] { return this.currentRoom()?.messages ?? []; }

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
          id: config.id, nom: config.nom, description: config.description,
          dateDebut: config.requetes[0].startDate, dateFin: config.requetes[0].endDate,
          actifs: actifs, donnees: donnees
        };

        this.actifSelectionne = actifs[0];
        this.actifsAffiches = [actifs[0]]; 
        
        this.engine.demarrerJeu(donnees, dureeMinutes, actifs);

        // Les bots tournent UNIQUEMENT chez l'hôte (MJ) : un seul exemplaire, vu par tous via le backend.
        if (this.roomCode && this.isAdmin) {
          const sym = actifs[0];
          const total = this.dureeTotaleSecondes;
          this.liveBots.demarrer({
            graine: this.roomCode + '|' + config.id,
            nbBots: 5,
            capitalJoueur: 50000,
            symbole: sym,
            debutMs: Date.now(),
            // prix de référence = trajectoire historique interpolée sur la durée de la séance
            prixReference: (tick) => {
              const data = donnees[sym] || [];
              if (!data.length) return 0;
              const pos = Math.min(tick / total, 1) * (data.length - 1);
              const i = Math.floor(pos), f = pos - i;
              const c0 = data[i].close, c1 = data[Math.min(i + 1, data.length - 1)].close;
              return c0 + (c1 - c0) * f;
            },
            executerOrdre: (ordre, bot) => {
              const prix = this.prixActuel(sym);
              if (!prix) return null;
              this.liveService.envoyerAction(this.roomCode!, bot.nom,
                ordre.sens === 'ACHAT' ? 'ACHETÉ' : 'VENDU', ordre.quantite, sym, prix, true).subscribe();
              return prix * (1 + this.liveRoom.impactPrix() / 100);
            }
          });
          this.subsBots.push(this.liveBots.messages$.subscribe(m =>
            this.liveService.envoyerMessage(this.roomCode!, m.auteur, m.texte, true).subscribe()));
        }

        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Erreur forkJoin:', err);
        this.erreurChargement = "Erreur lors du chargement des données.";
        this.cdr.detectChanges();
      }
    });
  }

  public acheter(): void {
    if (!this.scenario) return;
    this.message = this.engine.acheter(this.quantite, this.actifSelectionne, this.stopLoss || undefined, this.takeProfit || undefined).message;

    if (this.roomCode && this.pseudo) {
      // On envoie au backend, le polling le renverra à tout le monde
      this.liveService.envoyerAction(this.roomCode, this.pseudo, 'ACHETÉ', this.quantite, this.actifSelectionne, this.prixActuel(this.actifSelectionne)).subscribe();
    }

    setTimeout(() => { this.message = ''; }, 3000);
  }

  public vendre(): void {
    if (!this.scenario) return;
    this.message = this.engine.vendre(this.quantite, this.actifSelectionne).message;

    if (this.roomCode && this.pseudo) {
      this.liveService.envoyerAction(this.roomCode, this.pseudo, 'VENDU', this.quantite, this.actifSelectionne, this.prixActuel(this.actifSelectionne)).subscribe();
    }

    setTimeout(() => { this.message = ''; }, 3000);
  }

  public fermerPosition(pos: GamePosition): void {
    if (!this.scenario) return;
    this.message = this.engine.vendre(pos.quantite, pos.symbole).message;

    if (this.roomCode && this.pseudo) {
      this.liveService.envoyerAction(this.roomCode, this.pseudo, 'VENDU', pos.quantite, pos.symbole, this.prixActuel(pos.symbole)).subscribe();
    }

    setTimeout(() => { this.message = ''; }, 3000);
  }

  public confirmerQuitter(): void { 
    this.afficherModaleQuitter = false; 
    this.engine.arreterJeu();
    this.liveBots.arreter();
    
    if (this.roomCode && this.pseudo) {
      this.liveService.quitterSalle(this.roomCode, this.pseudo).subscribe();
      this.liveService.arreterPolling();
    }

    this.router.navigateByUrl('/game');
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

  public get dateMarche(): number | null {
    if (!this.scenario) return null;
    const data = this.scenario.donnees[this.scenario.actifs[0]] || [];
    if (data.length === 0) return null;
    const i = Math.min(Math.floor(this.state().tempsActuel), data.length - 1);
    return data[i]?.time ?? null;
  }

  public get formatDate(): string {
    const data = this.scenario ? (this.scenario.donnees[this.scenario.actifs[0]] || []) : [];
    const journalier = data.length > 1 && (data[1].time - data[0].time) >= 86400000;
    return journalier ? 'dd/MM/yyyy' : 'dd/MM/yyyy HH:mm';
  }

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

  public get progressionPct(): number {
    if (!this.dureeTotaleSecondes) return 0;
    const p = (1 - this.state().tempsRestantSecondes / this.dureeTotaleSecondes) * 100;
    return Math.min(100, Math.max(0, p));
  }

  public variationPct(actif: string): number {
    const data = this.scenario?.donnees[actif];
    const prix = this.engine.getPrixActuel(actif);
    if (!data || data.length === 0 || !prix || !data[0].close) return 0;
    const prixImpacte = prix * (1 + this.liveRoom.impactPrix() / 100);
    return (prixImpacte / data[0].close - 1) * 100;
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
    const prixImpacte = this.prixActuel(pos.symbole) * (1 + this.liveRoom.impactPrix() / 100);
    return (prixImpacte - pos.prixMoyenAchat) * pos.quantite;
  }

  public pnlPctPosition(pos: GamePosition): number {
    const prixImpacte = this.prixActuel(pos.symbole) * (1 + this.liveRoom.impactPrix() / 100);
    return pos.prixMoyenAchat ? (prixImpacte / pos.prixMoyenAchat - 1) * 100 : 0;
  }

  public get coutEstime(): number {
    return this.prixActuel(this.actifSelectionne) * (this.quantite || 0);
  }

  public get messageErreur(): boolean {
    return /insuffisant|indisponible/i.test(this.message);
  }

  public get classement(): any[] {
    return [...(this.currentRoom()?.joueurs ?? [])].sort((a, b) => b.pnl - a.pnl);
  }

  public selectionnerOnglet(actif: string): void {
    this.toggleActif(actif);
    if (this.actifsAffiches.includes(actif)) this.actifSelectionne = actif;
  }

  public setQuantitePct(pct: number): void {
    const prix = this.engine.getPrixActuel(this.actifSelectionne);
    if (!prix) return;
    const max = this.sens === 'ACHAT' ? this.state().solde / prix : (this.getPosition(this.actifSelectionne)?.quantite ?? 0);
    this.quantite = Math.floor(max * pct * 10000) / 10000;
  }

  public executer(): void {
    if (this.sens === 'ACHAT') this.acheter(); else this.vendre();
  }

  public formatTemps(secondes: number): string {
    const m = Math.floor(secondes / 60);
    const s = Math.floor(secondes % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  public analyserFinDeJeu(): void {
    if (!this.profilFinal) {
      const aUtiliseStopLoss = this.state().positions.some(p => p.stopLoss || p.takeProfit);
      this.profilFinal = this.analysis.analyserPerformance(this.engine.getPnl(), this.state().positions, !!aUtiliseStopLoss);
    }
  }

  public allerAuCours(): void {
    if (this.profilFinal) this.router.navigate(['/learning'], { queryParams: { cours: this.profilFinal.coursId } });
  }

  public quitterJeu(): void { this.afficherModaleQuitter = true; }
  
  public annulerQuitter(): void { this.afficherModaleQuitter = false; }

  public getBougiesActives(actif: string) {
    if (!this.scenario) return [];
    const data = this.scenario.donnees[actif] || [];
    const index = Math.min(this.state().tempsActuel, data.length - 1);
    return data.slice(0, index + 1);
  }

  public getCouleur(actif: string): string {
    const couleurs: { [key: string]: string } = {
      'BTCUSDT': '#f59e0b', 'ETHUSDT': '#8b5cf6', 'BNBUSDT': '#eab308', 'XRPUSDT': '#0ea5e9',
      'LTCUSDT': '#94a3b8', 'DOGEUSDT': '#d4a017', 'SOLUSDT': '#14f195'
    };
    return couleurs[actif] || '#ffffff';
  }

  public telechargerResultat(): void {
    if (!this.modaleResultat) { console.error('Modale non trouvée dans le DOM'); return; }

    const element = this.modaleResultat.nativeElement;
    html2canvas(element, { backgroundColor: '#0a0e17', scale: 2, useCORS: true }).then(canvas => {
      const link = document.createElement('a');
      link.download = `resultat-simulation-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }).catch(err => {
      console.error('Erreur lors de la capture:', err);
    });
  }

  public toggleChatbot() {
    this.chatbotOuvert = !this.chatbotOuvert;
    if (this.chatbotOuvert && this.chatBotMessages.length === 0) {
      this.chatBotMessages.push({
        role: 'bot',
        texte: 'Bonjour ! Je suis votre Coach IA. Posez-moi une question sur votre performance (ex: "Pourquoi j\'ai perdu ?", "Quelle était ma pire décision ?", "Quel est mon score ?").'
      });
    }
  }

  public envoyerQuestionChatbot() {
    const question = this.questionChatbot.trim().toLowerCase();
    if (!question) return;

    this.chatBotMessages.push({ role: 'user', texte: this.questionChatbot });

    setTimeout(() => {
      let reponse = "Je n'ai pas compris. Essayez : 'Pourquoi j\'ai perdu ?', 'Quelle est ma pire décision ?' ou 'Quel est mon score ?'.";

      if (question.includes('score') || question.includes('pnl') || question.includes('combien')) {
        const pnl = this.engine.getPnl();
        reponse = `Votre score final est de ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} $ (soit ${this.pnlPct.toFixed(1)}%). `;
        if (pnl > 0) reponse += "Félicitations, vous avez été rentable !";
        else reponse += "Malheureusement, vous avez subi une perte. Ne vous inquiétez pas, c'est en forgeant qu'on devient forgeron.";
      } 
      else if (question.includes('perdu') || question.includes('perte') || question.includes('pourquoi')) {
        if (this.engine.getPnl() < 0) {
          const positions = this.state().positions;
          const aUtiliseSL = positions.some(p => p.stopLoss);
          
          reponse = "Analyse de votre perte :\n";
          if (!aUtiliseSL) reponse += "⚠️ Vous n'avez pas utilisé de Stop-Loss. C'est la principale cause de grosses pertes.\n";
          if (positions.length > 1) reponse += "⚠️ Vous avez diversifié, mais peut-être trop.\n";
          if (reponse === "Analyse de votre perte :\n") reponse += "Le marché a été plus fort que vous cette fois-ci.";
        } else {
          reponse = "Vous n'avez pas perdu d'argent, vous êtes même en positif ! Continuez comme ça.";
        }
      }
      else if (question.includes('pire') || question.includes('décision') || question.includes('erreur')) {
        reponse = "Si je devais pointer une erreur, ce serait le manque de gestion du risque. Pensez à toujours définir un Stop-Loss et un Take-Profit avant d'entrer dans un trade.";
      }
      else if (question.includes('formation') || question.includes('cours') || question.includes('apprendre')) {
        reponse = "Je vous recommande de suivre le module 'Gestion des Risques' dans la section Formation.";
      }

      this.chatBotMessages.push({ role: 'bot', texte: reponse });
      this.questionChatbot = '';
    }, 500);
  }
}