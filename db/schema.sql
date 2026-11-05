-- =====================================================================
-- CraftFlow — Schéma PostgreSQL
-- Exécution : npm run db:init  (ATTENTION : supprime les données)
--
-- 7 tables :
--   users ─┬─ artisan_profiles ─┬─ services ─┐
--          │       │            └─ slots ────┼─ appointments ── appointment_status_history
--          │     trades                      │
--          └─────────────────────────────────┘ (client_id)
--
-- Principes :
--   * Les 3 rôles (client, artisan, admin) partagent UNE table d'authentification.
--   * Les règles critiques sont garanties PAR LA BASE, pas seulement par l'API :
--       - pas de double réservation (index unique partiel)
--       - pas de créneaux qui se chevauchent pour un même artisan (EXCLUDE)
--       - prestation et créneau d'un rendez-vous = même artisan (clés étrangères composites)
--   * Montants en centimes (INTEGER) : pas d'erreurs d'arrondi des flottants.
--   * On désactive (is_active) au lieu de supprimer : l'historique est conservé.
-- =====================================================================

BEGIN;

DROP TABLE IF EXISTS appointment_status_history CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS slots CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS artisan_profiles CASCADE;
DROP TABLE IF EXISTS trades CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS user_role;
DROP TYPE IF EXISTS appointment_status;
DROP FUNCTION IF EXISTS set_updated_at();

-- Nécessaire pour la contrainte d'exclusion (anti-chevauchement des créneaux)
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE user_role AS ENUM ('client', 'artisan', 'admin');
CREATE TYPE appointment_status AS ENUM ('EN_ATTENTE', 'CONFIRME', 'TERMINE', 'ANNULE');

-- Met à jour automatiquement la colonne updated_at à chaque UPDATE.
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Utilisateurs (les 3 rôles partagent la même table d'authentification)
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,                 -- hash bcrypt, jamais le mot de passe
  first_name    VARCHAR(80)  NOT NULL,
  last_name     VARCHAR(80)  NOT NULL,
  phone         VARCHAR(20),
  role          user_role    NOT NULL DEFAULT 'client',
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,     -- compte suspendu par un admin
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_lowercase CHECK (email = LOWER(email))
);

-- ---------------------------------------------------------------------
-- Corps de métier (plombier, électricien...) — table de référence
-- ---------------------------------------------------------------------
CREATE TABLE trades (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(60) NOT NULL UNIQUE
);

-- ---------------------------------------------------------------------
-- Profil professionnel (relation 1-1 avec users, rôle artisan)
-- ---------------------------------------------------------------------
CREATE TABLE artisan_profiles (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  business_name VARCHAR(120) NOT NULL,
  trade_id      INTEGER      NOT NULL REFERENCES trades(id),
  city          VARCHAR(80)  NOT NULL,
  description   TEXT,
  is_verified   BOOLEAN      NOT NULL DEFAULT FALSE,  -- validé par un admin avant d'être visible
  verified_at   TIMESTAMPTZ,
  CONSTRAINT artisan_verified_consistency CHECK (is_verified = (verified_at IS NOT NULL))
);

-- ---------------------------------------------------------------------
-- Catalogue de prestations (appartient à un artisan)
-- ---------------------------------------------------------------------
CREATE TABLE services (
  id               SERIAL PRIMARY KEY,
  artisan_id       INTEGER      NOT NULL REFERENCES artisan_profiles(user_id) ON DELETE CASCADE,
  title            VARCHAR(120) NOT NULL,
  description      TEXT,
  price_cents      INTEGER      NOT NULL CHECK (price_cents >= 0),
  duration_minutes INTEGER      NOT NULL CHECK (duration_minutes BETWEEN 15 AND 480),
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,                   -- "suppression" logique
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Cible de la clé étrangère composite de appointments (id, artisan_id)
  CONSTRAINT services_id_artisan_uq UNIQUE (id, artisan_id)
);

