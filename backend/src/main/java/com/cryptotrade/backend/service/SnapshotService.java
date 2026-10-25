package com.cryptotrade.backend.service;

import com.cryptotrade.backend.dto.PointValeur;
import com.cryptotrade.backend.model.Portefeuille;
import com.cryptotrade.backend.model.SnapshotValeur;
import com.cryptotrade.backend.repository.PortefeuilleRepository;
import com.cryptotrade.backend.repository.SnapshotValeurRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Garde l'historique de la valeur totale du portefeuille pour tracer la courbe. */
@Service
public class SnapshotService {

    private final SnapshotValeurRepository snapshotRepository;
    private final PortefeuilleRepository portefeuilleRepository;
    private final PortefeuilleService portefeuilleService;

    public SnapshotService(SnapshotValeurRepository snapshotRepository,
                           PortefeuilleRepository portefeuilleRepository,
                           PortefeuilleService portefeuilleService) {
        this.snapshotRepository = snapshotRepository;
        this.portefeuilleRepository = portefeuilleRepository;
        this.portefeuilleService = portefeuilleService;
    }

    /** Enregistre un point pour chaque portefeuille existant. */
    @Transactional
    public void enregistrerTous() {
        for (Portefeuille p : portefeuilleRepository.findAll()) {
            enregistrer(p);
        }
    }

    private void enregistrer(Portefeuille p) {
        SnapshotValeur s = new SnapshotValeur();
        s.setPortefeuilleId(p.getId());
        s.setValeurTotale(portefeuilleService.vue(p.getUtilisateurId()).valeurTotale());
        snapshotRepository.save(s);
    }

    /** Les derniers points, du plus ancien au plus recent. Cree un premier point si la courbe est vide. */
    @Transactional
    public List<PointValeur> historique(Long utilisateurId) {
        Portefeuille p = portefeuilleService.getOrCreate(utilisateurId);
        List<SnapshotValeur> points = snapshotRepository.findTop200ByPortefeuilleIdOrderByDateDesc(p.getId());
        if (points.isEmpty()) {
            enregistrer(p);
            points = snapshotRepository.findTop200ByPortefeuilleIdOrderByDateDesc(p.getId());
        }
        List<PointValeur> resultat = new ArrayList<>();
        for (SnapshotValeur s : points) {
            resultat.add(new PointValeur(s.getDate(), s.getValeurTotale()));
        }
        Collections.reverse(resultat);
        return resultat;
    }
}
