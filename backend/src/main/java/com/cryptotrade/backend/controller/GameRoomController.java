package com.cryptotrade.backend.controller; // 👈 Vérifie ton package

import org.springframework.web.bind.annotation.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@RestController
@RequestMapping("/api/game/rooms")
@CrossOrigin(origins = "*")
public class GameRoomController {

  // Nombre minimum de joueurs pour lancer une partie (mettre 1 pour tester seul)
  private static final int JOUEURS_MIN = 2;
  // Plafond de sécurité (pas de limite pratique : une classe entière peut jouer)
  private static final int JOUEURS_MAX = 50;
  // Un joueur sans signe de vie depuis ce délai est considéré comme déconnecté
  private static final long DELAI_DECONNEXION_MS = 10000;

  private final Map<String, GameRoom> rooms = new ConcurrentHashMap<>();

  // 1. Créer une salle
  @PostMapping
  public GameRoom createRoom(@RequestBody CreateRoomRequest req) {
    String code = "DEFI-" + UUID.randomUUID().toString().substring(0, 4).toUpperCase();
    GameRoom room = new GameRoom(code, req.scenarioId);
    // Durée de la séance choisie par l'hôte (5 à 120 min), 15 min par défaut
    room.dureeMinutes = (req.dureeMinutes >= 1 && req.dureeMinutes <= 120) ? req.dureeMinutes : 15;
    room.joueurs.add(new Player(req.pseudo, 0));
    rooms.put(code, room);
    return room;
  }

  // 2. Rejoindre une salle
  @PostMapping("/{code}/join")
  public GameRoom joinRoom(@PathVariable String code, @RequestBody JoinRoomRequest req) {
    GameRoom room = rooms.get(code.toUpperCase());
    if (room != null) {
      boolean exists = room.joueurs.stream().anyMatch(j -> j.pseudo.equals(req.pseudo));
      if (!exists) {
        if (room.demarree) throw new RuntimeException("La partie a déjà commencé");
        if (room.joueurs.size() >= JOUEURS_MAX) throw new RuntimeException("Salle pleine");
        room.joueurs.add(new Player(req.pseudo, 0));
        room.evenements.add(req.pseudo + " a rejoint la salle.");
      }
      return room;
    }
    throw new RuntimeException("Salle introuvable");
  }


  // 2b. Lancer la partie (hôte uniquement) : tous les joueurs démarrent en même temps
  @PostMapping("/{code}/start")
  public GameRoom startRoom(@PathVariable String code, @RequestBody JoinRoomRequest req) {
    GameRoom room = rooms.get(code.toUpperCase());
    if (room == null) throw new RuntimeException("Salle introuvable");
    if (room.joueurs.isEmpty() || !room.joueurs.get(0).pseudo.equals(req.pseudo)) {
      throw new RuntimeException("Seul l'hôte peut lancer la partie");
    }
    if (room.joueurs.size() < JOUEURS_MIN) {
      throw new RuntimeException("Il faut au moins " + JOUEURS_MIN + " joueurs");
    }
    if (!room.demarree) {
      room.demarree = true;
      // Délai de grâce : les joueurs n'ont pas encore envoyé de heartbeat (ils changent de page).
      // Sans cela, le premier heartbeat les croirait déconnectés.
      long grace = System.currentTimeMillis() + 10000;
      room.joueurs.forEach(j -> j.derniereActivite = grace);
      room.evenements.add("La partie démarre !");
    }
    return room;
  }

  // 3. Récupérer l'état de la salle (pour le polling)
  @GetMapping("/{code}")
  public GameRoom getRoom(@PathVariable String code) {
    GameRoom room = rooms.get(code.toUpperCase());
    if (room == null) throw new RuntimeException("Salle introuvable");
    return room;
  }

  // 4. Signaler une action (Achat / Vente)
  @PostMapping("/{code}/action")
  public GameRoom logAction(@PathVariable String code, @RequestBody ActionRequest req) {
    GameRoom room = rooms.get(code.toUpperCase());
    if (room != null) {
      room.evenements.add(req.pseudo + " a " + req.action + " " + req.symbole + " (Prix: " + req.prix + "$)");
      return room;
    }
    return null;
  }

