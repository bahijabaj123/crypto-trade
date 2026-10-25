package com.cryptotrade.backend.dto;

import com.cryptotrade.backend.model.SensOrdre;
import com.cryptotrade.backend.model.StatutOrdre;
import com.cryptotrade.backend.model.TypeOrdre;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record OrdreVue(
        Long id,
        String symbole,
        SensOrdre sens,
        TypeOrdre type,
        BigDecimal quantite,
        /** Seuil (limite / stop-loss / take-profit), null pour un ordre MARKET. */
        BigDecimal prixDeclenchement,
        /** null tant que l'ordre n'est pas execute. */
        BigDecimal prixExecution,
        BigDecimal montant,
        StatutOrdre statut,
        /** Raison du rejet, sinon null. */
        String motif,
        LocalDateTime date,
        LocalDateTime dateExecution
) {
}
