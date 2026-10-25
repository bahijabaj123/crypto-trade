package com.cryptotrade.backend.web;

import com.cryptotrade.backend.config.UtilisateurCourant;
import com.cryptotrade.backend.dto.PortefeuilleVue;
import com.cryptotrade.backend.dto.PositionVue;
import com.cryptotrade.backend.dto.TransactionVue;
import com.cryptotrade.backend.model.StatutPosition;
import com.cryptotrade.backend.dto.PointValeur;
import com.cryptotrade.backend.service.PortefeuilleService;
import com.cryptotrade.backend.service.SnapshotService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class PortefeuilleController {

    private final PortefeuilleService portefeuilleService;
    private final SnapshotService snapshotService;
    private final UtilisateurCourant utilisateur;

    public PortefeuilleController(PortefeuilleService portefeuilleService, SnapshotService snapshotService,
                                  UtilisateurCourant utilisateur) {
        this.portefeuilleService = portefeuilleService;
        this.snapshotService = snapshotService;
        this.utilisateur = utilisateur;
    }

    /** Solde, valeur totale, gain/perte, positions ouvertes et fermees. */
    @GetMapping("/portefeuille")
    public PortefeuilleVue portefeuille() {
        return portefeuilleService.vue(utilisateur.id());
    }

    /** /api/portefeuille/positions?statut=OUVERTE ou FERMEE */
    @GetMapping("/portefeuille/positions")
    public List<PositionVue> positions(@RequestParam(defaultValue = "OUVERTE") StatutPosition statut) {
        return portefeuilleService.positions(utilisateur.id(), statut);
    }

    /** Historique des transactions, de la plus recente a la plus ancienne. */
    @GetMapping("/transactions")
    public List<TransactionVue> transactions() {
        return portefeuilleService.transactions(utilisateur.id());
    }

    /** Courbe de la valeur totale du portefeuille dans le temps (200 derniers points). */
    @GetMapping("/portefeuille/historique-valeur")
    public List<PointValeur> historiqueValeur() {
        return snapshotService.historique(utilisateur.id());
    }
}
