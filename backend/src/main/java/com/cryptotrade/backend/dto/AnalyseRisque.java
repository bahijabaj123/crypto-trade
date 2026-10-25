package com.cryptotrade.backend.dto;

import java.util.List;

/**
 * Indicateurs de PERFORMANCE et de RISQUE du portefeuille.
 * Les champs Double peuvent etre null quand l'historique des prix est indisponible.
 */
public record AnalyseRisque(
        double valeurTotale,
        double investiPct,            // part du portefeuille investie en crypto (le reste = cash)
        double rendementPct,          // gain/perte depuis le capital de depart
        Double volatiliteAnnuellePct, // agitation du portefeuille, ramenee a 1 an
        Double var95Pct,              // perte max probable sur 1 jour (95 % des jours), en %
        Double var95Usdt,             // idem en USDT
        Double sharpe,                // rendement obtenu par unite de risque
        Double drawdownMaxPct,        // plus forte baisse "sommet -> creux" sur la periode
        double hhi,                   // concentration (0 - 10000)
        String diversification,       // BONNE / MOYENNE / FAIBLE / AUCUNE
        double expositionMaxPct,      // part du portefeuille dans l'actif le plus important
        String actifPlusExpose,
        List<Exposition> expositions,
        Integer scoreRisque,          // 0 (sur) a 100 (tres risque)
        String niveauRisque,          // FAIBLE / MODERE / ELEVE / INDISPONIBLE
        List<String> explications,    // "pourquoi ce score" en phrases simples
        String suggestion,            // conseil de reequilibrage (peut etre null)
        int joursHistorique) {

    /** Part d'un actif dans la valeur totale du portefeuille. */
    public record Exposition(String symbole, double valeur, double poidsPct) {
    }
}
