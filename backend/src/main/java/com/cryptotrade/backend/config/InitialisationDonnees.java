package com.cryptotrade.backend.config;

import com.cryptotrade.backend.service.PortefeuilleService;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Cree le portefeuille de l'utilisateur courant des le demarrage du serveur.
 * Sans ca, quand la page envoie plusieurs requetes en meme temps au tout premier chargement,
 * chacune essaie de creer le portefeuille et la base refuse le doublon.
 * (Avec le vrai module d'authentification, le portefeuille sera cree a l'inscription.)
 */
@Component
public class InitialisationDonnees implements ApplicationRunner {

    private final PortefeuilleService portefeuilleService;
    private final UtilisateurCourant utilisateur;

    public InitialisationDonnees(PortefeuilleService portefeuilleService, UtilisateurCourant utilisateur) {
        this.portefeuilleService = portefeuilleService;
        this.utilisateur = utilisateur;
    }

    @Override
    public void run(ApplicationArguments args) {
        portefeuilleService.getOrCreate(utilisateur.id());
    }
}
