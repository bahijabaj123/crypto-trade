package com.cryptotrade.backend.service;

import com.cryptotrade.backend.dto.AnalyseRisque;
import com.cryptotrade.backend.dto.ApercuRisque;
import com.cryptotrade.backend.dto.OrdreRequest;
import com.cryptotrade.backend.dto.ProjectionRisque;
import com.cryptotrade.backend.dto.ScenarioChoc;
import com.cryptotrade.backend.exception.RegleMetierException;
import com.cryptotrade.backend.model.SensOrdre;
import com.cryptotrade.backend.model.TypeOrdre;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/** Plafond d'exposition 40 %, alerte 25 % (valeurs par defaut). Binance est simule. */
@SpringBootTest(properties = "app.moteur.actif=false")
@Transactional
class RisqueServiceTest {

    private static final Long UTILISATEUR = 1L;

    @Autowired
    private OrdreService ordreService;
    @Autowired
    private RisqueService risqueService;
    @Autowired
    private PortefeuilleService portefeuilleService;

    @MockBean
    private BinanceService binance;

    private void prix(String symbole, String valeur) {
        when(binance.getPrix(symbole)).thenReturn(new BigDecimal(valeur));
    }

    private void acheter(String symbole, String quantite) {
        ordreService.passerOrdre(UTILISATEUR,
                new OrdreRequest(symbole, SensOrdre.ACHAT, TypeOrdre.MARKET, new BigDecimal(quantite), null));
    }

    /** 91 cloture : le cours monte de 1 % puis baisse de 1 % en alternance (volatilite connue et stable). */
    private void historique(String symbole, double depart) {
        List<Double> serie = new ArrayList<>();
        double c = depart;
        for (int i = 0; i <= 90; i++) {
            serie.add(c);
            c = c * (i % 2 == 0 ? 1.01 : 0.99);
        }
        when(binance.getCloturesJournalieres(eq(symbole), anyInt())).thenReturn(serie);
    }

    @Test
    void achatQuiDepasseLePlafondEstRefuse() {
        prix("BTCUSDT", "50000");
        // 1 BTC = 50 000 USDT = 50 % du portefeuille (100 000) > 40 %
        RegleMetierException e = assertThrows(RegleMetierException.class, () -> acheter("BTCUSDT", "1"));
        assertTrue(e.getMessage().contains("Refus"), e.getMessage());
        assertEquals(0, new BigDecimal("100000").compareTo(portefeuilleService.vue(UTILISATEUR).soldeDisponible()));
    }

    @Test
    void achatSousLePlafondEstAccepte() {
        prix("BTCUSDT", "50000");
        acheter("BTCUSDT", "0.7"); // 35 %
        assertEquals(1, portefeuilleService.vue(UTILISATEUR).positionsOuvertes().size());
    }

    @Test
    void apercuIndiqueExpositionApresOrdreEtQuantiteMax() {
        prix("BTCUSDT", "50000");
        var p = portefeuilleService.getOrCreate(UTILISATEUR);
        ApercuRisque a = risqueService.apercu(p, "BTCUSDT", SensOrdre.ACHAT, new BigDecimal("0.6"), new BigDecimal("50000"));
        assertEquals("ATTENTION", a.niveau());           // 30 % : au-dessus de l'alerte (25 %)
        assertTrue(a.autorise());
        assertEquals(30.0, a.expositionApresPct(), 0.01);
        assertEquals(0.8, a.quantiteMax(), 0.0001);       // 40 % de 100 000 / 50 000

        ApercuRisque b = risqueService.apercu(p, "BTCUSDT", SensOrdre.ACHAT, new BigDecimal("0.2"), new BigDecimal("50000"));
        assertEquals("OK", b.niveau());                    // 10 %
    }

