package com.cryptotrade.backend.service;

import com.cryptotrade.backend.dto.BougieVue;
import com.cryptotrade.backend.dto.CarnetVue;
import com.cryptotrade.backend.exception.PrixIndisponibleException;
import com.cryptotrade.backend.exception.RegleMetierException;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Recupere les prix reels sur l'API publique de Binance (aucune cle necessaire).
 * Les prix sont gardes en memoire quelques secondes pour ne pas appeler Binance a chaque requete.
 */
@Service
public class BinanceService {

    /** Reponse de GET /api/v3/ticker/price : {"symbol":"BTCUSDT","price":"86028.00000000"} */
    public record TickerPrice(String symbol, String price) {
    }

    /** Extrait de GET /api/v3/ticker/24hr : seul le pourcentage de variation nous interesse. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Ticker24h(String priceChangePercent) {
    }

    private record PrixEnCache(BigDecimal prix, long horodatage) {
    }

    /** Prix de secours, utilises seulement si app.binance.enabled=false (travail hors ligne). */
    private static final Map<String, BigDecimal> PRIX_FIXES = Map.of(
            "BTCUSDT", new BigDecimal("65000"),
            "ETHUSDT", new BigDecimal("3200"),
            "SOLUSDT", new BigDecimal("150"),
            "BNBUSDT", new BigDecimal("600"),
            "XRPUSDT", new BigDecimal("0.60"),
            "ADAUSDT", new BigDecimal("0.45"));

    private final RestClient client;
    private final boolean actif;
    private final long dureeCacheMs;
    private final Map<String, PrixEnCache> cache = new ConcurrentHashMap<>();
    private final Map<String, PrixEnCache> cacheVariation = new ConcurrentHashMap<>();

    /** Reponse de GET /api/v3/depth : {"bids":[["86000.00","0.5"],...],"asks":[...]} */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Profondeur(List<List<String>> bids, List<List<String>> asks) {
    }

    private record CarnetEnCache(CarnetVue carnet, long horodatage) {
    }

    private final Map<String, CarnetEnCache> cacheCarnet = new ConcurrentHashMap<>();

    private static final Set<String> INTERVALLES = Set.of("1m", "5m", "15m", "1h", "4h", "1d");

    private record BougiesEnCache(List<BougieVue> bougies, long horodatage) {
    }

    private final Map<String, BougiesEnCache> cacheBougies = new ConcurrentHashMap<>();

    private record CoursEnCache(List<Double> clotures, long horodatage) {
    }

    private final Map<String, CoursEnCache> cacheCours = new ConcurrentHashMap<>();

    public BinanceService(@Value("${app.binance.base-url}") String baseUrl,
                          @Value("${app.binance.enabled}") boolean actif,
                          @Value("${app.binance.cache-ms}") long dureeCacheMs) {
        SimpleClientHttpRequestFactory usine = new SimpleClientHttpRequestFactory();
        usine.setConnectTimeout(3000);
        usine.setReadTimeout(3000);
        this.client = RestClient.builder().baseUrl(baseUrl).requestFactory(usine).build();
        this.actif = actif;
        this.dureeCacheMs = dureeCacheMs;
    }

    public BigDecimal getPrix(String symbole) {
        String s = symbole.trim().toUpperCase();

        if (!actif) {
            BigDecimal fixe = PRIX_FIXES.get(s);
            if (fixe == null) {
                throw new RegleMetierException("Symbole inconnu (mode hors ligne) : " + s);
            }
            return fixe;
        }

        long maintenant = System.currentTimeMillis();
        PrixEnCache enCache = cache.get(s);
        if (enCache != null && maintenant - enCache.horodatage() < dureeCacheMs) {
            return enCache.prix();
        }

        try {
            TickerPrice reponse = client.get()
                    .uri("/api/v3/ticker/price?symbol={s}", s)
                    .retrieve()
                    .body(TickerPrice.class);
            if (reponse == null || reponse.price() == null) {
                throw new PrixIndisponibleException("Reponse vide de Binance pour " + s);
            }
            BigDecimal prix = new BigDecimal(reponse.price());
            cache.put(s, new PrixEnCache(prix, maintenant));
            return prix;
        } catch (RestClientResponseException e) {
            // Binance repond 400 quand le symbole n'existe pas
            if (e.getStatusCode().is4xxClientError()) {
                throw new RegleMetierException("Symbole inconnu sur Binance : " + s);
            }
            throw new PrixIndisponibleException("Binance a repondu une erreur pour " + s, e);
        } catch (RestClientException e) {
            throw new PrixIndisponibleException("Impossible de joindre Binance pour " + s, e);
        }
    }

