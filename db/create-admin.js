// Crée un compte administrateur (aucune route publique ne le permet).
// Usage : npm run create-admin -- admin@exemple.fr "MotDePasse123" Prénom Nom
const bcrypt = require('bcrypt');
const config = require('../src/config');
const { pool } = require('../src/db/pool');

(async () => {
  const [email, password, firstName = 'Admin', lastName = 'CraftFlow'] = process.argv.slice(2);
  if (!email || !password || password.length < 8) {
    console.error('Usage : npm run create-admin -- <email> <motdepasse (8+ caractères)> [prénom] [nom]');
    process.exit(1);
  }
  try {
    const hash = await bcrypt.hash(password, config.bcryptRounds);
    await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, 'admin')`,
      [email.toLowerCase(), hash, firstName, lastName]
    );
    console.log(`Administrateur ${email} créé.`);
  } catch (err) {
    console.error('Erreur :', err.code === '23505' ? 'cet email existe déjà' : err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
