package com.cryptotrade.backend.service;

import com.cryptotrade.backend.dto.OrdreRequest;
import com.cryptotrade.backend.dto.OrdreVue;
import com.cryptotrade.backend.dto.ResultatOrdre;
import com.cryptotrade.backend.exception.RegleMetierException;
import com.cryptotrade.backend.model.Ordre;
import com.cryptotrade.backend.model.Portefeuille;
import com.cryptotrade.backend.model.Position;
import com.cryptotrade.backend.model.SensOrdre;
import com.cryptotrade.backend.model.StatutOrdre;
import com.cryptotrade.backend.model.StatutPosition;
import com.cryptotrade.backend.model.Transaction;
import com.cryptotrade.backend.model.TypeOrdre;
import com.cryptotrade.backend.repository.OrdreRepository;
import com.cryptotrade.backend.repository.PortefeuilleRepository;
import com.cryptotrade.backend.repository.PositionRepository;
import com.cryptotrade.backend.repository.TransactionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Le moteur d'ordres (MARKET, LIMIT, STOP_LOSS, TAKE_PROFIT) : verifie, execute au prix Binance, met a jour solde et positions,
 * puis enregistre l'ordre et la transaction. Tout se passe dans UNE transaction :
 * si une etape echoue, rien n'est enregistre.
 */
@Service
public class OrdreService {

    private static final int ECHELLE = 8;

    private final PortefeuilleService portefeuilleService;
    private final PortefeuilleRepository portefeuilleRepository;
    private final PositionRepository positionRepository;
    private final OrdreRepository ordreRepository;
    private final TransactionRepository transactionRepository;
    private final BinanceService binanceService;
    private final RisqueService risqueService;

    public OrdreService(PortefeuilleService portefeuilleService,
                        PortefeuilleRepository portefeuilleRepository,
                        PositionRepository positionRepository,
                        OrdreRepository ordreRepository,
                        TransactionRepository transactionRepository,
                        BinanceService binanceService,
                        RisqueService risqueService) {
        this.portefeuilleService = portefeuilleService;
        this.portefeuilleRepository = portefeuilleRepository;
        this.positionRepository = positionRepository;
        this.ordreRepository = ordreRepository;
        this.transactionRepository = transactionRepository;
        this.binanceService = binanceService;
        this.risqueService = risqueService;
    }

    @Transactional
    public ResultatOrdre passerOrdre(Long utilisateurId, OrdreRequest demande) {
        TypeOrdre type = demande.type() != null ? demande.type() : TypeOrdre.MARKET;

        String symbole = demande.symbole().trim().toUpperCase();
        BigDecimal quantite = demande.quantite().setScale(ECHELLE, RoundingMode.HALF_UP);
        if (quantite.signum() <= 0) {
            throw new RegleMetierException("La quantite est trop petite.");
        }

        Portefeuille portefeuille = portefeuilleService.getOrCreate(utilisateurId);
        BigDecimal prix = binanceService.getPrix(symbole).setScale(ECHELLE, RoundingMode.HALF_UP);

        BigDecimal seuil = null;
        if (type != TypeOrdre.MARKET) {
            seuil = verifierOrdreEnAttente(portefeuille, type, demande, symbole, quantite, prix);
        }

        Ordre ordre = new Ordre();
        ordre.setPortefeuille(portefeuille);
        ordre.setSymbole(symbole);
        ordre.setSens(demande.sens());
        ordre.setType(type);
        ordre.setQuantite(quantite);
        ordre.setPrixDeclenchement(seuil);
        ordre.setStatut(StatutOrdre.EN_ATTENTE);
        ordre = ordreRepository.save(ordre);

        // MARKET : execute tout de suite. LIMIT deja atteint : aussi. Sinon l'ordre attend le moteur.
        if (type == TypeOrdre.MARKET || conditionAtteinte(ordre, prix)) {
            executer(portefeuille, ordre, prix);
            String message = (demande.sens() == SensOrdre.ACHAT ? "Achat" : "Vente") + " execute : "
                    + texte(quantite) + " " + symbole + " a " + texte(prix) + " USDT.";
            return new ResultatOrdre(versVue(ordre), arrondi(portefeuille.getSoldeDisponible()), message);
        }

        String message = "Ordre " + type + " enregistre (en attente) : "
                + (demande.sens() == SensOrdre.ACHAT ? "achat" : "vente") + " de " + texte(quantite) + " "
                + symbole + " quand le prix " + (ordre.getSens() == SensOrdre.ACHAT && type == TypeOrdre.LIMIT
                || type == TypeOrdre.STOP_LOSS ? "sera inferieur ou egal a " : "sera superieur ou egal a ")
                + texte(seuil) + " USDT (prix actuel " + texte(prix) + ").";
        return new ResultatOrdre(versVue(ordre), arrondi(portefeuille.getSoldeDisponible()), message);
    }

