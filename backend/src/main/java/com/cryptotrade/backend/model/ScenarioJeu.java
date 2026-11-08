package com.cryptotrade.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Un scenario de la Salle de Marche (ex. "Le Krach du Covid-19").
 * Les actifs et les periodes a telecharger (requetes) sont stockes au format JSON dans un seul champ.
 */
@Entity
@Table(name = "scenarios_jeu")
public class ScenarioJeu {

    /** Identifiant lisible, ex. "covid-crypto" (sert aussi dans l'URL de la partie). */
    @Id
    @Column(length = 60)
    private String id;

    @Column(nullable = false, length = 150)
    private String nom;

    @Column(nullable = false, length = 1000)
    private String description;

    @Column(nullable = false, length = 30)
    private String difficulte;

    @Column(nullable = false, length = 20)
    private String icone;

    /** Classes Tailwind du degrade, ex. "from-orange-500 to-red-500". */
    @Column(nullable = false, length = 80)
    private String couleur;

    @Column(nullable = false, length = 40)
    private String marche;

    /** Un scenario inactif n'apparait plus dans le jeu, mais reste en base. */
    @Column(nullable = false)
    private boolean actif = true;

    /** Position dans la liste (plus petit = plus haut). */
    @Column(nullable = false)
    private int ordre;

    @Column(nullable = false, length = 4000)
    private String requetesJson;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getNom() { return nom; }
    public void setNom(String nom) { this.nom = nom; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getDifficulte() { return difficulte; }
    public void setDifficulte(String difficulte) { this.difficulte = difficulte; }
    public String getIcone() { return icone; }
    public void setIcone(String icone) { this.icone = icone; }
    public String getCouleur() { return couleur; }
    public void setCouleur(String couleur) { this.couleur = couleur; }
    public String getMarche() { return marche; }
    public void setMarche(String marche) { this.marche = marche; }
    public boolean isActif() { return actif; }
    public void setActif(boolean actif) { this.actif = actif; }
    public int getOrdre() { return ordre; }
    public void setOrdre(int ordre) { this.ordre = ordre; }
    public String getRequetesJson() { return requetesJson; }
    public void setRequetesJson(String requetesJson) { this.requetesJson = requetesJson; }
}
