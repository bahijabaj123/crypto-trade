package com.cryptotrade.backend.controller;

import com.cryptotrade.backend.service.CoachService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Coach IA : POST /api/coach/ask. Si le LLM est indisponible, source="local" et le front utilise son coach interne. */
@RestController
@RequestMapping("/api/coach")
@CrossOrigin(origins = "*")
public class CoachController {

  private final CoachService coach;

  public CoachController(CoachService coach) { this.coach = coach; }

  public record Tour(String role, String texte) {}                       // role = "user" | "bot"
  public record AskRequest(String pseudo, String question, String contexte, String faitsLocaux, List<Tour> historique) {}
  public record AskResponse(String reponse, String source, String raison) {}   // source = "llm" | "local"

  @PostMapping("/ask")
  public AskResponse ask(@RequestBody AskRequest req) {
    return coach.repondre(req);
  }

  @GetMapping("/statut")
  public AskResponse statut() {
    return new AskResponse(null, coach.disponible() ? "llm" : "local", coach.disponible() ? "clé configurée" : "aucune clé GROQ_API_KEY");
  }
}
