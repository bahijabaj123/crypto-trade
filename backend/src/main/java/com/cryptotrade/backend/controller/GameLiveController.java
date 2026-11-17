package com.cryptotrade.backend.controller;

import org.springframework.web.bind.annotation.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Salle de Marché Vivante : le backend est la SOURCE DE VÉRITÉ (joueurs, chat, événements, impact de prix).
 * Le front ne fait que lire (polling 1 s) et envoyer ses actions.
 */
@RestController
@RequestMapping("/api/game/live")
@CrossOrigin(origins = "*")
public class GameLiveController {

  /** Liquidité du marché virtuel : impact(%) = 100 × notionnel / LIQUIDITE. À ajuster selon le capital des joueurs. */
  private static final double LIQUIDITE = 200_000.0;
  private static final double IMPACT_MAX = 60.0;       // plafond |impact| en %
  private static final double DEMI_VIE_MS = 60_000.0;  // l'impact retombe de moitié toutes les 60 s

  private final Map<String, LiveRoom> liveRooms = new ConcurrentHashMap<>();

  @PostMapping
  public LiveRoom createRoom(@RequestBody CreateLiveRoomRequest req) {
    String code = "LIVE-" + UUID.randomUUID().toString().substring(0, 4).toUpperCase();
    LiveRoom room = new LiveRoom(code, req.scenarioId, req.pseudo, req.dureeMinutes > 0 ? req.dureeMinutes : 15);
    liveRooms.put(code, room);
    return room;
  }

  @PostMapping("/{code}/join")
  public LiveRoom joinRoom(@PathVariable String code, @RequestBody JoinLiveRoomRequest req) {
    LiveRoom room = trouver(code);
    synchronized (room) {
      boolean exists = room.joueurs.stream().anyMatch(j -> j.pseudo.equals(req.pseudo));
      if (!exists) {
        room.joueurs.add(new LivePlayer(req.pseudo));
        room.evenements.add(req.pseudo + " a rejoint la salle.");
      }
      room.decay();
    }
    return room;
  }

  @GetMapping("/{code}")
  public LiveRoom getRoom(@PathVariable String code) {
    LiveRoom room = trouver(code);
    synchronized (room) { room.decay(); }
    return room;
  }

  /** Ordre d'un joueur (ou d'un bot, bot=true) : change le prix pour TOUT LE MONDE. */
  @PostMapping("/{code}/action")
  public LiveRoom logAction(@PathVariable String code, @RequestBody LiveActionRequest req) {
    LiveRoom room = trouver(code);
    synchronized (room) {
      room.decay();
      double notionnel = req.quantite * (req.prix > 0 ? req.prix : 0);
      double delta = 100.0 * notionnel / LIQUIDITE * (req.action.contains("ACHET") ? 1 : -1);
      room.ajouterImpact(req.symbole, delta);
      room.evenements.add((req.bot ? "🤖 " : "") + req.pseudo + " a " + req.action + " "
        + String.format(Locale.US, "%.4f", req.quantite) + " " + req.symbole
        + " → impact " + String.format(Locale.US, "%+.2f", delta) + "%");
    }
    return room;
  }

  /** Événement du MJ : CRASH / PUMP (valeur = % signé), NEWS (valeur = % signé, texte), BOT_FORCE (texte = bot, valeur = % signé). */
  @PostMapping("/{code}/event")
  public LiveRoom logEvent(@PathVariable String code, @RequestBody LiveEventRequest req) {
    LiveRoom room = trouver(code);
    synchronized (room) {
      room.decay();
      String v = String.format(Locale.US, "%+.0f", req.valeur);
      boolean tous = req.symbole == null || req.symbole.isBlank() || req.symbole.equals("TOUS");
      String cible = tous ? "tout le marché" : req.symbole;
      String message = switch (req.type) {
        case "CRASH" -> "📢 ÉVÉNEMENT : " + cible + " s'effondre (" + v + "%) !";
        case "PUMP" -> "🚀 ÉVÉNEMENT : " + cible + " explose (" + v + "%) !";
        case "NEWS" -> "📰 BREAKING NEWS (" + cible + ", " + v + "%) : " + req.texte;
        case "BOT_FORCE" -> "🤖 ÉVÉNEMENT : " + req.texte + " est forcé d'agir sur " + cible + " (" + v + "%).";
        default -> "Événement inconnu.";
      };
      room.ajouterImpact(tous ? null : req.symbole, req.valeur);
      room.evenements.add(message);
    }
    return room;
  }

  /** Chat global (joueurs et bots). */
  @PostMapping("/{code}/message")
  public LiveRoom postMessage(@PathVariable String code, @RequestBody LiveMessageRequest req) {
    LiveRoom room = trouver(code);
    if (req.texte == null || req.texte.isBlank()) return room;
    String t = req.texte.length() > 200 ? req.texte.substring(0, 200) : req.texte;
    synchronized (room) {
      room.messages.add(new ChatMsg(req.pseudo, t, req.bot));
      while (room.messages.size() > 200) room.messages.remove(0);
    }
    return room;
  }

