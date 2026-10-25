package com.cryptotrade.backend.model;

/** Seul MARKET est gere pour l'instant. LIMIT, STOP_LOSS et TAKE_PROFIT arrivent a l'etape 2. */
public enum TypeOrdre {
    MARKET,
    LIMIT,
    STOP_LOSS,
    TAKE_PROFIT
}
