package com.cryptotrade.backend.dto;

import com.cryptotrade.backend.model.SensOrdre;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;

/** Ce que l'on veut tester : "et si j'achetais 0.5 BTC ?". Le prix est facultatif (sinon prix du marche). */
public record ApercuRequest(
        @NotBlank String symbole,
        @NotNull SensOrdre sens,
        @NotNull @Positive BigDecimal quantite,
        @Positive BigDecimal prix) {
}
