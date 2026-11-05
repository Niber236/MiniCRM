const { query } = require('../db/pool');

// Une prestation n'est visible publiquement que si : elle est active, son artisan
// est vérifié par un admin ET le compte de l'artisan est actif.
const PUBLIC_FILTER = 's.is_active AND ap.is_verified AND u.is_active';

const PUBLIC_SELECT = `
  SELECT s.id, s.title, s.description, s.price_cents, s.duration_minutes,
         ap.user_id AS artisan_id, ap.business_name, ap.city, t.id AS trade_id, t.name AS trade
    FROM services s
    JOIN artisan_profiles ap ON ap.user_id = s.artisan_id
    JOIN users u ON u.id = ap.user_id
    JOIN trades t ON t.id = ap.trade_id`;

async function listPublic({ tradeId, city, q } = {}) {
  const { rows } = await query(
    `${PUBLIC_SELECT}
      WHERE ${PUBLIC_FILTER}
        AND ($1::int IS NULL OR t.id = $1)
        AND ($2::text IS NULL OR ap.city ILIKE $2)
        AND ($3::text IS NULL OR s.title ILIKE $3 OR s.description ILIKE $3 OR ap.business_name ILIKE $3)
      ORDER BY s.title`,
    [tradeId || null, city ? `%${city}%` : null, q ? `%${q}%` : null]
  );
  return rows;
}

async function findPublicById(id) {
  const { rows } = await query(
    `${PUBLIC_SELECT}
      WHERE s.id = $1 AND ${PUBLIC_FILTER}`,
    [id]
  );
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await query('SELECT * FROM services WHERE id = $1', [id]);
  return rows[0] || null;
}

async function listByArtisan(artisanId) {
  const { rows } = await query(
    `SELECT id, title, description, price_cents, duration_minutes, is_active, created_at, updated_at
       FROM services WHERE artisan_id = $1
      ORDER BY is_active DESC, title`,
    [artisanId]
  );
  return rows;
}

async function create(artisanId, { title, description, priceCents, durationMinutes }) {
  const { rows } = await query(
    `INSERT INTO services (artisan_id, title, description, price_cents, duration_minutes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [artisanId, title, description || null, priceCents, durationMinutes]
  );
  return rows[0];
}

const UPDATABLE = {
  title: 'title',
  description: 'description',
  priceCents: 'price_cents',
  durationMinutes: 'duration_minutes',
  isActive: 'is_active',
};

/** Mise à jour restreinte au propriétaire (artisan_id dans le WHERE). */
async function update(id, artisanId, fields) {
  const sets = [];
  const values = [id, artisanId];
  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (fields[key] !== undefined) {
      values.push(fields[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }
  sets.push('updated_at = NOW()');
  const { rows } = await query(
    `UPDATE services SET ${sets.join(', ')} WHERE id = $1 AND artisan_id = $2 RETURNING *`,
    values
  );
  return rows[0] || null;
}

module.exports = { listPublic, findPublicById, findById, listByArtisan, create, update };
