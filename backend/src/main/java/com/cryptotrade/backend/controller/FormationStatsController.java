package com.cryptotrade.backend.controller;

import org.springframework.web.bind.annotation.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Statistiques anonymes de la formation (en mémoire) :
 *  - leçons ouvertes / terminées  -> où les gens abandonnent
 *  - quiz : tentatives, réussites, score moyen, questions les plus ratées
 * Le front envoie un petit événement à chaque action (voir suivi-formation.service.ts).
 */
@RestController
@CrossOrigin(origins = "*")
public class FormationStatsController {

  private final Map<String, AtomicLong> lecOuvertes = new ConcurrentHashMap<>();
  private final Map<String, AtomicLong> lecTerminees = new ConcurrentHashMap<>();
  private final Map<String, AtomicLong> quizTentatives = new ConcurrentHashMap<>();
  private final Map<String, AtomicLong> quizReussites = new ConcurrentHashMap<>();
  private final Map<String, AtomicLong> quizSommeScores = new ConcurrentHashMap<>();
  private final Map<String, AtomicLong> questionsRatees = new ConcurrentHashMap<>();
  private final AtomicLong total = new AtomicLong();

  /** type : LECON_OUVERTE | LECON_TERMINEE | QUIZ */
  @PostMapping("/api/stats/formation")
  public void enregistrer(@RequestBody EvenementFormation e) {
    if (e == null || e.type == null || e.cle == null || e.cle.isBlank()) return;
    total.incrementAndGet();
    switch (e.type) {
      case "LECON_OUVERTE" -> inc(lecOuvertes, e.cle);
      case "LECON_TERMINEE" -> inc(lecTerminees, e.cle);
      case "QUIZ" -> {
        inc(quizTentatives, e.cle);
        if (e.reussi) inc(quizReussites, e.cle);
        if (e.total > 0) quizSommeScores.computeIfAbsent(e.cle, k -> new AtomicLong()).addAndGet(Math.round(100.0 * e.score / e.total));
        if (e.questionsRatees != null) for (String q : e.questionsRatees) inc(questionsRatees, e.cle + "|" + q);
      }
      default -> { }
    }
  }

  @GetMapping("/api/admin/live/formation")
  public Map<String, Object> resume() {
    Set<String> ids = new TreeSet<>(lecOuvertes.keySet());
    ids.addAll(lecTerminees.keySet());
    List<Map<String, Object>> lecons = new ArrayList<>();
    for (String id : ids) {
      long o = val(lecOuvertes, id), t = val(lecTerminees, id);
      long ouvertesEff = Math.max(o, t);
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("id", id); m.put("ouvertes", ouvertesEff); m.put("terminees", t);
      m.put("abandons", Math.max(0, ouvertesEff - t));
      m.put("tauxAbandonPct", ouvertesEff == 0 ? 0 : Math.round(100.0 * (ouvertesEff - t) / ouvertesEff));
      lecons.add(m);
    }
    lecons.sort((a, b) -> Long.compare(((Number) b.get("abandons")).longValue(), ((Number) a.get("abandons")).longValue()));

    List<Map<String, Object>> quiz = new ArrayList<>();
    for (String id : new TreeSet<>(quizTentatives.keySet())) {
      long n = val(quizTentatives, id), r = val(quizReussites, id);
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("id", id); m.put("tentatives", n); m.put("reussites", r);
      m.put("tauxReussitePct", n == 0 ? 0 : Math.round(100.0 * r / n));
      m.put("scoreMoyenPct", n == 0 ? 0 : Math.round((double) val(quizSommeScores, id) / n));
      quiz.add(m);
    }

    List<Map<String, Object>> ratees = new ArrayList<>();
    questionsRatees.forEach((k, v) -> {
      String[] p = k.split("\\|", 2);
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("quiz", p[0]); m.put("question", p.length > 1 ? p[1] : ""); m.put("ratees", v.get());
      ratees.add(m);
    });
    ratees.sort((a, b) -> Long.compare(((Number) b.get("ratees")).longValue(), ((Number) a.get("ratees")).longValue()));

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("evenements", total.get());
    out.put("lecons", lecons);
    out.put("quiz", quiz);
    out.put("questionsRatees", ratees.subList(0, Math.min(10, ratees.size())));
    return out;
  }

  private static void inc(Map<String, AtomicLong> m, String k) { m.computeIfAbsent(k, x -> new AtomicLong()).incrementAndGet(); }
  private static long val(Map<String, AtomicLong> m, String k) { AtomicLong a = m.get(k); return a == null ? 0 : a.get(); }

  public static class EvenementFormation {
    public String type; public String cle;
    public int score, total; public boolean reussi;
    public List<String> questionsRatees;
  }
}
