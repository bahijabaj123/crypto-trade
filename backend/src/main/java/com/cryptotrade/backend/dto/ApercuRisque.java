package com.cryptotrade.backend.dto;

import java.util.List;

/** Resultat de l'evaluation du risque AVANT un ordre : que se passe-t-il si je valide ? */
public record ApercuRisque(
        boolean autorise,
        String niveau,                 // OK / ATTENTION / REFUSE
        List<String> messages,
        double expositionAvantPct,     // part de l'actif concerne dans le portefeuille, avant l'ordre
        double expositionApresPct,     // ... et apres
        double hhiAvant,
        double hhiApres,
        Double var95PctAvant,
        Double var95PctApres,
        Double var95UsdtAvant,
        Double var95UsdtApres,
        Double quantiteMax) {          // quantite maximale d'achat acceptee (null si pas d'achat)
}
