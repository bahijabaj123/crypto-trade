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

/**
 * Une position = ce que l'utilisateur detient sur une crypto.
 * OUVERTE tant qu'il en reste ; FERMEE quand tout a ete vendu (la ligne est conservee
 * pour l'affichage des "positions fermees" et le calcul du gain/perte realise).
 */
@Entity
@Table(name = "positions")
public class Position {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "portefeuille_id")
    private Portefeuille portefeuille;

    @Column(nullable = false, length = 20)
    private String symbole;

    /** Quantite actuellement detenue (0 quand la position est fermee). */
    @Column(nullable = false, precision = 38, scale = 8)
    private BigDecimal quantite;

    /** Cumul de tout ce qui a ete achete dans cette position (sert a l'affichage). */
    @Column(nullable = false, precision = 38, scale = 8)
    private BigDecimal quantiteTotaleAchetee;

    @Column(nullable = false, precision = 38, scale = 8)
    private BigDecimal prixMoyenAchat;

    /** Gain ou perte deja encaisse grace aux ventes. */
    @Column(nullable = false, precision = 38, scale = 8)
    private BigDecimal pnlRealise = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private StatutPosition statut = StatutPosition.OUVERTE;

    @Column(nullable = false)
    private LocalDateTime dateOuverture = LocalDateTime.now();

    private LocalDateTime dateFermeture;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Portefeuille getPortefeuille() { return portefeuille; }
    public void setPortefeuille(Portefeuille portefeuille) { this.portefeuille = portefeuille; }

    public String getSymbole() { return symbole; }
    public void setSymbole(String symbole) { this.symbole = symbole; }

    public BigDecimal getQuantite() { return quantite; }
    public void setQuantite(BigDecimal quantite) { this.quantite = quantite; }

    public BigDecimal getQuantiteTotaleAchetee() { return quantiteTotaleAchetee; }
    public void setQuantiteTotaleAchetee(BigDecimal quantiteTotaleAchetee) { this.quantiteTotaleAchetee = quantiteTotaleAchetee; }

    public BigDecimal getPrixMoyenAchat() { return prixMoyenAchat; }
    public void setPrixMoyenAchat(BigDecimal prixMoyenAchat) { this.prixMoyenAchat = prixMoyenAchat; }

    public BigDecimal getPnlRealise() { return pnlRealise; }
    public void setPnlRealise(BigDecimal pnlRealise) { this.pnlRealise = pnlRealise; }

    public StatutPosition getStatut() { return statut; }
    public void setStatut(StatutPosition statut) { this.statut = statut; }

    public LocalDateTime getDateOuverture() { return dateOuverture; }
    public void setDateOuverture(LocalDateTime dateOuverture) { this.dateOuverture = dateOuverture; }

    public LocalDateTime getDateFermeture() { return dateFermeture; }
    public void setDateFermeture(LocalDateTime dateFermeture) { this.dateFermeture = dateFermeture; }
}
