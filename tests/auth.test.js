const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

before(h.resetDb);
after(() => h.pool.end());

test('inscription client : 201, cookie HttpOnly, pas de hash renvoyé', async () => {
  const res = await h.agent().post('/api/auth/register').send({
    email: 'Camille@Test.fr', password: h.PASSWORD, firstName: 'Camille', lastName: 'D', role: 'client',
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.email, 'camille@test.fr');
  assert.equal(res.body.user.password_hash, undefined);
  const cookie = res.headers['set-cookie'].join(';');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
});

test('impossible de s\'inscrire en admin', async () => {
  const res = await h.agent().post('/api/auth/register').send({
    email: 'pirate@test.fr', password: h.PASSWORD, firstName: 'P', lastName: 'P', role: 'admin',
  });
  assert.equal(res.status, 400);
});

test('email déjà utilisé : 409', async () => {
  const body = { email: 'double@test.fr', password: h.PASSWORD, firstName: 'A', lastName: 'B', role: 'client' };
  assert.equal((await h.agent().post('/api/auth/register').send(body)).status, 201);
  assert.equal((await h.agent().post('/api/auth/register').send(body)).status, 409);
});

test('mot de passe faible refusé avec le détail du champ', async () => {
  const res = await h.agent().post('/api/auth/register').send({
    email: 'faible@test.fr', password: 'abc', firstName: 'A', lastName: 'B', role: 'client',
  });
  assert.equal(res.status, 400);
  assert.ok(res.body.details.password);
});

test('connexion : mauvais mot de passe → 401 avec message générique', async () => {
  const { user } = await h.registerClient();
  const res = await h.agent().post('/api/auth/login').send({ email: user.email, password: 'Mauvais123' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Email ou mot de passe incorrect');
});

test('/auth/me exige une session, logout la supprime', async () => {
  assert.equal((await h.agent().get('/api/auth/me')).status, 401);
  const { agent } = await h.registerClient();
  assert.equal((await agent.get('/api/auth/me')).status, 200);
  assert.equal((await agent.post('/api/auth/logout')).status, 204);
  assert.equal((await agent.get('/api/auth/me')).status, 401);
});

test('jeton falsifié refusé', async () => {
  const res = await h.agent().get('/api/auth/me').set('Cookie', 'craftflow_token=abc.def.ghi');
  assert.equal(res.status, 401);
});

test('injection SQL dans l\'email : simplement refusée', async () => {
  const res = await h.agent().post('/api/auth/login').send({ email: "' OR 1=1 --", password: 'x1' });
  assert.equal(res.status, 400);
});

test('protection CSRF : requête d\'une autre origine refusée', async () => {
  const res = await h.agent().post('/api/auth/login')
    .set('Origin', 'https://site-malveillant.example')
    .send({ email: 'a@b.fr', password: 'x1' });
  assert.equal(res.status, 403);
});
