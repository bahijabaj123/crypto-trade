package com.cryptotrade.backend.dto;

import java.math.BigDecimal;

/** Chiffres de la page « Tableau de bord » de l'administrateur. */
public record StatsAdminVue(
        long utilisateursTotal, long administrateurs, long joueurs, long comptesBloques,
        long ordresTotal, long ordresExecutes, long ordresEnAttente, long ordresAnnules,
        BigDecimal volumeExecute, long portefeuilles, long transactions,
        long scenariosTotal, long scenariosActifs, long evenementsJournal) {
}
