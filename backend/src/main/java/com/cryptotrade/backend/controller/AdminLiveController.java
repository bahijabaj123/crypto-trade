package com.cryptotrade.backend.controller;

import org.springframework.web.bind.annotation.*;
import java.util.*;

/**
 * Suivi en direct pour l'administrateur. Toutes les routes sont sous /api/admin/**,
 * donc protégées comme les autres pages admin (stats, utilisateurs, journal).
 */
@RestController
@RequestMapping("/api/admin/live")
@CrossOrigin(origins = "*")
public class AdminLiveController {

  private final GameLiveController jeu;

  public AdminLiveController(GameLiveController jeu) { this.jeu = jeu; }

  /** Liste de toutes les salles (état, joueurs, temps restant). */
  @GetMapping("/salles")
  public List<Map<String, Object>> adminSalles() {
    List<Map<String, Object>> out = new ArrayList<>();
    for (GameLiveController.LiveRoom r : jeu.toutesLesSalles()) {
      Map<String, Object> m = new LinkedHashMap<>();
      long restant = r.demarree ? Math.max(0, r.dureeMinutes * 60L - (System.currentTimeMillis() - r.debutMs) / 1000) : r.dureeMinutes * 60L;
      m.put("code", r.code);
      m.put("scenarioId", r.scenarioId);
      m.put("hote", r.joueurs.isEmpty() ? "" : r.joueurs.get(0).pseudo);
      m.put("nbJoueurs", Math.max(0, r.joueurs.size() - 1));
      m.put("nbActifs", r.joueurs.stream().skip(1).filter(j -> j.actif).count());
      m.put("etat", GameLiveController.etat(r));
      m.put("tempsRestantSec", restant);
      m.put("dureeMinutes", r.dureeMinutes);
      m.put("creeMs", r.creeMs);
      m.put("annonce", r.annonce);
      out.add(m);
    }
    out.sort((a, b) -> Long.compare((Long) b.get("creeMs"), (Long) a.get("creeMs")));
    return out;
  }

  /** Tous les joueurs de toutes les salles (l'hôte/MJ est exclu : il ne trade pas). */
  @GetMapping("/joueurs")
  public List<Map<String, Object>> adminJoueurs() {
    long now = System.currentTimeMillis();
    List<Map<String, Object>> out = new ArrayList<>();
    for (GameLiveController.LiveRoom r : jeu.toutesLesSalles()) {
      String etat = GameLiveController.etat(r);
      for (int i = 1; i < r.joueurs.size(); i++) {
        GameLiveController.LivePlayer p = r.joueurs.get(i);
        long inactifSec = (now - p.derniereActiviteMs) / 1000;
        String presence = !p.actif ? "PARTI"
          : p.termine ? "TERMINE"
          : !r.demarree ? "ATTENTE"
          : inactifSec > 60 ? "ABSENT"
          : inactifSec > 20 ? "INACTIF" : "ACTIF";
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("pseudo", p.pseudo); m.put("salle", r.code); m.put("etatSalle", etat);
        m.put("presence", presence); m.put("inactifSec", inactifSec);
        m.put("nbOrdres", p.nbOrdres); m.put("pnl", p.pnl); m.put("pnlPct", p.pnlPct);
        m.put("valeur", p.valeur); m.put("drawdown", p.drawdown); m.put("concentration", p.concentration);
        m.put("stopLoss", p.stopLoss); m.put("score", p.score); m.put("profil", p.profil);
        m.put("termine", p.termine); m.put("exclu", p.exclu);
        m.put("nbPositions", p.positions == null ? 0 : p.positions.size());
        out.add(m);
      }
    }
    return out;
  }

  /** Détail d'une salle : joueurs + positions + derniers événements. */
  @GetMapping("/{code}/detail")
  public Map<String, Object> adminDetail(@PathVariable String code) {
    GameLiveController.LiveRoom r = jeu.salle(code);
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("code", r.code); m.put("etat", GameLiveController.etat(r)); m.put("impactGlobal", r.impactGlobal); m.put("impacts", r.impacts);
    m.put("scenarioId", r.scenarioId); m.put("dureeMinutes", r.dureeMinutes);
    m.put("tempsRestantSec", r.demarree ? Math.max(0, r.dureeMinutes * 60L - (System.currentTimeMillis() - r.debutMs) / 1000) : r.dureeMinutes * 60L);
    m.put("joueurs", r.joueurs);
    int n = r.evenements.size();
    m.put("evenements", r.evenements.subList(Math.max(0, n - 15), n));
    int k = r.messages.size();
    m.put("messages", r.messages.subList(Math.max(0, k - 30), k));
    return m;
  }


