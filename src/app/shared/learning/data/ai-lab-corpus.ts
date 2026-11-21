import { CognitiveBias, CrisisKind } from '../models/ai-lab.models';

export const CRISIS_TEMPLATES: {
  kind: CrisisKind;
  titles: string[];
  hooks: string[];
  assets: string[];
  trap: string;
  discipline: string;
  headlines: string[][];
}[] = [
  {
    kind: 'LIQUIDATION',
    titles: ['Cascade de liquidations', 'Squeeze long forcé', 'Mur de stops emporté'],
    hooks: [
      'Le carnet est mince. Un mouvement de 3 % peut en déclencher 12 %.',
      'Le funding est extrême : le marché est trop d’un seul côté.',
    ],
    assets: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
    trap: 'Ajouter pour « rattraper » pendant la cascade.',
    discipline: 'Réduire le levier avant d’espérer un rebond.',
    headlines: [
      ['Open interest record sur les perps', 'Première vague de liquidations long', 'Le carnet bid disparaît sur 200 ms'],
      ['Funding 0,12 % / 8h — trop de monde long', 'Oracle lag : stops groupés au même prix', 'Market makers retirent la liquidité'],
    ],
  },
  {
    kind: 'HACK',
    titles: ['Faille d’un CEX', 'Bridge drainé', 'Hot wallet compromis'],
    hooks: [
      'L’incertitude de contrepartie tue plus vite que le graphe.',
      'Le prix n’est plus un signal : c’est une file de sorties.',
    ],
    assets: ['ETHUSDT', 'BNBUSDT', 'ARBUSDT'],
    trap: 'Acheter le « dip » avant de savoir qui est solvable.',
    discipline: 'Couper l’exposition à l’écosystème touché, pas « nibble ».',
    headlines: [
      ['Tweet d’un chercheur : flux anormaux', 'Pause des retraits annoncée', 'On-chain : 80k ETH vers mixer'],
      ['Support silencieux depuis 19 min', 'Pairs isolés : spread 4 %', 'Rumeur de re-hypothecation'],
    ],
  },
  {
    kind: 'MACRO',
    titles: ['Surprise de taux', 'CPI hors consensus', 'Discours hawkish'],
    hooks: [
      'Le crypto n’a pas de bilan : il a un beta au dollar.',
      'Quand le risque gratuit disparaît, les alts se décorrèlent trop tard.',
    ],
    assets: ['BTCUSDT', 'ETHUSDT'],
    trap: 'Traiter un print macro comme un pullback technique.',
    discipline: 'Réduire la taille tant que le régime n’est pas re-pricé.',
    headlines: [
      ['CPI +0,4 % vs 0,2 % attendu', 'DXY casse 106', 'Nasdaq -2,1 % en 8 minutes'],
      ['Fed : « higher for longer »', 'Real yields +18 bps', 'Basis trade se démonte'],
    ],
  },
  {
    kind: 'DEPEG',
    titles: ['Stablecoin sous 0,97', 'Panique USDT/USDC', 'Curve pool déséquilibré'],
    hooks: [
      'Un depeg n’est pas un trade : c’est un test de solvabilité.',
      'Les « opportunités » de 3 % cachent un risque de 30 %.',
    ],
    assets: ['USDTUSDT', 'USDCUSDT', 'DAIUSDT'],
    trap: 'Averaging down un stablecoin « parce que ça revient toujours ».',
    discipline: 'Sortir des collatéraux opaques, attendre la preuve on-chain.',
    headlines: [
      ['Pool Curve : 78 / 22', 'OTC quotes 0,94', 'Redeem queue 14 h'],
      ['Issuer nie, on-chain dit le contraire', 'CEX haircut 6 %', 'Flight vers T-bills tokenisés'],
    ],
  },
  {
    kind: 'ETF',
    titles: ['Rejet ETF surprise', 'Outflows records', 'Custodian glitch'],
    hooks: [
      'Le flux institutionnel n’est pas une religion : il s’inverse.',
      'Un headline ETF est un choc de liquidité, pas une thèse long terme.',
    ],
    assets: ['BTCUSDT'],
    trap: 'Doubler la position « parce que BlackRock est encore long ».',
    discipline: 'Trader le flux, pas le narratif marketing.',
    headlines: [
      ['SEC delay communicated after close', 'GBTC outflows 642 M$', 'Basis cash-and-carry se resserre'],
      ['Custodian halt 23 min', 'Premium ETF négatif', 'Desks coupés côté authorised participants'],
    ],
  },
  {
    kind: 'WHALE',
    titles: ['Dump OTC raté', 'Unlock + vente', 'Wallet 2013 en mouvement'],
    hooks: [
      'Une baleine ne « dump » pas le graphe : elle dump votre stop.',
      'Le tape ne ment pas. Le Twitter, si.',
    ],
    assets: ['BTCUSDT', 'WIFUSDT', 'PEPEUSDT'],
    trap: 'Front-run un « accumulation whale » mal étiquetée.',
    discipline: 'Attendre que l’offre soit absorbée, pas prédire l’intention.',
    headlines: [
      ['12 400 BTC quittent cold wallet', 'Binance : sell wall 1 800 BTC', 'Funding flip short'],
      ['Unlock team : 4,2 % du supply', 'MM retire le bid 1 %', 'Cluster de stops à -6 %'],
    ],
  },
  {
    kind: 'GEO',
    titles: ['Choc géopolitique', 'Sanction surprise', 'Coupure de câbles'],
    hooks: [
      'Le risque de queue n’a pas de RSI.',
      'En régime de peur, la corrélation va à 1.',
    ],
    assets: ['BTCUSDT', 'ETHUSDT', 'XAU proxy'],
    trap: 'Chercher un bottom trop tôt parce que « BTC is digital gold ».',
    discipline: 'Taille minimale, hedge, pas de prédiction héroïque.',
    headlines: [
      ['Strike reported near energy hub', 'Oil +4 %', 'Risk-off : yen jump'],
      ['Exchange KYC freeze rumor', 'Hashrate dip régional', 'Stablecoin rails congested'],
    ],
  },
  {
    kind: 'NARRATIVE',
    titles: ['AI coin unwind', 'L2 hype collapse', 'Memecoin rotation'],
    hooks: [
      'Quand le narratif meurt, le multiple meurt plus vite que les cash-flows (il n’y en a pas).',
      'Vous n’êtes pas en retard : le train n’allait nulle part.',
    ],
    assets: ['FETUSDT', 'RNDRUSDT', 'WIFUSDT'],
    trap: 'FOMO sur un rebond de 20 % dans une tendance cassée.',
    discipline: 'Admettre le régime : distribution, pas « buy the dip ».',
    headlines: [
      ['KOL : « last chance before 10x »', 'Volume social +400 %', 'Price -18 % quand même'],
      ['Unlock + airdrop hunters exit', 'TVL -22 % en 48 h', 'Market maker widens spread 90 bps'],
    ],
  },
];

