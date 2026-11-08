import { Course, Lesson, Quiz } from '../models/formation.models';

export interface LessonWithResource extends Lesson {
  ressource?: { label: string; url: string };
}

export const ACTUARIAT_COURSES: Omit<Course, 'progress'>[] = [
  {
    id: 'actuariat-tarification',
    title: 'Tarification et Prime d\'Assurance',
    category: 'Actuariat',
    description: 'Apprenez à calculer une prime d\'assurance en fonction du risque. Découvrez la marge de prime et le ratio S/P.',
    level: 'INTERMEDIATE',
    levelLabel: 'Intermédiaire',
    lessonsCount: 3,
    durationMinutes: 45,
    xpReward: 150,
    topics: ['Prime', 'Marge', 'Ratio S/P'],
    iconKey: 'risk',
  },
  {
    id: 'actuariat-provisionnement',
    title: 'Provisionnement : Chain-Ladder & Bornhuetter-Ferguson',
    category: 'Actuariat',
    description: 'Maîtrisez les méthodes de provisionnement des sinistres. Calculez l\'ultime, l\'IBNR et la provision totale.',
    level: 'ADVANCED',
    levelLabel: 'Avancé',
    lessonsCount: 3,
    durationMinutes: 60,
    xpReward: 200,
    topics: ['Triangle', 'Chain-Ladder', 'Bornhuetter-Ferguson', 'IBNR'],
    iconKey: 'advanced',
  },
  {
    id: 'actuariat-parametrique',
    title: 'Assurance Paramétrique',
    category: 'Actuariat',
    description: 'Découvrez l\'assurance paramétrique, le mouvement brownien géométrique et la couverture des risques extrêmes.',
    level: 'ADVANCED',
    levelLabel: 'Avancé',
    lessonsCount: 3,
    durationMinutes: 50,
    xpReward: 180,
    topics: ['Assurance Paramétrique', 'Black-Scholes', 'Risques Extrêmes'],
    iconKey: 'advanced',
  },
  {
    id: 'actuariat-mode-assureur',
    title: 'Gestion d\'une Compagnie d\'Assurance',
    category: 'Actuariat',
    description: 'Devenez assureur : fixez vos primes, choisissez votre réassurance et évitez la ruine.',
    level: 'INTERMEDIATE',
    levelLabel: 'Intermédiaire',
    lessonsCount: 2,
    durationMinutes: 30,
    xpReward: 120,
    topics: ['Réassurance', 'Solvabilité', 'Ratio Combiné', 'Ruine'],
    iconKey: 'trading',
  }
];

