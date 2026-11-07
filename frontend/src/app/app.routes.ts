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

export const routes: Routes = [
  {
    path: '',
    component: AppLayoutComponent,
    children: [
      // ... (toutes les routes originales TailAdmin restent ici)

      // ---------- DASHBOARD ----------
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
        title: 'Dashboard Marchés | Crypto Simulator',
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
        title: 'Marché | Crypto Simulator',
      },
      {
        path: 'market/detail/:symbol',
        loadComponent: () => import('./pages/market-detail/market-detail.component').then(m => m.MarketDetailComponent),
        title: 'Détail Actif | Crypto Simulator',
      },

      // ---------- TRADING ----------
      {
        path: 'trading',
        loadComponent: () => import('./pages/trading/trading.component').then(m => m.TradingComponent),
        title: 'Trading | Crypto Simulator',
      },
      {
        path: 'trading/orderbook',
        loadComponent: () => import('./pages/orderbook/orderbook.component').then(m => m.OrderbookComponent),
        title: "Carnet d'ordres | Crypto Simulator",
      },
      {
        path: 'trading/risk',
        loadComponent: () => import('./pages/risk/risk.component').then(m => m.RiskComponent),
        title: 'Stop-loss / Take-profit | Crypto Simulator',
      },

      // ---------- PORTEFEUILLE & HISTORIQUE ----------
      {
        path: 'portfolio',
        loadComponent: () => import('./pages/portfolio/portfolio.component').then(m => m.PortfolioComponent),
        title: 'Portefeuille | Crypto Simulator',
      },
      {
        path: 'history',
        loadComponent: () => import('./pages/history/history.component').then(m => m.HistoryComponent),
        title: 'Historique | Crypto Simulator',
      },

      // ---------- ANALYSE & BACKTESTING ----------
      // 👇 La route /analysis pointe vers la page vide (pour Ramii)
      {
        path: 'analysis',
        loadComponent: () => import('./pages/analysis/analysis.component').then(m => m.AnalysisComponent),
        title: 'Analyse Technique | Crypto Simulator',
      },
      // 👇 La route /analysis/portfolio pointe vers TON composant
      {
        path: 'analysis/portfolio',
        loadComponent: () => import('./pages/analysis-technical/analysis-technical.component').then(m => m.AnalysisTechnicalComponent),
        title: 'Analyse Portefeuille | Crypto Simulator',
      },
      {
        path: 'analysis/compare',
        loadComponent: () => import('./pages/analysis-compare/analysis-compare.component').then(m => m.AnalysisCompareComponent),
        title: 'Comparaison Stratégies | Crypto Simulator',
      },
      {
        path: 'backtesting',
        loadComponent: () => import('./pages/backtesting/backtesting.component').then(m => m.BacktestingComponent),
        title: 'Backtesting | Crypto Simulator',
      },
      // 👇 Routes de Ramii (à ajouter si pas déjà là)
      {
        path: 'stress-testing',
        loadComponent: () => import('./pages/stress-testing/stress-testing.component').then(m => m.StressTestingComponent),
        title: 'Stress Testing | Crypto Simulator',
      },
      {
        path: 'stress-testing/results',
        loadComponent: () => import('./pages/stress-results/stress-results.component').then(m => m.StressResultsComponent),
        title: 'Résultats Stress Test | Crypto Simulator',
      },
      {
        path: 'stress-testing/compare',
        loadComponent: () => import('./pages/stress-compare/stress-compare.component').then(m => m.StressCompareComponent),
        title: 'Comparaison Scénarios | Crypto Simulator',
      },

      // ---------- JEU DE SALLE DE MARCHÉ ----------
      {
        path: 'game',
        loadComponent: () => import('./pages/game/game-lobby/game-lobby.component').then(m => m.GameLobbyComponent),
        title: 'Salle de Marché - Choix du Scénario | Crypto Simulator',
      },
      {
        path: 'game/play/:scenarioId',
        loadComponent: () => import('./pages/game/game-dashboard/game-dashboard.component').then(m => m.GameDashboardComponent),
        title: 'Jeu de Trading Historique | Crypto Simulator',
      },
      {
        path: 'game/results',
        loadComponent: () => import('./pages/game/game-results/game-results.component').then(m => m.GameResultsComponent),
        title: 'Résultats de la Simulation | Crypto Simulator',
      },
      {
        path: 'game/multiplayer',
        loadComponent: () => import('./pages/game/game-multiplayer/game-multiplayer.component').then(m => m.GameMultiplayerComponent),
        title: 'Défis Multijoueurs | Crypto Simulator',
      },

      // ---------- IA & XAI ----------
      { path: 'ai', loadComponent: () => import('./pages/ai/ai.component').then(m => m.AiComponent), title: 'Prédictions IA | Crypto Simulator' },
      { path: 'ai/agent', loadComponent: () => import('./pages/ai-agent/ai-agent.component').then(m => m.AiAgentComponent), title: 'Agent de Trading IA | Crypto Simulator' },
      { path: 'ai/sentiment', loadComponent: () => import('./pages/ai-sentiment/ai-sentiment.component').then(m => m.AiSentimentComponent), title: 'Analyse de Sentiment | Crypto Simulator' },
      { path: 'xai', loadComponent: () => import('./pages/xai/xai.component').then(m => m.XaiComponent), title: 'Explicabilité XAI | Crypto Simulator' },

      // ---------- FORMATION ----------
      {
        path: 'learning/course/:courseId/lesson/:lessonId',
        loadComponent: () => import('./pages/learning-course/learning-course.component').then(m => m.LearningCourseComponent),
        title: 'Leçon | Crypto Simulator',
      },
      {
        path: 'learning/course/:courseId',
        loadComponent: () => import('./pages/learning-course/learning-course.component').then(m => m.LearningCourseComponent),
        title: 'Module | Crypto Simulator',
      },
      {
        path: 'learning/quiz/:quizId',
        loadComponent: () => import('./pages/quiz-player/quiz-player.component').then(m => m.QuizPlayerComponent),
        title: 'Quiz en cours | Crypto Simulator',
      },
      {
        path: 'learning/quiz',
        loadComponent: () => import('./pages/quiz/quiz.component').then(m => m.QuizComponent),
        title: 'Quiz | Crypto Simulator',
      },
      {
        path: 'learning/progress',
        loadComponent: () => import('./pages/learning-progress/learning-progress.component').then(m => m.LearningProgressComponent),
        title: 'Progression | Crypto Simulator',
      },
      {
        path: 'learning',
        loadComponent: () => import('./pages/learning/learning.component').then(m => m.LearningComponent),
        title: 'Formation | Crypto Simulator',
      },
      {
        path: 'quiz',
        redirectTo: 'learning/quiz',
        pathMatch: 'full',
      },

      // ---------- GRAPHIQUES ----------
      { path: 'charts/candles', loadComponent: () => import('./pages/charts-candles/charts-candles.component').then(m => m.ChartsCandlesComponent), title: 'Chandeliers | Crypto Simulator' },
      { path: 'charts/indicators', loadComponent: () => import('./pages/charts-indicators/charts-indicators.component').then(m => m.ChartsIndicatorsComponent), title: 'Indicateurs | Crypto Simulator' },

      // ---------- ADMINISTRATION ----------
      { path: 'admin/users', loadComponent: () => import('./pages/admin-users/admin-users.component').then(m => m.AdminUsersComponent), title: 'Gestion Utilisateurs | Crypto Simulator' },
      { path: 'admin/ai-models', loadComponent: () => import('./pages/admin-ai-models/admin-ai-models.component').then(m => m.AdminAiModelsComponent), title: 'Modèles IA | Crypto Simulator' },
      { path: 'admin/stress-scenarios', loadComponent: () => import('./pages/admin-stress-scenarios/admin-stress-scenarios.component').then(m => m.AdminStressScenariosComponent), title: 'Scénarios Stress | Crypto Simulator' },
      { path: 'admin/stats', loadComponent: () => import('./pages/admin-stats/admin-stats.component').then(m => m.AdminStatsComponent), title: 'Statistiques | Crypto Simulator' },
    ]
  },

  // ---------- AUTHENTIFICATION ----------
  { path: 'signin', component: SignInComponent, title: 'Connexion | Crypto Simulator' },
  { path: 'signup', component: SignUpComponent, title: 'Inscription | Crypto Simulator' },

  // ---------- 404 ----------
  { path: '**', component: NotFoundComponent, title: 'Page introuvable | Crypto Simulator' },
];