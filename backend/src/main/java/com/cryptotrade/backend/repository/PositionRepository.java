package com.cryptotrade.backend.repository;

import com.cryptotrade.backend.model.Position;
import com.cryptotrade.backend.model.StatutPosition;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PositionRepository extends JpaRepository<Position, Long> {

    List<Position> findByPortefeuilleIdAndStatutOrderByDateOuvertureDesc(Long portefeuilleId, StatutPosition statut);

    Optional<Position> findByPortefeuilleIdAndSymboleAndStatut(Long portefeuilleId, String symbole, StatutPosition statut);
}
