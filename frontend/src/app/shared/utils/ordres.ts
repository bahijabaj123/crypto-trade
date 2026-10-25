import { OrdreVue, StatutOrdre, TypeOrdre } from '../models/crypto.models';

/** Petits utilitaires d'affichage des ordres, partagés par les pages Trading, Carnet d'ordres et Stop-loss. */

export const LIBELLE_TYPE: Record<TypeOrdre, string> = {
  MARKET: 'Au marché',
  LIMIT: 'Limite',
  STOP_LOSS: 'Stop-loss',
  TAKE_PROFIT: 'Take-profit',
};

export const LIBELLE_STATUT: Record<StatutOrdre, string> = {
  EXECUTE: 'Exécuté',
  EN_ATTENTE: 'En attente',
  ANNULE: 'Annulé',
  REJETE: 'Rejeté',
};

export type CouleurBadge = 'success' | 'warning' | 'error' | 'light';

export function couleurStatut(statut: StatutOrdre): CouleurBadge {
  switch (statut) {
    case 'EXECUTE':
      return 'success';
    case 'EN_ATTENTE':
      return 'warning';
    case 'REJETE':
      return 'error';
    default:
      return 'light';
  }
}

/** Phrase qui décrit la condition de déclenchement, ex. « prix ≤ 45 000 ». */
export function conditionOrdre(o: OrdreVue): string {
  if (o.prixDeclenchement === null) return 'Prix du marché';
  const bas = o.type === 'STOP_LOSS' || (o.type === 'LIMIT' && o.sens === 'ACHAT');
  return `${bas ? '≤' : '≥'} ${o.prixDeclenchement.toLocaleString('fr-FR', { maximumFractionDigits: 8 })}`;
}
