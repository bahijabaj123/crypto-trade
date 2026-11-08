package com.cryptotrade.backend.repository;

import com.cryptotrade.backend.model.JournalAudit;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface JournalAuditRepository extends JpaRepository<JournalAudit, Long> {

    /** Les plus recentes d'abord ; la taille est donnee par le Pageable. */
    List<JournalAudit> findAllByOrderByDateDescIdDesc(Pageable page);
}
