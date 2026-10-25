package com.cryptotrade.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Les taches de fond du backend :
 *  - toutes les 5 s : surveille les ordres en attente (LIMIT, STOP_LOSS, TAKE_PROFIT) et les execute
 *  - toutes les 30 s : enregistre la valeur du portefeuille pour la courbe
 * Desactivable avec app.moteur.actif=false (utile dans les tests).
 */
@Component
@ConditionalOnProperty(name = "app.moteur.actif", havingValue = "true", matchIfMissing = true)
public class MoteurOrdres {

    private static final Logger LOG = LoggerFactory.getLogger(MoteurOrdres.class);

    private final OrdreService ordreService;
    private final SnapshotService snapshotService;

    public MoteurOrdres(OrdreService ordreService, SnapshotService snapshotService) {
        this.ordreService = ordreService;
        this.snapshotService = snapshotService;
    }

    @Scheduled(fixedDelayString = "${app.moteur.intervalle-ordres-ms:5000}", initialDelay = 5000)
    public void surveillerOrdres() {
        try {
            int executes = ordreService.traiterOrdresEnAttente();
            if (executes > 0) {
                LOG.info("{} ordre(s) en attente execute(s)", executes);
            }
        } catch (RuntimeException e) {
            LOG.warn("Surveillance des ordres impossible : {}", e.getMessage());
        }
    }

    @Scheduled(fixedDelayString = "${app.moteur.intervalle-snapshot-ms:30000}", initialDelay = 10000)
    public void enregistrerValeur() {
        try {
            snapshotService.enregistrerTous();
        } catch (RuntimeException e) {
            LOG.warn("Enregistrement de la valeur impossible : {}", e.getMessage());
        }
    }
}
