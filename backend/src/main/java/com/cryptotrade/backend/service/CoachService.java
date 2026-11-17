package com.cryptotrade.backend.service;

import com.cryptotrade.backend.controller.CoachController.AskRequest;
import com.cryptotrade.backend.controller.CoachController.AskResponse;
import com.cryptotrade.backend.controller.CoachController.Tour;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.Duration;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class CoachService {

  @Value("${coach.groq.api-key:}") private String apiKey;
  @Value("${coach.groq.model:openai/gpt-oss-120b}") private String model;
  @Value("${coach.groq.url:https://api.groq.com/openai/v1/chat/completions}") private String url;
  @Value("${coach.limite-par-heure:40}") private int limiteHeure;      // par pseudo
  @Value("${coach.limite-par-jour:900}") private int limiteJour;       // global (palier gratuit ≈ 1000/jour)

  private final ObjectMapper mapper = new ObjectMapper();
  private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
  private final Map<String, Deque<Long>> appelsParPseudo = new ConcurrentHashMap<>();
  private final AtomicInteger appelsJour = new AtomicInteger();
  private volatile LocalDate jourCourant = LocalDate.now();
  private final List<Section> connaissances = new ArrayList<>();

  private record Section(String titre, String texte, Set<String> mots) {}

  private static final String SYSTEM = """
      Tu es le Coach de TradeLAB, plateforme pédagogique de simulation de trading (crypto) et d'actuariat.
      FORMAT (très important) : tutoiement, français, TEXTE BRUT. 60 mots maximum, 4 lignes maximum.
      Interdit : titres (#), gras (**), tableaux, listes numérotées, emojis, récapitulatif de la situation, salutation longue.
      Réponds uniquement à la question posée, va droit au but : 1 phrase de diagnostic + 1 à 2 conseils concrets.
      Pour « bonjour » ou un message vague : une phrase d'accueil + une question courte.
      RÈGLES :
      1. Tout chiffre sur la partie vient de CONTEXTE ou FAITS CALCULÉS. N'invente rien, n'attribue pas une cause (ex. un joueur ou un bot précis) qui n'est pas écrite dans le contexte.
      2. Ne prédis jamais un prix, ne dis jamais « achète / vends maintenant ». Aide à raisonner : risque, plan, taille de position.
      3. Pas d'accès aux actualités en direct : utilise seulement les événements du CONTEXTE.
      4. Définitions et fonctions de l'app : appuie-toi sur CONNAISSANCES. Si tu cites un cours, écris « Cours : <titre> ».
      5. Hors sujet (trading, finance, actuariat, TradeLAB) : refuse en une phrase.
      6. Si tu ne sais pas, dis-le. Termine par « (pédagogique) » seulement si tu recommandes une action.
      """;

  @PostConstruct
  void chargerConnaissances() {
    try (InputStream in = getClass().getResourceAsStream("/coach/connaissances.md")) {
      if (in == null) return;
      String md = new String(in.readAllBytes(), StandardCharsets.UTF_8);
      for (String bloc : md.split("(?m)^## ")) {
        if (bloc.isBlank()) continue;
        int nl = bloc.indexOf('\n');
        String titre = (nl > 0 ? bloc.substring(0, nl) : bloc).trim();
        String texte = nl > 0 ? bloc.substring(nl + 1).trim() : "";
        connaissances.add(new Section(titre, texte, mots(titre + " " + texte)));
      }
    } catch (Exception e) { /* base de connaissances optionnelle */ }
  }

  public boolean disponible() { return apiKey != null && !apiKey.isBlank(); }

  public AskResponse repondre(AskRequest req) {
    if (!disponible()) return local("aucune clé GROQ_API_KEY");
    if (req == null || req.question() == null || req.question().isBlank()) return local("question vide");
    String question = tronquer(req.question(), 500);
    if (!autorise(req.pseudo())) return local("quota atteint");

    try {
      ObjectNode body = mapper.createObjectNode();
      body.put("model", model);
      body.put("temperature", 0.3);
      body.put("max_tokens", 450);
      if (model.contains("gpt-oss")) body.put("reasoning_effort", "low");
      ArrayNode msgs = body.putArray("messages");
      msgs.addObject().put("role", "system").put("content", SYSTEM);

      List<Tour> h = req.historique() == null ? List.of() : req.historique();
      for (Tour t : h.subList(Math.max(0, h.size() - 6), h.size()))
        if (t.texte() != null) msgs.addObject().put("role", "user".equals(t.role()) ? "user" : "assistant").put("content", tronquer(t.texte(), 600));

      StringBuilder u = new StringBuilder();
      u.append("CONNAISSANCES :\n").append(extraits(question)).append("\n\n");
      if (req.contexte() != null) u.append("CONTEXTE (partie en cours, JSON) :\n").append(tronquer(req.contexte(), 3500)).append("\n\n");
      if (req.faitsLocaux() != null) u.append("FAITS CALCULÉS :\n").append(tronquer(req.faitsLocaux(), 1200)).append("\n\n");
      u.append("QUESTION : ").append(question);
      msgs.addObject().put("role", "user").put("content", u.toString());

      HttpRequest r = HttpRequest.newBuilder(URI.create(url))
        .timeout(Duration.ofSeconds(20))
        .header("Authorization", "Bearer " + apiKey)
        .header("Content-Type", "application/json")
        .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
        .build();
      HttpResponse<String> res = http.send(r, HttpResponse.BodyHandlers.ofString());
      if (res.statusCode() != 200) return local("LLM HTTP " + res.statusCode());

      JsonNode out = mapper.readTree(res.body()).path("choices").path(0).path("message").path("content");
      String texte = out.asText("").replaceAll("(?s)<think>.*?</think>", "").trim();
      if (texte.isEmpty()) return local("réponse vide");
      return new AskResponse(nettoyer(texte), "llm", null);
    } catch (Exception e) {
      return local("erreur : " + e.getClass().getSimpleName());
    }
  }

  // ------------------------------------------------------------------ garde-fous
  private boolean autorise(String pseudo) {
    LocalDate auj = LocalDate.now();
    if (!auj.equals(jourCourant)) { jourCourant = auj; appelsJour.set(0); }
    if (appelsJour.get() >= limiteJour) return false;

    String cle = pseudo == null || pseudo.isBlank() ? "anon" : pseudo;
    Deque<Long> q = appelsParPseudo.computeIfAbsent(cle, k -> new ArrayDeque<>());
    long now = System.currentTimeMillis();
    synchronized (q) {
      while (!q.isEmpty() && now - q.peekFirst() > 3_600_000L) q.pollFirst();
      if (q.size() >= limiteHeure) return false;
      q.addLast(now);
    }
    appelsJour.incrementAndGet();
    return true;
  }

  // ------------------------------------------------------------------ recherche dans la base de connaissances
  private String extraits(String question) {
    Set<String> qm = mots(question);
    return connaissances.stream()
      .map(s -> Map.entry(s, s.mots().stream().filter(qm::contains).count()))
      .filter(e -> e.getValue() > 0)
      .sorted((a, b) -> Long.compare(b.getValue(), a.getValue()))
      .limit(3)
      .map(e -> "- " + e.getKey().titre() + " : " + tronquer(e.getKey().texte(), 700))
      .reduce((a, b) -> a + "\n" + b)
      .orElse("(aucun extrait pertinent)");
  }

  private static Set<String> mots(String s) {
    String n = Normalizer.normalize(s.toLowerCase(), Normalizer.Form.NFD).replaceAll("\\p{M}", "");
    Set<String> out = new HashSet<>();
    for (String w : n.split("[^a-z0-9]+")) if (w.length() > 3) out.add(w.length() > 6 ? w.substring(0, 6) : w);   // racine grossière
    return out;
  }

  /** Filet de sécurité : retire le markdown que le front n'affiche pas (titres, gras, tableaux). */
  private static String nettoyer(String s) {
    return s.replaceAll("(?m)^#{1,6}\\s*", "")
      .replace("**", "").replace("__", "")
      .replaceAll("(?m)^\\s*\\|?[-:| ]{3,}\\|?\\s*$", "")
      .replaceAll("(?m)^\\|\\s*", "").replaceAll("\\s*\\|\\s*", " — ")
      .replaceAll("\\n{3,}", "\n\n").trim();
  }

  private static String tronquer(String s, int max) { return s.length() <= max ? s : s.substring(0, max); }
  private static AskResponse local(String raison) { return new AskResponse(null, "local", raison); }
}

