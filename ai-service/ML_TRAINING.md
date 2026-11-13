# Module d'entraînement ML (protocole 1, BTCUSDT-1h-v1)

Ce module compare deux baselines naïves, une régression logistique et une Random Forest pour
prédire `target_up_1h` (probabilité que `close(t+1h) > close(t)`).

| Ensemble | Période | Usage |
|---|---|---|
| train | 2020-2024 | ajustement des modèles et du scaler, probabilités des baselines |
| validation | 2025 | métriques, sélection du modèle, calibration, choix futur de la couverture ATTENDRE |
| test | janvier-septembre 2026 | **une seule** évaluation finale, après figeage de la sélection |

`fwd_return_1h` n'est jamais une variable d'entrée : il sert uniquement au diagnostic des décisions.

## Installation des dépendances (à lancer vous-même)

Le collecteur et le constructeur de dataset n'ont besoin d'aucune dépendance (`requirements.txt`
reste vide). Les dépendances ML sont dans `requirements-ml.txt` : scikit-learn, numpy et joblib
(scipy est installé automatiquement ; pandas n'est pas utilisé).

```powershell
# Se placer dans le dossier ai-service du dépôt cloné (adapter le chemin)
cd <chemin-du-depot>\crypto-trade\ai-service
.\.venv\Scripts\Activate.ps1

# Option A (recommandée) : les versions avec lesquelles les tests synthétiques ont été exécutés
python -m pip install "scikit-learn==1.3.2" "numpy==1.24.3" "joblib==1.3.2"

# Option B : versions plus récentes, dans les bornes de requirements-ml.txt (à revalider par les tests)
python -m pip install -r requirements-ml.txt

# Dans les deux cas : figer les versions réellement installées, puis lancer les tests
python -m pip freeze > requirements-ml.lock.txt
python -m pytest
```

Sans ces dépendances, les tests ML sont ignorés (`skipped`) et les tests du collecteur et du
dataset passent toujours.

## Configuration

`config/training/btcusdt_1h_v1.json` déclare tout à l'avance :

- graine `42` pour les modèles, le bootstrap et les simulations de calibration ;
- les 17 variables, dans l'ordre exact de `config_used.json` (toute différence est refusée) ;
- baselines : `constant_train_rate` (« toujours hausse », probabilité = taux de hausse du train) et
  `previous_hour_direction` (hausse si `ret_1h > 0` ; probabilités conditionnelles du train) ;
- régression logistique : `Pipeline(StandardScaler, LogisticRegression)`, `C` ∈ {0,001 ; 0,01 ; 0,1 ; 1 ; 10} ;
- Random Forest : `Pipeline(RandomForestClassifier)` sans scaler, 300 arbres,
  `max_depth` ∈ {4, 6, 8}, `min_samples_leaf` ∈ {50, 200} ;
- métrique principale : log loss de validation ;
- règle de sélection et de calibration (ci-dessous) ;
- grille de couverture ATTENDRE `[1.0, 0.5, 0.25, 0.1]` et hypothèse de frais de 0,1 % par ordre.

## Règles de sélection et de refus de signal

1. Un modèle est **éligible** si sa log loss de validation est inférieure à celle de chaque baseline
   **et** si la borne haute de l'intervalle bootstrap à 95 % (blocs d'une semaine) de la différence
   avec la meilleure baseline est négative.
2. Parmi les éligibles, la log loss la plus basse l'emporte ; si la régression logistique ne s'en
   distingue pas (intervalle de la différence contenant 0), elle est préférée car plus simple.
3. La calibration du modèle retenu est jugée **insuffisante** si son ECE (10 groupes de taille égale)
   dépasse le quantile 95 % des ECE qu'obtiendrait un modèle parfaitement calibré (cibles simulées).
4. Si aucun modèle n'est éligible ou si la calibration est insuffisante, le signal est **REFUSÉ** :
   la politique figée sera « toujours ATTENDRE ».

Une probabilité élevée ne garantit aucun profit : le marché change, l'avantage mesuré est faible et
les frais peuvent l'absorber.

## Étapes (chaque étape réelle nécessite un accord explicite)

```powershell
.\.venv\Scripts\Activate.ps1

# 1. Entraînement sur train + comparaison sur validation (ne lit jamais le test)
python scripts\train_models.py --data-dir C:\CryptoTrade-AI-Data

# 2. Après analyse humaine de comparison.json : figer la sélection.
#    --coverage est choisi parmi la grille, sur validation uniquement ; à omettre si le signal est refusé.
python scripts\freeze_selection.py --data-dir C:\CryptoTrade-AI-Data --experiment <run_id> --coverage 0.25

# 3. Évaluation finale UNIQUE du test 2026
python scripts\evaluate_final_test.py --data-dir C:\CryptoTrade-AI-Data
```

Codes de sortie : 0 succès, 1 erreur (rien de partiel n'est conservé), 2 configuration invalide.

## Fichiers produits (hors Git)

Dans `C:\CryptoTrade-AI-Data\models\BTCUSDT-1h-v1\` :

- `experiments\<run_id>\experiment.json` : date, commit Git, versions (Python, scikit-learn, numpy,
  scipy, joblib), SHA-256 du dataset et de la configuration, effectifs, résumé de tous les essais ;
- `experiments\<run_id>\comparison.json` : comparaison aux baselines, intervalles bootstrap,
  modèle retenu, statut du signal, diagnostic de couverture sur validation ;
- `experiments\<run_id>\trials\NN\` : `model.joblib`, `metadata.json`, `metrics.json`
  (train, validation, tableau de calibration), `predictions_validation.csv` ;
- `registry.json` : journal de toutes les expériences, sélections et évaluations finales ;
- `selection.json` : modèle retenu, SHA-256 des modèles figés, politique de décision ;
- `final_test_log.json` et `final_test_final-N.json` : chaque évaluation du test, consignée
  **avant** la lecture du test, avec son statut (`commencee`, `terminee`, `echec`).

Rien n'est remplacé : une expérience existante, un modèle ou une sélection déjà figée provoquent
une erreur. Une sélection ne peut plus changer après une évaluation finale.

## Protections contre les fuites

- Le chargeur vérifie le statut du rapport, l'identité du dataset, les SHA-256 de `dataset.csv` et
  de `config_used.json`, l'en-tête exact, les bornes des splits, l'ordre des horodatages, les
  valeurs finies et les effectifs.
- Pendant l'entraînement et la sélection, les lignes du test ne sont pas converties : seuls leur
  horodatage et leur split sont contrôlés. `DevelopmentData` n'a aucun attribut `test`.
- Le test n'est lisible que par `evaluate_final_test.py`, avec une sélection figée ; une seconde
  évaluation exige `--repeat-reason "motif"`, consigné dans le journal.
- Le scaler est dans le `Pipeline` : il est ajusté sur le train seul.
- Avant chargement, chaque modèle joblib est vérifié par SHA-256 et par version de scikit-learn
  (un fichier joblib peut exécuter du code : ne jamais charger un fichier d'origine inconnue).

Ces verrous protègent contre les accès accidentels ; ils ne remplacent pas la discipline du
protocole (ne pas ouvrir les statistiques du test dans `dataset_report.json`).

## Tests synthétiques

`tests/synthetic_training.py` écrit dans `tmp_path` un faux dataset au même format, avec ou sans
signal planté. Ces données ne représentent aucun marché et ne servent qu'aux tests.
