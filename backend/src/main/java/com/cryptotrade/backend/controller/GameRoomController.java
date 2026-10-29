package com.cryptotrade.backend.controller; // 👈 Vérifie ton package

import org.springframework.web.bind.annotation.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/game/rooms")
@CrossOrigin(origins = "*")
public class GameRoomController {

  private final Map<String, GameRoom> rooms = new ConcurrentHashMap<>();

  // 1. Créer une salle
  @PostMapping
  public GameRoom createRoom(@RequestBody CreateRoomRequest req) {
    String code = "DEFI-" + UUID.randomUUID().toString().substring(0, 4).toUpperCase();
    GameRoom room = new GameRoom(code, req.scenarioId);
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
        room.joueurs.add(new Player(req.pseudo, 0));
        room.evenements.add(req.pseudo + " a rejoint la salle.");
      }
      return room;
    }
    throw new RuntimeException("Salle introuvable");
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
        .ifPresent(j -> j.pnl = req.pnl);

      // Si tous les joueurs ont fini, on peut considérer la partie terminée
      boolean tousTermines = room.joueurs.stream().allMatch(j -> j.pnl != 0.0);
      if (tousTermines) {
        room.statut = "TERMINE";
        room.evenements.add("La partie est terminée !");
      }
    }
    return room;
  }

  // 6. Quitter la salle
  // 6. Quitter la salle
  // 6. Quitter la salle
  @PostMapping("/{code}/leave")
  public void leaveRoom(@PathVariable String code, @RequestBody JoinRoomRequest req) {
    GameRoom room = rooms.get(code.toUpperCase());
    if (room != null) {
      room.statut = "TERMINE";
      room.evenements.add("⚠️ " + req.pseudo + " a quitté la partie.");
      // On ne supprime pas la salle tout de suite pour que les autres joueurs voient le message
    }
  }

  // ==========================================
  // CLASSES INTERNES
  // ==========================================

  public static class GameRoom {
    public String code;
    public String scenarioId;
    public List<Player> joueurs = new ArrayList<>();
    public List<String> evenements = new ArrayList<>(); // 👈 Log des actions
    public String statut = "EN_COURS";

    public GameRoom(String code, String scenarioId) {
      this.code = code;
      this.scenarioId = scenarioId;
    }
  }

  public static class Player {
    public String pseudo;
    public double pnl;
    public long derniereActivite = System.currentTimeMillis();

    public Player(String pseudo, double pnl) {
      this.pseudo = pseudo;
      this.pnl = pnl;

    }
  }

  public static class CreateRoomRequest { public String pseudo; public String scenarioId; }
  public static class JoinRoomRequest { public String pseudo; }
  public static class ScoreRequest { public String pseudo; public double pnl; }
  public static class ActionRequest { public String pseudo; public String action; public String symbole; public double prix; }

  @PostMapping("/{code}/heartbeat")
  public GameRoom heartbeat(@PathVariable String code, @RequestBody JoinRoomRequest req) {
    GameRoom room = rooms.get(code.toUpperCase());
    if (room != null) {
      room.joueurs.stream()
        .filter(j -> j.pseudo.equals(req.pseudo))
        .findFirst()
        .ifPresent(j -> j.derniereActivite = System.currentTimeMillis());

      // Vérifier si un joueur est déconnecté (pas de heartbeat depuis 6 secondes)
      long now = System.currentTimeMillis();
      for (Player p : room.joueurs) {
        if (now - p.derniereActivite > 6000 && !room.statut.equals("TERMINE")) {
          room.statut = "TERMINE";
          room.evenements.add("⚠️ " + p.pseudo + " s'est déconnecté. La partie est terminée.");
          break;
        }
      }
    }
    return room;
  }

}
