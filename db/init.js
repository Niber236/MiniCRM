// Applique db/schema.sql sur la base pointée par DATABASE_URL (supprime les données existantes).
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db/pool');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('Schéma appliqué avec succès.');
  } catch (err) {
    console.error('Échec de l\'initialisation :', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
