package com.cryptotrade.backend.service;

import com.cryptotrade.backend.dto.InvitationDtos.InvitationReponse;
import com.cryptotrade.backend.dto.InvitationDtos.InvitationRequest;
import com.cryptotrade.backend.exception.RegleMetierException;
import com.cryptotrade.backend.model.Utilisateur;
import com.cryptotrade.backend.repository.UtilisateurRepository;
import com.cryptotrade.backend.security.Acteur;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Envoie par email (SMTP) une invitation a rejoindre une salle de jeu.
 *
 * Garde-fous : il faut etre connecte, l'adresse et le code sont verifies, le lien est fabrique ICI
 * (jamais pris dans la requete, pour qu'on ne puisse pas s'en servir pour envoyer des liens pieges),
 * et chaque joueur est limite a quelques invitations par heure.
 */
@Service
public class InvitationService {

    private static final Logger LOG = LoggerFactory.getLogger(InvitationService.class);
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final Pattern CODE = Pattern.compile("^[A-Z0-9-]{3,20}$");
    private static final int MAX_PAR_HEURE = 10;
    private static final long UNE_HEURE_MS = 3_600_000L;

    private final ObjectProvider<JavaMailSender> expediteur;
    private final UtilisateurRepository utilisateurs;
    private final AuditService audit;

    private final boolean actif;
    private final String adresseExpediteur;
    private final String urlFrontend;

    /** Horodatage des envois recents, par joueur. */
    private final Map<Long, Deque<Long>> envois = new ConcurrentHashMap<>();

    public InvitationService(ObjectProvider<JavaMailSender> expediteur,
                             UtilisateurRepository utilisateurs,
                             AuditService audit,
                             @Value("${app.mail.actif:false}") boolean actif,
                             @Value("${app.mail.expediteur:no-reply@cryptotrade.local}") String adresseExpediteur,
                             @Value("${app.frontend-url:http://localhost:4200}") String urlFrontend) {
        this.expediteur = expediteur;
        this.utilisateurs = utilisateurs;
        this.audit = audit;
        this.actif = actif;
        this.adresseExpediteur = adresseExpediteur;
        this.urlFrontend = urlFrontend.endsWith("/") ? urlFrontend.substring(0, urlFrontend.length() - 1) : urlFrontend;
    }

    public InvitationReponse inviter(Acteur acteur, InvitationRequest req) {
        if (acteur == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Connectez-vous pour envoyer une invitation par email.");

        String email = req.email() == null ? "" : req.email().trim().toLowerCase();
        String code = req.code() == null ? "" : req.code().trim().toUpperCase();
        if (!EMAIL.matcher(email).matches() || email.length() > 120) throw new RegleMetierException("Adresse email invalide.");
        if (!CODE.matcher(code).matches()) throw new RegleMetierException("Code de salle invalide.");

        JavaMailSender envoi = expediteur.getIfAvailable();
        if (!actif || envoi == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "L'envoi d'emails n'est pas configuré sur ce serveur (voir mail-local.properties).");
        }

        verifierLimite(acteur.id());

        String nom = utilisateurs.findById(acteur.id()).map(Utilisateur::getNom).orElse("Un joueur");
        String hote = nettoyer(req.hote(), 40);
        if (hote.isEmpty()) hote = nom;
        String scenario = nettoyer(req.scenario(), 80);

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(adresseExpediteur);
        message.setTo(email);
        message.setSubject("Invitation : rejoins ma salle de trading CryptoTrade");
        message.setText(
                "Bonjour,\n\n"
                + hote + " vous invite à rejoindre une salle de la Salle de Marché CryptoTrade"
                + (scenario.isEmpty() ? "" : " (scénario : " + scenario + ")") + ".\n\n"
                + "Code de la salle : " + code + "\n"
                + "Lien direct : " + urlFrontend + "/game?salle=" + code + "\n\n"
                + "Cliquez sur le lien, choisissez un pseudo et rejoignez la partie.\n\n"
                + "Cette invitation a été envoyée par " + nom + " depuis CryptoTrade.");

        try {
            envoi.send(message);
        } catch (MailException e) {
            LOG.warn("Echec d'envoi de l'invitation : {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "L'envoi a échoué. Vérifiez la configuration SMTP du serveur.");
        }

        audit.enregistrerPar(acteur.email(), "INVITATION_ENVOYEE", "Salle " + code + " -> " + email);
        return new InvitationReponse("Invitation envoyée à " + email + ".");
    }

    // ---------- Interne ----------

    private void verifierLimite(Long joueur) {
        long maintenant = System.currentTimeMillis();
        Deque<Long> recents = envois.computeIfAbsent(joueur, k -> new ArrayDeque<>());
        synchronized (recents) {
            while (!recents.isEmpty() && maintenant - recents.peekFirst() > UNE_HEURE_MS) recents.pollFirst();
            if (recents.size() >= MAX_PAR_HEURE) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                        "Trop d'invitations envoyées : réessayez dans une heure.");
            }
            recents.addLast(maintenant);
        }
    }

    /** Texte libre venant du navigateur : sans retours a la ligne ni caracteres de controle, longueur limitee. */
    private static String nettoyer(String texte, int max) {
        if (texte == null) return "";
        String propre = texte.replaceAll("\\p{Cntrl}", " ").trim();
        return propre.length() > max ? propre.substring(0, max) : propre;
    }
}
