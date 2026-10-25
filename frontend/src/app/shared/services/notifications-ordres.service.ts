import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, exhaustMap, timer } from 'rxjs';

import { OrdreVue, StatutOrdre } from '../models/crypto.models';
import { LIBELLE_TYPE } from '../utils/ordres';
import { CryptoApiService } from './crypto-api.service';

export interface Notification {
  id: number;
  type: 'succes' | 'erreur';
  titre: string;
  texte: string;
}

/**
 * Surveille les ordres toutes les 5 secondes, sur TOUTES les pages.
 * Quand un ordre « en attente » est exécuté (ou rejeté) par le serveur, une notification apparaît.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsOrdresService {
  private readonly api = inject(CryptoApiService);

  readonly notifications = signal<Notification[]>([]);

  /** Dernier statut connu de chaque ordre (clé = numéro de l'ordre). */
  private readonly statuts = new Map<number, StatutOrdre>();
  /** Le premier chargement sert seulement à mémoriser l'existant : pas de notification pour les anciens ordres. */
  private premierChargementFait = false;
  private compteur = 0;

  constructor() {
    timer(0, 5_000)
      .pipe(
        exhaustMap(() => this.api.getOrdres().pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(),
      )
      .subscribe((ordres) => this.analyser(ordres));
  }

  fermer(id: number): void {
    this.notifications.update((liste) => liste.filter((n) => n.id !== id));
  }

  private analyser(ordres: OrdreVue[]): void {
    for (const o of ordres) {
      const avant = this.statuts.get(o.id);
      if (this.premierChargementFait) {
        const etaitEnAttente = avant === 'EN_ATTENTE' && o.statut !== 'EN_ATTENTE';
        // ordre non « au marché » apparu déjà exécuté entre deux vérifications (seuil atteint très vite)
        const executeRapidement = avant === undefined && o.statut === 'EXECUTE' && o.type !== 'MARKET';
        if (o.statut === 'EXECUTE' && (etaitEnAttente || executeRapidement)) {
          this.ajouter('succes', this.titreExecution(o), this.texteExecution(o));
        } else if (o.statut === 'REJETE' && etaitEnAttente) {
          this.ajouter('erreur', `Ordre #${o.id} rejeté`, o.motif ?? 'Conditions non remplies au moment de l\'exécution.');
        }
      }
      this.statuts.set(o.id, o.statut);
    }
    this.premierChargementFait = true;
  }

  private titreExecution(o: OrdreVue): string {
    switch (o.type) {
      case 'STOP_LOSS':
        return `Stop-loss déclenché (ordre #${o.id})`;
      case 'TAKE_PROFIT':
        return `Take-profit atteint (ordre #${o.id})`;
      default:
        return `${LIBELLE_TYPE[o.type]} exécuté (ordre #${o.id})`;
    }
  }

  private texteExecution(o: OrdreVue): string {
    const verbe = o.sens === 'ACHAT' ? 'Achat' : 'Vente';
    const quantite = o.quantite.toLocaleString('fr-FR', { maximumFractionDigits: 8 });
    const prix = (o.prixExecution ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 8 });
    const montant = o.montant !== null ? ` (${o.montant.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} USDT)` : '';
    return `${verbe} de ${quantite} ${o.symbole} au prix de ${prix}${montant}.`;
  }

  private ajouter(type: Notification['type'], titre: string, texte: string): void {
    const id = ++this.compteur;
    this.notifications.update((liste) => [...liste, { id, type, titre, texte }]);
    // disparaît toute seule après 10 secondes
    setTimeout(() => this.fermer(id), 10_000);
  }
}
