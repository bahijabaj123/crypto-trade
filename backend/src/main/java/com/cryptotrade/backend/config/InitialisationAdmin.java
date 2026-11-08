package com.cryptotrade.backend.config;

import com.cryptotrade.backend.service.AuthService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Au premier demarrage, cree le compte administrateur initial.
 * Email et mot de passe modifiables dans application.properties :
 *   app.admin.email=...      app.admin.mot-de-passe=...
 * IMPORTANT : changer le mot de passe par defaut avant toute mise en ligne.
 */
@Component
public class InitialisationAdmin implements ApplicationRunner {

    private final AuthService auth;
    private final String email;
    private final String motDePasse;

    public InitialisationAdmin(AuthService auth,
                               @Value("${app.admin.email:admin@cryptotrade.local}") String email,
                               @Value("${app.admin.mot-de-passe:Admin123!}") String motDePasse) {
        this.auth = auth;
        this.email = email;
        this.motDePasse = motDePasse;
    }

    @Override
    public void run(ApplicationArguments args) {
        auth.creerAdminParDefaut(email, motDePasse);
    }
}