    /**
     * Variation du prix sur 24 h, en pourcentage. Ne leve jamais d'erreur : retourne null
     * si l'information est indisponible (ce n'est qu'un affichage, pas utile pour executer un ordre).
     */
    public BigDecimal getVariation24h(String symbole) {
        String s = symbole.trim().toUpperCase();
        if (!actif) {
            return BigDecimal.ZERO;
        }
        long maintenant = System.currentTimeMillis();
        PrixEnCache enCache = cacheVariation.get(s);
        if (enCache != null && maintenant - enCache.horodatage() < 30_000) {
            return enCache.prix();
        }
        try {
            Ticker24h reponse = client.get()
                    .uri("/api/v3/ticker/24hr?symbol={s}", s)
                    .retrieve()
                    .body(Ticker24h.class);
            if (reponse == null || reponse.priceChangePercent() == null) {
                return garderAncienneVariation(s, enCache, maintenant);
            }
            BigDecimal variation = new BigDecimal(reponse.priceChangePercent());
            cacheVariation.put(s, new PrixEnCache(variation, maintenant));
            return variation;
        } catch (RuntimeException e) {
            return garderAncienneVariation(s, enCache, maintenant);
        }
    }

    /** En cas d'echec on memorise le resultat 30 s pour ne pas retenter (et attendre le timeout) a chaque requete. */
    private BigDecimal garderAncienneVariation(String s, PrixEnCache ancien, long maintenant) {
        BigDecimal valeur = ancien != null ? ancien.prix() : null;
        cacheVariation.put(s, new PrixEnCache(valeur, maintenant));
        return valeur;
    }

    /**
     * Prix de cloture JOURNALIERS des derniers jours (du plus ancien au plus recent), via
     * /api/v3/klines. Sert a calculer volatilite, VaR, Sharpe et drawdown (module Risque).
     * Ne leve jamais d'erreur : retourne une liste vide si l'historique est indisponible.
     * Garde en memoire 10 minutes (1 minute en cas d'echec, pour ne pas attendre le timeout a chaque fois).
     */
    public List<Double> getCloturesJournalieres(String symbole, int jours) {
        String s = symbole.trim().toUpperCase();
        if (!actif) {
            return coursSimules(s, jours);
        }
        long maintenant = System.currentTimeMillis();
        CoursEnCache enCache = cacheCours.get(s);
        if (enCache != null) {
            long duree = enCache.clotures().isEmpty() ? 60_000 : 600_000;
            if (maintenant - enCache.horodatage() < duree && enCache.clotures().size() >= Math.min(jours, 10)) {
                return enCache.clotures();
            }
        }
        try {
            List<List<Object>> lignes = client.get()
                    .uri("/api/v3/klines?symbol={s}&interval=1d&limit={n}", s, jours + 1)
                    .retrieve()
                    .body(new ParameterizedTypeReference<List<List<Object>>>() { });
            List<Double> clotures = new ArrayList<>();
            if (lignes != null) {
                for (List<Object> ligne : lignes) {
                    // une bougie = [heureOuverture, ouverture, haut, bas, CLOTURE, volume, ...]
                    clotures.add(Double.parseDouble(String.valueOf(ligne.get(4))));
                }
            }
            cacheCours.put(s, new CoursEnCache(clotures, maintenant));
            return clotures;
        } catch (RuntimeException e) {
            cacheCours.put(s, new CoursEnCache(List.of(), maintenant));
            return List.of();
        }
    }

    /** Hors ligne : serie fictive mais reproductible (toujours la meme pour un symbole donne). */
    private List<Double> coursSimules(String symbole, int jours) {
        BigDecimal base = PRIX_FIXES.get(symbole);
        if (base == null) {
            return List.of();
        }
        Random hasard = new Random(symbole.hashCode());
        double[] ordre = new double[jours + 1];
        ordre[jours] = base.doubleValue();
        for (int i = jours; i > 0; i--) {
            ordre[i - 1] = ordre[i] / (1 + hasard.nextGaussian() * 0.03);
        }
        List<Double> serie = new ArrayList<>();
        for (double v : ordre) {
            serie.add(v);
        }
        return serie;
    }

