// Garde-fous du front-end : la politique de sécurité (CSP) du serveur interdit les scripts et styles
// écrits dans les pages. Ces tests échouent si quelqu'un en ajoute par erreur, et vérifient que
// chaque page publiée charge bien des fichiers qui existent.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db/pool');

after(() => pool.end());

const PUBLIC = path.join(__dirname, '..', 'public');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(PUBLIC);
const pages = files.filter((f) => f.endsWith('.html'));
const scripts = files.filter((f) => f.endsWith('.js'));

test('le site contient les pages des trois espaces', () => {
  const relative = pages.map((p) => path.relative(PUBLIC, p).split(path.sep).join('/'));
  for (const expected of [
    'index.html', 'login.html', 'register.html', 'service.html',
    'client/rendez-vous.html',
    'artisan/index.html', 'artisan/prestations.html', 'artisan/creneaux.html', 'artisan/profil.html',
    'admin/index.html',
  ]) {
    assert.ok(relative.includes(expected), `page manquante : ${expected}`);
  }
});

test('aucune page ne contient de script, de style ou de gestionnaire d\'événement en ligne', () => {
  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    const name = path.relative(PUBLIC, page);
    assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/i.test(html), `${name} : script en ligne`);
    assert.ok(!/<style[\s>]/i.test(html), `${name} : balise <style> en ligne`);
    assert.ok(!/\sstyle\s*=/i.test(html), `${name} : attribut style en ligne`);
    assert.ok(!/\son[a-z]+\s*=/i.test(html), `${name} : gestionnaire onclick/onsubmit... en ligne`);
  }
});

test('les fichiers référencés par chaque page existent', () => {
  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    for (const [, url] of html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)) {
      assert.ok(fs.existsSync(path.join(PUBLIC, url)), `${path.relative(PUBLIC, page)} référence ${url} (introuvable)`);
    }
  }
});

test('le code JavaScript n\'injecte jamais de HTML brut (anti-XSS)', () => {
  for (const script of scripts) {
    const code = fs.readFileSync(script, 'utf8');
    const name = path.relative(PUBLIC, script);
    assert.ok(!/\.innerHTML\s*=/.test(code), `${name} : innerHTML`);
    assert.ok(!/\.outerHTML\s*=/.test(code), `${name} : outerHTML`);
    assert.ok(!/insertAdjacentHTML/.test(code), `${name} : insertAdjacentHTML`);
    assert.ok(!/document\.write/.test(code), `${name} : document.write`);
    assert.ok(!/\beval\s*\(/.test(code), `${name} : eval`);
  }
});

test('le serveur sert les pages et envoie la politique de sécurité', async () => {
  for (const url of ['/', '/login.html', '/register.html', '/service.html', '/client/rendez-vous.html', '/artisan/', '/admin/']) {
    const res = await request(app).get(url);
    assert.equal(res.status, 200, url);
    assert.match(res.headers['content-security-policy'], /script-src 'self'/);
  }
  assert.equal((await request(app).get('/css/style.css')).status, 200);
  assert.equal((await request(app).get('/js/pages/catalogue.js')).status, 200);
});