export const BIAS_LABELS: Record<CognitiveBias, string> = {
  FOMO: 'FOMO',
  REVENGE: 'Revenge trading',
  CONFIRMATION: 'Biais de confirmation',
  ANCHORING: 'Ancrage',
  RECENCY: 'Récence',
  OVERCONFIDENCE: 'Surconfiance',
  LOSS_AVERSION: 'Aversion à la perte',
  NARRATIVE: 'Biais narratif',
};

export const BIAS_CASES: {
  title: string;
  context: string[];
  trueBiases: CognitiveBias[];
  sound: string[];
  trap: string[];
  notes: string[];
  tweets: string[];
  news: string[];
  telegram: string[];
}[] = [
  {
    title: 'Le breakout qui « ne peut plus rater »',
    context: [
      'BTC consolide 36 h sous un range. Le volume social explose. Votre dernière perte est encore ouverte mentalement.',
      'ETH a fait +9 % hier. Aujourd’hui le marché est plat, mais votre fil est vert fluo.',
    ],
    trueBiases: ['FOMO', 'RECENCY'],
    sound: [
      'Attendre une clôture + retest, taille 0,5R',
      'Ne rien faire tant que le volume réel (pas social) ne confirme pas',
    ],
    trap: [
      'All-in market au-dessus du range',
      'Doubler parce que « tout le monde est déjà dedans »',
    ],
    notes: [
      'Le FOMO se nourrit du temps ressenti, pas du setup. La récence vous fait croire que hier se répète.',
    ],
    tweets: [
      'Si tu n’es pas long ici tu n’as rien compris au cycle.',
      'Les shorts vont se faire liquider d’une bougie, screenshot this.',
      'Mon cousin a 40x sur un perp, facile.',
    ],
    news: [
      'Un média recycle un article de 2021 « institutions incoming ».',
      'Headline : ETF inflows — en réalité le flux est mixte.',
    ],
    telegram: [
      'VIP : entrée maintenant, TP +80 %, SL secret (il n’y en a pas).',
      'Admin mute ceux qui parlent de risque. 🔥🔥🔥',
    ],
  },
  {
    title: 'Vous voulez récupérer la perte d’hier',
    context: [
      'Vous avez coupé -2R hier sur SOL. Ce matin un alt inconnu pump de 22 %. Vos mains démangent.',
      'Le journal de trade dit « max 1R ». Votre ego dit « je dois finir vert ».',
    ],
    trueBiases: ['REVENGE', 'LOSS_AVERSION'],
    sound: [
      'Journée off ou taille baby, setup A seulement',
      'Écrire la perte comme coût d’information, pas comme dette',
    ],
    trap: [
      'Martingale sur un ticker sans liquidité',
      'Déplacer le stop pour « laisser respirer »',
    ],
    notes: [
      'Revenge trading n’est pas une stratégie : c’est une tentative de réparer une émotion avec un levier.',
    ],
    tweets: [
      'Les weak hands ont vendu le bottom, encore.',
      'Moi je double, le marché me doit bien ça.',
    ],
    news: [
      'Flash : memecoin +40 % — liquidité 90k $.',
      'Un influenceur poste son PnL (sans les 7 pertes).',
    ],
    telegram: [
      'On se refait ce soir, levier 25x, who is in?',
      'Ne ratez pas le rebound, yesterday was the trap.',
    ],
  },
  {
    title: 'Votre thèse favorite est en train de mourir',
    context: [
      'Vous êtes long un L2 depuis 3 semaines. Le prix a perdu la MM50. Vous cherchez uniquement les tweets haussiers.',
      'Un rapport bearish sort. Vous le skipez. Un KOL bullish poste un graphe mal scalé : vous le sauvegardez.',
    ],
    trueBiases: ['CONFIRMATION', 'NARRATIVE', 'ANCHORING'],
    sound: [
      'Invalider : clôture sous le niveau X = sortie 100 %',
      'Chercher l’argument qui tuerait la thèse, pas celui qui la sauve',
    ],
    trap: [
      'Averaging down « au prix de l’ICO »',
      'Ignorer le flux on-chain parce que le whitepaper est joli',
    ],
    notes: [
      'L’ancrage au prix d’entrée n’a aucune valeur informationnelle. Le marché n’a pas vos moyennes.',
    ],
    tweets: [
      'Les haters comprendront dans 6 mois.',
      'C’est exactement comme ETH en 2018 (spoiler : non).',
    ],
    news: [
      'TVL en baisse 3e semaine. Enterré en bas d’article.',
      'Partenariat « AI » sans livrable, titre en majuscules.',
    ],
    telegram: [
      'On accumule, whale wallet (c’est l’équipe).',
      'DCA until we die 💎',
    ],
  },
  {
    title: 'Trois wins, puis l’illusion de maîtrise',
    context: [
      'Vous avez enchaîné 3 trades verts. La taille a déjà doublé « parce que ça marche ».',
      'Le 4e setup est médiocre. Vous le prenez quand même : vous « sentez » le marché.',
    ],
    trueBiases: ['OVERCONFIDENCE', 'RECENCY'],
    sound: [
      'Revenir à la taille de base, 1 trade A-setup',
      'Journal : « win streak = danger de taille »',
    ],
    trap: [
      'Levier 10x sur un range',
      'Skip le stop « je saurai sortir »',
    ],
    notes: [
      'La surconfiance arrive après les gains, pas les pertes. C’est là que les comptes meurent.',
    ],
    tweets: [
      'Trading is easy if you have conviction.',
      'Je vous avais dit 100k, encore trop tôt mais close.',
    ],
    news: [
      'Volatilité implicite en baisse — le marché est calme (piège).',
      'Article « comment j’ai 10x en 48 h » sans drawdown.',
    ],
    telegram: [
      'Signals 98 % winrate (échantillon : 12 tweets).',
      'On scale in, no SL, trust the process.',
    ],
  },
];

