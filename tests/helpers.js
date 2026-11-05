// Outils partagés par les tests d'intégration (base craftflow_test, voir .env.test).
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const { pool, query } = require('../src/db/pool');

const PASSWORD = 'Password123';

/** Vide toutes les tables (sauf la table de référence trades). */
async function resetDb() {
  await query(`TRUNCATE appointment_status_history, appointments, slots, services,
               artisan_profiles, users RESTART IDENTITY CASCADE`);
}

/** Retourne un "agent" supertest qui conserve le cookie de session. */
function agent() {
  return request.agent(app);
}

let counter = 0;
const uniqueEmail = (prefix) => `${prefix}${++counter}_${Date.now()}@test.fr`;

async function registerClient(overrides = {}) {
  const a = agent();
  const res = await a.post('/api/auth/register').send({
    email: uniqueEmail('client'), password: PASSWORD, firstName: 'Claire', lastName: 'Client',
    role: 'client', ...overrides,
  });
  if (res.status !== 201) throw new Error(`register client: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent: a, user: res.body.user };
}

/** Crée un artisan ; s'il est vérifié, ses prestations sont visibles publiquement. */
async function registerArtisan({ verified = true } = {}) {
  const { rows } = await query("SELECT id FROM trades WHERE name = 'Plomberie'");
  const a = agent();
  const res = await a.post('/api/auth/register').send({
    email: uniqueEmail('artisan'), password: PASSWORD, firstName: 'Paul', lastName: 'Plombier',
    role: 'artisan', businessName: 'Paul Plomberie', tradeId: rows[0].id, city: 'Paris',
  });
  if (res.status !== 201) throw new Error(`register artisan: ${res.status} ${JSON.stringify(res.body)}`);
  if (verified) {
    await query('UPDATE artisan_profiles SET is_verified = TRUE, verified_at = NOW() WHERE user_id = $1', [res.body.user.id]);
  }
  return { agent: a, user: res.body.user };
}

/** Aucun compte admin ne peut être créé via l'API : on l'insère directement en base. */
async function createAdmin() {
  const email = uniqueEmail('admin');
  await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ($1, $2, 'Ada', 'Admin', 'admin')`,
    [email, await bcrypt.hash(PASSWORD, 4)]
  );
  const a = agent();
  const res = await a.post('/api/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login admin: ${res.status}`);
  return { agent: a, user: res.body.user };
}

/** Date ISO à J+days, heure fixe. */
function future(days, hour) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

/** Artisan vérifié avec une prestation de 60 min et 4 créneaux d'1 h demain. */
async function artisanWithOffer() {
  const artisan = await registerArtisan();
  const svc = await artisan.agent.post('/api/services').send({
    title: 'Réparation de fuite', description: 'Fuite visible', priceCents: 8900, durationMinutes: 60,
  });
  const slots = await artisan.agent.post('/api/slots').send({
    start: future(1, 8), end: future(1, 12), durationMinutes: 60,
  });
  return { artisan, service: svc.body.service, slots: slots.body.slots };
}

const booking = (service, slot) => ({
  serviceId: service.id, slotId: slot.id,
  address: '12 rue de Rivoli, 75004 Paris', description: 'Fuite sous l\'évier de la cuisine',
});

module.exports = {
  app, pool, query, PASSWORD, resetDb, agent, registerClient, registerArtisan, createAdmin,
  future, artisanWithOffer, booking,
};