  /** Seul l'hôte (1er joueur) peut lancer la partie ; il faut au moins 1 joueur en plus de lui. */
  @PostMapping("/{code}/start")
  public LiveRoom startRoom(@PathVariable String code, @RequestBody JoinLiveRoomRequest req) {
    LiveRoom room = trouver(code);
    synchronized (room) {
      if (room.demarree) return room;
      if (room.joueurs.isEmpty() || !room.joueurs.get(0).pseudo.equals(req.pseudo))
        throw new RuntimeException("Seul l'hôte peut lancer la partie");
      if (room.joueurs.size() < 2) throw new RuntimeException("Il faut au moins 1 joueur en plus de l'hôte");
      room.demarree = true;
      room.debutMs = System.currentTimeMillis();
      room.dernierMajMs = room.debutMs;
      room.evenements.add("🔔 La partie commence !");
    }
    return room;
  }

  /** Résultat final d'un joueur (envoyé à la fin de sa séance). */
  @PostMapping("/{code}/result")
  public LiveRoom postResult(@PathVariable String code, @RequestBody ResultRequest req) {
    LiveRoom room = trouver(code);
    synchronized (room) {
      for (LivePlayer p : room.joueurs) {
        if (p.pseudo.equals(req.pseudo)) {
          p.pnl = req.pnl; p.pnlPct = req.pnlPct; p.valeur = req.valeur;
          p.nbOrdres = req.nbOrdres; p.stopLoss = req.stopLoss; p.drawdown = req.drawdown; p.score = req.score;
          p.termine = true;
        }
      }
    }
    return room;
  }

  @PostMapping("/{code}/leave")
  public void leaveRoom(@PathVariable String code, @RequestBody JoinLiveRoomRequest req) {
    LiveRoom room = liveRooms.get(code.toUpperCase());
    if (room == null) return;
    synchronized (room) {
      if (!room.demarree) room.joueurs.removeIf(j -> j.pseudo.equals(req.pseudo));          // avant le départ : on retire
      else room.joueurs.stream().filter(j -> j.pseudo.equals(req.pseudo)).forEach(j -> j.actif = false);  // en partie : abandon (sauf s'il a fini)
      room.evenements.add(req.pseudo + " a quitté la salle.");
      if (room.joueurs.stream().noneMatch(j -> j.actif)) liveRooms.remove(code.toUpperCase());
    }
  }

  private LiveRoom trouver(String code) {
    LiveRoom room = liveRooms.get(code.toUpperCase());
    if (room == null) throw new RuntimeException("Salle Live introuvable");
    return room;
  }

  // ===================== classes =====================

  public static class LiveRoom {
    public String code;
    public String scenarioId;
    public int dureeMinutes;
    public long debutMs = System.currentTimeMillis();
    public double impactGlobal = 0;                     // choc "tout le marché" (en %)
    public Map<String, Double> impacts = new ConcurrentHashMap<>();   // choc par actif (en %)
    public List<LivePlayer> joueurs = new CopyOnWriteArrayList<>();
    public List<String> evenements = new CopyOnWriteArrayList<>();
    public List<ChatMsg> messages = new CopyOnWriteArrayList<>();
    public boolean demarree = false;
    public String statut = "EN_COURS";
    long dernierMajMs = System.currentTimeMillis();   // privé : non sérialisé

    public LiveRoom(String code, String scenarioId, String createur, int dureeMinutes) {
      this.code = code; this.scenarioId = scenarioId; this.dureeMinutes = dureeMinutes;
      this.joueurs.add(new LivePlayer(createur));
    }
    void decay() {
      long now = System.currentTimeMillis();
      double f = Math.pow(0.5, (now - dernierMajMs) / DEMI_VIE_MS);
      impactGlobal *= f;
      impacts.replaceAll((k, v) -> v * f);
      dernierMajMs = now;
    }
    /** symbole null = tout le marché. */
    void ajouterImpact(String symbole, double d) {
      if (symbole == null) impactGlobal = borne(impactGlobal + d);
      else impacts.merge(symbole, borne(d), (x, y) -> borne(x + y));
    }
    private static double borne(double v) { return Math.max(-IMPACT_MAX, Math.min(IMPACT_MAX, v)); }
  }

  public static class LivePlayer {
    public String pseudo;
    public double pnl = 0, pnlPct = 0, valeur = 0, drawdown = 0;
    public int nbOrdres = 0, score = 0;
    public boolean stopLoss = false, termine = false, actif = true;
    public LivePlayer(String pseudo) { this.pseudo = pseudo; }
  }

  public static class ChatMsg {
    public String pseudo; public String texte; public boolean bot; public long ts = System.currentTimeMillis();
    public ChatMsg(String pseudo, String texte, boolean bot) { this.pseudo = pseudo; this.texte = texte; this.bot = bot; }
  }

  public static class CreateLiveRoomRequest { public String pseudo; public String scenarioId; public int dureeMinutes; }
  public static class JoinLiveRoomRequest { public String pseudo; }
  public static class LiveActionRequest {
    public String pseudo; public String action; public double quantite; public String symbole;
    public double prix; public boolean bot;
  }
  public static class LiveEventRequest { public String type; public double valeur; public String texte; public String symbole; }
  public static class ResultRequest {
    public String pseudo; public double pnl, pnlPct, valeur, drawdown; public int nbOrdres, score; public boolean stopLoss;
  }
  public static class LiveMessageRequest { public String pseudo; public String texte; public boolean bot; }
}
