package com.cryptotrade.backend.security;

import org.springframework.stereotype.Service;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Empreinte des mots de passe avec PBKDF2 (fourni par Java, aucune librairie a ajouter).
 * Format stocke : iterations:sel:empreinte (sel et empreinte en Base64).
 */
@Service
public class MotDePasseService {

    private static final int ITERATIONS = 120_000;
    private static final int LONGUEUR_BITS = 256;
    private final SecureRandom hasard = new SecureRandom();

    public String hasher(String motDePasse) {
        byte[] sel = new byte[16];
        hasard.nextBytes(sel);
        byte[] hash = calculer(motDePasse, sel, ITERATIONS);
        Base64.Encoder b64 = Base64.getEncoder();
        return ITERATIONS + ":" + b64.encodeToString(sel) + ":" + b64.encodeToString(hash);
    }

    public boolean verifier(String motDePasse, String stocke) {
        try {
            String[] p = stocke.split(":");
            int iterations = Integer.parseInt(p[0]);
            byte[] sel = Base64.getDecoder().decode(p[1]);
            byte[] attendu = Base64.getDecoder().decode(p[2]);
            return MessageDigest.isEqual(attendu, calculer(motDePasse, sel, iterations));
        } catch (RuntimeException e) {
            return false;
        }
    }

    private byte[] calculer(String motDePasse, byte[] sel, int iterations) {
        try {
            PBEKeySpec spec = new PBEKeySpec(motDePasse.toCharArray(), sel, iterations, LONGUEUR_BITS);
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("PBKDF2 indisponible", e);
        }
    }
}
