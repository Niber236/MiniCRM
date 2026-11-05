const { query } = require('../db/pool');

async function listTrades() {
  const { rows } = await query('SELECT id, name FROM trades ORDER BY name');
  return rows;
}

async function tradeExists(id) {
  const { rowCount } = await query('SELECT 1 FROM trades WHERE id = $1', [id]);
  return rowCount === 1;
}

async function createProfile(db, { userId, businessName, tradeId, city, description }) {
  const { rows } = await db.query(
    `INSERT INTO artisan_profiles (user_id, business_name, trade_id, city, description)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, businessName, tradeId, city, description || null]
  );
  return rows[0];
}

async function findProfile(userId) {
  const { rows } = await query(
    `SELECT ap.user_id, ap.business_name, ap.trade_id, t.name AS trade, ap.city,
            ap.description, ap.is_verified, ap.verified_at
       FROM artisan_profiles ap
       JOIN trades t ON t.id = ap.trade_id
      WHERE ap.user_id = $1`,
    [userId]
  );
  return rows[0] || null;
}

// Colonnes modifiables : la correspondance champ → colonne est codée en dur,
// seules les VALEURS viennent de l'utilisateur (et passent en paramètres).
const UPDATABLE = {
  businessName: 'business_name',
  tradeId: 'trade_id',
  city: 'city',
  description: 'description',
};

async function updateProfile(userId, fields) {
  const sets = [];
  const values = [userId];
  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (fields[key] !== undefined) {
      values.push(fields[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (sets.length === 0) return findProfile(userId);
  await query(`UPDATE artisan_profiles SET ${sets.join(', ')} WHERE user_id = $1`, values);
  return findProfile(userId);
}

async function setVerified(userId, isVerified) {
  const { rows } = await query(
    `UPDATE artisan_profiles
        SET is_verified = $2,
            verified_at = CASE WHEN $2 THEN NOW() ELSE NULL END
      WHERE user_id = $1
      RETURNING *`,
    [userId, isVerified]
  );
  return rows[0] || null;
}

module.exports = { listTrades, tradeExists, createProfile, findProfile, updateProfile, setVerified };