    /** Controles d'un ordre LIMIT / STOP_LOSS / TAKE_PROFIT a la creation. Retourne le seuil. */
    private BigDecimal verifierOrdreEnAttente(Portefeuille p, TypeOrdre type, OrdreRequest demande,
                                              String symbole, BigDecimal quantite, BigDecimal prixActuel) {
        if (demande.prixDeclenchement() == null) {
            throw new RegleMetierException("Le prix de declenchement est obligatoire pour un ordre " + type + ".");
        }
        BigDecimal seuil = demande.prixDeclenchement().setScale(ECHELLE, RoundingMode.HALF_UP);
        if (seuil.signum() <= 0) {
            throw new RegleMetierException("Le prix de declenchement est trop petit.");
        }

        if ((type == TypeOrdre.STOP_LOSS || type == TypeOrdre.TAKE_PROFIT) && demande.sens() != SensOrdre.VENTE) {
            throw new RegleMetierException("Un " + (type == TypeOrdre.STOP_LOSS ? "stop-loss" : "take-profit")
                    + " est un ordre de VENTE.");
        }
        if (type == TypeOrdre.STOP_LOSS && seuil.compareTo(prixActuel) >= 0) {
            throw new RegleMetierException("Le stop-loss doit etre inferieur au prix actuel ("
                    + texte(prixActuel) + " USDT), sinon il se declencherait immediatement.");
        }
        if (type == TypeOrdre.TAKE_PROFIT && seuil.compareTo(prixActuel) <= 0) {
            throw new RegleMetierException("Le take-profit doit etre superieur au prix actuel ("
                    + texte(prixActuel) + " USDT), sinon il se declencherait immediatement.");
        }

        if (demande.sens() == SensOrdre.VENTE) {
            verifierQuantiteDisponible(p, symbole, quantite);
        } else {
            BigDecimal coutMax = seuil.multiply(quantite);
            if (p.getSoldeDisponible().compareTo(coutMax) < 0) {
                throw new RegleMetierException("Solde insuffisant : il faut jusqu'a "
                        + arrondi(coutMax) + " USDT, solde disponible " + arrondi(p.getSoldeDisponible()) + " USDT.");
            }
        }
        return seuil;
    }

    private void verifierQuantiteDisponible(Portefeuille p, String symbole, BigDecimal quantite) {
        Position position = positionRepository
                .findByPortefeuilleIdAndSymboleAndStatut(p.getId(), symbole, StatutPosition.OUVERTE)
                .orElseThrow(() -> new RegleMetierException(
                        "Vous n'avez aucune position ouverte sur " + symbole + "."));
        if (position.getQuantite().compareTo(quantite) < 0) {
            throw new RegleMetierException("Quantite insuffisante : vous possedez "
                    + texte(position.getQuantite()) + " " + symbole + ".");
        }
    }

    /** Vrai si le prix du marche a atteint le seuil de l'ordre. */
    static boolean conditionAtteinte(Ordre o, BigDecimal prix) {
        BigDecimal seuil = o.getPrixDeclenchement();
        if (seuil == null) {
            return true; // MARKET
        }
        return switch (o.getType()) {
            case LIMIT -> o.getSens() == SensOrdre.ACHAT ? prix.compareTo(seuil) <= 0 : prix.compareTo(seuil) >= 0;
            case STOP_LOSS -> prix.compareTo(seuil) <= 0;
            case TAKE_PROFIT -> prix.compareTo(seuil) >= 0;
            case MARKET -> true;
        };
    }

