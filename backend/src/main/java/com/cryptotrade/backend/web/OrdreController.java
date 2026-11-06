package com.cryptotrade.backend.web;

import com.cryptotrade.backend.config.UtilisateurCourant;
import com.cryptotrade.backend.dto.OrdreRequest;
import com.cryptotrade.backend.dto.OrdreVue;
import com.cryptotrade.backend.dto.ResultatOrdre;
import com.cryptotrade.backend.service.OrdreService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/ordres")
public class OrdreController {

    private final OrdreService ordreService;
    private final UtilisateurCourant utilisateur;

    public OrdreController(OrdreService ordreService, UtilisateurCourant utilisateur) {
        this.ordreService = ordreService;
        this.utilisateur = utilisateur;
    }

    /** Passe un ordre. Corps : {"symbole":"BTCUSDT","sens":"ACHAT","type":"MARKET","quantite":0.1} */
    @PostMapping
    public ResponseEntity<ResultatOrdre> passer(@Valid @RequestBody OrdreRequest demande) {
        ResultatOrdre resultat = ordreService.passerOrdre(utilisateur.id(), demande);
        return ResponseEntity.status(HttpStatus.CREATED).body(resultat);
    }

    @GetMapping
    public List<OrdreVue> liste() {
        return ordreService.liste(utilisateur.id());
    }

    /** Annule un ordre en attente : DELETE /api/ordres/12 */
    @DeleteMapping("/{id}")
    public OrdreVue annuler(@PathVariable Long id) {
        return ordreService.annuler(utilisateur.id(), id);
    }
}