export const ACTUARIAT_LESSONS: LessonWithResource[] = [
  // --- Tarification ---
  {
    id: 'actuariat-tarification-l1',
    courseId: 'actuariat-tarification',
    order: 1,
    title: 'Comprendre la Prime d\'Assurance',
    durationMinutes: 15,
    objective: 'Comprendre comment on passe du risque à la prime.',
    sections: [
      { title: 'Le principe de base', body: 'La prime d\'assurance est le prix que paie l\'assuré pour transférer son risque à l\'assureur. En actuarial, on dit que la prime doit être "équitable" : elle doit refléter le coût attendu du risque.' },
      { title: 'Les composantes', body: 'Prime = Coût attendu (Sinistre moyen × Probabilité) + Chargements. Les chargements couvrent les frais de gestion, les commissions des apporteurs d\'affaires et la marge de sécurité de l\'assureur.' },
      { title: 'Exemple concret', body: 'Si un trader a 10% de chance de perdre 10 000€, le coût attendu est de 1 000€. Avec 30% de chargements, la prime sera de 1 300€.' }
    ],
    takeaways: ['La prime couvre le risque', 'Elle inclut des chargements (frais + marge)'],
    knowledgeCheck: {
      question: 'Que couvre la prime d\'assurance ?',
      options: ['Uniquement les sinistres', 'Les sinistres + frais + marge', 'Uniquement les frais', 'Rien du tout'],
      correctIndex: 1,
      explanation: 'La prime doit couvrir le sinistre attendu, les frais de gestion et la marge de l\'assureur.'
    },
    ressource: { label: 'Open Actuarial Textbooks - Loss Data Analytics', url: 'https://openacttexts.github.io/Loss-Data-Analytics/ChapIntroduction.html' }
  },
  {
    id: 'actuariat-tarification-l2',
    courseId: 'actuariat-tarification',
    order: 2,
    title: 'Marge de Prime et Ratio S/P',
    durationMinutes: 15,
    objective: 'Savoir si une assurance est rentable.',
    sections: [
      { title: 'Marge de prime', body: 'Marge = Prime - Sinistre attendu. Si cette marge est positive, l\'assurance est rentable. C\'est le "profit technique" de l\'assureur.' },
      { title: 'Ratio S/P', body: 'Le ratio Sinistres/Primes (Loss Ratio en anglais) est l\'indicateur clé. S/P = Sinistres / Primes. Si < 100%, l\'assureur gagne de l\'argent sur la couverture du risque. Si > 100%, il en perd.' },
      { title: 'Lien avec la faillite', body: 'Un ratio S/P durablement supérieur à 100% signifie que l\'assureur paie plus qu\'il ne reçoit. À terme, il fera faillite s\'il ne remonte pas ses primes.' }
    ],
    takeaways: ['Marge = Prime - Provision', 'Ratio S/P < 100% = rentable'],
    knowledgeCheck: {
      question: 'Un ratio S/P de 80% signifie que :',
      options: ['L\'assurance est déficitaire', 'L\'assurance est rentable', 'Il n\'y a pas de sinistre', 'Le client a payé trop cher'],
      correctIndex: 1,
      explanation: 'Si S/P < 100%, les primes couvrent les sinistres, donc l\'assurance est rentable.'
    }
  },
  {
    id: 'actuariat-tarification-l3',
    courseId: 'actuariat-tarification',
    order: 3,
    title: 'Le Bonus/Malus Comportemental',
    durationMinutes: 15,
    objective: 'Adapter la prime au comportement du trader.',
    sections: [
      { title: 'Le principe de la télématique', body: 'Comme les boîtiers dans les voitures qui surveillent la conduite, on ajuste la prime selon le comportement du trader. Un trader discipliné est moins risqué.' },
      { title: 'Le calcul du multiplicateur', body: 'Multiplicateur = 1 + Malus (concentration) - Bonus (formation). Exemple : 10% de malus et 15% de bonus donnent un multiplicateur de 0,95. La prime est donc réduite de 5%.' }
    ],
    takeaways: ['La formation réduit la prime', 'La concentration augmente la prime'],
    knowledgeCheck: {
      question: 'Un trader qui suit des cours de gestion des risques aura :',
      options: ['Une prime plus élevée', 'Une prime plus basse', 'La même prime', 'Pas d\'assurance'],
      correctIndex: 1,
      explanation: 'La formation est un bonus : elle réduit la prime car le trader est considéré comme moins risqué.'
    }
  },

  // --- Provisionnement ---
  {
    id: 'actuariat-provisionnement-l1',
    courseId: 'actuariat-provisionnement',
    order: 1,
    title: 'Le Triangle de Développement',
    durationMinutes: 20,
    objective: 'Comprendre comment les sinistres évoluent dans le temps.',
    sections: [
      { title: 'Pourquoi un triangle ?', body: 'En assurance Non-Vie (IARD), un sinistre survenu en 2024 peut être payé sur plusieurs années (expertise, procédure judiciaire). Le triangle de développement permet de visualiser les paiements cumulés par année de survenance et par année de développement.' },
      { title: 'Structure des données', body: 'Les lignes représentent l\'année de survenance (ex: 2020). Les colonnes représentent le délai de développement (ex: 0 = année du sinistre, 1 = un an après, etc.). La diagonale inférieure contient les paiements déjà effectués ; le reste est à projeter.' },
      { title: 'L\'objectif final', body: 'Le but est d\'estimer l\'"Ultime" : le coût total final du sinistre. La différence entre l\'Ultime et ce qui a déjà été payé s\'appelle la Provision pour Sinistres à Payer (PSAP).' }
    ],
    takeaways: ['Lignes = survenance, Colonnes = développement', 'Le triangle montre les paiements cumulés'],
    knowledgeCheck: {
      question: 'Dans un triangle de développement, que représentent les colonnes ?',
      options: ['Les années de survenance', 'Les années de développement', 'Les sinistres', 'Les primes'],
      correctIndex: 1,
      explanation: 'Les colonnes représentent le temps écoulé depuis la survenance.'
    }
  },
  {
    id: 'actuariat-provisionnement-l2',
    courseId: 'actuariat-provisionnement',
    order: 2,
    title: 'Chain-Ladder : les Facteurs de Développement',
    durationMinutes: 20,
    objective: 'Calculer les facteurs et projeter l\'ultime.',
    sections: [
      { title: 'Le principe des facteurs', body: 'Le Chain-Ladder suppose que le ratio de développement entre deux colonnes est stable dans le temps. On calcule un facteur moyen pondéré F(j) pour chaque colonne j : F(j) = (Somme des sinistres de la colonne j+1) / (Somme des sinistres de la colonne j).' },
      { title: 'Projection vers l\'Ultime', body: 'Une fois les facteurs calculés, on les multiplie entre eux pour obtenir le CDF (Cumulative Development Factor). L\'Ultime est obtenu en multipliant la dernière valeur observée par le CDF correspondant.' },
      { title: 'Limites de la méthode', body: 'Le Chain-Ladder est simple mais sensible aux valeurs extrêmes. Il fonctionne bien quand le portefeuille est stable. Si les sinistres récents sont très différents des anciens, il faut utiliser des méthodes plus robustes.' }
    ],
    takeaways: ['F[j] = ratio entre colonnes', 'Ultime = Dernière valeur × CDF'],
    knowledgeCheck: {
      question: 'Le CDF permet de :',
      options: ['Calculer la prime', 'Projeter la valeur observée à l\'ultime', 'Calculer le ratio S/P', 'Réduire la prime'],
      correctIndex: 1,
      explanation: 'Le CDF multiplie la dernière valeur observée pour estimer l\'ultime.'
    },
    ressource: { label: 'Livre : Loss Reserving (Open Actuarial Textbooks)', url: 'https://openacttexts.github.io/Loss-Data-Analytics/ChapLossReserves.html' }
  },
  {
    id: 'actuariat-provisionnement-l3',
    courseId: 'actuariat-provisionnement',
    order: 3,
    title: 'Bornhuetter-Ferguson et IBNR',
    durationMinutes: 20,
    objective: 'Combiner historique et primes attendues.',
    sections: [
      { title: 'Pourquoi BF ?', body: 'Si une année est récente, on a très peu de données. Le Chain-Ladder va donner une estimation instable. Bornhuetter-Ferguson (BF) combine le "déjà payé" avec une estimation a priori basée sur les primes et le ratio S/P attendu.' },
      { title: 'La formule BF', body: 'Ultime = Payé + (Prime × S/P a priori) × (1 - 1/CDF). On ajoute au déjà payé une fraction de l\'ultime attendu. Plus on est proche de la fin du développement, plus le terme correctif devient petit.' },
      { title: 'IBNR', body: 'IBNR (Incurred But Not Reported) désigne les sinistres survenus mais pas encore déclarés. C\'est une composante clé de la provision. Le triangle permet de l\'estimer indirectement.' }
    ],
    takeaways: ['BF combine historique et primes', 'IBNR = sinistres non déclarés'],
    knowledgeCheck: {
      question: 'Que signifie IBNR ?',
      options: ['Incurred But Not Reported', 'Insurance Basic Normal Reserve', 'International Bank Note Rate', 'Incurred Business Net Result'],
      correctIndex: 0,
      explanation: 'IBNR signifie "Incurred But Not Reported" : sinistres survenus mais pas encore déclarés.'
    },
    // 👇 AJOUTÉ ICI POUR QUE LE BOUTON S'AFFICHE SUR CETTE LEÇON
    ressource: { label: 'Livre : Loss Reserving (Open Actuarial Textbooks)', url: 'https://openacttexts.github.io/Loss-Data-Analytics/ChapLossReserves.html' }
  },

  // --- Paramétrique ---
  {
    id: 'actuariat-parametrique-l1',
    courseId: 'actuariat-parametrique',
    order: 1,
    title: 'Le Principe de l\'Assurance Paramétrique',
    durationMinutes: 15,
    objective: 'Comprendre le déclenchement automatique.',
    sections: [
      { title: 'Définition', body: 'L\'assurance paramétrique paie automatiquement si un indicateur objectif dépasse un seuil. Pas besoin de constat de sinistre, ce qui réduit les coûts de gestion et accélère l\'indemnisation.' },
      { title: 'Exemple concret', body: 'Si le BTC perd 30% en 7 jours, le paiement se déclenche automatiquement. On ne vérifie pas si le trader a vraiment perdu de l\'argent, on regarde juste l\'indicateur.' }
    ],
    takeaways: ['Déclenchement automatique', 'Basé sur un indicateur objectif'],
    knowledgeCheck: {
      question: 'L\'assurance paramétrique nécessite-t-elle un constat de sinistre ?',
      options: ['Oui, toujours', 'Non, le déclenchement est automatique', 'Seulement pour les gros sinistres', 'Cela dépend du contrat'],
      correctIndex: 1,
      explanation: 'L\'assurance paramétrique se déclenche automatiquement dès que le seuil est atteint.'
    },
    ressource: { label: 'Article : Assurance Paramétrique', url: 'https://fr.wikipedia.org/wiki/Assurance_param%C3%A9trique' }
  },
  {
    id: 'actuariat-parametrique-l2',
    courseId: 'actuariat-parametrique',
    order: 2,
    title: 'Calcul de la Probabilité (Black-Scholes)',
    durationMinutes: 20,
    objective: 'Estimer la probabilité de déclenchement.',
    sections: [
      { title: 'Mouvement brownien', body: 'On modélise le prix avec un mouvement brownien géométrique (modèle de Black-Scholes). C\'est le standard en finance pour modéliser les prix des actifs.' },
      { title: 'Formule', body: 'P(déclenchement) = 2 × Φ(-ln(1 - X) / (σ√t)). X est le seuil, σ la volatilité, t la durée. Φ est la fonction de répartition de la loi normale.' }
    ],
    takeaways: ['Modèle de Black-Scholes adapté', 'La probabilité dépend de la volatilité et de la durée'],
    knowledgeCheck: {
      question: 'Dans la formule de probabilité, que représente σ ?',
      options: ['Le seuil de baisse', 'La volatilité', 'La durée', 'Le montant garanti'],
      correctIndex: 1,
      explanation: 'σ (sigma) représente la volatilité de l\'actif.'
    }
  },
  {
    id: 'actuariat-parametrique-l3',
    courseId: 'actuariat-parametrique',
    order: 3,
    title: 'Monte-Carlo et Crédibilité',
    durationMinutes: 15,
    objective: 'Simuler des scénarios pour affiner la prime.',
    sections: [
      { title: 'Monte-Carlo', body: 'On simule des milliers de trajectoires de prix pour estimer la probabilité de déclenchement. C\'est une méthode numérique très puissante.' },
      { title: 'Crédibilité', body: 'On combine l\'estimation historique et l\'estimation Monte-Carlo pour obtenir une prime plus fiable. La crédibilité est une technique actuarielle standard.' }
    ],
    takeaways: ['Monte-Carlo simule des trajectoires', 'La crédibilité combine historique et simulation'],
    knowledgeCheck: {
      question: 'À quoi sert la simulation Monte-Carlo ?',
      options: ['À calculer la prime exacte', 'À simuler des trajectoires de prix', 'À remplacer le triangle', 'À calculer le ratio S/P'],
      correctIndex: 1,
      explanation: 'Monte-Carlo simule de nombreuses trajectoires pour estimer la probabilité de déclenchement.'
    }
  },

  // --- Mode Assureur ---
  {
    id: 'actuariat-mode-assureur-l1',
    courseId: 'actuariat-mode-assureur',
    order: 1,
    title: 'Réassurance et Ratio Combiné',
    durationMinutes: 15,
    objective: 'Comprendre comment un assureur se protège.',
    sections: [
      { title: 'Réassurance', body: 'L\'assureur cède une part de ses primes et de ses sinistres à un réassureur. Ça le protège mais coûte cher (commission de réassurance).' },
      { title: 'Ratio combiné', body: 'Ratio = (Sinistres + Frais) / Primes. Si < 100%, l\'assureur est rentable. C\'est l\'indicateur le plus utilisé en assurance.' }
    ],
    takeaways: ['La réassurance protège mais coûte', 'Ratio combiné < 100% = rentable'],
    knowledgeCheck: {
      question: 'Que se passe-t-il si l\'assureur cède 30% de ses primes au réassureur ?',
      options: ['Il gagne 30% de plus', 'Il cède aussi 30% de ses sinistres', 'Il ne paie plus de sinistres', 'Il doit fermer'],
      correctIndex: 1,
      explanation: 'En cédant une part des primes, l\'assureur cède aussi la même part des sinistres au réassureur.'
    }
  },
  {
    id: 'actuariat-mode-assureur-l2',
    courseId: 'actuariat-mode-assureur',
    order: 2,
    title: 'Solvabilité et Ruine',
    durationMinutes: 15,
    objective: 'Savoir quand un assureur fait faillite.',
    sections: [
      { title: 'Solvabilité', body: 'Ratio = Capital disponible / Capital requis. Si < 100%, l\'assureur est en danger. La réglementation (Solvency II) impose un ratio minimum.' },
      { title: 'Ruine', body: 'Si le capital devient négatif, l\'assureur fait faillite. C\'est le modèle de Cramér-Lundberg, le modèle classique de ruine en assurance.' }
    ],
    takeaways: ['Solvabilité < 100% = danger', 'Ruine = capital négatif'],
    knowledgeCheck: {
      question: 'Que se passe-t-il si le capital de l\'assureur devient négatif ?',
      options: ['Il gagne de l\'argent', 'Il est en ruine', 'Il augmente ses primes', 'Rien du tout'],
      correctIndex: 1,
      explanation: 'Un capital négatif signifie que l\'assureur ne peut plus payer ses engagements : c\'est la ruine.'
    }
  }
];

