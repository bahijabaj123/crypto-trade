package com.cryptotrade.backend.web;

import com.cryptotrade.backend.config.UtilisateurCourant;
import com.cryptotrade.backend.dto.AnalyseRisque;
import com.cryptotrade.backend.dto.ApercuRequest;
import com.cryptotrade.backend.dto.ApercuRisque;
import com.cryptotrade.backend.dto.ProjectionRisque;
import com.cryptotrade.backend.dto.ScenarioChoc;
import com.cryptotrade.backend.service.BinanceService;
import com.cryptotrade.backend.service.PortefeuilleService;
import com.cryptotrade.backend.service.RisqueService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;

/** Gestion du risque : indicateurs du portefeuille, apercu avant un ordre, simulation de crash. */
@RestController
@RequestMapping("/api")
public class RisqueController {

    private final RisqueService risqueService;
    private final PortefeuilleService portefeuilleService;
    private final BinanceService binanceService;
    private final UtilisateurCourant utilisateur;

    public RisqueController(RisqueService risqueService, PortefeuilleService portefeuilleService,
                            BinanceService binanceService, UtilisateurCourant utilisateur) {
        this.risqueService = risqueService;
        this.portefeuilleService = portefeuilleService;
        this.binanceService = binanceService;
        this.utilisateur = utilisateur;
    }

    /** Rendement, volatilite, VaR, Sharpe, drawdown, exposition, HHI, score de risque. */
    @GetMapping("/portefeuille/risque")
    public AnalyseRisque analyse() {
        return risqueService.analyser(portefeuilleService.getOrCreate(utilisateur.id()));
    }

    /** "Et si j'achetais 0.5 BTC ?" : impact sur l'exposition, la concentration et la VaR (rien n'est execute). */
    @PostMapping("/risque/apercu")
    public ApercuRisque apercu(@Valid @RequestBody ApercuRequest demande) {
        String symbole = demande.symbole().trim().toUpperCase();
        BigDecimal prix = demande.prix() != null ? demande.prix() : binanceService.getPrix(symbole);
        return risqueService.apercu(portefeuilleService.getOrCreate(utilisateur.id()),
                symbole, demande.sens(), demande.quantite(), prix);
    }

    /** /api/portefeuille/scenario?choc=40 : perte si le marche crypto chute de 40 %. */
    @GetMapping("/portefeuille/scenario")
    public ScenarioChoc scenario(@RequestParam(defaultValue = "40") double choc) {
        return risqueService.simulerChoc(portefeuilleService.getOrCreate(utilisateur.id()), choc);
    }

    /** /api/portefeuille/projection?jours=30 : 1 000 futurs possibles du portefeuille (Monte-Carlo). */
    @GetMapping("/portefeuille/projection")
    public ProjectionRisque projection(@RequestParam(defaultValue = "30") int jours) {
        return risqueService.projeter(portefeuilleService.getOrCreate(utilisateur.id()), jours);
    }
}
