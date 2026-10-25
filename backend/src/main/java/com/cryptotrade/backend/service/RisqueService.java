package com.cryptotrade.backend.service;

import com.cryptotrade.backend.dto.AnalyseRisque;
import com.cryptotrade.backend.dto.ApercuRisque;
import com.cryptotrade.backend.dto.ProjectionRisque;
import com.cryptotrade.backend.dto.ScenarioChoc;
import com.cryptotrade.backend.exception.PrixIndisponibleException;
import com.cryptotrade.backend.exception.RegleMetierException;
import com.cryptotrade.backend.model.Portefeuille;
import com.cryptotrade.backend.model.Position;
import com.cryptotrade.backend.model.SensOrdre;
import com.cryptotrade.backend.model.StatutPosition;
import com.cryptotrade.backend.repository.PositionRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Gestion du risque (cahier des charges, section 3.2) :
 *  1. evaluation du risque AVANT chaque ordre  (apercu / verifierAvantOrdre)
 *  2. indicateurs de performance et de risque  (analyser) : rendement, volatilite, VaR, Sharpe,
 *     drawdown maximal, exposition par actif, indice de concentration HHI
 *  3. simulation de crash                      (simulerChoc)
 *
 * Les formules sont volontairement simples et expliquees dans les commentaires.
 */
@Service
public class RisqueService {

    /** Nombre de jours d'historique utilises pour estimer volatilite, VaR, Sharpe et drawdown. */
    static final int JOURS = 90;
    /** Les cryptos se negocient 7j/7 : on ramene a l'annee avec 365 jours. */
    static final double JOURS_PAR_AN = 365;
    /** Au-dessus de ce HHI le portefeuille est juge concentre (equivalent a moins de 3 actifs de meme poids). */
    static final double SEUIL_HHI = 10000.0 / 3;
    /** Perte quotidienne probable (VaR 95 %) au-dela de laquelle on previent l'utilisateur. */
    static final double SEUIL_VAR_PCT = 5.0;

    private final PositionRepository positionRepository;
    private final BinanceService binanceService;
    private final double expositionMaxPct;
    private final double expositionAlertePct;

    public RisqueService(PositionRepository positionRepository,
                         BinanceService binanceService,
                         @Value("${app.risque.exposition-max-pct:40}") double expositionMaxPct,
                         @Value("${app.risque.exposition-alerte-pct:25}") double expositionAlertePct) {
        this.positionRepository = positionRepository;
        this.binanceService = binanceService;
        this.expositionMaxPct = expositionMaxPct;
        this.expositionAlertePct = expositionAlertePct;
    }

    // ------------------------------------------------------------------ structures internes

    /** Photo du portefeuille : valeur (en USDT) de chaque actif + le cash. */
    private record Etat(Map<String, Double> valeurs, double cash) {
        double investi() {
            return valeurs.values().stream().mapToDouble(Double::doubleValue).sum();
        }

        double total() {
            return investi() + cash;
        }

        double valeur(String symbole) {
            return valeurs.getOrDefault(symbole, 0.0);
        }
    }

    /** Resultats chiffres pour un Etat. Les Double sont null si l'historique de prix manque. */
    private record Mesures(Double volatiliteAnnuellePct, Double varPct, Double sharpe, Double drawdownMaxPct,
                           double hhi, double expositionMaxPct, String actifPlusExpose, double investiPct,
                           int jours) {
    }

    // ------------------------------------------------------------------ 1. avant un ordre

    /** Appelee par OrdreService avant CHAQUE execution : refuse l'ordre si le risque est inacceptable. */
    public void verifierAvantOrdre(Portefeuille portefeuille, String symbole, SensOrdre sens,
                                   BigDecimal quantite, BigDecimal prix) {
        ApercuRisque apercu = apercu(portefeuille, symbole, sens, quantite, prix);
        if (!apercu.autorise()) {
            throw new RegleMetierException(apercu.messages().get(0));
        }
    }