export const ACTUARIAT_QUIZZES: Quiz[] = [
  {
    id: 'quiz-tarification',
    courseId: 'actuariat-tarification',
    title: 'Quiz Tarification',
    moduleTitle: 'Tarification et Prime',
    questionCount: 3,
    durationMinutes: 5,
    difficulty: 'INTERMEDIATE',
    difficultyLabel: 'Intermédiaire',
    passingScore: 70,
    xpReward: 100,
    questions: [
      {
        id: 'q1',
        question: 'Que couvre la prime d\'assurance ?',
        options: ['Uniquement les sinistres', 'Les sinistres + frais + marge', 'Uniquement les frais', 'Rien'],
        correctIndex: 1,
        explanation: 'La prime doit tout couvrir.'
      },
      {
        id: 'q2',
        question: 'Un ratio S/P de 80% signifie que :',
        options: ['L\'assurance est déficitaire', 'L\'assurance est rentable', 'Il n\'y a pas de sinistre', 'Le client a payé trop cher'],
        correctIndex: 1,
        explanation: 'Moins de 100%, donc rentable.'
      },
      {
        id: 'q3',
        question: 'Le Bonus/Malus est basé sur :',
        options: ['L\'âge du trader', 'Le comportement du trader', 'Le marché', 'La chance'],
        correctIndex: 1,
        explanation: 'On récompense le bon comportement.'
      }
    ]
  }
];