  // 5. Envoyer le score final
  @PostMapping("/{code}/score")
  public GameRoom updateScore(@PathVariable String code, @RequestBody ScoreRequest req) {
    GameRoom room = rooms.get(code.toUpperCase());
    if (room != null) {
      room.joueurs.stream()
        .filter(j -> j.pseudo.equals(req.pseudo))
        .findFirst()
        .ifPresent(j -> { j.pnl = req.pnl; j.termine = true; });
      verifierFinDePartie(room);
    }
    return room;
  }

  // 6. Quitter la salle
  // Avant le début : le joueur sort de la liste. Pendant la partie : il est marqué « abandon »
  // et la partie continue pour les autres joueurs.
  @PostMapping("/{code}/leave")
  public void leaveRoom(@PathVariable String code, @RequestBody JoinRoomRequest req) {
    GameRoom room = rooms.get(code.toUpperCase());
    if (room == null) return;
    if (!room.demarree) {
      room.joueurs.removeIf(j -> j.pseudo.equals(req.pseudo));
      if (room.joueurs.isEmpty()) rooms.remove(room.code);
      return;
    }
    room.joueurs.stream()
      .filter(j -> j.pseudo.equals(req.pseudo) && j.actif && !j.termine)
      .findFirst()
      .ifPresent(j -> {
        j.actif = false;
        room.evenements.add("⚠️ " + j.pseudo + " a quitté la partie.");
      });
    verifierFinDePartie(room);
  }

  // La salle est terminée quand tous les joueurs encore présents ont fini (ou s'il n'en reste aucun)
  private void verifierFinDePartie(GameRoom room) {
    if (!room.demarree || "TERMINE".equals(room.statut)) return;
    boolean encoreEnJeu = room.joueurs.stream().anyMatch(j -> j.actif && !j.termine);
    if (!encoreEnJeu) {
      room.statut = "TERMINE";
      room.evenements.add("La partie est terminée !");
    }
  }

  // ==========================================
  // CLASSES INTERNES
  // ==========================================

  public static class GameRoom {
    public String code;
    public String scenarioId;
    public List<Player> joueurs = new CopyOnWriteArrayList<>();
    public List<String> evenements = new CopyOnWriteArrayList<>(); // 👈 Log des actions
    public String statut = "EN_COURS";
    public int dureeMinutes = 15;      // durée de la séance (choisie par l'hôte)
    public boolean demarree = false;   // true quand l'hôte a lancé la partie

    public GameRoom(String code, String scenarioId) {
      this.code = code;
      this.scenarioId = scenarioId;
    }
  }

  public static class Player {
    public String pseudo;
    public double pnl;
    public boolean actif = true;     // false = a quitté ou s'est déconnecté (abandon)
    public boolean termine = false;  // true = a fini sa séance et envoyé son score
    public long derniereActivite = System.currentTimeMillis();

    public Player(String pseudo, double pnl) {
      this.pseudo = pseudo;
      this.pnl = pnl;

    }
  }

  public static class CreateRoomRequest { public String pseudo; public String scenarioId; public int dureeMinutes; }
  public static class JoinRoomRequest { public String pseudo; }
  public static class ScoreRequest { public String pseudo; public double pnl; }
  public static class ActionRequest { public String pseudo; public String action; public String symbole; public double prix; }

  @PostMapping("/{code}/heartbeat")
  public GameRoom heartbeat(@PathVariable String code, @RequestBody JoinRoomRequest req) {
    GameRoom room = rooms.get(code.toUpperCase());
    if (room != null) {
      long now = System.currentTimeMillis();
      room.joueurs.stream()
        .filter(j -> j.pseudo.equals(req.pseudo))
        .findFirst()
        .ifPresent(j -> j.derniereActivite = now);

      // Un joueur sans heartbeat depuis 10 s est considéré comme déconnecté : on le marque « abandon »
      // sans arrêter la partie des autres.
      if (room.demarree && !"TERMINE".equals(room.statut)) {
        for (Player p : room.joueurs) {
          if (p.actif && !p.termine && now - p.derniereActivite > DELAI_DECONNEXION_MS) {
            p.actif = false;
            room.evenements.add("⚠️ " + p.pseudo + " s'est déconnecté.");
          }
        }
        verifierFinDePartie(room);
      }
    }
    return room;
  }

}
