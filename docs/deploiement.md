# Déploiement sur Render

Ce guide met CraftFlow en ligne, avec une base PostgreSQL, pour obtenir une démo accessible par lien.
Render est une plateforme d'hébergement : elle récupère le code sur GitHub, l'installe, le lance et fournit une adresse HTTPS.

> Les noms des boutons et les limites de l'offre gratuite (mise en veille, durée de la base) sont ceux que je connais de Render.
> Ils peuvent avoir changé : vérifiez-les sur la page *Pricing* de Render avant de compter dessus.

## Ce qui est déployé

| Élément | Rôle |
|---|---|
| **Web service `craftflow`** | Lance `npm start` : prépare la base, puis sert l'API et les pages du site (même adresse, donc cookies de session valides) |
| **Base `craftflow-db`** | PostgreSQL, accessible uniquement par le service (réseau privé de Render) |

Au premier démarrage, `db/ensure-schema.js` constate que la base est vide, crée le schéma et insère les données de démonstration
(`SEED_DEMO=true`). Aux démarrages suivants, il ne touche à rien : **vos données ne sont jamais effacées par un redémarrage ou un redéploiement**.

## Avant de commencer

1. Un compte sur https://render.com (le plus simple : *Sign up with GitHub*).
2. Le code à jour sur la branche `main` de https://github.com/Niber236/MiniCRM (fichier `render.yaml` présent à la racine).
3. Un mot de passe pour les comptes de démonstration, **différent de `Demo1234`** (ce dernier est public dans le dépôt). Choisissez-en un
   d'au moins 8 caractères : vous le donnerez au jury.

## Méthode A : Blueprint (recommandée)

1. Dans le tableau de bord Render : **New +** puis **Blueprint**.
2. Connectez GitHub si Render le demande, puis choisissez le dépôt `Niber236/MiniCRM`, branche `main`.
3. Render lit `render.yaml` et affiche ce qu'il va créer : 1 base de données et 1 service web.
4. Il demande la valeur de **`DEMO_PASSWORD`** : saisissez le mot de passe choisi à l'étape précédente.
5. Cliquez sur **Apply** (ou *Deploy Blueprint*) et attendez quelques minutes (installation, démarrage).
6. Ouvrez le service `craftflow` : son adresse `https://craftflow-xxxx.onrender.com` est affichée en haut de la page.

Dans l'onglet **Logs** du service, vous devez voir :

```
Base vide : création du schéma...
Schéma créé.
Insertion des données de démonstration...
CraftFlow démarré sur http://localhost:10000 (production)
```

## Méthode B : à la main (si le Blueprint pose problème)

1. **New +** puis **PostgreSQL** : nom `craftflow-db`, base `craftflow`, utilisateur `craftflow`, plan gratuit, puis *Create*.
   Copiez l'**Internal Database URL** une fois la base prête.
2. **New +** puis **Web Service** : dépôt `Niber236/MiniCRM`, branche `main`, runtime **Node**.
   - Build Command : `npm ci`
   - Start Command : `npm start`
   - Health Check Path (dans *Advanced*) : `/api/health`
3. Variables d'environnement du service :

| Variable | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` |
| `DATABASE_URL` | l'Internal Database URL copiée à l'étape 1 |
| `JWT_SECRET` | une longue chaîne aléatoire (voir la commande ci-dessous) |
| `SEED_DEMO` | `true` |
| `DEMO_PASSWORD` | le mot de passe choisi pour les comptes de démo |

Pour fabriquer un `JWT_SECRET` (dans un terminal, sur votre ordinateur) :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Vérifier que le site fonctionne

1. `https://<votre-adresse>/api/health` doit répondre `{"status":"ok"}`.
2. Sur la page d'accueil, le catalogue affiche 6 prestations.
3. Connectez-vous avec `plombier@craftflow.fr` et votre `DEMO_PASSWORD`, puis testez un parcours complet (client : réserver ; artisan : confirmer).
4. Le cadenas HTTPS est présent : les cookies de session sont marqués `Secure`.
5. **Postman** : dans la collection, changez la variable `baseUrl` en `https://<votre-adresse>` et la variable `password` en votre `DEMO_PASSWORD`, puis *Run collection*.

Comptes de démonstration (mot de passe = `DEMO_PASSWORD`) : `admin@craftflow.fr`, `client@craftflow.fr`, `julien@craftflow.fr`,
`plombier@craftflow.fr`, `electricien@craftflow.fr`, `serrurier@craftflow.fr` (ce dernier attend la validation de l'administrateur).

## Limites à connaître (offre gratuite, à vérifier sur Render)

- **Mise en veille** : un service gratuit s'endort après une quinzaine de minutes sans visite. La première page chargée ensuite peut mettre
  30 à 60 secondes. **Ouvrez le site quelques minutes avant la soutenance** pour le réveiller.
- **Durée de vie de la base gratuite** : elle est limitée dans le temps (30 jours à ma connaissance). Créez-la quelques jours avant la
  soutenance, pas des semaines avant. Si elle expire, recréez-la : le démarrage suivant recrée le schéma et les données de démonstration.
- **Données de démonstration** : les créneaux sont créés relativement à la date du premier démarrage (les 7 jours suivants). Pour des
  créneaux frais, supprimez puis recréez la base (ou ouvrez des créneaux depuis l'espace artisan).

## Sécurité en production

| Mesure | Où |
|---|---|
| HTTPS imposé, en-tête HSTS | Render et Helmet |
| Cookie de session `HttpOnly`, `Secure`, `SameSite=Strict` | `src/middlewares/auth.js` |
| `JWT_SECRET` généré par Render, refus de démarrer s'il fait moins de 32 caractères | `render.yaml`, `src/config.js` |
| Mot de passe de démo hors du dépôt, jamais affiché dans les journaux | `DEMO_PASSWORD`, `db/seed.js` |
| `npm start` n'efface jamais une base qui contient des données | `db/ensure-schema.js` (testé) |
| Contrôle d'origine contre le CSRF, derrière le proxy de Render | `src/app.js` (`trust proxy`) |
| Limitation des tentatives de connexion (20 par 15 minutes et par IP) | `src/middlewares/rateLimit.js` |

Limite assumée : la connexion à la base utilise SSL sans vérifier le certificat (`rejectUnauthorized: false`), ce qui est courant chez
les hébergeurs mais moins strict qu'une vérification complète. Le trafic reste dans le réseau privé de Render.

## Mettre à jour le site

Chaque push sur `main` redéploie automatiquement le site (réglage par défaut de Render). La CI GitHub vérifie les tests sur chaque push :
regardez l'onglet *Actions* avant de fusionner dans `main`.

## Problèmes fréquents

| Message dans les journaux | Cause et solution |
|---|---|
| `JWT_SECRET doit contenir au moins 32 caractères en production` | Variable absente ou trop courte : en générer une avec la commande ci-dessus |
| `En production, définissez DEMO_PASSWORD (8 caractères minimum)` | Renseigner `DEMO_PASSWORD`, ou mettre `SEED_DEMO` à `false` |
| `Échec de la préparation de la base : ... SSL` | Ajouter la variable `DATABASE_SSL` = `false` |
| `Échec de la préparation de la base : ... btree_gist` | La base refuse de créer l'extension : s'y connecter avec l'*External Database URL* (`psql`) et lancer `CREATE EXTENSION btree_gist;` |
| Page blanche ou erreur 502 pendant une minute | Le service se réveille ou démarre : patienter puis recharger |
| Connexion impossible alors que le mot de passe est bon | Vérifier `DEMO_PASSWORD` : la valeur utilisée est celle d'au **premier** démarrage (base vide) |
