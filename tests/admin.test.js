const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

beforeEach(h.resetDb);
after(() => h.pool.end());

test('routes admin interdites aux clients et artisans (403) et aux anonymes (401)', async () => {
  const client = await h.registerClient();
  const artisan = await h.registerArtisan();
  assert.equal((await h.agent().get('/api/admin/stats')).status, 401);
  assert.equal((await client.agent.get('/api/admin/stats')).status, 403);
  assert.equal((await artisan.agent.get('/api/admin/users')).status, 403);
});

test('l\'admin valide un artisan : ses prestations deviennent publiques', async () => {
  const admin = await h.createAdmin();
  const artisan = await h.registerArtisan({ verified: false });
  await artisan.agent.post('/api/services').send({ title: 'Débouchage', priceCents: 11000, durationMinutes: 60 });

  const res = await admin.agent.patch(`/api/admin/artisans/${artisan.user.id}/verify`).send({ isVerified: true });
  assert.equal(res.status, 200);
  assert.equal((await h.agent().get('/api/services')).body.services.length, 1);
});

test('compte désactivé : accès coupé immédiatement, même avec un jeton valide', async () => {
  const admin = await h.createAdmin();
  const client = await h.registerClient();
  assert.equal((await client.agent.get('/api/auth/me')).status, 200);

  await admin.agent.patch(`/api/admin/users/${client.user.id}/active`).send({ isActive: false });
  assert.equal((await client.agent.get('/api/auth/me')).status, 401);
  const login = await h.agent().post('/api/auth/login').send({ email: client.user.email, password: h.PASSWORD });
  assert.equal(login.status, 403);
});

test('un admin ne peut pas désactiver un compte admin', async () => {
  const admin = await h.createAdmin();
  const res = await admin.agent.patch(`/api/admin/users/${admin.user.id}/active`).send({ isActive: false });
  assert.equal(res.status, 400);
});

test('statistiques et liste des utilisateurs', async () => {
  const admin = await h.createAdmin();
  await h.registerClient();
  await h.registerArtisan({ verified: false });
  const stats = (await admin.agent.get('/api/admin/stats')).body.stats;
  assert.equal(stats.clients, 1);
  assert.equal(stats.artisans_pending, 1);
  const users = (await admin.agent.get('/api/admin/users?role=artisan')).body.users;
  assert.equal(users.length, 1);
});
