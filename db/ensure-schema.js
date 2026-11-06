// Prépare la base au démarrage du serveur (npm start) :
//   - base VIDE      → crée le schéma, et les données de démo si SEED_DEMO=true ;
//   - base EXISTANTE → ne touche à rien (jamais de DROP, contrairement à db/init.js).
// Si une étape échoue, le script se termine en erreur et le serveur ne démarre pas.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pool } = require('../src/db/pool');

(async () => {
  try {
    const { rows } = await pool.query("SELECT to_regclass('public.users') AS users_table");
    if (rows[0].users_table) {
      console.log('Base déjà initialisée : aucune modification.');
      return;
    }

    console.log('Base vide : création du schéma...');
    await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    console.log('Schéma créé.');

    if (process.env.SEED_DEMO === 'true') {
      console.log('Insertion des données de démonstration...');
      execFileSync(process.execPath, [path.join(__dirname, 'seed.js')], { stdio: 'inherit' });
    }
  } catch (err) {
    console.error('Échec de la préparation de la base :', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
