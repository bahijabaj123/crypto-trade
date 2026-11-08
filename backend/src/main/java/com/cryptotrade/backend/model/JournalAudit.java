package com.cryptotrade.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/** Une ligne du journal : qui a fait quoi et quand (tracabilite des operations importantes). */
@Entity
@Table(name = "journal_audit")
public class JournalAudit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private LocalDateTime date = LocalDateTime.now();

    /** Email de la personne (ou "systeme"). */
    @Column(nullable = false, length = 120)
    private String acteur;

    /** Ex. CONNEXION, SCENARIO_CREE, ROLE_MODIFIE... */
    @Column(nullable = false, length = 40)
    private String action;

    @Column(nullable = false, length = 500)
    private String details;

    public Long getId() { return id; }
    public LocalDateTime getDate() { return date; }
    public String getActeur() { return acteur; }
    public void setActeur(String acteur) { this.acteur = acteur; }
    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }
    public String getDetails() { return details; }
    public void setDetails(String details) { this.details = details; }
}
