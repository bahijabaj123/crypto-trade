import { Injectable } from '@angular/core';

export interface TermeGlossaire {
  titre: string;
  definition: string;
  exemple?: string;
  cours?: { titre: string; route: string }; 
}

@Injectable({ providedIn: 'root' })
export class GlossaireService {
  private readonly termes: Record<string, TermeGlossaire> = {
    'prime': {
      titre: 'Prime d\'assurance',
      definition: 'Montant payé par l\'assuré pour être couvert. Elle couvre le sinistre attendu + les frais + la marge de l\'assureur.',
      exemple: 'Prime = Coût attendu × 1,2 (20 % de chargement).',
      cours: { titre: 'Tarification et Prime', route: '/learning/course/actuariat-tarification/lesson/actuariat-tarification-l1' }
    },
    'provision': {
      titre: 'Provisionnement',
      definition: 'Argent mis de côté par l\'assureur pour payer les sinistres futurs (déjà survenus mais pas encore réglés).',
      exemple: 'Provision = Ultime estimé − Déjà payé.',
      cours: { titre: 'Le Triangle de Développement', route: '/learning/course/actuariat-provisionnement/lesson/actuariat-provisionnement-l1' }
    },
    'triangle': {
      titre: 'Triangle de développement',
      definition: 'Tableau qui montre comment les sinistres d\'une année évoluent au fil des années de développement.',
      exemple: 'Ligne = année de survenance, colonne = année de développement.',
      cours: { titre: 'Le Triangle de Développement', route: '/learning/course/actuariat-provisionnement/lesson/actuariat-provisionnement-l1' }
    },
    'chain-ladder': {
      titre: 'Chain-Ladder',
      definition: 'Méthode qui calcule des facteurs de développement historiques pour projeter les sinistres futurs.',
      exemple: 'F[j] = Σ sinistres[j+1] / Σ sinistres[j].',
      cours: { titre: 'Les Facteurs de Développement', route: '/learning/course/actuariat-provisionnement/lesson/actuariat-provisionnement-l2' }
    },
    'facteur': {
      titre: 'Facteur de développement',
      definition: 'Ratio entre deux colonnes consécutives du triangle. Il indique de combien les sinistres augmentent d\'une année à l\'autre.',
      cours: { titre: 'Les Facteurs de Développement', route: '/learning/course/actuariat-provisionnement/lesson/actuariat-provisionnement-l2' }
    },
    'ultime': {
      titre: 'Ultime',
      definition: 'Coût total final d\'un sinistre, une fois tous les paiements effectués.',
      exemple: 'Ultime = Dernière valeur observée × CDF.',
      cours: { titre: 'Chain-Ladder : les Facteurs', route: '/learning/course/actuariat-provisionnement/lesson/actuariat-provisionnement-l2' }
    },
    'ibnr': {
      titre: 'IBNR',
      definition: 'Incurred But Not Reported : sinistres survenus mais pas encore déclarés à l\'assureur.',
      exemple: 'Provision IBNR = provision pour ces sinistres "invisibles".',
      cours: { titre: 'Bornhuetter-Ferguson et IBNR', route: '/learning/course/actuariat-provisionnement/lesson/actuariat-provisionnement-l3' }
    },
    'bornhuetter-ferguson': {
      titre: 'Bornhuetter-Ferguson',
      definition: 'Méthode de provisionnement qui combine l\'historique observé et le ratio S/P a priori (primes attendues).',
      exemple: 'Ultime = Payé + (Prime × S/P) × (1 − 1/CDF).',
      cours: { titre: 'Bornhuetter-Ferguson et IBNR', route: '/learning/course/actuariat-provisionnement/lesson/actuariat-provisionnement-l3' }
    },
    'ratio-sp': {
      titre: 'Ratio S/P',
      definition: 'Sinistres / Primes. Si < 100 %, l\'assurance est rentable. Si > 100 %, elle est déficitaire.',
      cours: { titre: 'Marge de Prime et Ratio S/P', route: '/learning/course/actuariat-tarification/lesson/actuariat-tarification-l2' }
    },
    'erreur-mack': {
      titre: 'Erreur-type de Mack',
      definition: 'Mesure l\'incertitude de l\'estimation Chain-Ladder. Plus elle est grande, plus la provision est risquée.',
      cours: { titre: 'Chain-Ladder', route: '/learning/course/actuariat-provisionnement/lesson/actuariat-provisionnement-l2' }
    },
    'provision-prudente': {
      titre: 'Provision prudente',
      definition: 'Provision centrale + marge de sécurité (z × erreur-type). z dépend du niveau de confiance.',
      cours: { titre: 'Provisionnement', route: '/learning/course/actuariat-provisionnement/lesson/actuariat-provisionnement-l1' }
    },
    'ratio-combine': {
      titre: 'Ratio combiné',
      definition: 'Sinistres + Frais de gestion, divisé par les primes. C\'est le vrai indicateur de rentabilité de l\'assureur.',
      exemple: '< 100 % : bénéfice. > 100 % : perte.',
      cours: { titre: 'Réassurance et Ratio Combiné', route: '/learning/course/actuariat-mode-assureur/lesson/actuariat-mode-assureur-l1' }
    },
    'solvabilite': {
      titre: 'Solvabilité',
      definition: 'Capacité de l\'assureur à honorer ses engagements. Ratio = Capital disponible / Capital requis.',
      exemple: '< 100 % : ruine. > 150 % : confortable.',
      cours: { titre: 'Solvabilité et Ruine', route: '/learning/course/actuariat-mode-assureur/lesson/actuariat-mode-assureur-l2' }
    },
    'reassurance': {
      titre: 'Réassurance',
      definition: 'L\'assureur cède une part de ses primes et de ses sinistres à un réassureur. Ça le protège mais coûte cher.',
      exemple: 'Céder 30 % des primes contre une commission.',
      cours: { titre: 'Réassurance et Ratio Combiné', route: '/learning/course/actuariat-mode-assureur/lesson/actuariat-mode-assureur-l1' }
    },
    'ruine': {
      titre: 'Ruine',
      definition: 'Situation où le capital de l\'assureur devient négatif. La partie s\'arrête.',
      cours: { titre: 'Solvabilité et Ruine', route: '/learning/course/actuariat-mode-assureur/lesson/actuariat-mode-assureur-l2' }
    },
    'placements': {
      titre: 'Placements',
      definition: 'L\'assureur place son capital sur les marchés financiers pour générer un rendement.',
      cours: { titre: 'Gestion d\'une Compagnie', route: '/learning/course/actuariat-mode-assureur/lesson/actuariat-mode-assureur-l1' }
    },
    'evenement-majeur': {
      titre: 'Événement majeur',
      definition: 'Catastrophe rare (krach, pandémie) qui multiplie les sinistres. Environ 1 fois tous les 8 ans.',
      cours: { titre: 'Tarification', route: '/learning/course/actuariat-tarification/lesson/actuariat-tarification-l1' }
    },
    'niveau-prime': {
      titre: 'Niveau de prime',
      definition: 'Prix que tu fixes par rapport au marché. 100 % = prix du marché. 130 % = 30 % plus cher.',
      cours: { titre: 'Tarification', route: '/learning/course/actuariat-tarification/lesson/actuariat-tarification-l1' }
    },
    'volatilite': {
      titre: 'Volatilité',
      definition: 'Amplitude des variations d\'un actif. Plus elle est élevée, plus le risque est grand.',
      cours: { titre: 'Tarification', route: '/learning/course/actuariat-tarification/lesson/actuariat-tarification-l1' }
    }
  };

  get(cle: string): TermeGlossaire | null {
    return this.termes[cle] ?? null;
  }
}