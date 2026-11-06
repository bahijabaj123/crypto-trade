package com.cryptotrade.backend.config;

import org.springframework.stereotype.Component;

/**
 * Qui est l'utilisateur connecte ?
 * Pour l'instant : toujours l'utilisateur 1, car le module Securite (JWT) n'est pas encore pret.
 * Quand il le sera, c'est le SEUL endroit a modifier : lire l'identifiant dans le token JWT.
 */
@Component
public class UtilisateurCourant {

    public Long id() {
        return 1L;
    }
}