export const MENTOR_CASES_BASE: {
  title: string;
  briefs: string[];
  hidden: string[];
  questions: { prompt: string; keys: [string, string[]][] }[];
  strong: string;
  weak: string;
  courseId: string;
}[] = [
  {
    title: 'Position coincée sous un range',
    briefs: [
      'Vous êtes long BTC, entrée 67 400. Le prix stagne 11 h sous 67 850, funding positif, open interest qui monte.',
      'Long ETH 3 420, résistance claire 3 455, volume descendant, votre stop est sous un round number évident.',
    ],
    hidden: [
      'Le marché accumule du carburant pour un squeeze… ou une chasse aux stops. Le funding + OI haussier sans prix = fragile.',
      'Vous n’avez pas un edge, vous avez une opinion. Le stop est trop visible : il sera testé.',
    ],
    questions: [
      {
        prompt: 'Que vous dit le combo prix plat + open interest qui monte ?',
        keys: [
          ['leverage', ['open interest', 'oi', 'levier', 'position', 'carburant', 'squeeze', 'fragile']],
          ['funding', ['funding', 'longs', 'crowded', 'encombr']],
        ],
      },
      {
        prompt: 'Où placeriez-vous l’invalidation, et pourquoi pas pile sous le round number ?',
        keys: [
          ['invalidation', ['inval', 'stop', 'niveau', 'thèse', 'sortie']],
          ['liquidity', ['liquid', 'chasse', 'stop hunt', 'round', 'évident', 'cluster']],
        ],
      },
      {
        prompt: 'Quelle taille de position rend cette attente acceptable si ça casse contre vous ?',
        keys: [
          ['risk', ['risque', 'r multiple', '1r', 'perte', 'taille', 'size', '%', 'capital']],
          ['plan', ['plan', 'si', 'alors', 'scénario', 'hedge']],
        ],
      },
    ],
    strong: 'Vous raisonnez en régime et en invalidation, pas en espoir. C’est exactement le muscle d’un trader IA-assisté : hypothèse, test, kill-switch.',
    weak: 'Vous décrivez le graphe, mais pas le risque. Relisez Gestion des risques : une thèse sans taille et sans invalidation n’est pas une thèse.',
    courseId: 'risk-management',
  },
  {
    title: 'Signal RSI vs structure',
    briefs: [
      'RSI 28 sur un alt, mais les plus bas sont de plus en plus bas et la MM20 est un plafond.',
      'Divergence haussière RSI sur 15m, alors que le 4h casse un support hebdo.',
    ],
    hidden: [
      'Un oscillateur oversold dans une tendance baissière est une invitation à se faire piéger, pas un achat.',
      'La timeframe supérieure gagne toujours. Une divergence 15m ne contre pas une cassure 4h.',
    ],
    questions: [
      {
        prompt: 'Pourquoi « RSI oversold » n’est pas un ordre d’achat ?',
        keys: [
          ['trend', ['tendance', 'structure', 'plus bas', 'baiss', 'mm', 'régime']],
          ['oscillator', ['oscillateur', 'rsi', 'indicateur', 'retard', 'lag']],
        ],
      },
      {
        prompt: 'Comment départager un signal 15m et une structure 4h ?',
        keys: [
          ['htf', ['4h', 'supérieur', 'timeframe', 'htf', 'hebdo', 'priorité']],
          ['confluence', ['confluence', 'align', 'multi', 'confirmation']],
        ],
      },
      {
        prompt: 'Quel serait un plan de short ou de stand-aside ici, pas un espoir de rebond ?',
        keys: [
          ['standaside', ['rien', 'attendre', 'stand', 'pas trader', 'cash']],
          ['shortplan', ['short', 'retest', 'résistance', 'rejet', 'break']],
        ],
      },
    ],
    strong: 'Vous avez mis la structure au-dessus de l’indicateur. C’est la compétence qui sépare l’analyse technique utile du folklore.',
    weak: 'Les indicateurs vous parlent trop fort. Retournez au module Analyse technique : structure d’abord, oscillateurs ensuite.',
    courseId: 'technical-analysis',
  },
  {
    title: 'L’agent IA vous dit d’acheter',
    briefs: [
      'Votre agent interne affiche 0,72 de proba haussière. Le carnet est déséquilibré, le sentiment Twitter est euphorique.',
      'Le modèle XAI met 40 % du poids sur un feature de momentum qui a overfitté 2021.',
    ],
    hidden: [
      'Une proba sans régime ni coût d’erreur n’est pas un ordre. L’euphorie sociale est souvent anti-signal.',
      'Si le modèle est expliqué et qu’un feature instable domine, vous devez réduire la taille, pas obéir.',
    ],
    questions: [
      {
        prompt: 'Que manque-t-il à une « probabilité 72 % » pour devenir une décision ?',
        keys: [
          ['expected', ['esperance', 'edge', 'payoff', 'asymétrie', 'coût', 'erreur']],
          ['size', ['taille', 'kelly', 'fraction', 'risque', 'position']],
        ],
      },
      {
        prompt: 'Comment utiliser l’explicabilité (XAI) pour se méfier du modèle ?',
        keys: [
          ['feature', ['feature', 'poids', 'variable', 'momentum', 'overfit']],
          ['distrust', ['méfi', 'réduire', 'taille', 'override', 'humain']],
        ],
      },
      {
        prompt: 'Sentiment extrême + signal modèle : vous suivez, vous fadez, ou vous attendez ? Pourquoi ?',
        keys: [
          ['crowd', ['foule', 'euphor', 'contrarian', 'fade', 'crowded']],
          ['wait', ['attendre', 'confir', 'régime', 'filtre']],
        ],
      },
    ],
    strong: 'Vous traitez l’IA comme un analyste junior : utile, biaisée, jamais souveraine. C’est le bon contrat.',
    weak: 'Vous êtes tenté d’obéir au score. Le module IA & Trading insiste : le modèle propose, le risque dispose.',
    courseId: 'ai-trading',
  },
];

export const BRIEFING_QUOTES = [
  'Le marché paie la discipline, pas l’intelligence.',
  'Votre edge est un processus. Votre ego est un coût.',
  'Une bonne décision peut perdre. Un bon système survit.',
  'Le FOMO est un spread que vous payez volontairement.',
  'L’IA accélère : le risque, et l’apprentissage — selon qui tient le volant.',
];
