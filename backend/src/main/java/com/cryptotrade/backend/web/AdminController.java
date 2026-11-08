package com.cryptotrade.backend.web;

import com.cryptotrade.backend.dto.AuthDtos.UtilisateurVue;
import com.cryptotrade.backend.dto.JournalVue;
import com.cryptotrade.backend.dto.StatsAdminVue;
import com.cryptotrade.backend.exception.RegleMetierException;
import com.cryptotrade.backend.model.Role;
import com.cryptotrade.backend.security.AuthContext;
import com.cryptotrade.backend.service.AuditService;
import com.cryptotrade.backend.service.AuthService;
import com.cryptotrade.backend.service.StatsAdminService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Espace administrateur (toutes ces routes sont reservees au role ADMIN par AuthInterceptor).
 * GET /api/admin/stats                         : chiffres globaux
 * GET /api/admin/utilisateurs                  : liste des comptes
 * PUT /api/admin/utilisateurs/{id}/role        : ?valeur=ADMIN|JOUEUR
 * PUT /api/admin/utilisateurs/{id}/actif       : ?valeur=true|false (bloquer / debloquer)
 * GET /api/admin/journal                       : ?limite=100 (journal d'audit)
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final StatsAdminService stats;
    private final AuthService comptes;
    private final AuditService audit;

    public AdminController(StatsAdminService stats, AuthService comptes, AuditService audit) {
        this.stats = stats;
        this.comptes = comptes;
        this.audit = audit;
    }

    @GetMapping("/stats")
    public StatsAdminVue stats() {
        return stats.calculer();
    }

    @GetMapping("/utilisateurs")
    public List<UtilisateurVue> utilisateurs() {
        return comptes.lister();
    }

    @PutMapping("/utilisateurs/{id}/role")
    public UtilisateurVue role(@PathVariable Long id, @RequestParam String valeur) {
        Role role;
        try {
            role = Role.valueOf(valeur.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new RegleMetierException("Rôle invalide (ADMIN ou JOUEUR).");
        }
        return comptes.changerRole(id, role, idActeur());
    }

    @PutMapping("/utilisateurs/{id}/actif")
    public UtilisateurVue actif(@PathVariable Long id, @RequestParam boolean valeur) {
        return comptes.changerActif(id, valeur, idActeur());
    }

    @GetMapping("/journal")
    public List<JournalVue> journal(@RequestParam(defaultValue = "100") int limite) {
        return audit.derniers(limite);
    }

    private Long idActeur() {
        return AuthContext.courant().map(a -> a.id()).orElse(-1L);
    }
}
