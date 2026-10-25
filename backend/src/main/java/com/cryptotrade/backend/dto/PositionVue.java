package com.cryptotrade.backend.dto;

import com.cryptotrade.backend.model.StatutPosition;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Une ligne du tableau "positions".
 * Pour une position FERMEE : prixActuel = null, valeurActuelle et pnlLatent = 0, seul pnlRealise compte.
 * prixDisponible = false si Binance n'a pas repondu (on utilise alors le prix moyen d'achat).
 */
public record PositionVue(
        Long id,
        String symbole,
        BigDecimal quantite,
        BigDecimal quantiteTotaleAchetee,
        BigDecimal prixMoyenAchat,
        BigDecimal prixActuel,
        BigDecimal valeurActuelle,
        BigDecimal pnlLatent,
        BigDecimal pnlLatentPourcent,
        BigDecimal pnlRealise,
        StatutPosition statut,
        LocalDateTime dateOuverture,
        LocalDateTime dateFermeture,
        boolean prixDisponible
) {
}
