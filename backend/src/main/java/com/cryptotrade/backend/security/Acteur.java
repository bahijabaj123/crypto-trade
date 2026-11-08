package com.cryptotrade.backend.security;

import com.cryptotrade.backend.model.Role;

/** La personne connectee pour la requete en cours (lue dans le jeton). */
public record Acteur(Long id, String email, Role role) {
}
