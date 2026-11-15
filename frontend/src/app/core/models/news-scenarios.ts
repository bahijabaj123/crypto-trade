/**
 * Actualités de chaque scénario : ce sont des faits historiques réels, affichés au joueur
 * quand le temps du marché atteint leur date. Sert aussi à mesurer la réaction du joueur.
 */
export type TonNews = 'positif' | 'negatif' | 'neutre';

export interface NewsItem {
  /** Date réelle de l'événement (AAAA-MM-JJ) : la news apparaît quand le marché atteint cette date. */
  date: string;
  categorie: string;
  titre: string;
  detail?: string;
  /** Effet attendu sur les prix : sert à juger si la réaction du joueur est cohérente. */
  ton: TonNews;
}

/** Ordre passé par le joueur (enregistré par GameEngineService). */
export interface OrdreJoueur {
  sens: 'ACHAT' | 'VENTE';
  symbole: string;
  /** Index de la bougie au moment de l'ordre. */
  index: number;
}

export const NEWS: { [scenarioId: string]: NewsItem[] } = {
  'covid-crypto': [
    { date: '2020-03-03', categorie: 'Banque centrale', ton: 'neutre', titre: 'La Fed baisse ses taux en urgence', detail: 'Les marchés restent nerveux.' },
    { date: '2020-03-09', categorie: 'Marchés', ton: 'negatif', titre: 'Guerre des prix du pétrole : les bourses plongent', detail: 'Wall Street suspend les échanges.' },
    { date: '2020-03-11', categorie: 'Santé', ton: 'negatif', titre: 'L\'OMS déclare la pandémie de Covid-19' },
    { date: '2020-03-12', categorie: 'Marchés', ton: 'negatif', titre: '« Jeudi noir » : ventes de panique sur tous les actifs', detail: 'Le Bitcoin est entraîné dans la chute.' },
    { date: '2020-03-15', categorie: 'Banque centrale', ton: 'positif', titre: 'La Fed ramène ses taux proches de zéro', detail: 'Elle relance aussi ses achats d\'actifs.' },
    { date: '2020-03-16', categorie: 'Marchés', ton: 'negatif', titre: 'Le Dow Jones connaît sa pire séance depuis 1987' }
  ],
  'ukraine-2022': [
    { date: '2022-02-21', categorie: 'Géopolitique', ton: 'negatif', titre: 'La Russie reconnaît les républiques séparatistes de Donetsk et Louhansk', detail: 'Les tensions montent.' },
    { date: '2022-02-24', categorie: 'Géopolitique', ton: 'negatif', titre: 'La Russie envahit l\'Ukraine', detail: 'Ventes de panique sur tous les marchés.' },
    { date: '2022-02-26', categorie: 'Sanctions', ton: 'negatif', titre: 'L\'Occident annonce l\'exclusion de banques russes de SWIFT' },
    { date: '2022-02-28', categorie: 'Finance', ton: 'negatif', titre: 'Le rouble s\'effondre', detail: 'La banque centrale russe double son taux directeur à 20 %.' },
    { date: '2022-03-08', categorie: 'Énergie', ton: 'negatif', titre: 'Les États-Unis annoncent un embargo sur le pétrole russe' }
  ],
  'bulle-2017-2018': [
    { date: '2017-12-17', categorie: 'Marché crypto', ton: 'positif', titre: 'Le Bitcoin atteint son record, près de 20 000 $' },
    { date: '2017-12-22', categorie: 'Marché crypto', ton: 'negatif', titre: 'Forte correction : le Bitcoin repasse sous 12 000 $' },
    { date: '2018-01-16', categorie: 'Régulation', ton: 'negatif', titre: 'Rumeurs de régulation en Corée du Sud et en Chine', detail: 'Nouvelle chute des cours.' },
    { date: '2018-02-05', categorie: 'Marchés', ton: 'negatif', titre: 'Les actions chutent aussi : le Bitcoin passe sous 7 000 $' }
  ],
  'chine-2021': [
    { date: '2021-05-12', categorie: 'Entreprises', ton: 'negatif', titre: 'Tesla n\'accepte plus le Bitcoin', detail: 'Elon Musk invoque son impact écologique.' },
    { date: '2021-05-18', categorie: 'Régulation', ton: 'negatif', titre: 'La Chine interdit aux institutions financières les services liés aux cryptomonnaies' },
    { date: '2021-05-19', categorie: 'Marché crypto', ton: 'negatif', titre: 'Journée de panique : le Bitcoin perd plus de 30 % en quelques heures' },
    { date: '2021-05-21', categorie: 'Régulation', ton: 'negatif', titre: 'La Chine annonce vouloir réprimer le minage de Bitcoin' }
  ],
  'luna-2022': [
    { date: '2022-05-07', categorie: 'Marché crypto', ton: 'negatif', titre: 'L\'UST (stablecoin de Terra) commence à perdre sa parité avec le dollar' },
    { date: '2022-05-09', categorie: 'Marché crypto', ton: 'negatif', titre: 'Spirale de ventes : Luna s\'effondre', detail: 'Le marché entier plonge.' },
    { date: '2022-05-12', categorie: 'Marché crypto', ton: 'negatif', titre: 'Luna ne vaut presque plus rien', detail: 'Tether baisse brièvement sous 1 $.' },
    { date: '2022-05-13', categorie: 'Marché crypto', ton: 'negatif', titre: 'Terra suspend sa blockchain' }
  ],
  'ftx-2022': [
    { date: '2022-11-02', categorie: 'Enquête', ton: 'negatif', titre: 'CoinDesk révèle que le bilan d\'Alameda Research repose sur le jeton FTT de FTX' },
    { date: '2022-11-06', categorie: 'Marché crypto', ton: 'negatif', titre: 'Le patron de Binance annonce vendre ses FTT', detail: 'Ruée sur les retraits chez FTX.' },
    { date: '2022-11-08', categorie: 'Marché crypto', ton: 'negatif', titre: 'FTX suspend les retraits', detail: 'Binance renonce à la racheter.' },
    { date: '2022-11-11', categorie: 'Marché crypto', ton: 'negatif', titre: 'FTX se déclare en faillite' }
  ]
};

