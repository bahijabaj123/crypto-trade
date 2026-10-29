import { HistoricalRequest } from '../services/historical-data.service';

export interface ScenarioConfig {
  id: string;
  nom: string;
  description: string;
  difficulte: string;
  icone: string;
  couleur: string;
  marche: 'Crypto' | 'Actions' | 'Forex' | 'Matières premières'; // 👈 Nouveau champ
  requetes: HistoricalRequest[];
}

export const SCENARIOS_CONFIG: ScenarioConfig[] = [
  // ============================================================
  // SCÉNARIO 1 : CRYPTO (Krach Covid)
  // ============================================================
  {
    id: 'covid-crypto',
    nom: 'Le Krach du Covid-19 (Crypto)',
    description: 'Mars 2020. Le monde s\'arrête. Le Bitcoin, l\'Ethereum et les altcoins perdent plus de 50%.',
    difficulte: 'Difficile',
    icone: '🦠',
    couleur: 'from-orange-500 to-red-500',
    marche: 'Crypto',
    requetes: [
      { source: 'binance', symbol: 'BTCUSDT', startDate: '2020-03-01', endDate: '2020-03-20', interval: '1h' },
      { source: 'binance', symbol: 'ETHUSDT', startDate: '2020-03-01', endDate: '2020-03-20', interval: '1h' },
      { source: 'binance', symbol: 'BNBUSDT', startDate: '2020-03-01', endDate: '2020-03-20', interval: '1h' },
      { source: 'binance', symbol: 'XRPUSDT', startDate: '2020-03-01', endDate: '2020-03-20', interval: '1h' }
    ]
  },

  // ============================================================
  // SCÉNARIO 2 : ACTIONS (Subprimes 2008)
  // ============================================================
  {
    id: 'subprimes-actions',
    nom: 'Le Krach des Subprimes (Actions)',
    description: 'Septembre 2008. La faillite de Lehman Brothers entraîne une crise boursière mondiale.',
    difficulte: 'Extrême',
    icone: '🏦',
    couleur: 'from-red-700 to-red-900',
    marche: 'Actions',
    requetes: [
      { source: 'twelvedata', symbol: 'AAPL', startDate: '2008-09-01', endDate: '2008-10-15', interval: '1day' },
      { source: 'twelvedata', symbol: 'MSFT', startDate: '2008-09-01', endDate: '2008-10-15', interval: '1day' },
      { source: 'twelvedata', symbol: 'JPM', startDate: '2008-09-01', endDate: '2008-10-15', interval: '1day' }
    ]
  },

  // ============================================================
  // SCÉNARIO 3 : FOREX (Flash Crash 2010)
  // ============================================================
  {
    id: 'flash-crash-forex',
    nom: 'Le Flash Crash du Forex (2010)',
    description: 'Mai 2010. En quelques minutes, le Dow Jones perd 1000 points et l\'EUR/USD s\'effondre.',
    difficulte: 'Difficile',
    icone: '💱',
    couleur: 'from-blue-600 to-cyan-500',
    marche: 'Forex',
    requetes: [
      { source: 'twelvedata', symbol: 'EUR/USD', startDate: '2010-05-01', endDate: '2010-05-15', interval: '1h' },
      { source: 'twelvedata', symbol: 'GBP/USD', startDate: '2010-05-01', endDate: '2010-05-15', interval: '1h' },
      { source: 'twelvedata', symbol: 'USD/JPY', startDate: '2010-05-01', endDate: '2010-05-15', interval: '1h' }
    ]
  },

  // ============================================================
  // SCÉNARIO 4 : MATIÈRES PREMIÈRES (Krach Pétrole 2020)
  // ============================================================
  {
    id: 'oil-crash-2020',
    nom: 'Le Krach du Pétrole (Matières premières)',
    description: 'Avril 2020. La demande s\'effondre à cause du Covid. Le prix du pétrole devient négatif.',
    difficulte: 'Extrême',
    icone: '🛢️',
    couleur: 'from-yellow-600 to-orange-700',
    marche: 'Matières premières',
    requetes: [
      // Les symboles dépendent de Twelve Data : WTI et BRENT pour le pétrole
      { source: 'twelvedata', symbol: 'WTI', startDate: '2020-03-15', endDate: '2020-04-25', interval: '1day' },
      { source: 'twelvedata', symbol: 'BRENT', startDate: '2020-03-15', endDate: '2020-04-25', interval: '1day' }
    ]
  }
];