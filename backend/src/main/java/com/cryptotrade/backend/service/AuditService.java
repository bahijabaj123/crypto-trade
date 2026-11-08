package com.cryptotrade.backend.service;

import com.cryptotrade.backend.dto.JournalVue;
import com.cryptotrade.backend.model.JournalAudit;
import com.cryptotrade.backend.repository.JournalAuditRepository;
import com.cryptotrade.backend.security.AuthContext;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** Tracabilite : enregistre les operations importantes (qui, quoi, quand). */
@Service
public class AuditService {

    private final JournalAuditRepository repository;

    public AuditService(JournalAuditRepository repository) {
        this.repository = repository;
    }

    /** Enregistre une action faite par la personne connectee. */
    public void enregistrer(String action, String details) {
        enregistrerPar(AuthContext.emailCourant(), action, details);
    }

    public void enregistrerPar(String acteur, String action, String details) {
        JournalAudit ligne = new JournalAudit();
        ligne.setActeur(coupe(acteur, 120));
        ligne.setAction(coupe(action, 40));
        ligne.setDetails(coupe(details, 500));
        repository.save(ligne);
    }

    @Transactional(readOnly = true)
    public List<JournalVue> derniers(int limite) {
        int taille = Math.max(1, Math.min(limite, 500));
        return repository.findAllByOrderByDateDescIdDesc(PageRequest.of(0, taille)).stream()
                .map(j -> new JournalVue(j.getId(), j.getDate(), j.getActeur(), j.getAction(), j.getDetails()))
                .toList();
    }

    private static String coupe(String texte, int max) {
        if (texte == null) return "";
        return texte.length() <= max ? texte : texte.substring(0, max);
    }
}