    /**
     * Carnet d'ordres du marche : les `profondeur` meilleurs acheteurs et vendeurs (GET /api/v3/depth).
     * Garde 1 seconde en memoire. Leve PrixIndisponibleException si Binance ne repond pas.
     */
    public CarnetVue getCarnet(String symbole, int profondeur) {
        String s = symbole.trim().toUpperCase();
        int n = Math.max(1, Math.min(profondeur, 20));
        long maintenant = System.currentTimeMillis();
        CarnetEnCache enCache = cacheCarnet.get(s + n);
        if (enCache != null && maintenant - enCache.horodatage() < 1000) {
            return enCache.carnet();
        }

        List<List<String>> bids;
        List<List<String>> asks;
        if (!actif) {
            BigDecimal base = PRIX_FIXES.get(s);
            if (base == null) {
                throw new RegleMetierException("Symbole inconnu (mode hors ligne) : " + s);
            }
            Random hasard = new Random(maintenant / 1000);
            bids = new ArrayList<>();
            asks = new ArrayList<>();
            for (int i = 1; i <= n; i++) {
                BigDecimal pas = base.multiply(new BigDecimal("0.0002")).multiply(BigDecimal.valueOf(i));
                String qte = BigDecimal.valueOf(0.1 + hasard.nextDouble() * 2).setScale(4, RoundingMode.HALF_UP).toPlainString();
                bids.add(List.of(base.subtract(pas).toPlainString(), qte));
                asks.add(List.of(base.add(pas).toPlainString(), qte));
            }
        } else {
            try {
                Profondeur p = client.get()
                        .uri("/api/v3/depth?symbol={s}&limit={n}", s, n)
                        .retrieve()
                        .body(Profondeur.class);
                if (p == null || p.bids() == null || p.asks() == null || p.bids().isEmpty() || p.asks().isEmpty()) {
                    throw new PrixIndisponibleException("Carnet vide pour " + s);
                }
                bids = p.bids();
                asks = p.asks();
            } catch (RestClientResponseException e) {
                if (e.getStatusCode().is4xxClientError()) {
                    throw new RegleMetierException("Symbole inconnu sur Binance : " + s);
                }
                throw new PrixIndisponibleException("Binance a repondu une erreur pour " + s, e);
            } catch (RestClientException e) {
                throw new PrixIndisponibleException("Impossible de joindre Binance pour " + s, e);
            }
        }

        List<CarnetVue.Niveau> achats = niveaux(bids);
        List<CarnetVue.Niveau> ventes = niveaux(asks);
        BigDecimal meilleurAchat = achats.get(0).prix();
        BigDecimal meilleurVente = ventes.get(0).prix();
        BigDecimal ecart = meilleurVente.subtract(meilleurAchat);
        BigDecimal milieu = meilleurVente.add(meilleurAchat).divide(BigDecimal.valueOf(2), 8, RoundingMode.HALF_UP);
        BigDecimal ecartPct = milieu.signum() == 0 ? BigDecimal.ZERO
                : ecart.multiply(BigDecimal.valueOf(100)).divide(milieu, 4, RoundingMode.HALF_UP);
        BigDecimal volAchats = achats.get(achats.size() - 1).cumul();
        BigDecimal volVentes = ventes.get(ventes.size() - 1).cumul();
        BigDecimal volTotal = volAchats.add(volVentes);
        BigDecimal pression = volTotal.signum() == 0 ? new BigDecimal("50")
                : volAchats.multiply(BigDecimal.valueOf(100)).divide(volTotal, 2, RoundingMode.HALF_UP);

        CarnetVue carnet = new CarnetVue(s, achats, ventes, meilleurAchat, meilleurVente, ecart, ecartPct,
                milieu, volAchats, volVentes, pression);
        cacheCarnet.put(s + n, new CarnetEnCache(carnet, maintenant));
        return carnet;
    }

