import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef, HostListener, ViewChild, ElementRef, effect, untracked } from '@angular/core';
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
import { CoachService, CtxCoach, Debrief, ScoreComportement, FinPartie } from '../../../core/services/coach.service';
import { CoachApiService } from '../../../core/services/coach-api.service';
import { GameLiveService } from '../../../core/services/game-live.service';

// Composants
import { PortfolioCurveComponent, PointCourbe, MarqueOrdre } from '../components/portfolio-curve/portfolio-curve.component';
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
  imports: [CommonModule, FormsModule, GameLineChartComponent, PortfolioCurveComponent],
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
  private readonly coach = inject(CoachService);
  private readonly coachApi = inject(CoachApiService);

  @ViewChild('zoneCoach') zoneCoach?: ElementRef<HTMLDivElement>;
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
  public readonly suggestionsCoach = this.coach.suggestions;
  public bulleCoach: { texte: string; niveau: string } | null = null;
  public alerteNonLue = false;
  public coachReflechit = false;
  public sourceCoach: 'llm' | 'local' | null = null;
  private timerCoach: any = null;
  private timerBulle: any = null;

  public panneauMJouvert = false;
  public newsInput = '';

  public role: string | null = null;
  public messageChat = '';
  public roomCode: string | null = null;
  public pseudo: string | null = null;

  public readonly state = this.engine.state;
  public readonly currentRoom = this.liveService.currentRoom;

  private subsBots: Subscription[] = [];

  // ---- Fin de partie : courbe, score, débrief ----
  public courbe: PointCourbe[] = [];
  public marques: MarqueOrdre[] = [];
  public score: ScoreComportement | null = null;
  public debrief: Debrief | null = null;
  public debriefIA: string | null = null;
  private maxConcentration = 0;
  private stopLossUtilise = false;
  private finTraitee = false;
  private timerCourbe: any = null;

  constructor() {
    effect(() => {
      if (this.state().jeuTermine && !this.finTraitee) {
        this.finTraitee = true;
        untracked(() => this.cloturer());
      }
    });
    // Synchronise l'état partagé du backend : prix impacté + flux d'événements
    effect(() => {
      const room = this.liveService.currentRoom();
      if (!room) return;
      const raw: string[] = room.evenements ? room.evenements.slice(-10) : [];
      this.evenementsEnrichis = raw.slice().reverse().map(ev => {
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

    // Enregistrement de la courbe du portefeuille (1 point / seconde, joueurs seulement)
    if (!this.isAdmin) this.timerCourbe = setInterval(() => this.echantillonner(), 1000);

    // Coach proactif (joueurs seulement) : vérifie la situation toutes les 3 s
    this.coach.reinitialiser();
    if (!this.isAdmin) this.timerCoach = setInterval(() => this.verifierAlertesCoach(), 3000);
  }

  ngOnDestroy(): void {
    this.engine.arreterJeu();
    if (this.timerCoach) clearInterval(this.timerCoach);
    if (this.timerCourbe) clearInterval(this.timerCourbe);
    if (this.timerBulle) clearTimeout(this.timerBulle);
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

  // ---- Contrôle MJ dynamique ----
  public cibleChoc = 'TOUS';          // 'TOUS' ou un symbole
  public intensiteChoc = -20;         // % signé, choisi au curseur
  public intensiteNews = -10;

  /** Choc cumulé affiché pour un actif (global + spécifique), en %. */
  public impactDe(actif: string): number {
    const r = this.currentRoom();
    return (r?.impactGlobal ?? 0) + (r?.impacts?.[actif] ?? 0);
  }

  public appliquerChoc() {
    if (!this.roomCode || !this.intensiteChoc) return;
    this.liveService.envoyerEvenementMJ(this.roomCode, this.intensiteChoc > 0 ? 'PUMP' : 'CRASH', this.intensiteChoc, '', this.cibleChoc).subscribe();
  }

  public forcerBot(personnalite: string, sens: string) {
    const nomBot = personnalite === 'paniqueux' ? 'Kira_Trade' : 'Orca';
    if (this.roomCode) this.liveService.envoyerEvenementMJ(this.roomCode, 'BOT_FORCE', sens === 'VENTE' ? -8 : 8, nomBot, this.cibleChoc).subscribe();
  }

  public injecterNews() {
    if (!this.newsInput.trim() || !this.roomCode) return;
    this.liveService.envoyerEvenementMJ(this.roomCode, 'NEWS', this.intensiteNews, this.newsInput, this.cibleChoc).subscribe();
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
              return prix * (1 + this.impactDe(sym) / 100);
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
    const r = this.engine.acheter(this.quantite, this.actifSelectionne, this.stopLoss || undefined, this.takeProfit || undefined);
    this.message = r.message;
    if (r.succes) {
      if (this.stopLoss) this.stopLossUtilise = true;
      this.marquerOrdre('ACHAT', this.actifSelectionne);
      this.signalerOrdre('ACHETÉ', this.quantite, this.actifSelectionne);
    }
    setTimeout(() => { this.message = ''; }, 3000);
  }

  public vendre(): void {
    if (!this.scenario) return;
    const r = this.engine.vendre(this.quantite, this.actifSelectionne);
    this.message = r.message;
    if (r.succes) {
      this.marquerOrdre('VENTE', this.actifSelectionne);
      this.signalerOrdre('VENDU', this.quantite, this.actifSelectionne);
    }
    setTimeout(() => { this.message = ''; }, 3000);
  }

  public fermerPosition(pos: GamePosition): void {
    if (!this.scenario) return;
    const q = pos.quantite, s = pos.symbole;
    const r = this.engine.vendre(q, s);
    this.message = r.message;
    if (r.succes) { this.marquerOrdre('VENTE', s); this.signalerOrdre('VENDU', q, s); }
    setTimeout(() => { this.message = ''; }, 3000);
  }

  private signalerOrdre(action: string, quantite: number, symbole: string): void {
    if (this.roomCode && this.pseudo)
      this.liveService.envoyerAction(this.roomCode, this.pseudo, action, quantite, symbole, this.prixActuel(symbole)).subscribe();
  }

  private marquerOrdre(sens: 'ACHAT' | 'VENTE', symbole: string): void {
    this.marques.push({ t: this.dureeTotaleSecondes - this.state().tempsRestantSecondes, sens, symbole });
  }

  // ================= FIN DE PARTIE =================

  /** Un point par seconde : valeur du portefeuille + marché (acheter et garder le 1er actif). */
  private echantillonner(): void {
    if (!this.scenario || !this.state().jeuEnCours) return;
    const t = this.dureeTotaleSecondes - this.state().tempsRestantSecondes;
    const a0 = this.scenario.actifs[0];
    const d = this.scenario.donnees[a0] ?? [];
    const i = Math.min(Math.floor(this.state().tempsActuel), d.length - 1);
    const m = d.length && d[0].close ? this.valeurInitiale * d[Math.max(0, i)].close / d[0].close : undefined;
    this.courbe.push({ t, v: this.valeurImpactee, m });
    const v = this.valeurImpactee;
    for (const p of this.state().positions) {
      const part = v ? (this.prixActuel(p.symbole) * (1 + this.impactDe(p.symbole) / 100) * p.quantite) / v : 0;
      if (part > this.maxConcentration) this.maxConcentration = part;
    }
  }

  private drawdownMax(): number {
    let pic = this.valeurInitiale, dd = 0;
    for (const p of this.courbe) { pic = Math.max(pic, p.v); dd = Math.max(dd, (pic - p.v) / pic * 100); }
    return dd;
  }

  private construireFin(): FinPartie {
    const ctx = this.construireCtxCoach();
    const dernier = this.courbe[this.courbe.length - 1];
    const marchePct = dernier?.m ? (dernier.m / this.valeurInitiale - 1) * 100 : 0;
    return {
      pnl: this.pnlImpacte, pnlPct: this.pnlPct, valeur: this.valeurImpactee, ordres: ctx.ordres,
      drawdownMax: this.drawdownMax(), concentrationMax: this.maxConcentration,
      stopLossUtilise: this.stopLossUtilise || ctx.positions.some(p => !!p.stopLoss),
      nbOrdres: this.engine.ordres.length, marchePct
    };
  }

  private cloturer(): void {
    if (this.timerCourbe) { clearInterval(this.timerCourbe); this.timerCourbe = null; }
    if (this.isAdmin || !this.scenario) return;
    this.echantillonner();
    // dernier point à t = durée totale (la boucle du moteur s'arrête avant)
    const f = this.construireFin();
    this.score = this.coach.scoreComportement(f);
    this.debrief = this.coach.debrief(f);

    if (this.roomCode && this.pseudo)
      this.liveService.envoyerResultat(this.roomCode, this.pseudo, {
        pnl: f.pnl, pnlPct: f.pnlPct, valeur: f.valeur, nbOrdres: f.nbOrdres,
        stopLoss: f.stopLossUtilise, drawdown: f.drawdownMax, score: this.score.total
      }).subscribe();

    // Commentaire du coach IA (facultatif, s'ajoute si le LLM répond)
    const faits = `Débrief : meilleure décision : ${this.debrief.meilleure}. Pire : ${this.debrief.pire}. ${this.debrief.risque} Score comportement : ${this.score.total}/100.`;
    this.coachApi.demander(this.pseudo ?? 'anon',
      'Fais mon débrief de fin de partie en 3 phrases : ce que j\'ai bien fait, mon erreur principale, ce que je dois travailler.',
      { fin: { pnlPct: +f.pnlPct.toFixed(1), marchePct: +f.marchePct.toFixed(1), drawdownMax: +f.drawdownMax.toFixed(1), concentrationMaxPct: Math.round(f.concentrationMax * 100), stopLoss: f.stopLossUtilise, nbOrdres: f.nbOrdres, score: this.score.total } },
      faits, []).subscribe(r => { if (r.source === 'llm' && r.reponse) this.debriefIA = r.reponse; });
  }

  // ---- classement, podium, prix ----
  public get joueursClasses(): any[] {
    const tous: any[] = this.currentRoom()?.joueurs ?? [];
    const joueurs = tous.slice(1);   // le 1er est l'hôte (MJ) : il ne joue pas
    const rang = (j: any) => (j.termine ? 0 : j.actif ? 1 : 2);
    return joueurs
      .map(j => ({ ...j, statut: j.termine ? 'fini' : j.actif ? 'encours' : 'abandon' }))
      .sort((a, b) => rang(a) - rang(b) || b.pnlPct - a.pnlPct);
  }
  public get podium(): any[] { return this.joueursClasses.filter(j => j.statut === 'fini').slice(0, 3); }
  public get autresJoueurs(): any[] {
    const p = this.podium.map(j => j.pseudo);
    return this.joueursClasses.filter(j => !p.includes(j.pseudo));
  }
  public get jeSuisPremier(): boolean { return this.podium[0]?.pseudo === this.pseudo; }
  public get prixComportement(): { titre: string; pseudo: string; detail: string }[] {
    const f = this.joueursClasses.filter(j => j.statut === 'fini' && j.nbOrdres > 0);
    if (f.length < 2) return [];
    const out: { titre: string; pseudo: string; detail: string }[] = [];
    const meilleur = (cmp: (a: any, b: any) => number) => [...f].sort(cmp)[0];
    const d = f.filter(j => j.stopLoss);
    if (d.length) { const j = [...d].sort((a, b) => b.score - a.score)[0]; out.push({ titre: 'Le plus discipliné', pseudo: j.pseudo, detail: `score ${j.score}/100` }); }
    const s = meilleur((a, b) => a.drawdown - b.drawdown);
    out.push({ titre: 'Le plus solide', pseudo: s.pseudo, detail: `baisse max ${s.drawdown.toFixed(1)} %` });
    const act = meilleur((a, b) => b.nbOrdres - a.nbOrdres);
    out.push({ titre: 'Le plus actif', pseudo: act.pseudo, detail: `${act.nbOrdres} ordres` });
    return out;
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
    const prixImpacte = prix * (1 + this.impactDe(actif) / 100);
    return (prixImpacte / data[0].close - 1) * 100;
  }

  public readonly valeurInitiale = 10000;

  /** Valeur du portefeuille avec les prix impactés par la salle (cohérent avec le tableau des positions). */
  public get valeurImpactee(): number {
    let total = this.state().solde;
    for (const p of this.state().positions)
      total += this.prixActuel(p.symbole) * (1 + this.impactDe(p.symbole) / 100) * p.quantite;
    return total;
  }
  public get pnlImpacte(): number { return this.valeurImpactee - this.valeurInitiale; }
  public get pnlPct(): number { return (this.pnlImpacte / this.valeurInitiale) * 100; }

  public getPosition(actif: string): GamePosition | undefined {
    return this.state().positions.find(p => p.symbole === actif);
  }

  public prixActuel(actif: string): number {
    return this.engine.getPrixActuel(actif) || 0;
  }

  public pnlPosition(pos: GamePosition): number {
    const prixImpacte = this.prixActuel(pos.symbole) * (1 + this.impactDe(pos.symbole) / 100);
    return (prixImpacte - pos.prixMoyenAchat) * pos.quantite;
  }

  public pnlPctPosition(pos: GamePosition): number {
    const prixImpacte = this.prixActuel(pos.symbole) * (1 + this.impactDe(pos.symbole) / 100);
    return pos.prixMoyenAchat ? (prixImpacte / pos.prixMoyenAchat - 1) * 100 : 0;
  }

  public get coutEstime(): number {
    return this.prixActuel(this.actifSelectionne) * (this.quantite || 0);
  }

  public get messageErreur(): boolean {
    return /insuffisant|indisponible/i.test(this.message);
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
      this.profilFinal = this.analysis.analyserPerformance(this.pnlImpacte, this.state().positions, !!aUtiliseStopLoss);
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

  // ================= COACH IA (contextuel) =================

  /** Photographie de la partie, donnée au coach. */
  private construireCtxCoach(): CtxCoach {
    const sc = this.scenario!;
    const prixImp = (s: string) => this.prixActuel(s) * (1 + this.impactDe(s) / 100);
    const positions = this.state().positions;
    const valeurs = positions.map(p => prixImp(p.symbole) * p.quantite);
    const valeurTotale = this.state().solde + valeurs.reduce((a, b) => a + b, 0);

    const variation: Record<string, number> = {}, choc: Record<string, number> = {}, recente: Record<string, number> = {};
    const i = Math.floor(this.state().tempsActuel);
    for (const a of sc.actifs) {
      variation[a] = this.variationPct(a);
      choc[a] = this.impactDe(a);
      const d = sc.donnees[a] ?? [];
      const ref = d[Math.max(0, i - 10)]?.close, now = d[Math.min(i, d.length - 1)]?.close;
      recente[a] = ref && now ? (now / ref - 1) * 100 : 0;
    }
    return {
      valeurTotale, solde: this.state().solde, pnl: this.pnlImpacte, pnlPct: this.pnlPct,
      positions: positions.map((p, k) => ({
        symbole: p.symbole, quantite: p.quantite, prixMoyen: p.prixMoyenAchat, prixActuel: prixImp(p.symbole),
        valeur: valeurs[k], pnlPct: this.pnlPctPosition(p), stopLoss: p.stopLoss,
        partPortefeuille: valeurTotale ? valeurs[k] / valeurTotale : 0
      })),
      actifCourant: this.actifSelectionne,
      variation, choc, variationRecente: recente,
      evenementContexte: this.evenementActuel,
      flux: this.evenementsEnrichis.map(e => e.texte),
      ordres: this.engine.ordres.map(o => ({
        sens: o.sens as 'ACHAT' | 'VENTE', symbole: o.symbole, index: o.index,
        prixAlors: sc.donnees[o.symbole]?.[Math.min(o.index, (sc.donnees[o.symbole]?.length ?? 1) - 1)]?.close ?? 0,
        prixActuel: prixImp(o.symbole)
      }))
    };
  }

  private verifierAlertesCoach(): void {
    if (!this.scenario || !this.state().jeuEnCours) return;
    const alertes = this.coach.alertes(this.construireCtxCoach());
    for (const a of alertes) {
      this.chatBotMessages.push({ role: 'bot', texte: (a.niveau === 'danger' ? '⚠️ ' : a.niveau === 'attention' ? '💡 ' : 'ℹ️ ') + a.texte });
      if (!this.chatbotOuvert) {
        this.alerteNonLue = true;
        this.bulleCoach = { texte: a.texte, niveau: a.niveau };
        if (this.timerBulle) clearTimeout(this.timerBulle);
        this.timerBulle = setTimeout(() => this.bulleCoach = null, 9000);
      }
    }
    if (alertes.length) this.defilerCoach();
  }

  private defilerCoach(): void {
    setTimeout(() => { const el = this.zoneCoach?.nativeElement; if (el) el.scrollTop = el.scrollHeight; }, 50);
  }

  public toggleChatbot() {
    this.chatbotOuvert = !this.chatbotOuvert;
    if (this.chatbotOuvert) { this.alerteNonLue = false; this.bulleCoach = null; }
    if (this.chatbotOuvert && this.chatBotMessages.length === 0) {
      this.chatBotMessages.push({
        role: 'bot',
        texte: 'Bonjour ! Je suis ton Coach. Je surveille ton portefeuille et je te préviens des risques. Pose-moi une question ou utilise les raccourcis ci-dessous.'
      });
    }
    if (this.chatbotOuvert) this.defilerCoach();
  }

  public poserQuestion(q: string) { this.questionChatbot = q; this.envoyerQuestionChatbot(); }

  public envoyerQuestionChatbot() {
    const question = this.questionChatbot.trim();
    if (!question || this.coachReflechit) return;
    const historique = this.chatBotMessages.filter(m => !m.texte.startsWith('⚠️') && !m.texte.startsWith('💡') && !m.texte.startsWith('ℹ️'));
    this.chatBotMessages.push({ role: 'user', texte: question });
    this.questionChatbot = '';
    this.defilerCoach();

    if (!this.scenario) {
      this.chatBotMessages.push({ role: 'bot', texte: "La partie n'est pas encore chargée." });
      return;
    }
    const ctx = this.construireCtxCoach();
    const faits = this.coach.repondre(question, ctx);          // calcul local fiable (sert de repli ET de faits au LLM)

    this.coachReflechit = true;
    this.coachApi.demander(this.pseudo ?? 'anon', question, this.ctxCompact(ctx), faits, historique).subscribe(r => {
      this.coachReflechit = false;
      this.sourceCoach = r.source;
      this.chatBotMessages.push({ role: 'bot', texte: r.source === 'llm' && r.reponse ? r.reponse : faits });
      this.defilerCoach();
    });
  }

  /** Version allégée du contexte envoyée au LLM (pas de données inutiles). */
  private ctxCompact(c: CtxCoach) {
    return {
      valeurTotale: Math.round(c.valeurTotale), cash: Math.round(c.solde), pnl: Math.round(c.pnl), pnlPct: +c.pnlPct.toFixed(1),
      actifCourant: c.actifCourant,
      positions: c.positions.map(p => ({ actif: p.symbole, partPct: Math.round(p.partPortefeuille * 100), pnlPct: +p.pnlPct.toFixed(1), stopLoss: !!p.stopLoss })),
      variationSeancePct: Object.fromEntries(Object.entries(c.variation).map(([k, v]) => [k, +v.toFixed(1)])),
      chocsSallePct: Object.fromEntries(Object.entries(c.choc).map(([k, v]) => [k, +v.toFixed(1)])),
      evenementContexte: c.evenementContexte,
      derniersEvenementsSalle: c.flux.slice(0, 4),
      nbOrdres: c.ordres.length
    };
  }
}