package com.cryptotrade.backend.config;

import com.cryptotrade.backend.security.AuthContext;
import org.springframework.stereotype.Component;

/**
 * Qui est l'utilisateur connecte ?
 * - si la requete porte un jeton valide : son identifiant (chaque joueur a son portefeuille) ;
 * - sinon : l'utilisateur 1, comme avant (les pages de trading restent utilisables sans connexion).
 */
@Component
public class UtilisateurCourant {

    public Long id() {
        return AuthContext.courant().map(a -> a.id()).orElse(1L);
    }
}
