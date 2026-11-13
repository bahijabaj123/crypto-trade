# CryptoTrade V1 — AI Advisor BTCUSDT 1 h

Guide d'installation **Windows** pour tester le conseiller pédagogique
(HAUSSE / BAISSE / ATTENDRE) avec FastAPI, Angular et TreeSHAP.

Le modèle est **déjà entraîné**. Il ne faut ni le réentraîner, ni télécharger
les archives historiques Binance, ni lancer Spring Boot.

Cette procédure a été vérifiée sous **Windows**. Elle n'est pas validée sous Linux.

**Aucun ordre n'est envoyé.** L'IA ne place, ne modifie et n'annule aucun trade.

## Prérequis

- Windows 10 ou 11, Python **3.11 64 bits** (pas 3.10, pas 3.12)
- Node.js **22**
- Accès HTTPS à `https://api.binance.com` (aucune clé API)
- Le dépôt CryptoTrade (branche `feature/ai-trading`)
- Le ZIP du modèle, **hors Git** : `CryptoTrade-BTCUSDT-1h-v1-frozen.zip`

SHA-256 attendu du ZIP (voir aussi `MODEL_SHA256SUMS.txt`) :

```text
ef10995c6bae973942d9cf9edf93a41f14605f3da94f75d81da2569d7e7f163b
```

## 1. Récupérer et extraire le modèle

1. Obtenir le ZIP auprès de l'équipe (il n'est pas dans le dépôt Git).
2. Vérifier l'empreinte, dans le dossier où se trouve le ZIP :

```powershell
Get-FileHash -Algorithm SHA256 .\CryptoTrade-BTCUSDT-1h-v1-frozen.zip
```

Le `Hash` doit correspondre à la valeur ci-dessus (casse indifférente).

3. Extraire vers un dossier **hors du dépôt Git**, par exemple `C:\CryptoTrade-AI-Data`.
   Après extraction, ce fichier doit exister :

```text
C:\CryptoTrade-AI-Data\models\BTCUSDT-1h-v1\selection.json
```

```powershell
New-Item -ItemType Directory -Force -Path C:\CryptoTrade-AI-Data | Out-Null
Expand-Archive -Path .\CryptoTrade-BTCUSDT-1h-v1-frozen.zip -DestinationPath C:\CryptoTrade-AI-Data
```

Ne pas y copier de datasets historiques. Les quatre fichiers du ZIP suffisent.

## 2. Environnement Python et dépendances figées

Dans PowerShell, depuis le dossier `ai-service` du dépôt :

```powershell
cd ai-service
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip
python -m pip install -r requirements-api.lock.txt
```

Si l'activation du venv est refusée, autoriser les scripts pour votre utilisateur :

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Contrôle rapide :

```powershell
python -c "import sklearn, numpy, shap, fastapi; print(sklearn.__version__, numpy.__version__, shap.__version__)"
```

Attendu : `1.3.2 1.24.3 0.49.1`.

N'installez pas une autre version de scikit-learn : le chargement du modèle serait refusé.

## 3. Lancer FastAPI

Toujours dans `ai-service`, venv activé, **laisser ce terminal ouvert** :

```powershell
$env:CRYPTOTRADE_AI_DATA_DIR = "C:\CryptoTrade-AI-Data"
python scripts\run_api.py
```

L'API écoute uniquement `http://127.0.0.1:8000` (pas le réseau local).

Dans un **deuxième** terminal PowerShell (le venv n'est pas nécessaire) :

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/ia/health
Invoke-RestMethod http://127.0.0.1:8000/api/ia/model-info
```

`health` doit indiquer `"status": "UP"` et `"modele_charge": true`.
`model-info` doit citer `BTCUSDT`, l'expérience `20261108T122920Z-c3c17310`
et l'essai `random_forest-max_depth4-min_samples_leaf200`.

Ces deux routes n'appellent pas Binance. La prédiction live
(`GET /api/ia/predict?symbol=BTCUSDT&explain=true`) oui.

## 4. Lancer Angular

**Troisième** terminal, depuis le dossier `frontend` :

```powershell
cd frontend
npm install
npm start
```

Ouvrir `http://localhost:4200`, puis **Dashboard** ou **Trading**.
Le bouton flottant du conseiller IA est en bas à droite.
Il interroge FastAPI (`127.0.0.1:8000`), pas Spring Boot (`8081`).

Spring Boot n'est **pas** requis pour tester le seul AI Advisor.
Sans backend Java, d'autres widgets (ticker, graphiques, ordres simulés)
peuvent échouer : ce n'est pas bloquant pour le panneau IA.

## 5. Arrêt

Dans chaque terminal de serveur (FastAPI et Angular) : `Ctrl+C`.
Pour quitter le venv Python : `deactivate`.

## Erreurs fréquentes

| Symptôme | Cause probable | Que faire |
|---|---|---|
| `health` en 503, `"code": "MODELE_INDISPONIBLE"` | ZIP mal extrait, mauvais dossier, ou scikit-learn ≠ 1.3.2 | Vérifier `CRYPTOTRADE_AI_DATA_DIR` et `selection.json` ; réinstaller le lockfile |
| `Address already in use` / port 8000 | Un autre processus utilise 8000 | Fermer l'ancienne API ou libérer le port |
| Port 4200 occupé | Un `ng serve` déjà lancé | `Ctrl+C` sur l'ancien terminal Angular |
| `health` UP mais prédiction en erreur marché | Binance injoignable, timeout, HTTP 403/418/429/451 | Vérifier Internet / pare-feu vers `api.binance.com` ; l'IA n'invente aucun chiffre |
| Panneau Angular : API non joignable | FastAPI arrêté, ou Angular pas sur `localhost:4200` | Relancer `python scripts\run_api.py` ; ne pas exposer Angular sur une autre machine (CORS) |
| `Get-FileHash` différent | ZIP incomplet ou substitué | Ne pas extraire ; redemander l'archive à l'équipe |

## Ce que cette V1 ne fait pas

- Pas d'entraînement, pas de téléchargement `data.binance.vision`
- Pas d'ordres automatiques
- Pas de multi-crypto : uniquement BTCUSDT, horizon 1 heure
- Pas de garantie de gain : une probabilité élevée n'est pas un conseil d'investissement
