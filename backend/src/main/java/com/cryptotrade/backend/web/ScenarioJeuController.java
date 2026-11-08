package com.cryptotrade.backend.web;

import com.cryptotrade.backend.dto.ScenarioJeuDto;
import com.cryptotrade.backend.service.AuditService;
import com.cryptotrade.backend.service.ScenarioJeuService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * GET  /api/scenarios                       : scenarios actifs (utilises par le jeu)
 * GET  /api/admin/scenarios                 : tous les scenarios (page Admin)
 * POST /api/admin/scenarios                 : creer
 * PUT  /api/admin/scenarios/{id}            : modifier
 * PUT  /api/admin/scenarios/{id}/actif      : activer / desactiver (?valeur=true|false)
 * DELETE /api/admin/scenarios/{id}          : supprimer
 * Routes /api/admin/** reservees au role ADMIN (voir AuthInterceptor). Chaque changement est inscrit au journal d'audit.
 */
@RestController
@RequestMapping("/api")
public class ScenarioJeuController {

    private final ScenarioJeuService service;
    private final AuditService audit;

    public ScenarioJeuController(ScenarioJeuService service, AuditService audit) {
        this.service = service;
        this.audit = audit;
    }

    @GetMapping("/scenarios")
    public List<ScenarioJeuDto> actifs() {
        return service.listerActifs();
    }

    @GetMapping("/admin/scenarios")
    public List<ScenarioJeuDto> tous() {
        return service.listerTous();
    }

    @PostMapping("/admin/scenarios")
    @ResponseStatus(HttpStatus.CREATED)
    public ScenarioJeuDto creer(@RequestBody ScenarioJeuDto dto) {
        ScenarioJeuDto cree = service.creer(dto);
        audit.enregistrer("SCENARIO_CREE", cree.id() + " (" + cree.nom() + ")");
        return cree;
    }

    @PutMapping("/admin/scenarios/{id}")
    public ScenarioJeuDto modifier(@PathVariable String id, @RequestBody ScenarioJeuDto dto) {
        ScenarioJeuDto modifie = service.modifier(id, dto);
        audit.enregistrer("SCENARIO_MODIFIE", id + " (" + modifie.nom() + ")");
        return modifie;
    }

    @PutMapping("/admin/scenarios/{id}/actif")
    public ScenarioJeuDto changerActif(@PathVariable String id, @RequestParam boolean valeur) {
        ScenarioJeuDto maj = service.changerActif(id, valeur);
        audit.enregistrer(valeur ? "SCENARIO_ACTIVE" : "SCENARIO_MASQUE", id);
        return maj;
    }

    @DeleteMapping("/admin/scenarios/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void supprimer(@PathVariable String id) {
        service.supprimer(id);
        audit.enregistrer("SCENARIO_SUPPRIME", id);
    }
}
