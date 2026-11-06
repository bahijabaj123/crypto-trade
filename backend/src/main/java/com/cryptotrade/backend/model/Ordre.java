package com.cryptotrade.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Un ordre d'achat ou de vente passe par l'utilisateur. */
@Entity
@Table(name = "ordres")
public class Ordre {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "portefeuille_id")
    private Portefeuille portefeuille;

    @Column(nullable = false, length = 20)
    private String symbole;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private SensOrdre sens;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TypeOrdre type;

    @Column(nullable = false, precision = 38, scale = 8)
    private BigDecimal quantite;

    /** Seuil de l'ordre : prix limite (LIMIT) ou prix de declenchement (STOP_LOSS / TAKE_PROFIT). Vide pour MARKET. */
    @Column(precision = 38, scale = 8)
    private BigDecimal prixDeclenchement;

    @Column(precision = 38, scale = 8)
    private BigDecimal prixExecution;

    @Column(precision = 38, scale = 8)
    private BigDecimal montant;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private StatutOrdre statut;

    /** Pourquoi l'ordre a ete rejete (solde ou quantite devenus insuffisants a l'execution). */
    @Column(length = 255)
    private String motif;

    @Column(nullable = false)
    private LocalDateTime dateCreation = LocalDateTime.now();

    private LocalDateTime dateExecution;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Portefeuille getPortefeuille() { return portefeuille; }
    public void setPortefeuille(Portefeuille portefeuille) { this.portefeuille = portefeuille; }

    public String getSymbole() { return symbole; }
    public void setSymbole(String symbole) { this.symbole = symbole; }

    public SensOrdre getSens() { return sens; }
    public void setSens(SensOrdre sens) { this.sens = sens; }

    public TypeOrdre getType() { return type; }
    public void setType(TypeOrdre type) { this.type = type; }

    public BigDecimal getQuantite() { return quantite; }
    public void setQuantite(BigDecimal quantite) { this.quantite = quantite; }

    public BigDecimal getPrixDeclenchement() { return prixDeclenchement; }
    public void setPrixDeclenchement(BigDecimal prixDeclenchement) { this.prixDeclenchement = prixDeclenchement; }

    public BigDecimal getPrixExecution() { return prixExecution; }
    public void setPrixExecution(BigDecimal prixExecution) { this.prixExecution = prixExecution; }

    public BigDecimal getMontant() { return montant; }
    public void setMontant(BigDecimal montant) { this.montant = montant; }

    public StatutOrdre getStatut() { return statut; }
    public void setStatut(StatutOrdre statut) { this.statut = statut; }

    public LocalDateTime getDateCreation() { return dateCreation; }
    public void setDateCreation(LocalDateTime dateCreation) { this.dateCreation = dateCreation; }

    public String getMotif() { return motif; }
    public void setMotif(String motif) { this.motif = motif; }

    public LocalDateTime getDateExecution() { return dateExecution; }
    public void setDateExecution(LocalDateTime dateExecution) { this.dateExecution = dateExecution; }
}
