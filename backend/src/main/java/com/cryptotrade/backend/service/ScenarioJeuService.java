package com.cryptotrade.backend.service;

import com.cryptotrade.backend.dto.ScenarioJeuDto;
import com.cryptotrade.backend.dto.ScenarioJeuDto.RequeteDto;
import com.cryptotrade.backend.exception.RegleMetierException;
import com.cryptotrade.backend.model.ScenarioJeu;
import com.cryptotrade.backend.repository.ScenarioJeuRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/** Gestion des scenarios du jeu : lecture pour les joueurs, creation / modification / suppression pour l'admin. */
@Service
public class ScenarioJeuService {

    private static final Pattern ID_VALIDE = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");
    private static final Set<String> SOURCES = Set.of("binance");
    private static final Set<String> INTERVALLES = Set.of("1h", "1day");
    private static final Set<String> MARCHES = Set.of("Crypto", "Actions", "Forex", "Matières premières");
    private static final Set<String> DIFFICULTES = Set.of("Facile", "Moyen", "Difficile", "Extrême");
    private static final int REQUETES_MAX = 8;
    /** Binance renvoie au maximum 1000 bougies par appel : au-dela, la fin de la periode serait coupee. */
    private static final long BOUGIES_MAX = 1000;

    private final ScenarioJeuRepository repository;
    private final ObjectMapper json;

    public ScenarioJeuService(ScenarioJeuRepository repository, ObjectMapper json) {
        this.repository = repository;
        this.json = json;
    }

    // ---------- Lecture ----------

    /** Ce que voit un joueur : seulement les scenarios actifs. */
    @Transactional(readOnly = true)
    public List<ScenarioJeuDto> listerActifs() {
        return repository.findByActifTrueOrderByOrdreAscIdAsc().stream().map(this::versDto).toList();
    }

    /** Ce que voit l'admin : tous les scenarios. */
    @Transactional(readOnly = true)
    public List<ScenarioJeuDto> listerTous() {
        return repository.findAllByOrderByOrdreAscIdAsc().stream().map(this::versDto).toList();
    }

    // ---------- Ecriture (admin) ----------

    @Transactional
    public ScenarioJeuDto creer(ScenarioJeuDto dto) {
        valider(dto, true);
        if (repository.existsById(dto.id())) {
            throw new RegleMetierException("Un scenario avec l'identifiant « " + dto.id() + " » existe deja.");
        }
        ScenarioJeu s = new ScenarioJeu();
        s.setId(dto.id());
        appliquer(s, dto);
        if (dto.ordre() <= 0) s.setOrdre((int) repository.count() + 1);
        return versDto(repository.save(s));
    }

    @Transactional
    public ScenarioJeuDto modifier(String id, ScenarioJeuDto dto) {
        ScenarioJeu s = trouver(id);
        valider(dto, false);
        appliquer(s, dto);   // l'identifiant ne change jamais
        return versDto(repository.save(s));
    }

    @Transactional
    public ScenarioJeuDto changerActif(String id, boolean actif) {
        ScenarioJeu s = trouver(id);
        s.setActif(actif);
        return versDto(repository.save(s));
    }

    @Transactional
    public void supprimer(String id) {
        repository.delete(trouver(id));
    }

    /** Pour le demarrage : ajoute les scenarios de depart si la table est vide. */
    @Transactional
    public void initialiserSiVide(List<ScenarioJeuDto> scenarios) {
        if (repository.count() > 0) return;
        for (ScenarioJeuDto dto : scenarios) {
            ScenarioJeu s = new ScenarioJeu();
            s.setId(dto.id());
            appliquer(s, dto);
            repository.save(s);
        }
    }

    // ---------- Interne ----------

    private ScenarioJeu trouver(String id) {
        return repository.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Scenario introuvable : " + id));
    }

    private void appliquer(ScenarioJeu s, ScenarioJeuDto dto) {
        s.setNom(dto.nom().trim());
        s.setDescription(dto.description().trim());
        s.setDifficulte(dto.difficulte());
        s.setIcone(dto.icone().trim());
        s.setCouleur(dto.couleur().trim());
        s.setMarche(dto.marche());
        s.setActif(dto.actif());
        if (dto.ordre() > 0) s.setOrdre(dto.ordre());
        try {
            s.setRequetesJson(json.writeValueAsString(dto.requetes()));
        } catch (JsonProcessingException e) {
            throw new RegleMetierException("Liste d'actifs invalide.");
        }
    }

