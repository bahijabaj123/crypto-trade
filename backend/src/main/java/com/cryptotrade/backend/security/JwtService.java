package com.cryptotrade.backend.security;

import com.cryptotrade.backend.model.Role;
import com.cryptotrade.backend.model.Utilisateur;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;

/**
 * Jeton JWT (HS256) fabrique a la main avec les outils de Java : aucune dependance a ajouter.
 * Un jeton = entete.contenu.signature. Le contenu dit qui est la personne et jusqu'a quand le jeton est valable ;
 * la signature prouve qu'il a ete cree par ce serveur (et pas modifie).
 */
@Service
public class JwtService {

    private static final Base64.Encoder ENCODEUR = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DECODEUR = Base64.getUrlDecoder();

    private final ObjectMapper json;
    private final byte[] secret;
    private final long dureeSecondes;

    public JwtService(ObjectMapper json,
                      @Value("${app.security.jwt-secret:cryptotrade-secret-de-developpement-a-changer-en-production}") String secret,
                      @Value("${app.security.jwt-duree-heures:8}") long dureeHeures) {
        this.json = json;
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
        this.dureeSecondes = dureeHeures * 3600;
    }

    public String creer(Utilisateur u) {
        try {
            String entete = ENCODEUR.encodeToString("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
            Map<String, Object> contenu = Map.of(
                    "sub", String.valueOf(u.getId()),
                    "email", u.getEmail(),
                    "role", u.getRole().name(),
                    "exp", Instant.now().getEpochSecond() + dureeSecondes);
            String corps = ENCODEUR.encodeToString(json.writeValueAsBytes(contenu));
            return entete + "." + corps + "." + signer(entete + "." + corps);
        } catch (Exception e) {
            throw new IllegalStateException("Impossible de creer le jeton", e);
        }
    }

    /** Renvoie la personne si le jeton est authentique et non expire, sinon rien. */
    public Optional<Acteur> lire(String jeton) {
        try {
            String[] parties = jeton.split("\\.");
            if (parties.length != 3) return Optional.empty();
            byte[] attendue = DECODEUR.decode(signer(parties[0] + "." + parties[1]));
            byte[] recue = DECODEUR.decode(parties[2]);
            if (!MessageDigest.isEqual(attendue, recue)) return Optional.empty();

            Map<String, Object> contenu = json.readValue(DECODEUR.decode(parties[1]), new TypeReference<Map<String, Object>>() { });
            long exp = ((Number) contenu.get("exp")).longValue();
            if (Instant.now().getEpochSecond() >= exp) return Optional.empty();
            return Optional.of(new Acteur(Long.valueOf((String) contenu.get("sub")),
                    (String) contenu.get("email"), Role.valueOf((String) contenu.get("role"))));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    private String signer(String texte) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret, "HmacSHA256"));
        return ENCODEUR.encodeToString(mac.doFinal(texte.getBytes(StandardCharsets.UTF_8)));
    }
}
