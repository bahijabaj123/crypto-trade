import { Injectable } from '@angular/core';

export interface TermeGlossaire {
  titre: string;
  definition: string;
  exemple?: string;
  cours?: { titre: string; route: string }; // lien vers un cours Linda
}

@Injectable({ providedIn: 'root' })
export class GlossaireService {
  private readonly termes: Record<string, TermeGlossaire> = {
    'prime': {
      titre: 'Prime d\'assurance',
      definition: 'Montant payé par l\'assuré pour être couvert. Elle couvre le sinistre attendu + les frais + la marge de l\'assureur.',
      exemple: 'Prime = Coût attendu × 1,2 (20 % de chargement).',
      cours: { titre: 'Bases de l\'assurance', route: '/learning' }
    },
    'provision': {
      titre: 'Provisionnement',
      definition: 'Argent mis de côté par l\'assureur pour payer les sinistres futurs (déjà survenus mais pas encore réglés).',
      exemple: 'Provision = Ultime estimé − Déjà payé.',
      cours: { titre: 'Provisionnement', route: '/learning' }
    },
    'triangle': {
      titre: 'Triangle de développement',
      definition: 'Tableau qui montre comment les sinistres d\'une année évoluent au fil des années de développement.',
      exemple: 'Ligne = année de survenance, colonne = année de développement.',
      cours: { titre: 'Triangle de développement', route: '/learning' }
    },
    'chain-ladder': {
      titre: 'Chain-Ladder',
      definition: 'Méthode qui calcule des facteurs de développement historiques pour projeter les sinistres futurs.',
      exemple: 'F[j] = Σ sinistres[j+1] / Σ sinistres[j].',
      cours: { titre: 'Chain-Ladder', route: '/learning' }
    },
    'facteur': {
      titre: 'Facteur de développement',
      definition: 'Ratio entre deux colonnes consécutives du triangle. Il indique de combien les sinistres augmentent d\'une année à l\'autre.',
      cours: { titre: 'Facteurs de développement', route: '/learning' }
    },
    'ultime': {
      titre: 'Ultime',
      definition: 'Coût total final d\'un sinistre, une fois tous les paiements effectués.',
      exemple: 'Ultime = Dernière valeur observée × CDF.',
      cours: { titre: 'Estimation de l\'ultime', route: '/learning' }
    },
    'ibnr': {
      titre: 'IBNR',
      definition: 'Incurred But Not Reported : sinistres survenus mais pas encore déclarés à l\'assureur.',
      exemple: 'Provision IBNR = provision pour ces sinistres "invisibles".',
      cours: { titre: 'IBNR', route: '/learning' }
    },
    'bornhuetter-ferguson': {
      titre: 'Bornhuetter-Ferguson',
      definition: 'Méthode de provisionnement qui combine l\'historique observé et le ratio S/P a priori (primes attendues).',
      exemple: 'Ultime = Payé + (Prime × S/P) × (1 − 1/CDF).',
      cours: { titre: 'Bornhuetter-Ferguson', route: '/learning' }
    },
    'ratio-sp': {
      titre: 'Ratio S/P',
      definition: 'Sinistres / Primes. Si < 100 %, l\'assurance est rentable. Si > 100 %, elle est déficitaire.',
      cours: { titre: 'Ratio S/P', route: '/learning' }
    },
    'erreur-mack': {
      titre: 'Erreur-type de Mack',
      definition: 'Mesure l\'incertitude de l\'estimation Chain-Ladder. Plus elle est grande, plus la provision est risquée.',
      cours: { titre: 'Méthode de Mack', route: '/learning' }
    },
    'provision-prudente': {
      titre: 'Provision prudente',
      definition: 'Provision centrale + marge de sécurité (z × erreur-type). z dépend du niveau de confiance (ex : 1,645 pour 95 %).',
      cours: { titre: 'Provisions prudentes', route: '/learning' }
    },
    'ratio-combine': {
      titre: 'Ratio combiné',
      definition: 'Sinistres + Frais de gestion, divisé par les primes. C\'est le vrai indicateur de rentabilité de l\'assureur.',
      exemple: '< 100 % : bénéfice. > 100 % : perte.',
      cours: { titre: 'Ratio combiné', route: '/learning' }
    },
    'solvabilite': {
      titre: 'Solvabilité',
      definition: 'Capacité de l\'assureur à honorer ses engagements. Ratio = Capital disponible / Capital requis.',
      exemple: '< 100 % : ruine. > 150 % : confortable.',
      cours: { titre: 'Solvabilité II', route: '/learning' }
    },
    'reassurance': {
      titre: 'Réassurance',
      definition: 'L\'assureur cède une part de ses primes et de ses sinistres à un réassureur. Ça le protège mais coûte cher.',
      exemple: 'Céder 30 % des primes contre 25 % de commission.',
      cours: { titre: 'Réassurance', route: '/learning' }
    },
    'ruine': {
      titre: 'Ruine',
      definition: 'Situation où le capital de l\'assureur devient négatif. La partie s\'arrête.',
      cours: { titre: 'Théorie de la ruine', route: '/learning' }
    },
    'placements': {
      titre: 'Placements',
      definition: 'L\'assureur place son capital sur les marchés financiers pour générer un rendement.',
      cours: { titre: 'Gestion actif-passif', route: '/learning' }
    },
    'evenement-majeur': {
      titre: 'Événement majeur',
      definition: 'Catastrophe rare (krach, pandémie) qui multiplie les sinistres. Environ 1 fois tous les 8 ans.',
      cours: { titre: 'Événements extrêmes', route: '/learning' }
    },
    'niveau-prime': {
      titre: 'Niveau de prime',
      definition: 'Prix que tu fixes par rapport au marché. 100 % = prix du marché. 130 % = 30 % plus cher (moins de clients).',
      cours: { titre: 'Tarification', route: '/learning' }
    },
    'volatilite': {
      titre: 'Volatilité',
      definition: 'Amplitude des variations d\'un actif. Plus elle est élevée, plus le risque est grand.',
      cours: { titre: 'Volatilité', route: '/learning' }
    }
  };

  get(cle: string): TermeGlossaire | null {
    return this.termes[cle] ?? null;
  }
}