    /** "Et si je validais cet ordre ?" : compare le portefeuille AVANT et APRES, sans rien modifier. */
    public ApercuRisque apercu(Portefeuille portefeuille, String symbole, SensOrdre sens,
                               BigDecimal quantite, BigDecimal prix) {
        String s = symbole.trim().toUpperCase(Locale.ROOT);
        double montant = prix.multiply(quantite).doubleValue();

        Etat avant = lireEtat(portefeuille, s, prix);
        Map<String, Double> valeursApres = new LinkedHashMap<>(avant.valeurs());
        double cashApres;
        if (sens == SensOrdre.ACHAT) {
            valeursApres.merge(s, montant, Double::sum);
            cashApres = Math.max(0, avant.cash() - montant);
        } else {
            valeursApres.put(s, Math.max(0, avant.valeur(s) - montant));
            cashApres = avant.cash() + montant;
        }
        Etat apres = new Etat(valeursApres, cashApres);

        Mesures mAvant = mesurer(avant);
        Mesures mApres = mesurer(apres);
        double expAvant = pourcent(avant.valeur(s), avant.total());
        double expApres = pourcent(apres.valeur(s), apres.total());

        List<String> messages = new ArrayList<>();
        boolean refuse = false;
        boolean attention = false;
        Double quantiteMax = null;

        if (sens == SensOrdre.ACHAT) {
            double valeurMax = expositionMaxPct / 100 * avant.total() - avant.valeur(s);
            double qMax = Math.max(0, valeurMax / prix.doubleValue());
            quantiteMax = BigDecimal.valueOf(qMax).setScale(6, RoundingMode.DOWN).doubleValue();

            if (expApres > expositionMaxPct + 1e-9) {
                refuse = true;
                messages.add(String.format(Locale.ROOT,
                        "Refusé : cet achat porterait %s à %.1f %% du portefeuille (maximum autorisé : %.0f %%). "
                                + "Quantité maximale pour cet actif : %s.",
                        court(s), expApres, expositionMaxPct, texte(quantiteMax)));
            } else if (expApres > expositionAlertePct) {
                attention = true;
                messages.add(String.format(Locale.ROOT,
                        "Attention : %s représenterait %.1f %% du portefeuille (seuil d'alerte : %.0f %%).",
                        court(s), expApres, expositionAlertePct));
            }
        } else {
            messages.add(String.format(Locale.ROOT,
                    "Cette vente réduit votre exposition à %s de %.1f %% à %.1f %%.",
                    court(s), expAvant, expApres));
        }

        // Impact sur la VaR : la perte maximale probable sur 1 jour, avant et apres l'ordre
        Double varUsdtAvant = enUsdt(mAvant.varPct(), avant.total());
        Double varUsdtApres = enUsdt(mApres.varPct(), apres.total());
        if (varUsdtAvant != null && varUsdtApres != null) {
            double diff = varUsdtApres - varUsdtAvant;
            messages.add(String.format(Locale.ROOT,
                    "Impact sur la VaR 95 %% (perte probable max. sur 1 jour) : %.0f → %.0f USDT (%s%.0f).",
                    varUsdtAvant, varUsdtApres, diff >= 0 ? "+" : "", diff));
            if (sens == SensOrdre.ACHAT && mApres.varPct() > SEUIL_VAR_PCT && mApres.varPct() > mAvant.varPct()) {
                attention = true;
                messages.add(String.format(Locale.ROOT,
                        "Attention : après cet ordre, vous pourriez perdre plus de %.0f %% de votre portefeuille en une journée.",
                        SEUIL_VAR_PCT));
            }
        }

        // Concentration : seulement si une part significative du portefeuille est investie
        if (sens == SensOrdre.ACHAT && mApres.investiPct() >= 20 && mApres.hhi() > SEUIL_HHI
                && mApres.hhi() > mAvant.hhi()) {
            attention = true;
            messages.add(String.format(Locale.ROOT,
                    "Attention : portefeuille peu diversifié (HHI = %.0f, équivalent à %.1f actif(s) de même poids).",
                    mApres.hhi(), 10000 / mApres.hhi()));
        }

        if (!refuse && !attention && sens == SensOrdre.ACHAT) {
            messages.add(0, "Aucun probl\u00e8me de risque d\u00e9tect\u00e9 : exposition et diversification restent acceptables.");
        }
        String niveau = refuse ? "REFUSE" : attention ? "ATTENTION" : "OK";

        return new ApercuRisque(!refuse, niveau, messages,
                r2(expAvant), r2(expApres), r2(mAvant.hhi()), r2(mApres.hhi()),
                arrondi(mAvant.varPct()), arrondi(mApres.varPct()),
                arrondi(varUsdtAvant), arrondi(varUsdtApres), quantiteMax);
    }