    @Test
    void apercuCalculeLImpactSurLaVar() {
        prix("BTCUSDT", "50000");
        historique("BTCUSDT", 50000);
        var p = portefeuilleService.getOrCreate(UTILISATEUR);
        ApercuRisque a = risqueService.apercu(p, "BTCUSDT", SensOrdre.ACHAT, new BigDecimal("0.5"), new BigDecimal("50000"));
        assertNotNull(a.var95UsdtApres());
        assertEquals(0.0, a.var95UsdtAvant(), 0.001);      // 100 % cash : pas de risque
        // 25 % du portefeuille avec des variations de 1 % par jour -> VaR = 0,25 x 1 % x 100 000 = 250
        assertEquals(250.0, a.var95UsdtApres(), 3.0);
    }

    @Test
    void analyseDuPortefeuille() {
        prix("BTCUSDT", "50000");
        prix("ETHUSDT", "2500");
        historique("BTCUSDT", 50000);
        historique("ETHUSDT", 2500);
        acheter("BTCUSDT", "0.5");   // 25 000
        acheter("ETHUSDT", "10");    // 25 000

        AnalyseRisque r = risqueService.analyser(portefeuilleService.getOrCreate(UTILISATEUR));
        assertEquals(50.0, r.investiPct(), 0.01);
        assertEquals(5000.0, r.hhi(), 0.01);                // 2 actifs a 50/50 : 0,5^2 + 0,5^2 = 0,5
        assertEquals("FAIBLE", r.diversification());
        assertEquals(25.0, r.expositionMaxPct(), 0.01);
        assertEquals(2, r.expositions().size());
        assertNotNull(r.volatiliteAnnuellePct());
        // 50 % investi, +-1 % / jour : ecart-type ~ 0,5 % ; annuel ~ 0,5 x racine(365) ~ 9,6 %
        assertEquals(9.6, r.volatiliteAnnuellePct(), 0.6);
        assertTrue(r.var95Pct() > 0);
        assertNotNull(r.scoreRisque());
        assertFalse(r.explications().isEmpty());
    }

    @Test
    void sansHistoriqueLesIndicateursDeMarcheSontIndisponiblesMaisPasLExposition() {
        prix("BTCUSDT", "50000");
        acheter("BTCUSDT", "0.5");
        AnalyseRisque r = risqueService.analyser(portefeuilleService.getOrCreate(UTILISATEUR));
        assertEquals(null, r.volatiliteAnnuellePct());
        assertEquals("INDISPONIBLE", r.niveauRisque());
        assertEquals(25.0, r.expositionMaxPct(), 0.01);
    }

    @Test
    void simulationDeCrash() {
        prix("BTCUSDT", "50000");
        acheter("BTCUSDT", "0.7"); // 35 000 investis
        ScenarioChoc s = risqueService.simulerChoc(portefeuilleService.getOrCreate(UTILISATEUR), 40);
        assertEquals(14000.0, s.perteUsdt(), 0.01);
        assertEquals(86000.0, s.valeurApres(), 0.01);
        assertEquals(14.0, s.perteDuPortefeuillePct(), 0.01);
    }

    @Test
    void projectionMonteCarlo() {
        prix("BTCUSDT", "50000");
        prix("ETHUSDT", "2500");
        historique("BTCUSDT", 50000);
        historique("ETHUSDT", 2500);
        acheter("BTCUSDT", "0.5");
        acheter("ETHUSDT", "10");

        ProjectionRisque p = risqueService.projeter(portefeuilleService.getOrCreate(UTILISATEUR), 30);
        assertTrue(p.disponible());
        assertEquals(31, p.trajectoire().size());
        assertEquals(1000, p.simulations());
        assertEquals(100000.0, p.trajectoire().get(0).p50(), 0.01);       // jour 0 = valeur actuelle
        assertTrue(p.pireCas() <= p.casMedian() && p.casMedian() <= p.meilleurCas());
        assertTrue(p.probabilitePertePct() >= 0 && p.probabilitePertePct() <= 100);
    }

    @Test
    void projectionIndisponibleSiToutEnCash() {
        ProjectionRisque p = risqueService.projeter(portefeuilleService.getOrCreate(UTILISATEUR), 30);
        assertFalse(p.disponible());
    }
}
