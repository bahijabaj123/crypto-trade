import { Routes } from '@angular/router';
import { AppLayoutComponent } from './shared/layout/app-layout/app-layout.component';
import { ProfileComponent } from './pages/profile/profile.component';
import { FormElementsComponent } from './pages/forms/form-elements/form-elements.component';
import { BasicTablesComponent } from './pages/tables/basic-tables/basic-tables.component';
import { BlankComponent } from './pages/blank/blank.component';
import { NotFoundComponent } from './pages/other-page/not-found/not-found.component';
import { InvoicesComponent } from './pages/invoices/invoices.component';
import { LineChartComponent } from './pages/charts/line-chart/line-chart.component';
import { BarChartComponent } from './pages/charts/bar-chart/bar-chart.component';
import { AlertsComponent } from './pages/ui-elements/alerts/alerts.component';
import { AvatarElementComponent } from './pages/ui-elements/avatar-element/avatar-element.component';
import { BadgesComponent } from './pages/ui-elements/badges/badges.component';
import { ButtonsComponent } from './pages/ui-elements/buttons/buttons.component';
import { ImagesComponent } from './pages/ui-elements/images/images.component';
import { VideosComponent } from './pages/ui-elements/videos/videos.component';
import { SignInComponent } from './pages/auth-pages/sign-in/sign-in.component';
import { SignUpComponent } from './pages/auth-pages/sign-up/sign-up.component';
import { CalenderComponent } from './pages/calender/calender.component';
import { ADMIN_ROUTES } from './app.routes.admin'; // 👈 Import de Sarra conservé
import { AccueilComponent } from './pages/accueil/accueil.component';


