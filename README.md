# CraftFlow

Plateforme de prise de rendez-vous et de suivi d'interventions pour artisans indépendants
(plombiers, électriciens, serruriers...).

Projet de fin de formation — Holberton School France, Développeur Web Full-Stack (RNCP niveau 5).
Auteur : Bernis-Dieubéni Kouzou.

## Les trois espaces

| Espace | Ce qu'on peut y faire |
|---|---|
| **Client** | Parcourir le catalogue, réserver un créneau, suivre et annuler ses demandes |
| **Artisan** | Gérer son profil, ses prestations (CRUD) et ses créneaux ; confirmer, terminer ou annuler les interventions |
| **Administration** | Valider les artisans, suspendre des comptes, consulter les statistiques, modérer les rendez-vous |

Cycle de vie d'un rendez-vous : `EN_ATTENTE → CONFIRME → TERMINE`, ou `ANNULE` à tout moment avant la fin.

## Stack technique

- **Front-end** : HTML5, CSS3, JavaScript natif (ES6+, Fetch API), servi par Express (même origine que l'API)
- **Back-end** : Node.js 20+, Express 4, architecture en couches (routes → contrôleurs → modèles)
- **Base de données** : PostgreSQL 14 ou supérieur, requêtes préparées avec `pg` — voir [docs/database.md](docs/database.md)
- **Sécurité** : bcrypt, JWT dans un cookie `HttpOnly` / `Secure` / `SameSite=Strict`, contrôle d'origine (CSRF),
  Helmet (CSP stricte), limitation des tentatives de connexion, validation de toutes les entrées côté serveur

## Pages du site

| Espace | Pages |
|---|---|
| Public | `/` catalogue filtrable, `/login.html`, `/register.html` (client ou artisan) |
| Client | `/service.html?id=` choix d'un créneau et réservation, `/client/rendez-vous.html` suivi et annulation |
| Artisan | `/artisan/` tableau de bord, `/artisan/prestations.html`, `/artisan/creneaux.html`, `/artisan/profil.html` |
| Admin | `/admin/` statistiques, artisans, utilisateurs, rendez-vous |

Le front est écrit en JavaScript natif (modules ES6) sans framework. Aucune page ne contient de script ni de
style en ligne : la politique de sécurité (CSP) du serveur les interdit, et tout texte affiché passe par
`textContent` (jamais `innerHTML`).

## Installation

Prérequis : Node.js 20+ et PostgreSQL 14 ou supérieur (avec l'extension `btree_gist`, incluse par défaut).

```bash
git clone https://github.com/Niber236/MiniCRM.git craftflow
cd craftflow
npm install
cp .env.example .env          # puis adapter DATABASE_URL et JWT_SECRET
```

Créer les bases (une pour le développement, une pour les tests) :

```bash
createdb craftflow
createdb craftflow_test
```

Initialiser le schéma et les données de démonstration, puis lancer le serveur :

```bash
npm run db:reset
npm run dev                    # http://localhost:3000
```

## Comptes de démonstration

Mot de passe commun : `Demo1234`

| Rôle | Email |
|---|---|
| Admin | `admin@craftflow.fr` |
| Client | `client@craftflow.fr`, `julien@craftflow.fr` |
| Artisan vérifié | `plombier@craftflow.fr`, `electricien@craftflow.fr` |
| Artisan en attente de validation | `serrurier@craftflow.fr` |

Créer un administrateur en production (aucune route publique ne le permet) :

```bash
npm run create-admin -- admin@exemple.fr "MotDePasse123" Prénom Nom
```

## Tests

```bash
npm test
```

37 tests : intégration (API + base réelle `craftflow_test`), unitaires (machine à états) et garde-fous du
front (pas de script ou style en ligne, pas d'`innerHTML`, fichiers référencés existants).
Ils couvrent l'authentification, les rôles, le cloisonnement des données, la double réservation
simultanée, les transitions interdites, le CSRF, le prix figé et le chevauchement des créneaux.
Le fichier `.env.test` ne contient que des valeurs de test locales.

## API REST

Toutes les routes sont préfixées par `/api`. Réponses en JSON.

| Méthode | Route | Accès | Rôle |
|---|---|---|---|
| POST | `/auth/register` | public | Inscription client ou artisan |
| POST | `/auth/login` | public | Connexion (pose le cookie de session) |
| POST | `/auth/logout` | public | Déconnexion |
| GET | `/auth/me` | connecté | Utilisateur courant |
| GET | `/trades` | public | Corps de métier |
| GET | `/services?trade=&city=&q=` | public | Catalogue filtrable |
| GET | `/services/:id` | public | Détail d'une prestation |
| GET | `/services/:id/slots` | public | Créneaux libres |
| GET | `/services/mine` | artisan | Mes prestations |
| POST / PUT / DELETE | `/services[/:id]` | artisan | Créer, modifier, désactiver une prestation |
| GET / POST | `/slots` | artisan | Mon planning, créer des créneaux par plage horaire |
| DELETE | `/slots/:id` | artisan | Supprimer un créneau jamais réservé |
| GET / PUT | `/artisan/profile` | artisan | Profil professionnel |
| GET | `/appointments?status=` | connecté | Rendez-vous (filtrés selon le rôle) |
| GET | `/appointments/:id` | connecté | Détail + historique |
| POST | `/appointments` | client | Réserver |
| PATCH | `/appointments/:id/status` | connecté | Changer le statut (selon la machine à états) |
| GET | `/admin/stats` | admin | Statistiques |
| GET | `/admin/users?role=` | admin | Utilisateurs |
| PATCH | `/admin/users/:id/active` | admin | Suspendre / réactiver un compte |
| PATCH | `/admin/artisans/:id/verify` | admin | Valider un artisan |

## Structure du projet

```
db/            schéma SQL, initialisation, données de démo, création d'admin
docs/          documentation technique (modèle de données)
public/
  css/         feuille de style commune (thèmes clair et sombre)
  js/          modules partagés (api, session, ui, layout, components) et js/pages/ (un fichier par page)
  client/ artisan/ admin/   pages de chaque espace
src/
  config.js    variables d'environnement
  app.js       application Express (sécurité, routes, fichiers statiques)
  routes/      déclaration des routes et des contrôles d'accès
  controllers/ logique HTTP (validation, réponses)
  models/      accès à la base (requêtes SQL préparées)
  services/    règles métier (machine à états)
  middlewares/ authentification, gestion d'erreurs, limitation de débit
  utils/       validation, erreurs HTTP
tests/         tests d'intégration et unitaires
```

## Workflow Git

- `main` : version stable, déployée
- `develop` : intégration
- `feature/<nom>` : une branche par fonctionnalité, fusionnée dans `develop` par pull request
- Commits au format Conventional Commits : `feat:`, `fix:`, `docs:`, `test:`, `refactor:`
