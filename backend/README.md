# CryptoTrade - Backend (Portefeuille + Trading)

API Spring Boot qui gère le **portefeuille virtuel** et le **passage d'ordres** au prix réel de Binance.

## Lancer le projet

Prérequis : **JDK 17 ou plus**.

**Avec IntelliJ IDEA (le plus simple)**
1. `File > Open` et choisir le dossier `backend` (celui qui contient `pom.xml`).
2. Attendre que Maven télécharge les dépendances (barre de progression en bas, 1 à 3 minutes la première fois).
3. Ouvrir `src/main/java/com/cryptotrade/backend/BackendApplication.java` et cliquer sur le triangle vert à côté de `main`.

**Avec le terminal** (si Maven est installé)
```
cd backend
mvn spring-boot:run
```

Quand tu vois `Started BackendApplication`, l'API tourne sur **http://localhost:8080**.

## Tester dans le navigateur

- Prix du Bitcoin : http://localhost:8080/api/marche/prix/BTCUSDT
- Plusieurs prix : http://localhost:8080/api/marche/prix?symboles=BTCUSDT,ETHUSDT,SOLUSDT
- Ton portefeuille : http://localhost:8080/api/portefeuille  (100 000 USDT au départ)
- Base de données (H2) : http://localhost:8080/h2-console
  - JDBC URL : `jdbc:h2:mem:cryptotrade`, utilisateur : `sa`, mot de passe : vide

## Passer un ordre (avec Postman)

`POST http://localhost:8080/api/ordres` avec un corps JSON (Body > raw > JSON) :

```json
{ "symbole": "BTCUSDT", "sens": "ACHAT", "type": "MARKET", "quantite": 0.1 }
```

Puis `GET /api/portefeuille` : le solde a baissé et une position ouverte est apparue.
Pour vendre : même corps avec `"sens": "VENTE"`.

## Les routes

| Méthode | URL | Rôle |
|---|---|---|
| GET | `/api/portefeuille` | Solde, valeur totale, gain/perte, positions ouvertes et fermées |
| GET | `/api/portefeuille/positions?statut=OUVERTE` (ou `FERMEE`) | Une seule liste de positions |
| GET | `/api/transactions` | Historique des transactions |
| GET | `/api/ordres` | Liste des ordres |
| POST | `/api/ordres` | Passer un ordre |
| GET | `/api/marche/prix/{symbole}` | Prix d'une crypto |
| GET | `/api/marche/prix?symboles=A,B,C` | Prix de plusieurs cryptos |

Les erreurs sont renvoyées au format `{"status":400,"message":"Solde insuffisant : ...","horodatage":"..."}`.

## Organisation du code

```
model/       les tables : Portefeuille, Position, Ordre, Transaction (+ les enums)
repository/  l'accès à la base de données
service/     la logique : OrdreService (moteur d'ordres), PortefeuilleService, BinanceService, RisqueService
web/         les routes (contrôleurs) et la gestion des erreurs
dto/         les formats JSON échangés avec Angular
config/      CORS (autorise localhost:4200) et UtilisateurCourant
```

## Ce qui est fait (étape 1) et ce qui reste

Fait : portefeuille virtuel, ordres **MARKET** d'achat et de vente au prix Binance, prix moyen d'achat,
positions ouvertes et fermées, gain/perte latent et réalisé, historique des transactions.

Pour l'étape 2, les points d'accroche existent déjà :
- **Ordres LIMIT, STOP_LOSS, TAKE_PROFIT** : les types existent dans `TypeOrdre`; `OrdreService.passerOrdre` les refuse pour l'instant. Ajouter les champs `prixLimite`, `stopLoss`, `takeProfit` dans `OrdreRequest`.
- **Évaluation du risque avant chaque ordre** (VaR, exposition, HHI) : à écrire dans `RisqueService.verifierAvantOrdre`, déjà appelée avant chaque exécution.
- **Indicateurs (volatilité, VaR, Sharpe, drawdown)** : à ajouter dans un nouveau service qui lit les transactions et les prix.
- **Mode formation** : le champ `mode` existe déjà dans `Portefeuille`.
- **Utilisateur connecté (JWT)** : remplacer le contenu de `UtilisateurCourant.id()`.

## Configuration

Tout est dans `src/main/resources/application.properties` :
- `app.binance.enabled=false` pour travailler sans internet (prix fixes pour BTC, ETH, SOL, BNB, XRP, ADA).
- `app.portefeuille.solde-initial` pour changer le capital de départ.
- Pour passer à MySQL plus tard : changer `spring.datasource.*` et ajouter le driver MySQL dans `pom.xml`.

Les données H2 sont **effacées à chaque redémarrage** (c'est voulu en développement).

## Lancer les tests

`mvn test` (ou clic droit sur `OrdreServiceTest` dans IntelliJ). Ils simulent Binance, donc pas besoin d'internet.
