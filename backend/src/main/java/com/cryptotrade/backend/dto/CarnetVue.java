package com.cryptotrade.backend.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Carnet d'ordres du MARCHE (Binance) : les acheteurs (bids) et les vendeurs (asks) du moment.
 * Les asks sont tries du moins cher au plus cher, les bids du plus cher au moins cher.
 */
public record CarnetVue(
        String symbole,
        List<Niveau> achats,          // acheteurs : ce qu'ils proposent de payer
        List<Niveau> ventes,          // vendeurs : ce qu'ils demandent
        BigDecimal meilleurAchat,     // le plus haut prix qu'un acheteur propose
        BigDecimal meilleurVente,     // le plus bas prix qu'un vendeur demande
        BigDecimal ecart,             // spread = meilleurVente - meilleurAchat
        BigDecimal ecartPct,
        BigDecimal prixMilieu,
        BigDecimal volumeAchats,      // total des quantites cote acheteurs
        BigDecimal volumeVentes,      // total des quantites cote vendeurs
        BigDecimal pressionAchatPct) { // part des acheteurs dans le volume total (>50 % : plus d'acheteurs)

    /** Une ligne du carnet : un prix, la quantite proposee a ce prix, et le cumul depuis le meilleur prix. */
    public record Niveau(BigDecimal prix, BigDecimal quantite, BigDecimal cumul) {
    }
}
