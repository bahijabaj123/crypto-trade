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

/** Trace de l'execution d'un ordre : c'est elle qu'on affiche dans l'historique. */
@Entity
@Table(name = "transactions")
public class Transaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "portefeuille_id")
    private Portefeuille portefeuille;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ordre_id")
    private Ordre ordre;

    @Column(nullable = false, length = 20)
    private String symbole;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private SensOrdre sens;

    @Column(nullable = false, precision = 38, scale = 8)
    private BigDecimal quantite;

    @Column(nullable = false, precision = 38, scale = 8)
    private BigDecimal prix;

    @Column(nullable = false, precision = 38, scale = 8)
    private BigDecimal montant;

    @Column(name = "date_transaction", nullable = false)
    private LocalDateTime date = LocalDateTime.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Portefeuille getPortefeuille() { return portefeuille; }
    public void setPortefeuille(Portefeuille portefeuille) { this.portefeuille = portefeuille; }

    public Ordre getOrdre() { return ordre; }
    public void setOrdre(Ordre ordre) { this.ordre = ordre; }

    public String getSymbole() { return symbole; }
    public void setSymbole(String symbole) { this.symbole = symbole; }

    public SensOrdre getSens() { return sens; }
    public void setSens(SensOrdre sens) { this.sens = sens; }

    public BigDecimal getQuantite() { return quantite; }
    public void setQuantite(BigDecimal quantite) { this.quantite = quantite; }

    public BigDecimal getPrix() { return prix; }
    public void setPrix(BigDecimal prix) { this.prix = prix; }

    public BigDecimal getMontant() { return montant; }
    public void setMontant(BigDecimal montant) { this.montant = montant; }

    public LocalDateTime getDate() { return date; }
    public void setDate(LocalDateTime date) { this.date = date; }
}
