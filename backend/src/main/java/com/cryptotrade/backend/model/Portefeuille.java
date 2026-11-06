package com.cryptotrade.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Le portefeuille virtuel d'un utilisateur : un solde en USDT + des positions. */
@Entity
@Table(name = "portefeuilles")
public class Portefeuille {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Un seul portefeuille par utilisateur. */
    @Column(nullable = false, unique = true)
    private Long utilisateurId;

    @Column(nullable = false, precision = 38, scale = 8)
    private BigDecimal soldeInitial;

    @Column(nullable = false, precision = 38, scale = 8)
    private BigDecimal soldeDisponible;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ModePortefeuille mode = ModePortefeuille.LIBRE;

    @Column(nullable = false)
    private LocalDateTime dateCreation = LocalDateTime.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getUtilisateurId() { return utilisateurId; }
    public void setUtilisateurId(Long utilisateurId) { this.utilisateurId = utilisateurId; }

    public BigDecimal getSoldeInitial() { return soldeInitial; }
    public void setSoldeInitial(BigDecimal soldeInitial) { this.soldeInitial = soldeInitial; }

    public BigDecimal getSoldeDisponible() { return soldeDisponible; }
    public void setSoldeDisponible(BigDecimal soldeDisponible) { this.soldeDisponible = soldeDisponible; }

    public ModePortefeuille getMode() { return mode; }
    public void setMode(ModePortefeuille mode) { this.mode = mode; }

    public LocalDateTime getDateCreation() { return dateCreation; }
    public void setDateCreation(LocalDateTime dateCreation) { this.dateCreation = dateCreation; }
}
