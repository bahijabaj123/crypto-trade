package com.cryptotrade.backend.service;

import com.cryptotrade.backend.dto.StatsAdminVue;
import com.cryptotrade.backend.model.Role;
import com.cryptotrade.backend.model.StatutOrdre;
import com.cryptotrade.backend.repository.JournalAuditRepository;
import com.cryptotrade.backend.repository.ScenarioJeuRepository;
import com.cryptotrade.backend.repository.UtilisateurRepository;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

/** Calcule les chiffres globaux de la plateforme (requetes de comptage directes, sans toucher aux repositories du trading). */
@Service
public class StatsAdminService {

    private final EntityManager em;
    private final UtilisateurRepository utilisateurs;
    private final ScenarioJeuRepository scenarios;
    private final JournalAuditRepository journal;

    public StatsAdminService(EntityManager em, UtilisateurRepository utilisateurs,
                             ScenarioJeuRepository scenarios, JournalAuditRepository journal) {
        this.em = em;
        this.utilisateurs = utilisateurs;
        this.scenarios = scenarios;
        this.journal = journal;
    }

    @Transactional(readOnly = true)
    public StatsAdminVue calculer() {
        BigDecimal somme = em.createQuery(
                        "select sum(o.montant) from Ordre o where o.statut = :s", BigDecimal.class)
                .setParameter("s", StatutOrdre.EXECUTE).getSingleResult();
        BigDecimal volume = somme != null ? somme : BigDecimal.ZERO;   // aucune ligne : sum() renvoie null
        return new StatsAdminVue(
                utilisateurs.count(), utilisateurs.countByRole(Role.ADMIN), utilisateurs.countByRole(Role.JOUEUR),
                utilisateurs.countByActifFalse(),
                compter("select count(o) from Ordre o"),
                ordresParStatut(StatutOrdre.EXECUTE), ordresParStatut(StatutOrdre.EN_ATTENTE), ordresParStatut(StatutOrdre.ANNULE),
                volume,
                compter("select count(p) from Portefeuille p"),
                compter("select count(t) from Transaction t"),
                scenarios.count(), scenarios.findByActifTrueOrderByOrdreAscIdAsc().size(),
                journal.count());
    }

    private long compter(String jpql) {
        return em.createQuery(jpql, Long.class).getSingleResult();
    }

    private long ordresParStatut(StatutOrdre statut) {
        return em.createQuery("select count(o) from Ordre o where o.statut = :s", Long.class)
                .setParameter("s", statut).getSingleResult();
    }
}
