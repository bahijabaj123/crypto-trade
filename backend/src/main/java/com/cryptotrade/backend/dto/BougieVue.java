package com.cryptotrade.backend.dto;

import java.math.BigDecimal;

/**
 * Une bougie (chandelier) : ce qu'a fait le prix pendant une periode (1 heure, 1 jour...).
 * Le "corps" va de l'ouverture a la cloture, la "meche" va du plus bas au plus haut.
 */
public record BougieVue(
        long temps,            // debut de la periode, en millisecondes (heure Unix)
        BigDecimal ouverture,  // premier prix de la periode
        BigDecimal haut,       // prix le plus haut
        BigDecimal bas,        // prix le plus bas
        BigDecimal cloture,    // dernier prix de la periode
        BigDecimal volume) {   // quantite echangee
}
