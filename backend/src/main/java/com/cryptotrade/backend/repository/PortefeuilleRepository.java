package com.cryptotrade.backend.repository;

import com.cryptotrade.backend.model.Portefeuille;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PortefeuilleRepository extends JpaRepository<Portefeuille, Long> {

    Optional<Portefeuille> findByUtilisateurId(Long utilisateurId);
}
