# ai-service — Module IA de CryptoTrade

Première brique du module IA : **collecte reproductible des bougies historiques
Binance Spot** (BTCUSDT, 1 heure) à partir des archives mensuelles officielles de
[data.binance.vision](https://data.binance.vision).

Ce module ne contient **pas encore** de modèle de Machine Learning ni d'API FastAPI.
Il ne touche pas au frontend Angular ni au backend Spring Boot.

## Ce que fait le script

1. Télécharge, mois par mois, `BTCUSDT-1h-AAAA-MM.zip` et son fichier `.CHECKSUM`.
2. Vérifie l'empreinte SHA-256 de chaque ZIP. Une archive non conforme n'est jamais enregistrée.
3. Conserve les ZIP bruts tels quels ; une archive déjà présente et valide n'est pas retéléchargée.
4. Convertit les horodatages en **millisecondes UTC** :
   - jusqu'à décembre 2024, les archives Spot sont en millisecondes (13 chiffres) ;
   - depuis janvier 2025, elles sont en microsecondes (16 chiffres), divisées par 1000.
   L'unité est détectée d'après l'ordre de grandeur ; un écart avec l'unité attendue
   pour le mois est signalé dans le rapport.
5. Contrôle chaque ligne et la série complète :
   - les 12 colonnes, des valeurs numériques et finies ;
   - des prix strictement positifs, des volumes positifs ou nuls ;
   - la cohérence OHLC (`low ≤ open, close ≤ high`) ;
   - une ouverture alignée sur l'heure et `close_time = open_time + 3 599 999 ms` ;
   - l'ordre chronologique, les doublons (identiques ou contradictoires) et les trous horaires ;
   - l'exclusion des bougies non clôturées à la date de référence.
6. Produit un **CSV nettoyé** (12 champs d'origine plus les dates lisibles) et un
   **rapport qualité JSON**.

**Aucune donnée n'est jamais inventée** : pas d'interpolation, pas de valeur
simulée. Un trou est listé dans le rapport, pas comblé. En cas d'erreur bloquante,
comme une archive absente, un SHA-256 incorrect ou des doublons contradictoires,
le statut est `ECHEC` et **aucun CSV n'est écrit**.

## Structure

```text
ai-service/
├── .gitignore                  ignore data/, .venv/, caches (ce module uniquement)
├── README.md
├── pyproject.toml              configuration de pytest
├── requirements.txt            dépendances d'exécution (aucune : bibliothèque standard)
├── requirements-dev.txt        dépendances de test (pytest)
├── scripts/
│   └── collect_binance_klines.py   point d'entrée en ligne de commande
├── src/cryptotrade_ai/
│   ├── config.py               période par défaut, dossiers de données
│   └── data/
│       ├── binance_archive.py  téléchargement poli + vérification SHA-256
│       ├── klines.py           conversion des dates + contrôles qualité
│       └── collect.py          enchaînement des étapes, CSV et rapport
└── tests/                      tests unitaires sur données SYNTHÉTIQUES
```

Les données sont créées à l'exécution dans `ai-service/data/`, qui est ignoré par Git :

```text
data/
├── raw/binance/spot/monthly/klines/BTCUSDT/1h/   ZIP + .CHECKSUM officiels
├── processed/BTCUSDT-1h-2020-01_2026-09.csv       CSV nettoyé
└── reports/BTCUSDT-1h-2020-01_2026-09.quality.json rapport qualité
```

Pour stocker les données ailleurs, par exemple hors du dossier OneDrive :

```powershell
$env:CRYPTOTRADE_AI_DATA_DIR = "C:\cryptotrade-data"
```

Vous pouvez aussi passer l'option `--data-dir C:\cryptotrade-data`.

## Installation (Windows PowerShell)

Prérequis : Python 3.10 ou plus récent.

```powershell
cd ai-service
py --version
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
```

Si l'activation est bloquée (« l'exécution de scripts est désactivée »), autorisez-la
pour cette fenêtre uniquement :

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

## Lancer les tests (aucun accès réseau)

```powershell
python -m pytest -v
```

## Utiliser le script

Toutes les commandes se lancent depuis `ai-service/`, avec l'environnement virtuel activé.

**1. Voir ce qui serait téléchargé, sans rien télécharger :**

```powershell
python scripts\collect_binance_klines.py --dry-run
```

**2. Petit essai réel sur un seul mois** (2 petits fichiers) :

```powershell
python scripts\collect_binance_klines.py --start 2024-01 --end 2024-01
```

**3. Collecte complète par défaut, de 2020-01 à 2026-09 :**

Cela représente 81 mois, soit 162 requêtes séquentielles espacées d'au moins
1 seconde, pour quelques mégaoctets au total.

```powershell
python scripts\collect_binance_klines.py
```

**4. Relancer le nettoyage sans réseau**, à partir des ZIP déjà conservés :

```powershell
python scripts\collect_binance_klines.py --offline
```

Options utiles (`--help` pour la liste complète) :

| Option | Rôle | Défaut |
|---|---|---|
| `--start` / `--end` | premier et dernier mois inclus (`AAAA-MM`) | `2020-01` / `2026-09` |
| `--symbol`, `--interval` | paire et intervalle | `BTCUSDT`, `1h` |
| `--reference-time` | exclut les bougies clôturées à partir de cette date UTC | fin de la période |
| `--delay` | pause entre requêtes (minimum 0,5 s) | `1.0` |
| `--data-dir` | dossier des données | `ai-service/data` |

La période par défaut est fixe et **ne dépend jamais de la date du jour**. Le script
vérifie seulement que le dernier mois demandé est terminé, et refuse sinon.

Codes de sortie : `0` (OK, éventuellement avec avertissements), `1` (échec,
voir le rapport), `2` (paramètre invalide).

## Rapport qualité

Le fichier `reports/<symbole>-<intervalle>-<début>_<fin>.quality.json` contient :

- `statut` : `OK`, `OK_AVEC_AVERTISSEMENTS` ou `ECHEC` ;
- `parametres` : période, date de référence, mode hors ligne ;
- `mois` : pour chaque archive, l'URL, le SHA-256 vérifié, le nombre de lignes et
  l'unité détectée ou attendue ;
- `qualite` :
  - les lignes invalides, par raison, avec le détail ;
  - les doublons, les trous horaires et les bougies non clôturées ;
  - les volumes nuls et les bougies « plates » ;
  - la première et la dernière bougie ;
- `sorties` : chemin, nombre de lignes et SHA-256 du CSV produit ;
- `erreurs` et `avertissements`.

## Construction du dataset ML

Le constructeur transforme le CSV nettoyé en dataset de classification binaire.
À la clôture de la bougie `t`, la cible vaut `1` si `close(t+1h) > close(t)`, sinon `0`.
Il **n'entraîne aucun modèle**. La configuration se trouve dans
`config/datasets/btcusdt_1h_v1.json`.

### Commandes (PowerShell, depuis `ai-service/`)

```powershell
.\.venv\Scripts\Activate.ps1
python -m pytest -v
python scripts\build_dataset.py --help
python scripts\build_dataset.py --data-dir C:\CryptoTrade-AI-Data
```

- Si les sorties existent déjà, le script refuse de les remplacer. Pour reconstruire, ajoutez `--overwrite`.
- Le script vérifie d'abord que le SHA-256 du CSV source est identique à celui du rapport de collecte. S'il diffère, il s'arrête.
- Si un contrôle échoue, aucun fichier n'est écrit et aucune donnée n'est inventée.
- Codes de sortie : `0` (succès), `1` (erreur sur les données ou les contrôles), `2` (configuration invalide).

### Fichiers produits

Les fichiers sont écrits dans `<dossier de données>\datasets\BTCUSDT-1h-v1\`.

- `dataset.csv` : un exemple par heure valide, avec les colonnes suivantes :
  - métadonnées : `open_time`, `open_time_utc`, `decision_time_utc`, `symbol`, `split` ;
  - les 17 variables d'entrée ;
  - la cible `target_up_1h` ;
  - `fwd_return_1h`, réservée à l'évaluation.
- `config_used.json` : la configuration appliquée, les valeurs dérivées et le SHA-256 du CSV source.
  Ce fichier ne dépend pas de la date de génération.
- `dataset_report.json` :
  - empreintes SHA-256 ;
  - exemples exclus, par raison et par plage de dates ;
  - trous horaires ;
  - valeurs non finies et doublons ;
  - dates, effectifs et équilibre des classes par ensemble, par année et par mois ;
  - vérification des frontières et audit de causalité.

### Règles de construction

- **Variables causales.** Elles n'utilisent que les bougies closes jusqu'à `t`, dans une série
  d'heures continue. Les indicateurs repartent de zéro après chaque trou, sans interpolation.
  Il faut au moins 72 heures consécutives d'historique.
- **Cible.** La bougie `t+1h` est cherchée par horodatage exact, jamais en prenant la ligne
  suivante. Si elle manque, l'exemple est exclu.

### Séparation train / validation / test

| Ensemble | Période de `t` | Usage |
|---|---|---|
| `train` | 2020-01-01 → 2024-12-31 | apprentissage du modèle et des mises à l'échelle |
| `validation` | 2025-01-01 → 2025-12-31 | choix des réglages, de la calibration et des futurs seuils ATTENDRE |
| `test` | 2026-01-01 → 2026-09-30 | évaluation finale unique, jamais utilisée pour choisir quoi que ce soit |

**Embargo de 73 heures.** Un exemple d'entraînement ou de validation n'est conservé que si
`t ≤ fin de son ensemble − 73 h`. Les 72 dernières heures de chaque ensemble sont donc exclues.
Ainsi, aucune bougie (variables ou cible) n'est partagée entre deux ensembles.

**Passé de l'ensemble précédent.** Les exemples de validation et de test utilisent normalement
leur passé réel, même lorsqu'il se trouve dans l'ensemble précédent : c'est de l'information
connue au moment `t`.

### Colonnes interdites comme variables ML

Seules les 17 variables listées dans `features` de la configuration peuvent servir d'entrées
au modèle. Il est **interdit** d'utiliser comme variables :

- `target_up_1h` et `fwd_return_1h` : ce sont la cible et le rendement futur, à n'utiliser que pour évaluer ;
- tout prix ou volume futur, c'est-à-dire toute donnée de la bougie `t+1h` ou postérieure ;
- les prix et volumes bruts (`open`, `high`, `low`, `close`, `volume`, …) ;
- les métadonnées : `open_time`, `open_time_utc`, `decision_time_utc`, `close_time`, `symbol`, `split`, `source_file`.

La configuration refuse ces colonnes dans `features`, et les tests le vérifient.

## Données synthétiques des tests

Les tests utilisent de **fausses bougies**, définies dans `tests/synthetic_klines.py` et
écrites uniquement dans des dossiers temporaires. Elles servent à vérifier le code et
**ne doivent jamais être utilisées pour entraîner, valider ou évaluer un modèle**.

## Respect de la source Binance

- Seules les archives publiques de `data.binance.vision` sont utilisées ; aucune clé API n'est nécessaire.
- Les requêtes sont envoyées une à la fois, avec une pause, un nombre de tentatives
  limité et un `User-Agent` explicite.
- Le script s'arrête immédiatement en cas de refus (HTTP 403, 418 ou 451) et respecte l'en-tête `Retry-After`.
- Les archives valides sont réutilisées au lieu d'être retéléchargées.
- Avant tout usage, lisez les conditions d'utilisation de Binance. Le script ne peut pas
  vérifier ce point à votre place.

## Limites connues

- Le passage aux microsecondes en janvier 2025 suit l'annonce de Binance. Le script
  ne s'y fie pas aveuglément : il détecte l'unité ligne par ligne et le signale.
- L'archive d'un mois n'est publiée qu'après la fin du mois, souvent quelques jours
  plus tard. Un mois trop récent donne une erreur 404, donc `ECHEC`.
- Les éventuels trous de Binance (maintenances) sont signalés, jamais comblés. Il
  faudra décider plus tard comment les traiter lors de la création des variables du modèle.