    // ------------------------------------------------------------------ 2. indicateurs du portefeuille

    public AnalyseRisque analyser(Portefeuille portefeuille) {
        Etat etat = lireEtat(portefeuille, null, null);
        Mesures m = mesurer(etat);
        double total = etat.total();
        double rendement = portefeuille.getSoldeInitial().signum() == 0 ? 0
                : (total - portefeuille.getSoldeInitial().doubleValue())
                / portefeuille.getSoldeInitial().doubleValue() * 100;

        List<AnalyseRisque.Exposition> expositions = etat.valeurs().entrySet().stream()
                .filter(e -> e.getValue() > 0)
                .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .map(e -> new AnalyseRisque.Exposition(e.getKey(), r2(e.getValue()), r2(pourcent(e.getValue(), total))))
                .toList();

        String diversification = etat.investi() <= 0 ? "AUCUNE"
                : m.hhi() <= 2000 ? "BONNE" : m.hhi() <= SEUIL_HHI ? "MOYENNE" : "FAIBLE";

        // --- score de risque 0-100 + explication ("pourquoi ?")
        List<String> explications = new ArrayList<>();
        Integer score = null;
        String niveau = "INDISPONIBLE";
        if (m.volatiliteAnnuellePct() != null && m.varPct() != null) {
            double ptsVol = 40 * Math.min(m.volatiliteAnnuellePct() / 80, 1);
            double ptsVar = 30 * Math.min(m.varPct() / 8, 1);
            double ptsExp = 30 * Math.min(m.expositionMaxPct() / 60, 1);
            score = (int) Math.round(ptsVol + ptsVar + ptsExp);
            niveau = score < 33 ? "FAIBLE" : score < 66 ? "MODERE" : "ELEVE";
            explications.add(String.format(Locale.ROOT,
                    "Volatilité : le portefeuille varie de %.0f %% par an → %.0f/40 points.",
                    m.volatiliteAnnuellePct(), ptsVol));
            explications.add(String.format(Locale.ROOT,
                    "VaR : sur une journée, la perte probable maximale est de %.1f %% (≈ %.0f USDT) → %.0f/30 points.",
                    m.varPct(), m.varPct() / 100 * total, ptsVar));
            explications.add(String.format(Locale.ROOT,
                    "Exposition : %s pèse %.0f %% du portefeuille → %.0f/30 points.",
                    m.actifPlusExpose() == null ? "aucun actif" : court(m.actifPlusExpose()),
                    m.expositionMaxPct(), ptsExp));
        } else if (etat.investi() > 0) {
            explications.add("L'historique des prix est indisponible : volatilité, VaR, Sharpe et drawdown "
                    + "ne peuvent pas être calculés pour le moment.");
        }
        if (etat.investi() > 0) {
            explications.add(String.format(Locale.ROOT,
                    "Diversification : HHI = %.0f, comme si vous déteniez %.1f actif(s) de même poids.",
                    m.hhi(), 10000 / m.hhi()));
        }
        explications.add(String.format(Locale.ROOT,
                "%.0f %% du portefeuille est en cash (USDT), donc sans risque de marché.", 100 - m.investiPct()));

        // --- conseil de reequilibrage
        String suggestion = null;
        if (m.actifPlusExpose() != null && m.expositionMaxPct() > expositionAlertePct) {
            double excedent = (m.expositionMaxPct() - expositionAlertePct) / 100 * total;
            suggestion = String.format(Locale.ROOT,
                    "%s pèse %.0f %% du portefeuille. Vendre environ %.0f USDT de %s (ou répartir sur d'autres cryptos) "
                            + "le ramènerait sous le seuil d'alerte de %.0f %%.",
                    court(m.actifPlusExpose()), m.expositionMaxPct(), excedent, court(m.actifPlusExpose()),
                    expositionAlertePct);
        } else if (etat.investi() > 0 && m.hhi() > SEUIL_HHI && m.investiPct() >= 20) {
            suggestion = "Votre portefeuille est concentré sur peu d'actifs : ajouter d'autres cryptos "
                    + "réduirait le risque spécifique à chacune.";
        }

        return new AnalyseRisque(r2(total), r2(m.investiPct()), r2(rendement),
                arrondi(m.volatiliteAnnuellePct()), arrondi(m.varPct()), arrondi(enUsdt(m.varPct(), total)),
                arrondi(m.sharpe()), arrondi(m.drawdownMaxPct()), r2(m.hhi()), diversification,
                r2(m.expositionMaxPct()), m.actifPlusExpose(), expositions,
                score, niveau, explications, suggestion, m.jours());
    }

