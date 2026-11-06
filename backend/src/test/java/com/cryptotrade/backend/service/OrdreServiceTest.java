package com.cryptotrade.backend.service;

import com.cryptotrade.backend.dto.OrdreRequest;
import com.cryptotrade.backend.dto.OrdreVue;
import com.cryptotrade.backend.dto.PortefeuilleVue;
import com.cryptotrade.backend.dto.ResultatOrdre;
import com.cryptotrade.backend.dto.PositionVue;
import com.cryptotrade.backend.exception.RegleMetierException;
import com.cryptotrade.backend.model.SensOrdre;
import com.cryptotrade.backend.model.StatutOrdre;
import com.cryptotrade.backend.model.StatutPosition;
import com.cryptotrade.backend.model.TypeOrdre;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

/** Chaque test est annule a la fin (@Transactional) : ils sont independants. Binance est simule. */
// Les tests de logique d'ordres achetent jusqu'a 50 % du capital : on desactive le plafond d'exposition ici.
// Le plafond est teste a part, dans RisqueServiceTest.
@SpringBootTest(properties = {"app.moteur.actif=false", "app.risque.exposition-max-pct=100"})
@Transactional
class OrdreServiceTest {

    private static final Long UTILISATEUR = 1L;

    @Autowired
    private OrdreService ordreService;

    @Autowired
    private PortefeuilleService portefeuilleService;

    @MockBean
    private BinanceService binance;

    private void prixBtc(String prix) {
        when(binance.getPrix("BTCUSDT")).thenReturn(new BigDecimal(prix));
    }

    private void ordre(SensOrdre sens, String quantite) {
        ordreService.passerOrdre(UTILISATEUR,
                new OrdreRequest("BTCUSDT", sens, TypeOrdre.MARKET, new BigDecimal(quantite), null));
    }

    private static void assertMontant(String attendu, BigDecimal reel) {
        assertEquals(0, new BigDecimal(attendu).compareTo(reel),
                "attendu " + attendu + " mais obtenu " + reel);
    }

    @Test
    void achatDebiteLeSoldeEtOuvreUnePosition() {
        prixBtc("50000");
        ordre(SensOrdre.ACHAT, "0.5");

        PortefeuilleVue vue = portefeuilleService.vue(UTILISATEUR);
        assertMontant("75000", vue.soldeDisponible());
        assertEquals(1, vue.positionsOuvertes().size());
        assertMontant("0.5", vue.positionsOuvertes().get(0).quantite());
        assertMontant("50000", vue.positionsOuvertes().get(0).prixMoyenAchat());
        assertMontant("100000", vue.valeurTotale());
    }

    @Test
    void deuxAchatsCalculentLePrixMoyen() {
        prixBtc("50000");
        ordre(SensOrdre.ACHAT, "0.5");   // 25 000 USDT
        prixBtc("60000");
        ordre(SensOrdre.ACHAT, "0.5");   // 30 000 USDT

        PositionVue position = portefeuilleService.vue(UTILISATEUR).positionsOuvertes().get(0);
        assertMontant("1", position.quantite());
        assertMontant("55000", position.prixMoyenAchat());   // (25 000 + 30 000) / 1
    }

    @Test
    void venteTotaleFermeLaPositionEtRealiseLeGain() {
        prixBtc("50000");
        ordre(SensOrdre.ACHAT, "1");
        prixBtc("60000");
        ordre(SensOrdre.VENTE, "1");

        PortefeuilleVue vue = portefeuilleService.vue(UTILISATEUR);
        assertMontant("110000", vue.soldeDisponible());
        assertMontant("10000", vue.pnlTotal());
        assertEquals(0, vue.positionsOuvertes().size());
        assertEquals(1, vue.positionsFermees().size());
        assertEquals(StatutPosition.FERMEE, vue.positionsFermees().get(0).statut());
        assertMontant("10000", vue.positionsFermees().get(0).pnlRealise());
    }

    @Test
    void ventePartielleGardeLaPositionOuverte() {
        prixBtc("50000");
        ordre(SensOrdre.ACHAT, "1");
        prixBtc("40000");
        ordre(SensOrdre.VENTE, "0.4");

        PortefeuilleVue vue = portefeuilleService.vue(UTILISATEUR);
        assertEquals(1, vue.positionsOuvertes().size());
        assertMontant("0.6", vue.positionsOuvertes().get(0).quantite());
        assertMontant("-4000", vue.positionsOuvertes().get(0).pnlRealise());
    }

    @Test
    void soldeInsuffisantRefuseLAchat() {
        prixBtc("50000");
        assertThrows(RegleMetierException.class, () -> ordre(SensOrdre.ACHAT, "3"));
    }

    @Test
    void venteSansPositionEstRefusee() {
        prixBtc("50000");
        assertThrows(RegleMetierException.class, () -> ordre(SensOrdre.VENTE, "1"));
    }

    @Test
    void venteDeTropEstRefusee() {
        prixBtc("50000");
        ordre(SensOrdre.ACHAT, "1");
        assertThrows(RegleMetierException.class, () -> ordre(SensOrdre.VENTE, "2"));
    }

    // ---------- ordres en attente ----------

    private ResultatOrdre enAttente(TypeOrdre type, SensOrdre sens, String quantite, String seuil) {
        return ordreService.passerOrdre(UTILISATEUR,
                new OrdreRequest("BTCUSDT", sens, type, new BigDecimal(quantite), new BigDecimal(seuil)));
    }

