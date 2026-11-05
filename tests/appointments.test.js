const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

beforeEach(h.resetDb);
after(() => h.pool.end());

test('parcours complet : réservation → confirmation → terminé, avec historique', async () => {
  const { artisan, service, slots } = await h.artisanWithOffer();
  const client = await h.registerClient();

  const created = await client.agent.post('/api/appointments').send(h.booking(service, slots[0]));
  assert.equal(created.status, 201);
  const id = created.body.appointment.id;
  assert.equal(created.body.appointment.status, 'EN_ATTENTE');

  assert.equal((await artisan.agent.patch(`/api/appointments/${id}/status`).send({ status: 'CONFIRME' })).status, 200);
  assert.equal((await artisan.agent.patch(`/api/appointments/${id}/status`).send({ status: 'TERMINE' })).status, 200);

  const detail = await client.agent.get(`/api/appointments/${id}`);
  assert.deepEqual(detail.body.history.map((e) => e.to_status), ['EN_ATTENTE', 'CONFIRME', 'TERMINE']);
});

test('double réservation simultanée : une seule réussit (201 + 409)', async () => {
  const { service, slots } = await h.artisanWithOffer();
  const c1 = await h.registerClient();
  const c2 = await h.registerClient();
  const body = h.booking(service, slots[0]);
  const results = await Promise.all([
    c1.agent.post('/api/appointments').send(body),
    c2.agent.post('/api/appointments').send(body),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
});

test('créneau réservé retiré de la liste, puis libéré après annulation', async () => {
  const { service, slots } = await h.artisanWithOffer();
  const client = await h.registerClient();
  const res = await client.agent.post('/api/appointments').send(h.booking(service, slots[0]));

  let available = (await h.agent().get(`/api/services/${service.id}/slots`)).body.slots;
  assert.ok(!available.some((s) => s.id === slots[0].id));

  await client.agent.patch(`/api/appointments/${res.body.appointment.id}/status`).send({ status: 'ANNULE' });
  available = (await h.agent().get(`/api/services/${service.id}/slots`)).body.slots;
  assert.ok(available.some((s) => s.id === slots[0].id));
});

test('le prix du rendez-vous est figé si l\'artisan change son tarif', async () => {
  const { artisan, service, slots } = await h.artisanWithOffer();
  const client = await h.registerClient();
  const res = await client.agent.post('/api/appointments').send(h.booking(service, slots[0]));
  await artisan.agent.put(`/api/services/${service.id}`).send({ priceCents: 15000 });
  const detail = await client.agent.get(`/api/appointments/${res.body.appointment.id}`);
  assert.equal(detail.body.appointment.price_cents, 8900);
});

test('créneau d\'un autre artisan refusé', async () => {
  const a = await h.artisanWithOffer();
  const b = await h.artisanWithOffer();
  const client = await h.registerClient();
  const res = await client.agent.post('/api/appointments').send(h.booking(a.service, b.slots[0]));
  assert.equal(res.status, 400);
});

test('prestation plus longue que le créneau refusée', async () => {
  const { artisan, slots } = await h.artisanWithOffer();
  const long = await artisan.agent.post('/api/services').send({ title: 'Chauffe-eau', priceCents: 35000, durationMinutes: 180 });
  const client = await h.registerClient();
  const res = await client.agent.post('/api/appointments').send(h.booking(long.body.service, slots[0]));
  assert.equal(res.status, 400);
  assert.ok(res.body.details.slotId);
});

test('transition interdite → 422 ; le client ne peut pas confirmer', async () => {
  const { artisan, service, slots } = await h.artisanWithOffer();
  const client = await h.registerClient();
  const id = (await client.agent.post('/api/appointments').send(h.booking(service, slots[0]))).body.appointment.id;
  assert.equal((await client.agent.patch(`/api/appointments/${id}/status`).send({ status: 'CONFIRME' })).status, 422);
  assert.equal((await artisan.agent.patch(`/api/appointments/${id}/status`).send({ status: 'TERMINE' })).status, 422);
});

test('cloisonnement : un client ne voit pas le rendez-vous d\'un autre (404)', async () => {
  const { service, slots } = await h.artisanWithOffer();
  const owner = await h.registerClient();
  const intruder = await h.registerClient();
  const id = (await owner.agent.post('/api/appointments').send(h.booking(service, slots[0]))).body.appointment.id;
  assert.equal((await intruder.agent.get(`/api/appointments/${id}`)).status, 404);
  assert.equal((await intruder.agent.get('/api/appointments')).body.appointments.length, 0);
});

test('un autre artisan ne peut pas modifier le rendez-vous', async () => {
  const { service, slots } = await h.artisanWithOffer();
  const other = await h.registerArtisan();
  const client = await h.registerClient();
  const id = (await client.agent.post('/api/appointments').send(h.booking(service, slots[0]))).body.appointment.id;
  assert.equal((await other.agent.patch(`/api/appointments/${id}/status`).send({ status: 'CONFIRME' })).status, 404);
});

test('un artisan ne peut pas réserver (403) ni modifier la prestation d\'un autre (404)', async () => {
  const { service, slots } = await h.artisanWithOffer();
  const other = await h.registerArtisan();
  assert.equal((await other.agent.post('/api/appointments').send(h.booking(service, slots[0]))).status, 403);
  assert.equal((await other.agent.put(`/api/services/${service.id}`).send({ priceCents: 1 })).status, 404);
});

test('créneaux qui se chevauchent refusés (409)', async () => {
  const { artisan } = await h.artisanWithOffer();
  const res = await artisan.agent.post('/api/slots').send({ start: h.future(1, 9), end: h.future(1, 10), durationMinutes: 30 });
  assert.equal(res.status, 409);
});

test('les prestations d\'un artisan non vérifié ne sont pas publiques', async () => {
  const artisan = await h.registerArtisan({ verified: false });
  await artisan.agent.post('/api/services').send({ title: 'Serrure', priceCents: 5000, durationMinutes: 60 });
  assert.equal((await h.agent().get('/api/services')).body.services.length, 0);
});

test('le contenu HTML est stocké tel quel (l\'échappement se fait à l\'affichage)', async () => {
  const { service, slots } = await h.artisanWithOffer();
  const client = await h.registerClient();
  const xss = '<img src=x onerror=alert(1)> fuite';
  const res = await client.agent.post('/api/appointments').send({ ...h.booking(service, slots[0]), description: xss });
  assert.equal(res.status, 201);
  assert.equal(res.body.appointment.description, xss);
  assert.match(res.headers['content-type'], /application\/json/);
});
