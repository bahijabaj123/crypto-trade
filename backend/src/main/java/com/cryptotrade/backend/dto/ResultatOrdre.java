package com.cryptotrade.backend.dto;

import java.math.BigDecimal;

/** Reponse de POST /api/ordres : l'ordre execute + le nouveau solde. */
public record ResultatOrdre(
        OrdreVue ordre,
        BigDecimal soldeDisponible,
        String message
) {
}
