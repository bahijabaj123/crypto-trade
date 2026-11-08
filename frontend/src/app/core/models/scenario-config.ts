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
  // Tous les scénarios ci-dessous utilisent l'API Binance (sans clé, intervalle 1h).
  // Binance n'a pas d'historique avant août 2017.
  // ============================================================
  {
    id: 'ukraine-2022',
    nom: 'La Guerre en Ukraine (Crypto, 2022)',
    description: 'Février 2022. La Russie envahit l’Ukraine. Sanctions, panique sur les marchés : comment réagissent le Bitcoin et les cryptos ?',
    difficulte: 'Difficile',
    icone: '🪖',
    couleur: 'from-blue-600 to-yellow-500',
    marche: 'Crypto',
    requetes: [
      { source: 'binance', symbol: 'BTCUSDT', startDate: '2022-02-10', endDate: '2022-03-10', interval: '1h' },
      { source: 'binance', symbol: 'ETHUSDT', startDate: '2022-02-10', endDate: '2022-03-10', interval: '1h' },
      { source: 'binance', symbol: 'BNBUSDT', startDate: '2022-02-10', endDate: '2022-03-10', interval: '1h' },
      { source: 'binance', symbol: 'XRPUSDT', startDate: '2022-02-10', endDate: '2022-03-10', interval: '1h' }
    ]
  },

  {
    id: 'bulle-2017-2018',
    nom: 'L’Éclatement de la Bulle Crypto (2017-2018)',
    description: 'Décembre 2017. Le Bitcoin frôle 20 000 $ puis s’effondre de plus de 50 % en quelques semaines. Saurez-vous vendre au sommet ?',
    difficulte: 'Difficile',
    icone: '🫧',
    couleur: 'from-yellow-500 to-red-600',
    marche: 'Crypto',
    requetes: [
      { source: 'binance', symbol: 'BTCUSDT', startDate: '2017-12-20', endDate: '2018-02-10', interval: '1h' },
      { source: 'binance', symbol: 'ETHUSDT', startDate: '2017-12-20', endDate: '2018-02-10', interval: '1h' },
      { source: 'binance', symbol: 'BNBUSDT', startDate: '2017-12-20', endDate: '2018-02-10', interval: '1h' },
      { source: 'binance', symbol: 'LTCUSDT', startDate: '2017-12-20', endDate: '2018-02-10', interval: '1h' }
    ]
  },

  {
    id: 'chine-2021',
    nom: 'L’Interdiction du Minage en Chine (2021)',
    description: 'Mai 2021. Les tweets d’Elon Musk, puis la Chine qui interdit le minage : les cryptos perdent plus de 40 % en quelques jours.',
    difficulte: 'Difficile',
    icone: '⛏️',
    couleur: 'from-red-600 to-rose-800',
    marche: 'Crypto',
    requetes: [
      { source: 'binance', symbol: 'BTCUSDT', startDate: '2021-05-05', endDate: '2021-05-30', interval: '1h' },
      { source: 'binance', symbol: 'ETHUSDT', startDate: '2021-05-05', endDate: '2021-05-30', interval: '1h' },
      { source: 'binance', symbol: 'BNBUSDT', startDate: '2021-05-05', endDate: '2021-05-30', interval: '1h' },
      { source: 'binance', symbol: 'DOGEUSDT', startDate: '2021-05-05', endDate: '2021-05-30', interval: '1h' }
    ]
  },

  {
    id: 'luna-2022',
    nom: 'L’Effondrement de Terra Luna (2022)',
    description: 'Mai 2022. Le stablecoin UST perd sa parité avec le dollar et Luna s’effondre : la panique gagne tout le marché crypto.',
    difficulte: 'Extrême',
    icone: '🌙',
    couleur: 'from-indigo-600 to-purple-800',
    marche: 'Crypto',
    requetes: [
      { source: 'binance', symbol: 'BTCUSDT', startDate: '2022-05-01', endDate: '2022-05-20', interval: '1h' },
      { source: 'binance', symbol: 'ETHUSDT', startDate: '2022-05-01', endDate: '2022-05-20', interval: '1h' },
      { source: 'binance', symbol: 'BNBUSDT', startDate: '2022-05-01', endDate: '2022-05-20', interval: '1h' },
      { source: 'binance', symbol: 'XRPUSDT', startDate: '2022-05-01', endDate: '2022-05-20', interval: '1h' }
    ]
  },

  {
    id: 'ftx-2022',
    nom: 'La Faillite de FTX (2022)',
    description: 'Novembre 2022. La deuxième plateforme crypto du monde s’effondre en quelques jours. La confiance disparaît, comme lors de Mt. Gox.',
    difficulte: 'Extrême',
    icone: '🏦',
    couleur: 'from-slate-600 to-blue-900',
    marche: 'Crypto',
    requetes: [
      { source: 'binance', symbol: 'BTCUSDT', startDate: '2022-11-01', endDate: '2022-11-20', interval: '1h' },
      { source: 'binance', symbol: 'ETHUSDT', startDate: '2022-11-01', endDate: '2022-11-20', interval: '1h' },
      { source: 'binance', symbol: 'BNBUSDT', startDate: '2022-11-01', endDate: '2022-11-20', interval: '1h' },
      { source: 'binance', symbol: 'SOLUSDT', startDate: '2022-11-01', endDate: '2022-11-20', interval: '1h' }
    ]
  }
];
