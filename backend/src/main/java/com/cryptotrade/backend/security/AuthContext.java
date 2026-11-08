package com.cryptotrade.backend.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

import java.util.Optional;

/** Acces simple a la personne connectee, depuis n'importe quel controleur ou service. */
public final class AuthContext {

    static final String ATTRIBUT = "cryptotrade.acteur";

    private AuthContext() {
    }

    public static Optional<Acteur> courant() {
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (attrs == null) return Optional.empty();
        Object valeur = attrs.getAttribute(ATTRIBUT, RequestAttributes.SCOPE_REQUEST);
        return valeur instanceof Acteur a ? Optional.of(a) : Optional.empty();
    }

    /** Email pour le journal ; "anonyme" si personne n'est connecte. */
    public static String emailCourant() {
        return courant().map(Acteur::email).orElse("anonyme");
    }

    static void definir(HttpServletRequest req, Acteur acteur) {
        req.setAttribute(ATTRIBUT, acteur);
    }
}
