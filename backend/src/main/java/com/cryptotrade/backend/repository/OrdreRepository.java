package com.cryptotrade.backend.repository;

import com.cryptotrade.backend.model.Ordre;
import com.cryptotrade.backend.model.StatutOrdre;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface OrdreRepository extends JpaRepository<Ordre, Long> {

    List<Ordre> findByPortefeuilleIdOrderByDateCreationDesc(Long portefeuilleId);

    /** Les ordres que le moteur doit surveiller. */
    List<Ordre> findByStatut(StatutOrdre statut);

    Optional<Ordre> findByIdAndPortefeuilleId(Long id, Long portefeuilleId);
}