export interface ReactionNews {
  news: NewsItem;
  /** Premier ordre passé après cette news (dans la fenêtre), sinon null. */
  ordre: OrdreJoueur | null;
  /** Délai de réaction en secondes réelles. */
  delaiSec: number | null;
  /** true = ordre dans le sens attendu (achat après bonne news, vente après mauvaise) ; null = news neutre ou pas de réaction. */
  coherent: boolean | null;
}

/**
 * Pour chaque news déjà apparue, regarde si le joueur a réagi (ordre dans les `fenetreSec` secondes
 * réelles qui suivent). Un ordre n'est rattaché qu'à la dernière news apparue avant lui.
 */
export function analyserReactions(
  news: NewsItem[],
  candles: { time: number }[],
  ordres: OrdreJoueur[],
  bougiesParSeconde: number,
  indexActuel: number,
  fenetreSec = 30
): ReactionNews[] {
  if (candles.length === 0 || bougiesParSeconde <= 0) return [];
  const apparues = news
    .map(n => ({ n, idx: candles.findIndex(c => c.time >= new Date(n.date).getTime()) }))
    .filter(x => x.idx >= 0 && x.idx <= indexActuel)
    .sort((a, b) => a.idx - b.idx);

  const resultats: ReactionNews[] = apparues.map(x => ({ news: x.n, ordre: null, delaiSec: null, coherent: null }));

  for (const o of ordres) {
    let k = -1;
    for (let i = 0; i < apparues.length; i++) if (apparues[i].idx <= o.index) k = i;
    if (k < 0 || resultats[k].ordre) continue;
    const delai = (o.index - apparues[k].idx) / bougiesParSeconde;
    if (delai > fenetreSec) continue;
    const ton = apparues[k].n.ton;
    resultats[k] = {
      news: apparues[k].n,
      ordre: o,
      delaiSec: Math.round(delai),
      coherent: ton === 'neutre' ? null : (ton === 'positif') === (o.sens === 'ACHAT')
    };
  }
  return resultats;
}