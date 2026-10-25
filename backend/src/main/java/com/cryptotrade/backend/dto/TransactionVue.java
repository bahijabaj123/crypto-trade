package com.cryptotrade.backend.dto;

import com.cryptotrade.backend.model.SensOrdre;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record TransactionVue(
        Long id,
        Long ordreId,
        String symbole,
        SensOrdre sens,
        BigDecimal quantite,
        BigDecimal prix,
        BigDecimal montant,
        LocalDateTime date
) {
}