  // ===================== ANALYSE DE SENTIMENT (spectateur) =====================

  private static final long FENETRE_REACTION_MS = 45_000;   // un ordre est une "réaction" s'il suit un choc de moins de 45 s
  private static final long FENETRE_FLUX_MS = 120_000;      // flux acheteur/vendeur sur les 2 dernières minutes

  /**
   * Humeur de chaque trader d'après SES ORDRES et les chocs du MJ :
   *  - panique : vente dans les 45 s après une chute
   *  - achat de la baisse : achat dans les 45 s après une chute (sang-froid)
   *  - FOMO : achat dans les 45 s après une hausse
   *  - flux net : achats vs ventes (2 dernières minutes), agitation : ordres sur la dernière minute
   * Le score 0..100 va de la peur (0) à l'avidité (100). L'indice de la salle est la moyenne.
   */
  @GetMapping("/{code}/sentiment")
  public Map<String, Object> sentiment(@PathVariable String code) {
    GameLiveController.LiveRoom r = jeu.salle(code);
    long now = System.currentTimeMillis();
    List<Map<String, Object>> joueurs = new ArrayList<>();
    double somme = 0; int n = 0, nbPanique = 0, nbEuphorique = 0, nbActifs = 0;

    for (int i = 1; i < r.joueurs.size(); i++) {
      GameLiveController.LivePlayer p = r.joueurs.get(i);
      if (!p.actif && !p.termine) continue;
      nbActifs++;
      int panique = 0, achatBaisse = 0, fomo = 0, recents = 0;
      double achats = 0, ventes = 0;
      for (GameLiveController.OrdreLog o : p.ordres) {
        if (now - o.ts <= FENETRE_FLUX_MS) { if (o.sens > 0) achats += o.notionnel; else ventes += o.notionnel; }
        if (now - o.ts <= 60_000) recents++;
        GameLiveController.Choc recent = null;        // le choc le plus récent qui précède l'ordre
        for (GameLiveController.Choc c : r.chocs) {
          long dt = o.ts - c.ts;
          if (dt < 0 || dt > FENETRE_REACTION_MS) continue;
          boolean concerne = c.symbole == null || "TOUS".equals(c.symbole) || c.symbole.equals(o.symbole);
          if (concerne && (recent == null || c.ts > recent.ts)) recent = c;
        }
        if (recent != null) {
          if (recent.valeur < 0) { if (o.sens < 0) panique++; else achatBaisse++; }
          else if (recent.valeur > 0 && o.sens > 0) fomo++;
        }
      }
      double total = achats + ventes;
      double fluxNet = total > 0 ? (achats - ventes) / total : 0;           // -1 (tout vendu) .. +1 (tout acheté)
      double dd = Math.min(30, p.drawdown);
      double score = 50 + 25 * fluxNet + 8 * Math.min(fomo, 3) + 4 * Math.min(achatBaisse, 2)
        - 12 * Math.min(panique, 3) - 0.8 * dd + 0.5 * Math.max(-20, Math.min(20, p.pnlPct));
      score = Math.max(0, Math.min(100, score));

      String humeur;
      if (p.nbOrdres == 0) humeur = "Observateur";
      else if (panique >= 2 || (panique >= 1 && dd >= 10)) humeur = "Paniqué";
      else if (fomo >= 2 || (fomo >= 1 && fluxNet > 0.6)) humeur = "Euphorique";
      else if (achatBaisse >= 1 && panique == 0) humeur = "Sang-froid";
      else if (dd >= 10 && recents >= 4) humeur = "Anxieux";
      else if (score >= 60) humeur = "Confiant";
      else if (score <= 40) humeur = "Inquiet";
      else humeur = "Neutre";

      List<String> raisons = new ArrayList<>();
      if (panique > 0) raisons.add(panique + " vente(s) dans les 45 s après une chute");
      if (fomo > 0) raisons.add(fomo + " achat(s) juste après une hausse");
      if (achatBaisse > 0) raisons.add(achatBaisse + " achat(s) pendant la baisse");
      if (dd >= 10) raisons.add(String.format(Locale.US, "baisse max %.0f %%", p.drawdown));
      if (recents >= 4) raisons.add(recents + " ordres en 1 min (agitation)");
      if (raisons.isEmpty()) raisons.add(p.nbOrdres == 0 ? "n'a pas encore passé d'ordre" : "comportement stable");

      if (p.nbOrdres > 0) { somme += score; n++; }
      if ("Paniqué".equals(humeur)) nbPanique++;
      if ("Euphorique".equals(humeur)) nbEuphorique++;

      Map<String, Object> m = new LinkedHashMap<>();
      m.put("pseudo", p.pseudo); m.put("humeur", humeur); m.put("score", Math.round(score));
      m.put("panique", panique); m.put("achatBaisse", achatBaisse); m.put("fomo", fomo);
      m.put("fluxNetPct", Math.round(fluxNet * 100)); m.put("agitation", recents);
      m.put("drawdown", p.drawdown); m.put("pnlPct", p.pnlPct); m.put("nbOrdres", p.nbOrdres);
      m.put("explication", String.join(" · ", raisons));
      joueurs.add(m);
    }

    long indice = Math.round(n > 0 ? somme / n : 50);
    String libelle = indice < 25 ? "Peur extrême" : indice < 45 ? "Peur" : indice <= 55 ? "Neutre" : indice <= 75 ? "Avidité" : "Euphorie";
    String resume;
    if (nbActifs == 0) resume = "Aucun joueur actif pour le moment.";
    else if (n == 0) resume = "Les joueurs n'ont pas encore passé d'ordre : le marché est calme.";
    else if (nbPanique * 2 >= nbActifs && nbPanique > 0) resume = "Panique collective : " + nbPanique + " joueur(s) sur " + nbActifs + " ont vendu juste après une chute.";
    else if (nbEuphorique * 2 >= nbActifs && nbEuphorique > 0) resume = "Euphorie collective : " + nbEuphorique + " joueur(s) sur " + nbActifs + " achètent après la hausse (risque de bulle).";
    else if (indice < 45) resume = "La salle est inquiète : les ventes dominent et les pertes pèsent.";
    else if (indice > 55) resume = "La salle est confiante : les achats dominent.";
    else resume = "Sentiment équilibré : pas de mouvement de foule marqué.";

    joueurs.sort((x, y) -> Long.compare(((Number) y.get("score")).longValue(), ((Number) x.get("score")).longValue()));
    int nc = r.chocs.size();
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("indice", indice); out.put("libelle", libelle); out.put("resume", resume);
    out.put("joueurs", joueurs);
    out.put("chocsRecents", r.chocs.subList(Math.max(0, nc - 5), nc));
    return out;
  }