    // ------------------------------------------------------------------ 3. simulation de crash

    /** Perte si toutes les cryptos detenues chutent de chocPct % (ex. 40 = crash de mai 2021). */
    public ScenarioChoc simulerChoc(Portefeuille portefeuille, double chocPct) {
        double choc = Math.max(0, Math.min(100, chocPct));
        Etat etat = lireEtat(portefeuille, null, null);
        double total = etat.total();
        List<ScenarioChoc.Ligne> lignes = etat.valeurs().entrySet().stream()
                .filter(e -> e.getValue() > 0)
                .map(e -> new ScenarioChoc.Ligne(e.getKey(), r2(e.getValue() * choc / 100)))
                .sorted(Comparator.comparingDouble(ScenarioChoc.Ligne::perteUsdt).reversed())
                .toList();
        double perte = etat.investi() * choc / 100;
        return new ScenarioChoc(choc, r2(total), r2(perte), r2(total - perte),
                total == 0 ? 0 : r2(perte / total * 100), lignes);
    }

    // ------------------------------------------------------------------ calculs

    /** Valeur actuelle (prix du marche x quantite) de chaque position ouverte. */
    private Etat lireEtat(Portefeuille p, String symboleConnu, BigDecimal prixConnu) {
        Map<String, Double> valeurs = new LinkedHashMap<>();
        List<Position> positions = positionRepository
                .findByPortefeuilleIdAndStatutOrderByDateOuvertureDesc(p.getId(), StatutPosition.OUVERTE);
        for (Position pos : positions) {
            BigDecimal prix;
            if (pos.getSymbole().equals(symboleConnu) && prixConnu != null) {
                prix = prixConnu;
            } else {
                try {
                    prix = binanceService.getPrix(pos.getSymbole());
                } catch (PrixIndisponibleException | RegleMetierException e) {
                    prix = pos.getPrixMoyenAchat(); // on ne bloque pas l'analyse si Binance ne repond pas
                }
            }
            valeurs.merge(pos.getSymbole(), prix.multiply(pos.getQuantite()).doubleValue(), Double::sum);
        }
        return new Etat(valeurs, p.getSoldeDisponible().doubleValue());
    }

