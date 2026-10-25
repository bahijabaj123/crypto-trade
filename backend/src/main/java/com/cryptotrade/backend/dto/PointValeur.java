package com.cryptotrade.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Un point de la courbe "valeur totale du portefeuille dans le temps". */
public record PointValeur(LocalDateTime date, BigDecimal valeur) {
}
