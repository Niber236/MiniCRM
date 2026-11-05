const { query } = require('../db/pool');

const PUBLIC_COLUMNS = 'id, email, first_name, last_name, phone, role, is_active, created_at';

async function findByEmail(email) {
  const { rows } = await query(`SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE email = $1`, [email]);
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

/** `db` = pool ou client de transaction. */
async function create(db, { email, passwordHash, firstName, lastName, phone, role }) {
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone, role)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${PUBLIC_COLUMNS}`,
    [email, passwordHash, firstName, lastName, phone || null, role]
  );
  return rows[0];
}

/** Liste pour l'administration, avec les infos professionnelles des artisans. */
async function listForAdmin({ role } = {}) {
  const { rows } = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.role, u.is_active, u.created_at,
            ap.business_name, ap.city, ap.is_verified, t.name AS trade
       FROM users u
       LEFT JOIN artisan_profiles ap ON ap.user_id = u.id
       LEFT JOIN trades t ON t.id = ap.trade_id
      WHERE ($1::user_role IS NULL OR u.role = $1)
      ORDER BY u.created_at DESC`,
    [role || null]
  );
  return rows;
}

async function setActive(id, isActive) {
  const { rows } = await query(
    `UPDATE users SET is_active = $2 WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
    [id, isActive]
  );
  return rows[0] || null;
}

module.exports = { findByEmail, findById, create, listForAdmin, setActive };