    /** Execute l'ordre au prix donne : risque, solde/position, ordre, transaction. */
    private void executer(Portefeuille portefeuille, Ordre ordre, BigDecimal prix) {
        BigDecimal quantite = ordre.getQuantite();
        BigDecimal montant = prix.multiply(quantite).setScale(ECHELLE, RoundingMode.HALF_UP);

        // Point d'extension : VaR, exposition, HHI (etape suivante)
        risqueService.verifierAvantOrdre(portefeuille, ordre.getSymbole(), ordre.getSens(), quantite, prix);

        if (ordre.getSens() == SensOrdre.ACHAT) {
            acheter(portefeuille, ordre.getSymbole(), quantite, prix, montant);
        } else {
            vendre(portefeuille, ordre.getSymbole(), quantite, prix, montant);
        }
        portefeuilleRepository.save(portefeuille);

        ordre.setPrixExecution(prix);
        ordre.setMontant(montant);
        ordre.setStatut(StatutOrdre.EXECUTE);
        ordre.setDateExecution(LocalDateTime.now());
        ordreRepository.save(ordre);

        Transaction transaction = new Transaction();
        transaction.setPortefeuille(portefeuille);
        transaction.setOrdre(ordre);
        transaction.setSymbole(ordre.getSymbole());
        transaction.setSens(ordre.getSens());
        transaction.setQuantite(quantite);
        transaction.setPrix(prix);
        transaction.setMontant(montant);
        transactionRepository.save(transaction);
    }

    /**
     * Appele toutes les quelques secondes par le MoteurOrdres : regarde les ordres EN_ATTENTE
     * et execute ceux dont le prix du marche a atteint le seuil.
     * Un ordre devenu impossible (solde ou quantite insuffisants) passe en REJETE avec un motif.
     *
     * @return le nombre d'ordres executes
     */
    @Transactional
    public int traiterOrdresEnAttente() {
        List<Ordre> enAttente = ordreRepository.findByStatut(StatutOrdre.EN_ATTENTE);
        Map<String, BigDecimal> prix = new HashMap<>();
        Set<String> sansPrix = new HashSet<>();
        int executes = 0;

        for (Ordre ordre : enAttente) {
            String symbole = ordre.getSymbole();
            if (sansPrix.contains(symbole)) {
                continue;
            }
            if (!prix.containsKey(symbole)) {
                try {
                    prix.put(symbole, binanceService.getPrix(symbole).setScale(ECHELLE, RoundingMode.HALF_UP));
                } catch (RuntimeException e) {
                    sansPrix.add(symbole); // Binance injoignable : on reessaiera au prochain tour
                    continue;
                }
            }
            BigDecimal prixActuel = prix.get(symbole);
            if (!conditionAtteinte(ordre, prixActuel)) {
                continue;
            }
            try {
                executer(ordre.getPortefeuille(), ordre, prixActuel);
                executes++;
            } catch (RegleMetierException e) {
                ordre.setStatut(StatutOrdre.REJETE);
                ordre.setMotif(e.getMessage());
                ordreRepository.save(ordre);
            }
        }
        return executes;
    }

    /** Annule un ordre encore en attente. */
    @Transactional
    public OrdreVue annuler(Long utilisateurId, Long ordreId) {
        Portefeuille p = portefeuilleService.getOrCreate(utilisateurId);
        Ordre ordre = ordreRepository.findByIdAndPortefeuilleId(ordreId, p.getId())
                .orElseThrow(() -> new RegleMetierException("Ordre introuvable : " + ordreId));
        if (ordre.getStatut() != StatutOrdre.EN_ATTENTE) {
            throw new RegleMetierException("Seul un ordre en attente peut etre annule (statut actuel : "
                    + ordre.getStatut() + ").");
        }
        ordre.setStatut(StatutOrdre.ANNULE);
        return versVue(ordreRepository.save(ordre));
    }

