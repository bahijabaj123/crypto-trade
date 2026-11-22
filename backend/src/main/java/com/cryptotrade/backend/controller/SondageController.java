package com.cryptotrade.backend.controller;

import org.springframework.web.bind.annotation.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Sondage de fin de partie : note 1..5, pistes (cases à cocher) et commentaire libre.
 * Un joueur n'a qu'une réponse par salle (la dernière remplace la précédente). Stockage en mémoire.
 */
@RestController
@CrossOrigin(origins = "*")
public class SondageController {

  private final Map<String, Retour> retours = new ConcurrentHashMap<>();

  @PostMapping("/api/sondage")
  public Map<String, Object> envoyer(@RequestBody SondageRequest req) {
    if (req == null || req.note < 1 || req.note > 5) throw new RuntimeException("Note invalide (1 à 5).");
    Retour r = new Retour();
    r.pseudo = req.pseudo == null || req.pseudo.isBlank() ? "anonyme" : coupe(req.pseudo, 40);
    r.salle = req.salle == null ? "" : coupe(req.salle, 20).toUpperCase();
    r.note = req.note;
    r.commentaire = req.commentaire == null ? "" : coupe(req.commentaire.trim(), 500);
    r.tags = new ArrayList<>();
    if (req.tags != null) for (String t : req.tags) { if (t != null && !t.isBlank() && r.tags.size() < 8) r.tags.add(coupe(t.trim(), 30)); }
    r.ts = System.currentTimeMillis();
    if (retours.size() > 3000) retours.clear();          // garde-fou mémoire
    retours.put(r.salle + "|" + r.pseudo, r);
    return Map.of("ok", true);
  }

  @GetMapping("/api/admin/live/sondage")
  public Map<String, Object> resume() {
    List<Retour> l = new ArrayList<>(retours.values());
    int[] rep = new int[5];
    double somme = 0;
    Map<String, Integer> tags = new HashMap<>();
    for (Retour r : l) { rep[r.note - 1]++; somme += r.note; for (String t : r.tags) tags.merge(t, 1, Integer::sum); }
    List<Map<String, Object>> tagsListe = new ArrayList<>();
    tags.entrySet().stream().sorted((a, b) -> b.getValue() - a.getValue())
      .forEach(e -> tagsListe.add(Map.of("tag", e.getKey(), "n", e.getValue())));
    List<Map<String, Object>> coms = new ArrayList<>();
    l.stream().filter(r -> !r.commentaire.isBlank()).sorted((a, b) -> Long.compare(b.ts, a.ts)).limit(100).forEach(r -> {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("pseudo", r.pseudo); m.put("salle", r.salle); m.put("note", r.note);
      m.put("commentaire", r.commentaire); m.put("tags", r.tags); m.put("ts", r.ts);
      coms.add(m);
    });
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("nb", l.size());
    out.put("moyenne", l.isEmpty() ? 0 : Math.round(somme / l.size() * 10) / 10.0);
    out.put("repartition", rep);
    out.put("tags", tagsListe);
    out.put("commentaires", coms);
    return out;
  }

  private static String coupe(String s, int max) { return s.length() > max ? s.substring(0, max) : s; }

  public static class SondageRequest { public String pseudo; public String salle; public int note; public String commentaire; public List<String> tags; }
  static class Retour { String pseudo, salle, commentaire; int note; List<String> tags; long ts;
    public String getPseudo() { return pseudo; } }

  @ResponseStatus(org.springframework.http.HttpStatus.BAD_REQUEST)
  @ExceptionHandler(RuntimeException.class)
  public Map<String, String> erreur(RuntimeException e) { return Map.of("erreur", String.valueOf(e.getMessage())); }
}
