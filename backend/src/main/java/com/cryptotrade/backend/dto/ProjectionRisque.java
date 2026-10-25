package com.cryptotrade.backend.dto;

import java.util.List;

/**
 * Projection du portefeuille par simulation de Monte-Carlo : 1 000 futurs possibles,
 * resumes par le pire cas, le cas median et le meilleur cas pour chaque jour.
 * Ce n'est PAS une prediction : elle suppose que les prochains jours ressemblent aux jours passes.
 */
public record ProjectionRisque(
        boolean disponible,
        String message,               // explication si indisponible, sinon une phrase de lecture
        int jours,                    // nombre de jours projetes
        int simulations,              // nombre de futurs simules
        int joursHistorique,          // jours d'historique reels utilises
        double valeurInitiale,
        double pireCas,               // valeur finale depassee dans 95 % des simulations
        double casMedian,
        double meilleurCas,           // valeur finale depassee dans seulement 5 % des simulations
        double probabilitePertePct,   // % de simulations qui finissent sous la valeur de depart
        double probabilitePerte10Pct, // % de simulations qui perdent plus de 10 %
        List<Point> trajectoire) {

    /** Un jour de l'eventail : les valeurs aux percentiles 5, 25, 50, 75 et 95. */
    public record Point(int jour, double p5, double p25, double p50, double p75, double p95) {
    }
}
