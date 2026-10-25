package com.cryptotrade.backend.dto;

import com.cryptotrade.backend.model.SensOrdre;
import com.cryptotrade.backend.model.TypeOrdre;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;

/**
 * Corps de POST /api/ordres.
 * Exemple : {"symbole":"BTCUSDT","sens":"ACHAT","type":"MARKET","quantite":0.1}
 * Ordre en attente : {"symbole":"BTCUSDT","sens":"VENTE","type":"STOP_LOSS","quantite":0.1,"prixDeclenchement":80000}
 *   - LIMIT       : achat si le prix descend a prixDeclenchement ou moins, vente s'il monte a prixDeclenchement ou plus
 *   - STOP_LOSS   : vente quand le prix descend a prixDeclenchement (limite la perte)
 *   - TAKE_PROFIT : vente quand le prix monte a prixDeclenchement (securise le gain)
 */
public record OrdreRequest(
        @NotBlank(message = "Le symbole est obligatoire")
        @Pattern(regexp = "^[A-Za-z0-9]{5,15}$", message = "Symbole invalide (exemple : BTCUSDT)")
        String symbole,

        @NotNull(message = "Le sens est obligatoire (ACHAT ou VENTE)")
        SensOrdre sens,

        /** Facultatif : MARKET par defaut. */
        TypeOrdre type,

        @NotNull(message = "La quantite est obligatoire")
        @Positive(message = "La quantite doit etre positive")
        BigDecimal quantite,

        /** Obligatoire pour LIMIT, STOP_LOSS et TAKE_PROFIT ; ignore pour MARKET. */
        @Positive(message = "Le prix de declenchement doit etre positif")
        BigDecimal prixDeclenchement
) {
}
