// Routes de l'espace artisan et catalogue qui n'avaient aucun test :
// GET /trades, GET et PUT /artisan/profile, GET /services/mine, DELETE /services/:id
// (+ validation des prestations).
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

beforeEach(h.resetDb);
after(() => h.pool.end());

/* ---------- GET /trades ---------- */

test('GET /trades : liste publique des métiers (sans connexion)', async () => {
  const res = await h.agent().get('/api/trades');
  assert.equal(res.status, 200);
  assert.ok(res.body.trades.length >= 7);
  assert.ok(res.body.trades.some((t) => t.name === 'Plomberie'));
  for (const trade of res.body.trades) {
    assert.equal(typeof trade.id, 'number');
    assert.equal(typeof trade.name, 'string');
  }
});

/* ---------- GET /artisan/profile ---------- */

test('GET /artisan/profile : l\'artisan voit son profil et l\'état de validation', async () => {
  const artisan = await h.registerArtisan({ verified: false });
  const res = await artisan.agent.get('/api/artisan/profile');
  assert.equal(res.status, 200);
  assert.equal(res.body.profile.business_name, 'Paul Plomberie');
  assert.equal(res.body.profile.trade, 'Plomberie');
  assert.equal(res.body.profile.city, 'Paris');
  assert.equal(res.body.profile.is_verified, false);
});

test('GET /artisan/profile : refusé aux anonymes (401) et aux clients (403)', async () => {
  const client = await h.registerClient();
  assert.equal((await h.agent().get('/api/artisan/profile')).status, 401);
  assert.equal((await client.agent.get('/api/artisan/profile')).status, 403);
});

/* ---------- PUT /artisan/profile ---------- */

test('PUT /artisan/profile : modification partielle, conservée en base', async () => {
  const artisan = await h.registerArtisan();
  const res = await artisan.agent.put('/api/artisan/profile').send({ city: 'Lyon', description: 'Dépannage 7j/7' });
  assert.equal(res.status, 200);
  assert.equal(res.body.profile.city, 'Lyon');
  assert.equal(res.body.profile.description, 'Dépannage 7j/7');
  assert.equal(res.body.profile.business_name, 'Paul Plomberie'); // champ non envoyé : inchangé

  const again = await artisan.agent.get('/api/artisan/profile');
  assert.equal(again.body.profile.city, 'Lyon');
});

test('PUT /artisan/profile : corps vide → profil inchangé', async () => {
  const artisan = await h.registerArtisan();
  const res = await artisan.agent.put('/api/artisan/profile').send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.profile.city, 'Paris');
});

test('PUT /artisan/profile : validation (nom trop court, métier inconnu)', async () => {
  const artisan = await h.registerArtisan();
  const short = await artisan.agent.put('/api/artisan/profile').send({ businessName: 'A' });
  assert.equal(short.status, 400);
  assert.ok(short.body.details.businessName);

  const unknown = await artisan.agent.put('/api/artisan/profile').send({ tradeId: 99999 });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.details.tradeId, 'Métier inconnu');
});

test('PUT /artisan/profile : un artisan ne peut pas se valider lui-même', async () => {
  const artisan = await h.registerArtisan({ verified: false });
  await artisan.agent.put('/api/artisan/profile').send({ isVerified: true, is_verified: true, city: 'Nice' });
  const res = await artisan.agent.get('/api/artisan/profile');
  assert.equal(res.body.profile.city, 'Nice');
  assert.equal(res.body.profile.is_verified, false);
});

test('PUT /artisan/profile : refusé aux clients (403)', async () => {
  const client = await h.registerClient();
  assert.equal((await client.agent.put('/api/artisan/profile').send({ city: 'Nice' })).status, 403);
});

/* ---------- GET /services/mine ---------- */

