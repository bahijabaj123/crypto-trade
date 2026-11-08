package com.cryptotrade.backend.web;

import com.cryptotrade.backend.dto.AuthDtos.AuthReponse;
import com.cryptotrade.backend.dto.AuthDtos.ChangerMotDePasseRequest;
import com.cryptotrade.backend.dto.AuthDtos.LoginRequest;
import com.cryptotrade.backend.dto.AuthDtos.RegisterRequest;
import com.cryptotrade.backend.dto.AuthDtos.UtilisateurVue;
import com.cryptotrade.backend.security.Acteur;
import com.cryptotrade.backend.security.AuthContext;
import com.cryptotrade.backend.service.AuthService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * POST /api/auth/register : creer un compte joueur
 * POST /api/auth/login    : se connecter (renvoie le jeton)
 * GET  /api/auth/me       : qui suis-je ? (jeton obligatoire)
 * PUT  /api/auth/mot-de-passe : changer son propre mot de passe (jeton obligatoire)
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService service;

    public AuthController(AuthService service) {
        this.service = service;
    }

    @PostMapping("/register")
    public AuthReponse inscrire(@RequestBody RegisterRequest req) {
        return service.inscrire(req);
    }

    @PostMapping("/login")
    public AuthReponse connecter(@RequestBody LoginRequest req) {
        return service.connecter(req);
    }

    @GetMapping("/me")
    public UtilisateurVue moi() {
        Acteur a = AuthContext.courant()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Connexion requise."));
        return service.moi(a.id());
    }

    @PutMapping("/mot-de-passe")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changerMotDePasse(@RequestBody ChangerMotDePasseRequest req) {
        Acteur a = AuthContext.courant()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Connexion requise."));
        service.changerMotDePasse(a.id(), req);
    }
}
