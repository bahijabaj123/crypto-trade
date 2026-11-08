package com.cryptotrade.backend.repository;

import com.cryptotrade.backend.model.ScenarioJeu;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ScenarioJeuRepository extends JpaRepository<ScenarioJeu, String> {

    List<ScenarioJeu> findAllByOrderByOrdreAscIdAsc();

    List<ScenarioJeu> findByActifTrueOrderByOrdreAscIdAsc();
}
