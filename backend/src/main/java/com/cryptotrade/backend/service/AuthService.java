package com.cryptotrade.backend.service;

import com.cryptotrade.backend.dto.AuthDtos.AuthReponse;
import com.cryptotrade.backend.dto.AuthDtos.ChangerMotDePasseRequest;
import com.cryptotrade.backend.dto.AuthDtos.LoginRequest;
import com.cryptotrade.backend.dto.AuthDtos.RegisterRequest;
import com.cryptotrade.backend.dto.AuthDtos.UtilisateurVue;
import com.cryptotrade.backend.exception.RegleMetierException;
import com.cryptotrade.backend.model.Role;
import com.cryptotrade.backend.model.Utilisateur;
import com.cryptotrade.backend.repository.UtilisateurRepository;
import com.cryptotrade.backend.security.JwtService;
import com.cryptotrade.backend.security.MotDePasseService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.regex.Pattern;

/** Inscription, connexion et gestion des comptes. */
@Service
public class AuthService {

    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

    private final UtilisateurRepository utilisateurs;
    private final MotDePasseService motsDePasse;
    private final JwtService jwt;
    private final AuditService audit;

    public AuthService(UtilisateurRepository utilisateurs, MotDePasseService motsDePasse, JwtService jwt, AuditService audit) {
        this.utilisateurs = utilisateurs;
        this.motsDePasse = motsDePasse;
        this.jwt = jwt;
        this.audit = audit;
    }

    // ---------- Connexion / inscription ----------

    @Transactional
    public AuthReponse inscrire(RegisterRequest req) {
        String nom = req.nom() == null ? "" : req.nom().trim();
        String email = req.email() == null ? "" : req.email().trim().toLowerCase();
        if (nom.length() < 2 || nom.length() > 60) throw new RegleMetierException("Le nom doit avoir entre 2 et 60 caractères.");
        if (!EMAIL.matcher(email).matches() || email.length() > 120) throw new RegleMetierException("Adresse email invalide.");
        verifierMotDePasse(req.motDePasse());
        if (utilisateurs.existsByEmailIgnoreCase(email)) throw new RegleMetierException("Un compte existe déjà avec cet email.");

        Utilisateur u = nouveau(nom, email, req.motDePasse(), Role.JOUEUR);
        u.setDerniereConnexion(LocalDateTime.now());
        utilisateurs.save(u);
        audit.enregistrerPar(email, "INSCRIPTION", "Nouveau compte joueur : " + email);
        return new AuthReponse(jwt.creer(u), UtilisateurVue.de(u));
    }

    @Transactional
    public AuthReponse connecter(LoginRequest req) {
        String email = req.email() == null ? "" : req.email().trim().toLowerCase();
        Utilisateur u = utilisateurs.findByEmailIgnoreCase(email).orElse(null);
        // Meme message dans les deux cas : on ne revele pas si l'email existe.
        if (u == null || req.motDePasse() == null || !motsDePasse.verifier(req.motDePasse(), u.getMotDePasseHash())) {
            audit.enregistrerPar(email.isEmpty() ? "anonyme" : email, "CONNEXION_ECHEC", "Email ou mot de passe incorrect");
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Email ou mot de passe incorrect.");
        }
        if (!u.isActif()) {
            audit.enregistrerPar(email, "CONNEXION_REFUSEE", "Compte bloqué");
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Ce compte est bloqué. Contactez un administrateur.");
        }
        u.setDerniereConnexion(LocalDateTime.now());
        utilisateurs.save(u);
        audit.enregistrerPar(email, "CONNEXION", "Connexion réussie (" + u.getRole() + ")");
        return new AuthReponse(jwt.creer(u), UtilisateurVue.de(u));
    }

    @Transactional(readOnly = true)
    public UtilisateurVue moi(Long id) {
        return UtilisateurVue.de(trouver(id));
    }

    // ---------- Gestion des comptes (admin) ----------

    @Transactional(readOnly = true)
    public java.util.List<UtilisateurVue> lister() {
        return utilisateurs.findAllByOrderByIdAsc().stream().map(UtilisateurVue::de).toList();
    }