    /** ["86000.00","0.5"] -> prix, quantite, et cumul des quantites depuis le meilleur prix. */
    private static List<CarnetVue.Niveau> niveaux(List<List<String>> lignes) {
        List<CarnetVue.Niveau> resultat = new ArrayList<>();
        BigDecimal cumul = BigDecimal.ZERO;
        for (List<String> ligne : lignes) {
            BigDecimal quantite = new BigDecimal(ligne.get(1));
            cumul = cumul.add(quantite);
            resultat.add(new CarnetVue.Niveau(new BigDecimal(ligne.get(0)), quantite, cumul));
        }
        return resultat;
    }

    /**
     * Bougies (chandeliers) d'une crypto : GET /api/v3/klines.
     * intervalle : 1m, 5m, 15m, 1h, 4h ou 1d. Du plus ancien au plus recent. Gardees 10 secondes en memoire.
     */
    public List<BougieVue> getBougies(String symbole, String intervalle, int limite) {
        String s = symbole.trim().toUpperCase();
        if (!INTERVALLES.contains(intervalle)) {
            throw new RegleMetierException("Intervalle invalide : " + intervalle + " (valeurs : 1m, 5m, 15m, 1h, 4h, 1d).");
        }
        int n = Math.max(10, Math.min(limite, 200));
        String cle = s + "|" + intervalle + "|" + n;
        long maintenant = System.currentTimeMillis();
        BougiesEnCache enCache = cacheBougies.get(cle);
        if (enCache != null && maintenant - enCache.horodatage() < 10_000) {
            return enCache.bougies();
        }

        List<BougieVue> bougies = new ArrayList<>();
        if (!actif) {
            BigDecimal base = PRIX_FIXES.get(s);
            if (base == null) {
                throw new RegleMetierException("Symbole inconnu (mode hors ligne) : " + s);
            }
            long pas = switch (intervalle) {
                case "1m" -> 60_000L;
                case "5m" -> 300_000L;
                case "15m" -> 900_000L;
                case "1h" -> 3_600_000L;
                case "4h" -> 14_400_000L;
                default -> 86_400_000L;
            };
            Random hasard = new Random(cle.hashCode());
            double prix = base.doubleValue();
            long debut = (maintenant / pas) * pas - (long) (n - 1) * pas;
            for (int i = 0; i < n; i++) {
                double ouv = prix;
                double clo = ouv * (1 + hasard.nextGaussian() * 0.01);
                double haut = Math.max(ouv, clo) * (1 + Math.abs(hasard.nextGaussian()) * 0.004);
                double bas = Math.min(ouv, clo) * (1 - Math.abs(hasard.nextGaussian()) * 0.004);
                bougies.add(new BougieVue(debut + (long) i * pas, BigDecimal.valueOf(ouv), BigDecimal.valueOf(haut),
                        BigDecimal.valueOf(bas), BigDecimal.valueOf(clo), BigDecimal.valueOf(10 + hasard.nextDouble() * 50)));
                prix = clo;
            }
        } else {
            try {
                List<List<Object>> lignes = client.get()
                        .uri("/api/v3/klines?symbol={s}&interval={i}&limit={n}", s, intervalle, n)
                        .retrieve()
                        .body(new ParameterizedTypeReference<List<List<Object>>>() { });
                if (lignes == null || lignes.isEmpty()) {
                    throw new PrixIndisponibleException("Aucune bougie pour " + s);
                }
                for (List<Object> l : lignes) {
                    // [heureOuverture, ouverture, haut, bas, cloture, volume, ...]
                    bougies.add(new BougieVue(((Number) l.get(0)).longValue(),
                            new BigDecimal(String.valueOf(l.get(1))), new BigDecimal(String.valueOf(l.get(2))),
                            new BigDecimal(String.valueOf(l.get(3))), new BigDecimal(String.valueOf(l.get(4))),
                            new BigDecimal(String.valueOf(l.get(5)))));
                }
            } catch (RestClientResponseException e) {
                if (e.getStatusCode().is4xxClientError()) {
                    throw new RegleMetierException("Symbole inconnu sur Binance : " + s);
                }
                throw new PrixIndisponibleException("Binance a repondu une erreur pour " + s, e);
            } catch (RestClientException e) {
                throw new PrixIndisponibleException("Impossible de joindre Binance pour " + s, e);
            }
        }
        cacheBougies.put(cle, new BougiesEnCache(bougies, maintenant));
        return bougies;
    }
}
