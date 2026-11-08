package com.cryptotrade.backend.dto;

import com.cryptotrade.backend.model.Role;
import com.cryptotrade.backend.model.Utilisateur;

import java.time.LocalDateTime;

/** Les formats echanges avec Angular pour la connexion et la gestion des comptes. */
public final class AuthDtos {

    private AuthDtos() {
    }

    public record LoginRequest(String email, String motDePasse) {
    }

    public record ChangerMotDePasseRequest(String ancienMotDePasse, String nouveauMotDePasse) {
    }

    public record RegisterRequest(String nom, String email, String motDePasse) {
    }

    /** Ce qu'on montre d'un compte (jamais le mot de passe). */
    public record UtilisateurVue(Long id, String nom, String email, Role role, boolean actif,
                                 LocalDateTime dateCreation, LocalDateTime derniereConnexion) {
        public static UtilisateurVue de(Utilisateur u) {
            return new UtilisateurVue(u.getId(), u.getNom(), u.getEmail(), u.getRole(), u.isActif(),
                    u.getDateCreation(), u.getDerniereConnexion());
        }
    }

    public record AuthReponse(String jeton, UtilisateurVue utilisateur) {
    }
}
