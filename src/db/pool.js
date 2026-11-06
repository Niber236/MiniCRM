const { Pool } = require('pg');
const config = require('../config');

// Pool de connexions partagé par toute l'application.
const pool = new Pool({
  connectionString: config.databaseUrl,
  // Les bases hébergées (Render, Railway) imposent SSL en production.
  // DATABASE_SSL=false permet de s'en passer (base sans SSL sur un réseau privé).
  ssl: config.isProduction && process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false,
});

/**
 * Requête préparée : les valeurs passent TOUJOURS par le tableau `params`
 * ($1, $2...) et jamais par concaténation de chaînes → pas d'injection SQL.
 */
function query(text, params) {
  return pool.query(text, params);
}

/**
 * Exécute `fn` dans une transaction. COMMIT si tout va bien, ROLLBACK sinon.
 * `fn` reçoit un client dédié à utiliser pour toutes les requêtes de la transaction.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