    /**
     * Calcule tous les indicateurs pour un etat du portefeuille.
     *
     * Principe : on prend les rendements JOURNALIERS des 90 derniers jours de chaque actif, et on les
     * combine avec les poids ACTUELS du portefeuille (le cash a un rendement de 0). On obtient ainsi
     * "ce qu'aurait fait ce portefeuille" sur 90 jours, dont on tire :
     *  - volatilite  = ecart-type des rendements journaliers x racine(365)
     *  - VaR 95 %    = le 5e percentile le plus bas des rendements journaliers (simulation historique)
     *  - Sharpe      = rendement moyen / ecart-type x racine(365)  (taux sans risque = 0)
     *  - drawdown    = plus forte baisse entre un sommet et le creux suivant
     *  - HHI         = somme des carres des poids des actifs detenus (x 10 000)
     */
    private Mesures mesurer(Etat etat) {
        double total = etat.total();
        double investi = etat.investi();
        double investiPct = pourcent(investi, total);

        double hhi = 0;
        String actifMax = null;
        double expMax = 0;
        for (Map.Entry<String, Double> e : etat.valeurs().entrySet()) {
            if (e.getValue() <= 0) {
                continue;
            }
            double w = e.getValue() / investi;
            hhi += w * w;
            double exp = pourcent(e.getValue(), total);
            if (exp > expMax) {
                expMax = exp;
                actifMax = e.getKey();
            }
        }
        hhi *= 10000;

        if (total <= 0) {
            return new Mesures(null, null, null, null, hhi, expMax, actifMax, investiPct, 0);
        }
        if (investi <= 0) { // 100 % cash : aucun risque de marche
            return new Mesures(0.0, 0.0, null, 0.0, 0, 0, null, 0, 0);
        }

        // Rendement du portefeuille chaque jour (null si l'historique des prix manque)
        double[] r = rendementsPortefeuille(etat);
        if (r == null) {
            return new Mesures(null, null, null, null, hhi, expMax, actifMax, investiPct, 0);
        }
        int n = r.length;

        double moyenne = Arrays.stream(r).average().orElse(0);
        double variance = n > 1 ? Arrays.stream(r).map(x -> (x - moyenne) * (x - moyenne)).sum() / (n - 1) : 0;
        double ecartType = Math.sqrt(variance);
        double volAnnuelle = ecartType * Math.sqrt(JOURS_PAR_AN) * 100;

        double[] tries = r.clone();
        Arrays.sort(tries);
        double percentile5 = tries[(int) Math.floor(0.05 * n)];
        double varPct = Math.max(0, -percentile5) * 100;

        Double sharpe = ecartType > 0 ? moyenne / ecartType * Math.sqrt(JOURS_PAR_AN) : null;

        double valeur = 1, sommet = 1, ddMax = 0;
        for (double x : r) {
            valeur *= 1 + x;
            sommet = Math.max(sommet, valeur);
            ddMax = Math.max(ddMax, (sommet - valeur) / sommet);
        }

        return new Mesures(volAnnuelle, varPct, sharpe, ddMax * 100, hhi, expMax, actifMax, investiPct, n);
    }

    /**
     * Rendement JOURNALIER du portefeuille sur les derniers jours : pour chaque jour, la somme
     * (poids de l'actif x variation du prix de l'actif). Le cash a un rendement de 0.
     * Retourne null si l'historique de prix d'un actif detenu est indisponible.
     */
    private double[] rendementsPortefeuille(Etat etat) {
        double total = etat.total();
        Map<String, List<Double>> cours = new LinkedHashMap<>();
        int n = Integer.MAX_VALUE;
        for (Map.Entry<String, Double> e : etat.valeurs().entrySet()) {
            if (e.getValue() <= 0) {
                continue;
            }
            List<Double> serie = binanceService.getCloturesJournalieres(e.getKey(), JOURS);
            if (serie == null || serie.size() < 11) {
                return null;
            }
            cours.put(e.getKey(), serie);
            n = Math.min(n, serie.size() - 1);
        }
        if (cours.isEmpty()) {
            return null;
        }
        double[] r = new double[n];
        for (Map.Entry<String, List<Double>> e : cours.entrySet()) {
            List<Double> c = e.getValue();
            double poids = etat.valeur(e.getKey()) / total;
            int decalage = c.size() - 1 - n; // on aligne les series sur les jours les plus recents
            for (int t = 0; t < n; t++) {
                r[t] += poids * (c.get(decalage + t + 1) / c.get(decalage + t) - 1);
            }
        }
        return r;
    }

    // ------------------------------------------------------------------ 4. projection (Monte-Carlo)

    static final int SIMULATIONS = 1000;

