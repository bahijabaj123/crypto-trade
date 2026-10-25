package com.cryptotrade.backend.repository;

import com.cryptotrade.backend.model.SnapshotValeur;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SnapshotValeurRepository extends JpaRepository<SnapshotValeur, Long> {

    /** Les 200 derniers points, du plus recent au plus ancien. */
    List<SnapshotValeur> findTop200ByPortefeuilleIdOrderByDateDesc(Long portefeuilleId);
}
