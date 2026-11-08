package com.cryptotrade.backend.security;

import com.cryptotrade.backend.model.Role;
import com.cryptotrade.backend.model.Utilisateur;
import com.cryptotrade.backend.repository.UtilisateurRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Optional;

/**
 * Execute avant chaque requete /api/** :
 * 1) lit le jeton "Authorization: Bearer ..." et retrouve la personne connectee (si le compte existe et n'est pas bloque) ;
 * 2) pour /api/admin/** : refuse (401) sans connexion valide et (403) si ce n'est pas un administrateur.
 * Les autres routes restent ouvertes, comme avant.
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    private final JwtService jwt;
    private final UtilisateurRepository utilisateurs;

    public AuthInterceptor(JwtService jwt, UtilisateurRepository utilisateurs) {
        this.jwt = jwt;
        this.utilisateurs = utilisateurs;
    }

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) throws IOException {
        if ("OPTIONS".equalsIgnoreCase(req.getMethod())) return true;   // verification CORS du navigateur

        Optional<Acteur> acteur = lireActeur(req);
        acteur.ifPresent(a -> AuthContext.definir(req, a));

        if (req.getRequestURI().startsWith("/api/admin")) {
            if (acteur.isEmpty()) {
                refuser(res, 401, "Connexion requise.");
                return false;
            }
            if (acteur.get().role() != Role.ADMIN) {
                refuser(res, 403, "Accès réservé aux administrateurs.");
                return false;
            }
        }
        return true;
    }

    private Optional<Acteur> lireActeur(HttpServletRequest req) {
        String entete = req.getHeader("Authorization");
        if (entete == null || !entete.startsWith("Bearer ")) return Optional.empty();
        Optional<Acteur> dansJeton = jwt.lire(entete.substring(7).trim());
        if (dansJeton.isEmpty()) return Optional.empty();
        // On relit le compte : un compte bloque ou supprime perd l'acces tout de suite, et le role est celui de la base.
        Optional<Utilisateur> compte = utilisateurs.findById(dansJeton.get().id());
        return compte.filter(Utilisateur::isActif)
                .map(u -> new Acteur(u.getId(), u.getEmail(), u.getRole()));
    }

    private void refuser(HttpServletResponse res, int statut, String message) throws IOException {
        res.setStatus(statut);
        res.setContentType("application/json");
        res.setCharacterEncoding(StandardCharsets.UTF_8.name());
        res.getWriter().write("{\"status\":" + statut + ",\"message\":\"" + message + "\",\"horodatage\":\""
                + LocalDateTime.now() + "\"}");
    }
}
