package com.cryptotrade.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Photo de la valeur totale du portefeuille a un instant donne (pour le graphique). */
@Entity
@Table(name = "snapshots_valeur")
public class SnapshotValeur {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long portefeuilleId;

    @Column(nullable = false)
    private LocalDateTime date = LocalDateTime.now();

    @Column(nullable = false, precision = 38, scale = 8)
    private BigDecimal valeurTotale;

    public Long getId() { return id; }
    public Long getPortefeuilleId() { return portefeuilleId; }
    public void setPortefeuilleId(Long portefeuilleId) { this.portefeuilleId = portefeuilleId; }
    public LocalDateTime getDate() { return date; }
    public void setDate(LocalDateTime date) { this.date = date; }
    public BigDecimal getValeurTotale() { return valeurTotale; }
    public void setValeurTotale(BigDecimal valeurTotale) { this.valeurTotale = valeurTotale; }
}