    @Test
    void ordreLimitAchatAttendQueLePrixDescende() {
        prixBtc("50000");
        ResultatOrdre r = enAttente(TypeOrdre.LIMIT, SensOrdre.ACHAT, "1", "45000");
        assertEquals(StatutOrdre.EN_ATTENTE, r.ordre().statut());
        assertMontant("100000", portefeuilleService.vue(UTILISATEUR).soldeDisponible()); // rien debite

        prixBtc("48000");
        assertEquals(0, ordreService.traiterOrdresEnAttente());   // pas encore

        prixBtc("44000");
        assertEquals(1, ordreService.traiterOrdresEnAttente());   // seuil atteint
        PortefeuilleVue vue = portefeuilleService.vue(UTILISATEUR);
        assertMontant("56000", vue.soldeDisponible());             // execute au prix du marche 44 000
        assertMontant("44000", vue.positionsOuvertes().get(0).prixMoyenAchat());
    }

    @Test
    void ordreLimitDejaAtteintEstExecuteImmediatement() {
        prixBtc("50000");
        ResultatOrdre r = enAttente(TypeOrdre.LIMIT, SensOrdre.ACHAT, "1", "52000");
        assertEquals(StatutOrdre.EXECUTE, r.ordre().statut());
    }

    @Test
    void stopLossVendQuandLePrixChute() {
        prixBtc("50000");
        ordre(SensOrdre.ACHAT, "1");
        enAttente(TypeOrdre.STOP_LOSS, SensOrdre.VENTE, "1", "45000");

        prixBtc("47000");
        assertEquals(0, ordreService.traiterOrdresEnAttente());
        prixBtc("44500");
        assertEquals(1, ordreService.traiterOrdresEnAttente());

        PortefeuilleVue vue = portefeuilleService.vue(UTILISATEUR);
        assertEquals(0, vue.positionsOuvertes().size());
        assertMontant("-5500", vue.positionsFermees().get(0).pnlRealise());   // (44 500 - 50 000) x 1
    }

    @Test
    void takeProfitVendQuandLePrixMonte() {
        prixBtc("50000");
        ordre(SensOrdre.ACHAT, "1");
        enAttente(TypeOrdre.TAKE_PROFIT, SensOrdre.VENTE, "1", "55000");

        prixBtc("54000");
        assertEquals(0, ordreService.traiterOrdresEnAttente());
        prixBtc("56000");
        assertEquals(1, ordreService.traiterOrdresEnAttente());
        assertMontant("6000", portefeuilleService.vue(UTILISATEUR).positionsFermees().get(0).pnlRealise());
    }

    @Test
    void stopLossAuDessusDuPrixEstRefuse() {
        prixBtc("50000");
        ordre(SensOrdre.ACHAT, "1");
        assertThrows(RegleMetierException.class,
                () -> enAttente(TypeOrdre.STOP_LOSS, SensOrdre.VENTE, "1", "51000"));
    }

    @Test
    void takeProfitSousLePrixEstRefuse() {
        prixBtc("50000");
        ordre(SensOrdre.ACHAT, "1");
        assertThrows(RegleMetierException.class,
                () -> enAttente(TypeOrdre.TAKE_PROFIT, SensOrdre.VENTE, "1", "49000"));
    }

    @Test
    void stopLossSansPositionEstRefuse() {
        prixBtc("50000");
        assertThrows(RegleMetierException.class,
                () -> enAttente(TypeOrdre.STOP_LOSS, SensOrdre.VENTE, "1", "45000"));
    }

    @Test
    void prixDeclenchementObligatoire() {
        prixBtc("50000");
        assertThrows(RegleMetierException.class, () ->
                ordreService.passerOrdre(UTILISATEUR,
                        new OrdreRequest("BTCUSDT", SensOrdre.ACHAT, TypeOrdre.LIMIT, new BigDecimal("1"), null)));
    }

    @Test
    void annulerUnOrdreEnAttente() {
        prixBtc("50000");
        Long id = enAttente(TypeOrdre.LIMIT, SensOrdre.ACHAT, "1", "45000").ordre().id();
        assertEquals(StatutOrdre.ANNULE, ordreService.annuler(UTILISATEUR, id).statut());

        prixBtc("40000");
        assertEquals(0, ordreService.traiterOrdresEnAttente());   // annule : ne s'execute plus
        assertThrows(RegleMetierException.class, () -> ordreService.annuler(UTILISATEUR, id));  // deja annule
    }

    @Test
    void ordreDevenuImpossibleEstRejete() {
        prixBtc("50000");
        ordre(SensOrdre.ACHAT, "1");
        // deux ventes en attente sur la meme quantite : la 2e ne pourra pas s'executer
        enAttente(TypeOrdre.TAKE_PROFIT, SensOrdre.VENTE, "1", "55000");
        Long id2 = enAttente(TypeOrdre.TAKE_PROFIT, SensOrdre.VENTE, "1", "56000").ordre().id();

        prixBtc("57000");
        assertEquals(1, ordreService.traiterOrdresEnAttente());
        OrdreVue deuxieme = ordreService.liste(UTILISATEUR).stream()
                .filter(o -> o.id().equals(id2)).findFirst().orElseThrow();
        assertEquals(StatutOrdre.REJETE, deuxieme.statut());
        assertEquals("Vous n'avez aucune position ouverte sur BTCUSDT.", deuxieme.motif());
    }
}