CREATE TRIGGER services_set_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Créneaux de disponibilité définis par l'artisan
-- ---------------------------------------------------------------------
CREATE TABLE slots (
  id         SERIAL PRIMARY KEY,
  artisan_id INTEGER     NOT NULL REFERENCES artisan_profiles(user_id) ON DELETE CASCADE,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT slots_valid_range CHECK (ends_at > starts_at),
  CONSTRAINT slots_id_artisan_uq UNIQUE (id, artisan_id),
  -- Un artisan ne peut pas avoir deux créneaux qui se chevauchent
  CONSTRAINT slots_no_overlap EXCLUDE USING gist (
    artisan_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  )
);

-- ---------------------------------------------------------------------
-- Rendez-vous / interventions
-- ---------------------------------------------------------------------
CREATE TABLE appointments (
  id          SERIAL PRIMARY KEY,
  -- RESTRICT : on ne supprime pas un client qui a un historique (on le désactive).
  client_id   INTEGER            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  artisan_id  INTEGER            NOT NULL,
  service_id  INTEGER            NOT NULL,
  slot_id     INTEGER            NOT NULL,
  -- Tarif FIGÉ au moment de la réservation : si l'artisan change son prix,
  -- les rendez-vous déjà pris ne changent pas.
  price_cents INTEGER            NOT NULL CHECK (price_cents >= 0),
  address     VARCHAR(255)       NOT NULL,
  description TEXT               NOT NULL,
  status      appointment_status NOT NULL DEFAULT 'EN_ATTENTE',
  created_at  TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  -- La prestation ET le créneau doivent appartenir au MÊME artisan :
  -- c'est garanti par la base, pas seulement par le code de l'API.
  CONSTRAINT appointments_service_fk FOREIGN KEY (service_id, artisan_id)
    REFERENCES services (id, artisan_id),
  CONSTRAINT appointments_slot_fk FOREIGN KEY (slot_id, artisan_id)
    REFERENCES slots (id, artisan_id),
  CONSTRAINT appointments_not_self_booking CHECK (client_id <> artisan_id)
);

-- Anti double-réservation : un créneau ne porte qu'UN rendez-vous non annulé.
-- (Si le rendez-vous est annulé, le créneau redevient réservable.)
CREATE UNIQUE INDEX appointments_one_active_per_slot
  ON appointments (slot_id)
  WHERE status <> 'ANNULE';

CREATE TRIGGER appointments_set_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Historique horodaté des changements de statut (traçabilité / audit)
-- ---------------------------------------------------------------------
CREATE TABLE appointment_status_history (
  id             SERIAL PRIMARY KEY,
  appointment_id INTEGER            NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  from_status    appointment_status,              -- NULL à la création
  to_status      appointment_status NOT NULL,
  changed_by     INTEGER            REFERENCES users(id) ON DELETE SET NULL,
  changed_at     TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  CONSTRAINT history_real_change CHECK (from_status IS DISTINCT FROM to_status)
);

-- ---------------------------------------------------------------------
-- Index de performance (colonnes de jointure et de filtre réellement utilisées)
-- ---------------------------------------------------------------------
CREATE INDEX artisan_profiles_trade_idx    ON artisan_profiles (trade_id);
CREATE INDEX services_artisan_idx          ON services (artisan_id);
CREATE INDEX slots_artisan_start_idx       ON slots (artisan_id, starts_at);
CREATE INDEX appointments_client_idx       ON appointments (client_id, status);
CREATE INDEX appointments_artisan_idx      ON appointments (artisan_id, status);  -- tableau de bord artisan
CREATE INDEX appointments_service_idx      ON appointments (service_id);
CREATE INDEX appointments_slot_idx         ON appointments (slot_id);
CREATE INDEX history_appointment_idx       ON appointment_status_history (appointment_id);

INSERT INTO trades (name) VALUES
  ('Plomberie'), ('Électricité'), ('Serrurerie'), ('Chauffage'),
  ('Menuiserie'), ('Peinture'), ('Dépannage multiservice');

COMMIT;
