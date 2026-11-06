package com.cryptotrade.backend.dto;

import java.util.List;

/** "Et si tout le marche crypto chutait de X % ?" : simulation de crash (passerelle vers le Stress Testing). */
public record ScenarioChoc(
        double chocPct,
        double valeurAvant,
        double perteUsdt,
        double valeurApres,
        double perteDuPortefeuillePct,
        List<Ligne> details) {

    public record Ligne(String symbole, double perteUsdt) {
    }
}