    /**
     * Simule SIMULATIONS futurs possibles du portefeuille sur `jours` jours.
     * Methode (bootstrap) : chaque jour futur, on TIRE AU HASARD l'une des variations journalieres
     * observees dans le passe et on l'applique a la valeur du portefeuille. On repete 1 000 fois,
     * puis pour chaque jour on garde les percentiles 5, 25, 50, 75 et 95 des 1 000 valeurs.
     */
    public ProjectionRisque projeter(Portefeuille portefeuille, int jours) {
        int horizon = Math.max(5, Math.min(jours, 90));
        Etat etat = lireEtat(portefeuille, null, null);
        double valeur0 = etat.total();

        if (etat.investi() <= 0) {
            return new ProjectionRisque(false,
                    "Votre portefeuille est entièrement en cash (USDT) : sa valeur ne varie pas. "
                            + "Achetez des cryptos pour voir une projection.",
                    horizon, 0, 0, r2(valeur0), r2(valeur0), r2(valeur0), r2(valeur0), 0, 0, List.of());
        }
        double[] r = rendementsPortefeuille(etat);
        if (r == null || r.length < 10) {
            return new ProjectionRisque(false,
                    "L'historique des prix Binance est indisponible pour le moment : la projection ne peut pas être calculée.",
                    horizon, 0, 0, r2(valeur0), r2(valeur0), r2(valeur0), r2(valeur0), 0, 0, List.of());
        }

        java.util.Random hasard = new java.util.Random(42); // graine fixe : meme resultat a chaque affichage
        double[][] valeurs = new double[horizon + 1][SIMULATIONS]; // valeurs[jour][simulation]
        for (int sim = 0; sim < SIMULATIONS; sim++) {
            double v = valeur0;
            valeurs[0][sim] = v;
            for (int jour = 1; jour <= horizon; jour++) {
                v *= 1 + r[hasard.nextInt(r.length)];
                valeurs[jour][sim] = v;
            }
        }

        List<ProjectionRisque.Point> trajectoire = new ArrayList<>();
        for (int jour = 0; jour <= horizon; jour++) {
            double[] colonne = valeurs[jour].clone();
            Arrays.sort(colonne);
            trajectoire.add(new ProjectionRisque.Point(jour,
                    r2(percentile(colonne, 5)), r2(percentile(colonne, 25)), r2(percentile(colonne, 50)),
                    r2(percentile(colonne, 75)), r2(percentile(colonne, 95))));
        }

        double[] finales = valeurs[horizon].clone();
        long enPerte = Arrays.stream(finales).filter(v -> v < valeur0).count();
        long perdent10 = Arrays.stream(finales).filter(v -> v < valeur0 * 0.9).count();
        ProjectionRisque.Point fin = trajectoire.get(horizon);
        double probaPerte = enPerte * 100.0 / SIMULATIONS;
        String message = String.format(Locale.ROOT,
                "Sur %d simulations, votre portefeuille vaudrait entre %.0f USDT (pire cas) et %.0f USDT (meilleur cas) "
                        + "dans %d jours, avec %.0f USDT comme cas médian. %.0f %% des simulations finissent en perte. "
                        + "Ce n'est pas une prédiction : on suppose que les jours à venir ressemblent aux %d derniers jours.",
                SIMULATIONS, fin.p5(), fin.p95(), horizon, fin.p50(), probaPerte, r.length);

        return new ProjectionRisque(true, message, horizon, SIMULATIONS, r.length, r2(valeur0),
                fin.p5(), fin.p50(), fin.p95(), r2(probaPerte), r2(perdent10 * 100.0 / SIMULATIONS), trajectoire);
    }

    /** Valeur au rang `p` % dans un tableau trie (p = 5 : on garde la valeur depassee dans 95 % des cas). */
    private static double percentile(double[] tries, int p) {
        int index = (int) Math.min(tries.length - 1, Math.floor(p / 100.0 * tries.length));
        return tries[index];
    }

    // ------------------------------------------------------------------ petits outils

    private static double pourcent(double partie, double total) {
        return total <= 0 ? 0 : partie / total * 100;
    }

    private static Double enUsdt(Double pct, double total) {
        return pct == null ? null : pct / 100 * total;
    }

    private static double r2(double v) {
        return BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    private static Double arrondi(Double v) {
        return v == null ? null : r2(v);
    }

    /** BTCUSDT -> BTC */
    private static String court(String symbole) {
        return symbole.endsWith("USDT") ? symbole.substring(0, symbole.length() - 4) : symbole;
    }

    private static String texte(Double v) {
        return BigDecimal.valueOf(v).stripTrailingZeros().toPlainString();
    }
}
