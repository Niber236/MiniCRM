// Le démarrage en production (npm start) prépare la base avec db/ensure-schema.js.
// Garde-fou essentiel : il crée le schéma sur une base VIDE, mais ne doit JAMAIS effacer une base qui contient déjà des données.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');
const { pool } = require('../src/db/pool');

after(() => pool.end());

const TMP_DB = 'craftflow_ensure_tmp';
const urlFor = (db) => {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${db}`;
  return url.toString();
};

function runEnsure(extraEnv = {}) {
  return spawnSync(process.execPath, [path.join(__dirname, '..', 'db', 'ensure-schema.js')], {
    env: { ...process.env, DATABASE_URL: urlFor(TMP_DB), ...extraEnv },
    encoding: 'utf8',
  });
}

test('ensure-schema : crée le schéma sur une base vide, puis ne modifie plus rien', async () => {
  await pool.query(`DROP DATABASE IF EXISTS ${TMP_DB}`);
  await pool.query(`CREATE DATABASE ${TMP_DB}`);
  const db = new Client({ connectionString: urlFor(TMP_DB) });
  try {
    // 1. base vide → schéma créé
    const first = runEnsure();
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Schéma créé/);
    await db.connect();
    const tables = await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'");
    assert.equal(tables.rows[0].n, 7);
    const trades = await db.query('SELECT count(*)::int AS n FROM trades');
    assert.ok(trades.rows[0].n >= 7);

    // 2. on ajoute des données, puis on "redémarre" : elles doivent survivre
    await db.query("INSERT INTO users (email, password_hash, first_name, last_name) VALUES ('survivant@test.fr', 'x', 'S', 'S')");
    const second = runEnsure();
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /déjà initialisée/);
    const users = await db.query("SELECT count(*)::int AS n FROM users WHERE email = 'survivant@test.fr'");
    assert.equal(users.rows[0].n, 1, 'les données existantes ont été effacées !');
  } finally {
    await db.end().catch(() => {});
    await pool.query(`DROP DATABASE IF EXISTS ${TMP_DB}`);
  }
});

test('ensure-schema : SEED_DEMO=true insère les données de démo, et refuse un mot de passe par défaut en production', async () => {
  await pool.query(`DROP DATABASE IF EXISTS ${TMP_DB}`);
  await pool.query(`CREATE DATABASE ${TMP_DB}`);
  const db = new Client({ connectionString: urlFor(TMP_DB) });
  try {
    // production sans DEMO_PASSWORD : la préparation échoue (le serveur ne démarrerait pas)
    const refused = runEnsure({ SEED_DEMO: 'true', NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), DATABASE_SSL: 'false' });
    assert.notEqual(refused.status, 0);

    await pool.query(`DROP DATABASE ${TMP_DB}`);
    await pool.query(`CREATE DATABASE ${TMP_DB}`);
    // production avec DEMO_PASSWORD : les données sont insérées, et le mot de passe n'apparaît pas dans les journaux
    const ok = runEnsure({
      SEED_DEMO: 'true', NODE_ENV: 'production', DEMO_PASSWORD: 'MotDePasseDeDemo42',
      JWT_SECRET: 'x'.repeat(40), DATABASE_SSL: 'false',
    });
    assert.equal(ok.status, 0, ok.stderr);
    assert.ok(!(ok.stdout + ok.stderr).includes('MotDePasseDeDemo42'), 'le mot de passe de démo est visible dans les journaux');
    await db.connect();
    const admins = await db.query("SELECT count(*)::int AS n FROM users WHERE role = 'admin'");
    assert.equal(admins.rows[0].n, 1);
  } finally {
    await db.end().catch(() => {});
    await pool.query(`DROP DATABASE IF EXISTS ${TMP_DB}`);
  }
});