export const routes: Routes = [
  {
    path: '',
    component: AppLayoutComponent,
    children: [

      // ---------- ACCUEIL (page d'arrivée) ----------
      {
        path: '',
        component: AccueilComponent,
        pathMatch: 'full',
        title: 'Accueil | TradeLAB',
      },

      // ---------- ACTUARIAT (TES ROUTES) ----------
      {
        path: 'actuariat',
        loadComponent: () => import('./pages/actuariat/actuariat.component').then(m => m.ActuariatComponent),
        title: 'Module Actuariat | TradeLAB',
      },
      {
        path: 'provisions',
        loadComponent: () => import('./pages/provisions/provisions.component').then(m => m.ProvisionsComponent),
        title: 'Provisions de Sinistres | TradeLAB',
      },
      {
        path: 'assurance-parametrique',
        loadComponent: () => import('./pages/assurance-parametrique/assurance-parametrique.component').then(m => m.AssuranceParametriqueComponent),
        title: 'Assurance Paramétrique | TradeLAB',
      },
      {
        path: 'mode-assureur',
        loadComponent: () => import('./pages/mode-assureur/mode-assureur.component').then(m => m.ModeAssureurComponent),
        title: 'Mode Assureur | TradeLAB',
      },

      // ---------- DASHBOARD ----------
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
        title: 'Dashboard Marchés | TradeLAB',
      },

      // ---------- MARCHÉ ----------
      {
        path: 'market',
        redirectTo: 'market/crypto',
        pathMatch: 'full',
      },
      {
        path: 'market/:type',
        loadComponent: () => import('./pages/market/market.component').then(m => m.MarketComponent),
        title: 'Marché | TradeLAB',
      },
      {
        path: 'market/detail/:symbol',
        loadComponent: () => import('./pages/market-detail/market-detail.component').then(m => m.MarketDetailComponent),
        title: 'Détail Actif | TradeLAB',
      },

      // ---------- TRADING ----------
      {
        path: 'trading',
        loadComponent: () => import('./pages/trading/trading.component').then(m => m.TradingComponent),
        title: 'Trading | TradeLAB',
      },
      {
        path: 'trading/orderbook',
        loadComponent: () => import('./pages/orderbook/orderbook.component').then(m => m.OrderbookComponent),
        title: "Carnet d'ordres | TradeLAB",
      },
      {
        path: 'trading/risk',
        loadComponent: () => import('./pages/risk/risk.component').then(m => m.RiskComponent),
        title: 'Stop-loss / Take-profit | TradeLAB',
      },

      // ---------- PORTEFEUILLE & HISTORIQUE ----------
      {
        path: 'portfolio',
        loadComponent: () => import('./pages/portfolio/portfolio.component').then(m => m.PortfolioComponent),
        title: 'Portefeuille | TradeLAB',
      },
      {
        path: 'history',
        loadComponent: () => import('./pages/history/history.component').then(m => m.HistoryComponent),
        title: 'Historique | TradeLAB',
      },

      // ---------- ANALYSE & BACKTESTING ----------
      {
        path: 'analysis',
        loadComponent: () => import('./pages/analysis/analysis.component').then(m => m.AnalysisComponent),
        title: 'Analyse Technique | TradeLAB',
      },
      {
        path: 'analysis/portfolio',
        loadComponent: () => import('./pages/analysis-technical/analysis-technical.component').then(m => m.AnalysisTechnicalComponent),
        title: 'Analyse Portefeuille | TradeLAB',
      },
      {
        path: 'analysis/compare',
        loadComponent: () => import('./pages/analysis-compare/analysis-compare.component').then(m => m.AnalysisCompareComponent),
        title: 'Comparaison Stratégies | TradeLAB',
      },
      {
        path: 'backtesting',
        loadComponent: () => import('./pages/backtesting/backtesting.component').then(m => m.BacktestingComponent),
        title: 'Backtesting | TradeLAB',
      },
      {
        path: 'stress-testing',
        loadComponent: () => import('./pages/stress-testing/stress-testing.component').then(m => m.StressTestingComponent),
        title: 'Stress Testing | TradeLAB',
      },
      {
        path: 'stress-testing/results',
        loadComponent: () => import('./pages/stress-results/stress-results.component').then(m => m.StressResultsComponent),
        title: 'Résultats Stress Test | TradeLAB',
      },
      {
        path: 'stress-testing/compare',
        loadComponent: () => import('./pages/stress-compare/stress-compare.component').then(m => m.StressCompareComponent),
        title: 'Comparaison Scénarios | TradeLAB',
      },

      // ---------- JEU DE SALLE DE MARCHÉ ----------
      {
        path: 'game',
        loadComponent: () => import('./pages/game/game-lobby/game-lobby.component').then(m => m.GameLobbyComponent),
        title: 'Salle de Marché - Défi Multijoueur | TradeLAB',
      },
      {
        path: 'game/play/:scenarioId',
        loadComponent: () => import('./pages/game/game-dashboard/game-dashboard.component').then(m => m.GameDashboardComponent),
        title: 'Jeu de Trading Historique | TradeLAB',
      },
      {
        path: 'game/results',
        loadComponent: () => import('./pages/game/game-results/game-results.component').then(m => m.GameResultsComponent),
        title: 'Résultats de la Simulation | TradeLAB',
      },
      {
        path: 'game/multiplayer',
        redirectTo: 'game',
        pathMatch: 'full',
      },

      // ---------- IA & XAI ----------
      { path: 'ai', loadComponent: () => import('./pages/ai/ai.component').then(m => m.AiComponent), title: 'Prédictions IA | TradeLAB' },
      { path: 'ai/agent', loadComponent: () => import('./pages/ai-agent/ai-agent.component').then(m => m.AiAgentComponent), title: 'Agent de Trading IA | TradeLAB' },
      { path: 'ai/sentiment', loadComponent: () => import('./pages/ai-sentiment/ai-sentiment.component').then(m => m.AiSentimentComponent), title: 'Analyse de Sentiment | TradeLAB' },
      { path: 'xai', loadComponent: () => import('./pages/xai/xai.component').then(m => m.XaiComponent), title: 'Explicabilité XAI | TradeLAB' },

      // ---------- FORMATION ----------
      {
        path: 'learning/course/:courseId/lesson/:lessonId',
        loadComponent: () => import('./pages/learning-course/learning-course.component').then(m => m.LearningCourseComponent),
        title: 'Leçon | TradeLAB',
      },
      {
        path: 'learning/course/:courseId',
        loadComponent: () => import('./pages/learning-course/learning-course.component').then(m => m.LearningCourseComponent),
        title: 'Module | TradeLAB',
      },
      {
        path: 'learning/quiz/:quizId',
        loadComponent: () => import('./pages/quiz-player/quiz-player.component').then(m => m.QuizPlayerComponent),
        title: 'Quiz en cours | TradeLAB',
      },
      {
        path: 'learning/quiz',
        loadComponent: () => import('./pages/quiz/quiz.component').then(m => m.QuizComponent),
        title: 'Quiz | TradeLAB',
      },
      {
        path: 'learning/progress',
        loadComponent: () => import('./pages/learning-progress/learning-progress.component').then(m => m.LearningProgressComponent),
        title: 'Progression | TradeLAB',
      },
      {
        path: 'learning',
        loadComponent: () => import('./pages/learning/learning.component').then(m => m.LearningComponent),
        title: 'Formation | TradeLAB',
      },
      {
        path: 'quiz',
        redirectTo: 'learning/quiz',
        pathMatch: 'full',
      },

      // ---------- GRAPHIQUES ----------
      { path: 'charts/candles', loadComponent: () => import('./pages/charts-candles/charts-candles.component').then(m => m.ChartsCandlesComponent), title: 'Chandeliers | TradeLAB' },
      { path: 'charts/indicators', loadComponent: () => import('./pages/charts-indicators/charts-indicators.component').then(m => m.ChartsIndicatorsComponent), title: 'Indicateurs | TradeLAB' },

      // ---------- ADMINISTRATION (PROTÉGÉE PAR SARRA) ----------
      ...ADMIN_ROUTES,
    ]
  },

  // ---------- AUTHENTIFICATION ----------
  { path: 'signin', component: SignInComponent, title: 'Connexion | TradeLAB' },
  { path: 'signup', component: SignUpComponent, title: 'Inscription | TradeLAB' },
{ path: 'profile', component: ProfileComponent, title: 'Mon Profil | TradeLAB' },

  // ---------- 404 ----------
  { path: '**', component: NotFoundComponent, title: 'Page introuvable | TradeLAB' },
];