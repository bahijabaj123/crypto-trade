package com.cryptotrade.backend.dto;

import java.util.List;

/**
 * Un scenario tel qu'il circule entre le backend et Angular.
 * Les noms des champs sont les memes que ceux de ScenarioConfig (scenario-config.ts) cote frontend.
 */
public record ScenarioJeuDto(
        String id,
        String nom,
        String description,
        String difficulte,
        String icone,
        String couleur,
        String marche,
        boolean actif,
        int ordre,
        List<RequeteDto> requetes) {

    /** Un actif a telecharger : source (binance), symbole, periode et intervalle des bougies. */
    public record RequeteDto(String source, String symbol, String startDate, String endDate, String interval) {
    }
}