    @Transactional
    public List<OrdreVue> liste(Long utilisateurId) {
        Portefeuille p = portefeuilleService.getOrCreate(utilisateurId);
        return ordreRepository.findByPortefeuilleIdOrderByDateCreationDesc(p.getId())
                .stream().map(this::versVue).toList();
    }

    private void acheter(Portefeuille p, String symbole, BigDecimal quantite, BigDecimal prix, BigDecimal montant) {
        if (p.getSoldeDisponible().compareTo(montant) < 0) {
            throw new RegleMetierException("Solde insuffisant : il faut "
                    + montant.setScale(2, RoundingMode.HALF_UP) + " USDT, solde disponible "
                    + p.getSoldeDisponible().setScale(2, RoundingMode.HALF_UP) + " USDT.");
        }
        p.setSoldeDisponible(p.getSoldeDisponible().subtract(montant));

        Position position = positionRepository
                .findByPortefeuilleIdAndSymboleAndStatut(p.getId(), symbole, StatutPosition.OUVERTE)
                .orElse(null);

        if (position == null) {
            position = new Position();
            position.setPortefeuille(p);
            position.setSymbole(symbole);
            position.setQuantite(quantite);
            position.setQuantiteTotaleAchetee(quantite);
            position.setPrixMoyenAchat(prix);
        } else {
            // Nouveau prix moyen = (ancien cout + nouveau cout) / nouvelle quantite
            BigDecimal nouvelleQuantite = position.getQuantite().add(quantite);
            BigDecimal coutTotal = position.getPrixMoyenAchat().multiply(position.getQuantite())
                    .add(prix.multiply(quantite));
            position.setPrixMoyenAchat(coutTotal.divide(nouvelleQuantite, ECHELLE, RoundingMode.HALF_UP));
            position.setQuantite(nouvelleQuantite);
            position.setQuantiteTotaleAchetee(position.getQuantiteTotaleAchetee().add(quantite));
        }
        positionRepository.save(position);
    }

    private void vendre(Portefeuille p, String symbole, BigDecimal quantite, BigDecimal prix, BigDecimal montant) {
        Position position = positionRepository
                .findByPortefeuilleIdAndSymboleAndStatut(p.getId(), symbole, StatutPosition.OUVERTE)
                .orElseThrow(() -> new RegleMetierException(
                        "Vous n'avez aucune position ouverte sur " + symbole + "."));

        if (position.getQuantite().compareTo(quantite) < 0) {
            throw new RegleMetierException("Quantite insuffisante : vous possedez "
                    + position.getQuantite().stripTrailingZeros().toPlainString() + " " + symbole + ".");
        }

        // Gain ou perte realise sur la partie vendue
        BigDecimal pnl = prix.subtract(position.getPrixMoyenAchat())
                .multiply(quantite).setScale(ECHELLE, RoundingMode.HALF_UP);
        position.setPnlRealise(position.getPnlRealise().add(pnl));
        position.setQuantite(position.getQuantite().subtract(quantite));
        p.setSoldeDisponible(p.getSoldeDisponible().add(montant));

        if (position.getQuantite().signum() == 0) {
            position.setStatut(StatutPosition.FERMEE);
            position.setDateFermeture(LocalDateTime.now());
        }
        positionRepository.save(position);
    }

    private OrdreVue versVue(Ordre o) {
        return new OrdreVue(o.getId(), o.getSymbole(), o.getSens(), o.getType(), o.getQuantite(),
                o.getPrixDeclenchement(), o.getPrixExecution(),
                o.getMontant() == null ? null : arrondi(o.getMontant()),
                o.getStatut(), o.getMotif(), o.getDateCreation(), o.getDateExecution());
    }

    private static BigDecimal arrondi(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP);
    }

    private static String texte(BigDecimal v) {
        return v.stripTrailingZeros().toPlainString();
    }
}