    @Transactional
    public UtilisateurVue changerRole(Long id, Role role, Long acteurId) {
        Utilisateur u = trouver(id);
        if (u.getId().equals(acteurId)) throw new RegleMetierException("Vous ne pouvez pas modifier votre propre rôle.");
        if (u.getRole() == Role.ADMIN && role != Role.ADMIN && utilisateurs.countByRoleAndActifTrue(Role.ADMIN) <= 1) {
            throw new RegleMetierException("Il doit rester au moins un administrateur actif.");
        }
        Role ancien = u.getRole();
        u.setRole(role);
        utilisateurs.save(u);
        audit.enregistrer("ROLE_MODIFIE", u.getEmail() + " : " + ancien + " → " + role);
        return UtilisateurVue.de(u);
    }

    @Transactional
    public UtilisateurVue changerActif(Long id, boolean actif, Long acteurId) {
        Utilisateur u = trouver(id);
        if (!actif && u.getId().equals(acteurId)) throw new RegleMetierException("Vous ne pouvez pas bloquer votre propre compte.");
        if (!actif && u.getRole() == Role.ADMIN && u.isActif() && utilisateurs.countByRoleAndActifTrue(Role.ADMIN) <= 1) {
            throw new RegleMetierException("Il doit rester au moins un administrateur actif.");
        }
        u.setActif(actif);
        utilisateurs.save(u);
        audit.enregistrer(actif ? "COMPTE_DEBLOQUE" : "COMPTE_BLOQUE", u.getEmail());
        return UtilisateurVue.de(u);
    }

    /**
     * Un utilisateur change son propre mot de passe : l'ancien est obligatoire.
     * (Erreur 400 et non 401 si l'ancien est faux, pour ne pas deconnecter la personne.)
     */
    @Transactional
    public void changerMotDePasse(Long id, ChangerMotDePasseRequest req) {
        Utilisateur u = trouver(id);
        String ancien = req.ancienMotDePasse();
        String nouveau = req.nouveauMotDePasse();
        if (ancien == null || !motsDePasse.verifier(ancien, u.getMotDePasseHash())) {
            audit.enregistrerPar(u.getEmail(), "MOT_DE_PASSE_ECHEC", "Ancien mot de passe incorrect");
            throw new RegleMetierException("L'ancien mot de passe est incorrect.");
        }
        verifierMotDePasse(nouveau);
        if (nouveau.equals(ancien)) throw new RegleMetierException("Le nouveau mot de passe doit être différent de l'ancien.");
        u.setMotDePasseHash(motsDePasse.hasher(nouveau));
        utilisateurs.save(u);
        audit.enregistrerPar(u.getEmail(), "MOT_DE_PASSE_MODIFIE", "Mot de passe changé par le titulaire du compte");
    }

    // ---------- Demarrage ----------

    /** Cree le premier administrateur si aucun compte n'existe. */
    @Transactional
    public void creerAdminParDefaut(String email, String motDePasse) {
        if (utilisateurs.countByRole(Role.ADMIN) > 0) return;
        if (utilisateurs.existsByEmailIgnoreCase(email)) return;
        utilisateurs.save(nouveau("Administrateur", email, motDePasse, Role.ADMIN));
        audit.enregistrerPar("systeme", "ADMIN_CREE", "Compte administrateur initial : " + email);
    }

    // ---------- Interne ----------

    private Utilisateur nouveau(String nom, String email, String motDePasse, Role role) {
        Utilisateur u = new Utilisateur();
        u.setNom(nom);
        u.setEmail(email);
        u.setMotDePasseHash(motsDePasse.hasher(motDePasse));
        u.setRole(role);
        return u;
    }

    private Utilisateur trouver(Long id) {
        return utilisateurs.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Utilisateur introuvable."));
    }

    private void verifierMotDePasse(String mdp) {
        if (mdp == null || mdp.length() < 8) throw new RegleMetierException("Le mot de passe doit avoir au moins 8 caractères.");
        if (mdp.length() > 100) throw new RegleMetierException("Le mot de passe est trop long.");
    }
}
