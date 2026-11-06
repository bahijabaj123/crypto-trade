package com.cryptotrade.backend.dto;

import com.cryptotrade.backend.model.ModePortefeuille;

import java.math.BigDecimal;
import java.util.List;

/** Tout ce qu'il faut pour la page Portefeuille et les cartes du dashboard. */
public record PortefeuilleVue(
        Long id,
        ModePortefeuille mode,
        BigDecimal soldeInitial,
        BigDecimal soldeDisponible,
        BigDecimal valeurPositions,
        BigDecimal valeurTotale,
        BigDecimal pnlTotal,
        BigDecimal pnlTotalPourcent,
        List<PositionVue> positionsOuvertes,
        List<PositionVue> positionsFermees
) {
}
