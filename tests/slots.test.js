// Routes des créneaux qui n'avaient aucun test : GET /slots et DELETE /slots/:id
// (+ validation de la création par plage horaire).
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

beforeEach(h.resetDb);
after(() => h.pool.end());

/* ---------- GET /slots ---------- */

test('GET /slots : planning de l\'artisan, trié, sans les créneaux des autres', async () => {
  const mine = await h.artisanWithOffer();
  await h.artisanWithOffer(); // un autre artisan, avec ses propres créneaux

  const res = await mine.artisan.agent.get('/api/slots');
  assert.equal(res.status, 200);
  assert.equal(res.body.slots.length, 4);
  const times = res.body.slots.map((s) => new Date(s.starts_at).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
});

test('GET /slots : un créneau réservé indique la prestation, le client et le statut', async () => {
  const { artisan, service, slots } = await h.artisanWithOffer();
  const client = await h.registerClient({ firstName: 'Camille', lastName: 'Durand' });
  await client.agent.post('/api/appointments').send(h.booking(service, slots[1]));

  const res = await artisan.agent.get('/api/slots');
  const booked = res.body.slots.find((s) => s.id === slots[1].id);
  assert.equal(booked.appointment_status, 'EN_ATTENTE');
  assert.equal(booked.service_title, 'Réparation de fuite');
  assert.equal(booked.client_first_name, 'Camille');
  const free = res.body.slots.find((s) => s.id === slots[0].id);
  assert.equal(free.appointment_id, null);
});

test('GET /slots : les créneaux passés ne sont affichés qu\'avec includePast=true', async () => {
  const { artisan } = await h.artisanWithOffer();
  await h.query(
    `INSERT INTO slots (artisan_id, starts_at, ends_at)
     VALUES ($1, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '1 hour')`,
    [artisan.user.id]
  );
  assert.equal((await artisan.agent.get('/api/slots')).body.slots.length, 4);
  assert.equal((await artisan.agent.get('/api/slots?includePast=true')).body.slots.length, 5);
});

test('GET /slots : refusé aux anonymes (401) et aux clients (403)', async () => {
  const client = await h.registerClient();
  assert.equal((await h.agent().get('/api/slots')).status, 401);
  assert.equal((await client.agent.get('/api/slots')).status, 403);
});

/* ---------- DELETE /slots/:id ---------- */

test('DELETE /slots/:id : supprime un créneau libre (204)', async () => {
  const { artisan, slots } = await h.artisanWithOffer();
  const res = await artisan.agent.delete(`/api/slots/${slots[0].id}`);
  assert.equal(res.status, 204);
  const left = await artisan.agent.get('/api/slots');
  assert.equal(left.body.slots.length, 3);
  assert.ok(!left.body.slots.some((s) => s.id === slots[0].id));
});

test('DELETE /slots/:id : un créneau réservé ne peut pas être supprimé (409)', async () => {
  const { artisan, service, slots } = await h.artisanWithOffer();
  const client = await h.registerClient();
  await client.agent.post('/api/appointments').send(h.booking(service, slots[0]));
  assert.equal((await artisan.agent.delete(`/api/slots/${slots[0].id}`)).status, 409);
});

test('DELETE /slots/:id : créneau d\'un autre artisan ou inconnu (409), jamais supprimé', async () => {
  const mine = await h.artisanWithOffer();
  const other = await h.artisanWithOffer();
  assert.equal((await other.artisan.agent.delete(`/api/slots/${mine.slots[0].id}`)).status, 409);
  assert.equal((await other.artisan.agent.delete('/api/slots/999999')).status, 409);
  assert.equal((await mine.artisan.agent.get('/api/slots')).body.slots.length, 4);
});

test('DELETE /slots/:id : refusé aux anonymes (401) et aux clients (403)', async () => {
  const { slots } = await h.artisanWithOffer();
  const client = await h.registerClient();
  assert.equal((await h.agent().delete(`/api/slots/${slots[0].id}`)).status, 401);
  assert.equal((await client.agent.delete(`/api/slots/${slots[0].id}`)).status, 403);
});

test('un créneau déjà réservé puis annulé est libre mais non supprimable : l\'API l\'indique (has_history)', async () => {
  const { artisan, service, slots } = await h.artisanWithOffer();
  const client = await h.registerClient();
  const created = await client.agent.post('/api/appointments').send(h.booking(service, slots[0]));
  await client.agent.patch(`/api/appointments/${created.body.appointment.id}/status`).send({ status: 'ANNULE' });

  const planning = (await artisan.agent.get('/api/slots')).body.slots;
  const cancelled = planning.find((s) => s.id === slots[0].id);
  const untouched = planning.find((s) => s.id === slots[1].id);
  assert.equal(cancelled.appointment_id, null); // il apparaît libre : le client peut le re-réserver
  assert.equal(cancelled.has_history, true);    // mais l'historique empêche sa suppression
  assert.equal(untouched.has_history, false);
  assert.equal((await artisan.agent.delete(`/api/slots/${slots[0].id}`)).status, 409);
});

/* ---------- POST /slots : validation de la plage horaire ---------- */

test('POST /slots : plages invalides refusées (passé, fin avant début, trop longue, trop de créneaux, durée)', async () => {
  const { artisan } = await h.artisanWithOffer();
  const post = (body) => artisan.agent.post('/api/slots').send(body);

  const past = await post({ start: h.future(-1, 8), end: h.future(-1, 12), durationMinutes: 60 });
  assert.equal(past.status, 400);
  assert.ok(past.body.details.start);

  const reversed = await post({ start: h.future(5, 12), end: h.future(5, 8), durationMinutes: 60 });
  assert.equal(reversed.status, 400);
  assert.ok(reversed.body.details.end);

  const tooLong = await post({ start: h.future(5, 0), end: h.future(6, 0), durationMinutes: 60 }); // 24 h
  assert.equal(tooLong.status, 400);

  const tooMany = await post({ start: h.future(6, 6), end: h.future(6, 21), durationMinutes: 15 }); // 60 créneaux
  assert.equal(tooMany.status, 400);

  const shortSlot = await post({ start: h.future(7, 8), end: h.future(7, 12), durationMinutes: 5 });
  assert.equal(shortSlot.status, 400);
  assert.ok(shortSlot.body.details.durationMinutes);
});

test('POST /slots : le découpage crée le bon nombre de créneaux consécutifs', async () => {
  const artisan = await h.registerArtisan();
  const res = await artisan.agent.post('/api/slots').send({ start: h.future(3, 8), end: h.future(3, 11), durationMinutes: 45 });
  assert.equal(res.status, 201);
  assert.equal(res.body.slots.length, 4); // 3 h / 45 min
  const first = new Date(res.body.slots[0].starts_at);
  const second = new Date(res.body.slots[1].starts_at);
  assert.equal(second - first, 45 * 60_000);
});
