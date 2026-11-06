package com.cryptotrade.backend.service;

import com.cryptotrade.backend.dto.PortefeuilleVue;
import com.cryptotrade.backend.dto.PositionVue;
import com.cryptotrade.backend.dto.TransactionVue;
import com.cryptotrade.backend.exception.PrixIndisponibleException;
import com.cryptotrade.backend.model.Portefeuille;
import com.cryptotrade.backend.model.Position;
import com.cryptotrade.backend.model.StatutPosition;
import com.cryptotrade.backend.repository.PortefeuilleRepository;
import com.cryptotrade.backend.repository.PositionRepository;
import com.cryptotrade.backend.repository.TransactionRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/** Tout ce qui concerne la lecture du portefeuille : solde, positions, valeur, gain/perte. */
@Service
public class PortefeuilleService {

    private final PortefeuilleRepository portefeuilleRepository;
    private final PositionRepository positionRepository;
    private final TransactionRepository transactionRepository;
    private final BinanceService binanceService;
    private final BigDecimal soldeInitial;

    public PortefeuilleService(PortefeuilleRepository portefeuilleRepository,
                               PositionRepository positionRepository,
                               TransactionRepository transactionRepository,
                               BinanceService binanceService,
                               @Value("${app.portefeuille.solde-initial}") BigDecimal soldeInitial) {
        this.portefeuilleRepository = portefeuilleRepository;
        this.positionRepository = positionRepository;
        this.transactionRepository = transactionRepository;
        this.binanceService = binanceService;
        this.soldeInitial = soldeInitial;
    }

    /** Retourne le portefeuille de l'utilisateur, en le creant (avec le capital de depart) s'il n'existe pas. */
    @Transactional
    public Portefeuille getOrCreate(Long utilisateurId) {
        return portefeuilleRepository.findByUtilisateurId(utilisateurId).orElseGet(() -> {
            Portefeuille p = new Portefeuille();
            p.setUtilisateurId(utilisateurId);
            p.setSoldeInitial(soldeInitial.setScale(8, RoundingMode.HALF_UP));
            p.setSoldeDisponible(soldeInitial.setScale(8, RoundingMode.HALF_UP));
            return portefeuilleRepository.save(p);
        });
    }

    @Transactional
    public PortefeuilleVue vue(Long utilisateurId) {
        Portefeuille p = getOrCreate(utilisateurId);

        List<PositionVue> ouvertes = positionRepository
                .findByPortefeuilleIdAndStatutOrderByDateOuvertureDesc(p.getId(), StatutPosition.OUVERTE)
                .stream().map(this::versVue).toList();
        List<PositionVue> fermees = positionRepository
                .findByPortefeuilleIdAndStatutOrderByDateOuvertureDesc(p.getId(), StatutPosition.FERMEE)
                .stream().map(this::versVue).toList();

        BigDecimal valeurPositions = ouvertes.stream()
                .map(PositionVue::valeurActuelle)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal valeurTotale = p.getSoldeDisponible().add(valeurPositions);
        BigDecimal pnlTotal = valeurTotale.subtract(p.getSoldeInitial());

        return new PortefeuilleVue(
                p.getId(),
                p.getMode(),
                arrondi(p.getSoldeInitial()),
                arrondi(p.getSoldeDisponible()),
                arrondi(valeurPositions),
                arrondi(valeurTotale),
                arrondi(pnlTotal),
                pourcentage(pnlTotal, p.getSoldeInitial()),
                ouvertes,
                fermees);
    }

    @Transactional
    public List<PositionVue> positions(Long utilisateurId, StatutPosition statut) {
        Portefeuille p = getOrCreate(utilisateurId);
        return positionRepository
                .findByPortefeuilleIdAndStatutOrderByDateOuvertureDesc(p.getId(), statut)
                .stream().map(this::versVue).toList();
    }

    @Transactional
    public List<TransactionVue> transactions(Long utilisateurId) {
        Portefeuille p = getOrCreate(utilisateurId);
        return transactionRepository.findByPortefeuilleIdOrderByDateDesc(p.getId()).stream()
                .map(t -> new TransactionVue(
                        t.getId(),
                        t.getOrdre().getId(),
                        t.getSymbole(),
                        t.getSens(),
                        t.getQuantite(),
                        t.getPrix(),
                        arrondi(t.getMontant()),
                        t.getDate()))
                .toList();
    }

    private PositionVue versVue(Position pos) {
        if (pos.getStatut() == StatutPosition.FERMEE) {
            return new PositionVue(
                    pos.getId(), pos.getSymbole(), pos.getQuantite(), pos.getQuantiteTotaleAchetee(),
                    pos.getPrixMoyenAchat(), null,
                    arrondi(BigDecimal.ZERO), arrondi(BigDecimal.ZERO), arrondi(BigDecimal.ZERO),
                    arrondi(pos.getPnlRealise()), pos.getStatut(),
                    pos.getDateOuverture(), pos.getDateFermeture(), true);
        }

        BigDecimal prixActuel;
        boolean prixDisponible = true;
        try {
            prixActuel = binanceService.getPrix(pos.getSymbole());
        } catch (PrixIndisponibleException e) {
            // Binance ne repond pas : on n'empeche pas d'afficher le portefeuille
            prixActuel = pos.getPrixMoyenAchat();
            prixDisponible = false;
        }

        BigDecimal valeur = prixActuel.multiply(pos.getQuantite());
        BigDecimal cout = pos.getPrixMoyenAchat().multiply(pos.getQuantite());
        BigDecimal pnl = valeur.subtract(cout);

        return new PositionVue(
                pos.getId(), pos.getSymbole(), pos.getQuantite(), pos.getQuantiteTotaleAchetee(),
                pos.getPrixMoyenAchat(), prixActuel,
                arrondi(valeur), arrondi(pnl), pourcentage(pnl, cout),
                arrondi(pos.getPnlRealise()), pos.getStatut(),
                pos.getDateOuverture(), pos.getDateFermeture(), prixDisponible);
    }

    private static BigDecimal arrondi(BigDecimal valeur) {
        return valeur.setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal pourcentage(BigDecimal numerateur, BigDecimal denominateur) {
        if (denominateur.signum() == 0) {
            return BigDecimal.ZERO.setScale(2);
        }
        return numerateur.multiply(BigDecimal.valueOf(100))
                .divide(denominateur, 2, RoundingMode.HALF_UP);
    }
}