test('GET /services/mine : uniquement mes prestations, actives et désactivées', async () => {
  const mine = await h.artisanWithOffer();
  const other = await h.artisanWithOffer();
  await mine.artisan.agent.post('/api/services').send({ title: 'Débouchage', priceCents: 11000, durationMinutes: 60 });
  await mine.artisan.agent.delete(`/api/services/${mine.service.id}`); // désactive la première

  const res = await mine.artisan.agent.get('/api/services/mine');
  assert.equal(res.status, 200);
  assert.equal(res.body.services.length, 2);
  assert.ok(res.body.services.every((s) => s.id !== other.service.id));
  assert.deepEqual(res.body.services.map((s) => s.is_active), [true, false]); // actives d'abord
});

test('GET /services/mine : refusé aux anonymes (401) et aux clients (403)', async () => {
  const client = await h.registerClient();
  assert.equal((await h.agent().get('/api/services/mine')).status, 401);
  assert.equal((await client.agent.get('/api/services/mine')).status, 403);
});

/* ---------- DELETE /services/:id (désactivation) ---------- */

test('DELETE /services/:id : désactive la prestation, la retire du catalogue, puis PUT la réactive', async () => {
  const { artisan, service } = await h.artisanWithOffer();

  const res = await artisan.agent.delete(`/api/services/${service.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.service.is_active, false);

  const publicList = await h.agent().get('/api/services');
  assert.ok(!publicList.body.services.some((s) => s.id === service.id));
  assert.equal((await h.agent().get(`/api/services/${service.id}`)).status, 404);

  const mine = await artisan.agent.get('/api/services/mine');
  assert.equal(mine.body.services[0].is_active, false); // toujours visible pour son propriétaire

  const back = await artisan.agent.put(`/api/services/${service.id}`).send({ isActive: true });
  assert.equal(back.status, 200);
  assert.ok((await h.agent().get('/api/services')).body.services.some((s) => s.id === service.id));
});

test('DELETE /services/:id : l\'historique des rendez-vous est conservé, mais plus de nouvelle réservation', async () => {
  const { artisan, service, slots } = await h.artisanWithOffer();
  const client = await h.registerClient();
  const created = await client.agent.post('/api/appointments').send(h.booking(service, slots[0]));
  assert.equal(created.status, 201);

  await artisan.agent.delete(`/api/services/${service.id}`);

  const list = await client.agent.get('/api/appointments');
  assert.equal(list.body.appointments.length, 1); // le rendez-vous existe toujours
  const again = await client.agent.post('/api/appointments').send(h.booking(service, slots[1]));
  assert.equal(again.status, 404); // mais la prestation n'est plus réservable
});

test('DELETE /services/:id : prestation d\'un autre artisan (404), inconnue (404), identifiant invalide (400)', async () => {
  const { service } = await h.artisanWithOffer();
  const intruder = await h.registerArtisan();
  assert.equal((await intruder.agent.delete(`/api/services/${service.id}`)).status, 404);
  assert.equal((await intruder.agent.delete('/api/services/999999')).status, 404);
  assert.equal((await intruder.agent.delete('/api/services/abc')).status, 400);
});

test('DELETE /services/:id : refusé aux anonymes (401) et aux clients (403)', async () => {
  const { service } = await h.artisanWithOffer();
  const client = await h.registerClient();
  assert.equal((await h.agent().delete(`/api/services/${service.id}`)).status, 401);
  assert.equal((await client.agent.delete(`/api/services/${service.id}`)).status, 403);
});

/* ---------- Validation des prestations ---------- */

test('POST /services : prix négatif, durée hors limites et titre trop court sont refusés', async () => {
  const artisan = await h.registerArtisan();
  const bad = await artisan.agent.post('/api/services').send({ title: 'ab', priceCents: -1, durationMinutes: 10 });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.details.title);
  assert.ok(bad.body.details.priceCents);
  assert.ok(bad.body.details.durationMinutes);

  const tooLong = await artisan.agent.post('/api/services').send({ title: 'Chantier', priceCents: 100, durationMinutes: 481 });
  assert.equal(tooLong.status, 400);
});