    private ScenarioJeuDto versDto(ScenarioJeu s) {
        List<RequeteDto> requetes;
        try {
            requetes = json.readValue(s.getRequetesJson(), new TypeReference<List<RequeteDto>>() { });
        } catch (JsonProcessingException e) {
            requetes = List.of();   // donnees abimees : le scenario s'affiche sans actif plutot que de planter
        }
        return new ScenarioJeuDto(s.getId(), s.getNom(), s.getDescription(), s.getDifficulte(), s.getIcone(),
                s.getCouleur(), s.getMarche(), s.isActif(), s.getOrdre(), requetes);
    }

    private void valider(ScenarioJeuDto d, boolean creation) {
        if (creation && (d.id() == null || d.id().length() < 3 || d.id().length() > 60
                || !ID_VALIDE.matcher(d.id()).matches())) {
            throw new RegleMetierException(
                    "Identifiant invalide : 3 a 60 caracteres, minuscules, chiffres et tirets (ex. « flash-crash-2010 »).");
        }
        exigerTexte(d.nom(), "Le nom", 150);
        exigerTexte(d.description(), "La description", 1000);
        exigerTexte(d.icone(), "L'icone", 20);
        exigerTexte(d.couleur(), "La couleur", 80);
        if (d.marche() == null || !MARCHES.contains(d.marche())) {
            throw new RegleMetierException("Marche invalide (Crypto, Actions, Forex ou Matières premières).");
        }
        if (d.difficulte() == null || !DIFFICULTES.contains(d.difficulte())) {
            throw new RegleMetierException("Difficulte invalide (Facile, Moyen, Difficile ou Extrême).");
        }
        List<RequeteDto> requetes = d.requetes();
        if (requetes == null || requetes.isEmpty() || requetes.size() > REQUETES_MAX) {
            throw new RegleMetierException("Un scenario doit avoir entre 1 et " + REQUETES_MAX + " actifs.");
        }
        String intervalle = requetes.get(0).interval();
        for (RequeteDto r : requetes) {
            if (r.source() == null || !SOURCES.contains(r.source())) {
                throw new RegleMetierException("Source invalide : seule « binance » est geree.");
            }
            if (r.symbol() == null || !r.symbol().matches("^[A-Z0-9]{5,20}$")) {
                throw new RegleMetierException("Symbole invalide (ex. BTCUSDT) : " + r.symbol());
            }
            if (r.interval() == null || !INTERVALLES.contains(r.interval())) {
                throw new RegleMetierException("Intervalle invalide (1h ou 1day) pour " + r.symbol());
            }
            if (!r.interval().equals(intervalle)) {
                throw new RegleMetierException("Tous les actifs d'un scenario doivent avoir le meme intervalle.");
            }
            try {
                LocalDate debut = LocalDate.parse(r.startDate());
                LocalDate fin = LocalDate.parse(r.endDate());
                if (!debut.isBefore(fin)) {
                    throw new RegleMetierException("La date de fin doit etre apres la date de debut (" + r.symbol() + ").");
                }
                long jours = java.time.temporal.ChronoUnit.DAYS.between(debut, fin);
                long bougies = "1h".equals(r.interval()) ? jours * 24 : jours;
                if (bougies > BOUGIES_MAX) {
                    throw new RegleMetierException("Periode trop longue : " + bougies + " bougies (maximum "
                            + BOUGIES_MAX + " : 41 jours en 1h, ou 1000 jours en 1day).");
                }
            } catch (DateTimeParseException | NullPointerException e) {
                throw new RegleMetierException("Date invalide pour " + r.symbol() + " (format AAAA-MM-JJ).");
            }
        }
    }

    private void exigerTexte(String valeur, String libelle, int max) {
        if (valeur == null || valeur.isBlank()) throw new RegleMetierException(libelle + " est obligatoire.");
        if (valeur.trim().length() > max) throw new RegleMetierException(libelle + " depasse " + max + " caracteres.");
    }
}
