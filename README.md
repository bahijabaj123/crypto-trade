# 🎮 Crypto Trade Simulator - Salle de Marché & Trading Multi-Marchés

## 📖 Description du Projet

Ce projet est un **simulateur de trading professionnel** qui permet à l'utilisateur de trader sur 4 classes d'actifs (Crypto, Actions, Forex, Matières premières) avec de vraies données de marché.

Il intègre deux modes distincts :
1. **Le Mode Réel** : Un portefeuille virtuel pour trader avec les données live du marché (via le backend Java).
2. **Le Mode Simulation Historique (Jeu)** : Un jeu immersif où l'utilisateur revit les plus grands krachs de l'histoire (Covid-19, Subprimes 2008, etc.), avec un chrono en temps réel et un système de recommandation de cours personnalisés ("Coach IA").

L'application supporte également un **mode Multijoueur** permettant de défier ses amis en temps réel.

---

## ✨ Fonctionnalités Principales

### 📊 Dashboard & Marchés
- **Dashboard multi-marchés** avec Heatmap, Pouls du Marché et IA Explicable (XAI).
- **Screener avancé** : Recherche par nom/symbole, tri par colonnes (Prix, Variation, Volume).
- **Page Marché dédiée** pour les 4 classes d'actifs avec colonnes adaptées.

### 💼 Trading & Portefeuille
- **Trading Hybride** :
  - Backend Java (Spring Boot) pour la Crypto (vrais ordres, vrais carnet).
  - Simulation locale (localStorage) pour les Actions, le Forex et les Matières premières.
- **Portefeuille Unifié** : Affiche en temps réel les positions Crypto ET Multi-Marchés avec calcul du P&L.
- **Gestion du Risque** : Module dédié Stop-Loss / Take-Profit.

### 📈 Analyse & Risque
- **Projection Monte-Carlo** : Simulation de 1 000 futurs possibles pour le portefeuille.
- **Métriques professionnelles** : Sharpe Ratio, VaR (Value at Risk), Drawdown maximal, HHI (diversification).
- **Simulateur de crash** : Test de résistance du portefeuille.

### 🎮 Jeu de Salle de Marché
- **Scénarios Historiques** : Covid-19 (Crypto), Subprimes 2008 (Actions), Flash Crash 2010 (Forex), Krach du Pétrole 2020.
- **Time Player** : Chrono en temps réel avec vitesse ajustable (5, 15, 30, 60 minutes).
- **Graphiques Multi-Actifs** : Comparaison des actifs avec échelles indépendantes.
- **Coach IA** : Analyse la performance en fin de partie et recommande un cours personnalisé.
- **Multijoueur** : Création de salle, code d'invitation, flux d'actions en temps réel, gestion de la déconnexion et podium final.

---

## 🛠️ Stack Technologique

### Frontend
- **Angular 18** (Standalone Components, Signals, RxJS)
- **Tailwind CSS** (Design système, thème sombre "Cyberpunk")
- **Lightweight-Charts** (Graphiques en chandeliers et courbes professionnels)
- **TypeScript**

### Backend
- **Spring Boot 3.3.5** (Java 17)
- **Spring Data JPA** (Base de données H2)
- **Maven** (Gestionnaire de dépendances)

### APIs Externes (Gratuites)
- **Binance API** (Crypto : prix, klines, carnet d'ordres)
- **Yahoo Finance** (Actions & Matières premières : prix historiques)
- **Twelve Data** (Forex & Actions : données historiques)
- **Finnhub** (Actions : prix temps réel)

---
## 👥 Équipe

| Membre |
|--------|
| **[Bahija Ben abdeljalil]** |  
| **[Laabidi sarra]** | 
| **[Ben atig rami]** |  
| **[Sfar Aziz]** |  
| **[Ismail linda]** |  
| **[Jeridi Hassen]** |  

## 🚀 Installation & Lancement

### Prérequis
- Node.js (v18+) & npm
- Java 17+ & Maven
- Un navigateur moderne (Chrome, Firefox)

### 1. Lancer le Backend
```bash
cd backend
mvn spring-boot:run
