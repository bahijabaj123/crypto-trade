package com.cryptotrade.backend.dto;

import java.math.BigDecimal;

/** Prix d'une crypto + variation sur 24 h en % (null si indisponible). */
public record PrixVue(String symbole, BigDecimal prix, BigDecimal variation24h) {
}