  /** Ferme une salle : plus d'ordres, les joueurs sont renvoyés au lobby. */
  @PostMapping("/{code}/fermer")
  public void adminFermer(@PathVariable String code) {
    GameLiveController.LiveRoom r = jeu.salle(code);
    synchronized (r) {
      r.fermee = true; r.statut = "TERMINE";
      r.annonce = "⛔ La salle a été fermée par l'administrateur."; r.annonceTs = System.currentTimeMillis();
      r.evenements.add(r.annonce);
    }
  }

  /** Exclut un joueur : il est renvoyé au lobby et ses ordres sont ignorés. */
  @PostMapping("/{code}/exclure")
  public void adminExclure(@PathVariable String code, @RequestBody GameLiveController.JoinLiveRoomRequest req) {
    GameLiveController.LiveRoom r = jeu.salle(code);
    synchronized (r) {
      for (GameLiveController.LivePlayer p : r.joueurs) {
        if (p.pseudo.equals(req.pseudo)) { p.exclu = true; p.actif = false; }
      }
      r.evenements.add("🚫 " + req.pseudo + " a été exclu par l'administrateur.");
    }
  }

  /** Message à tous (code vide ou "TOUTES") ou à une seule salle. */
  @PostMapping("/annonce")
  public int adminAnnonce(@RequestBody AnnonceRequest req) {
    if (req.texte == null || req.texte.isBlank()) return 0;
    String t = req.texte.length() > 200 ? req.texte.substring(0, 200) : req.texte;
    int n = 0;
    for (GameLiveController.LiveRoom r : jeu.toutesLesSalles()) {
      if (req.code != null && !req.code.isBlank() && !req.code.equalsIgnoreCase("TOUTES") && !r.code.equalsIgnoreCase(req.code)) continue;
      synchronized (r) {
        r.annonce = t; r.annonceTs = System.currentTimeMillis();
        r.messages.add(new GameLiveController.ChatMsg("📣 ADMIN", t, true));
        r.evenements.add("ADMIN : " + t);
        n++;
      }
    }
    return n;
  }

  public static class AnnonceRequest { public String code; public String texte; }

  @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.NOT_FOUND)
  @org.springframework.web.bind.annotation.ExceptionHandler(RuntimeException.class)
  public Map<String, String> erreur(RuntimeException e) {
    return Map.of("erreur", String.valueOf(e.getMessage()));
  }
}
