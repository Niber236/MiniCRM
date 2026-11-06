const { query } = require('../db/pool');

// Un créneau est "réservé" s'il porte un rendez-vous non annulé.
const IS_BOOKED = `EXISTS (
  SELECT 1 FROM appointments a WHERE a.slot_id = sl.id AND a.status <> 'ANNULE'
)`;

/** Créneaux futurs et libres d'un artisan (vue client). */
async function listAvailable(artisanId) {
  const { rows } = await query(
    `SELECT sl.id, sl.starts_at, sl.ends_at
       FROM slots sl
      WHERE sl.artisan_id = $1
        AND sl.starts_at > NOW()
        AND NOT ${IS_BOOKED}
      ORDER BY sl.starts_at
      LIMIT 200`,
    [artisanId]
  );
  return rows;
}

/** Planning de l'artisan, avec l'éventuel rendez-vous associé. */
async function listByArtisan(artisanId, { includePast = false } = {}) {
  const { rows } = await query(
    `SELECT sl.id, sl.starts_at, sl.ends_at,
            -- Un créneau déjà réservé (même annulé depuis) est gardé pour l'historique : il ne peut plus être supprimé.
            EXISTS (SELECT 1 FROM appointments x WHERE x.slot_id = sl.id) AS has_history,
            a.id AS appointment_id, a.status AS appointment_status,
            s.title AS service_title,
            u.first_name AS client_first_name, u.last_name AS client_last_name
       FROM slots sl
       LEFT JOIN appointments a ON a.slot_id = sl.id AND a.status <> 'ANNULE'
       LEFT JOIN services s ON s.id = a.service_id
       LEFT JOIN users u ON u.id = a.client_id
      WHERE sl.artisan_id = $1
        AND ($2 OR sl.ends_at > NOW())
      ORDER BY sl.starts_at`,
    [artisanId, includePast]
  );
  return rows;
}

/** Insère plusieurs créneaux dans la transaction fournie. */
async function createMany(db, artisanId, ranges) {
  const created = [];
  for (const { startsAt, endsAt } of ranges) {
    const { rows } = await db.query(
      `INSERT INTO slots (artisan_id, starts_at, ends_at) VALUES ($1, $2, $3)
       RETURNING id, starts_at, ends_at`,
      [artisanId, startsAt, endsAt]
    );
    created.push(rows[0]);
  }
  return created;
}

/** Verrouille la ligne du créneau (FOR UPDATE) le temps de la transaction de réservation. */
async function findForUpdate(db, id) {
  const { rows } = await db.query('SELECT * FROM slots WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] || null;
}

/** Supprime un créneau de l'artisan uniquement s'il n'a jamais été réservé. */
async function deleteFree(id, artisanId) {
  const { rowCount } = await query(
    `DELETE FROM slots sl
      WHERE sl.id = $1 AND sl.artisan_id = $2
        AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.slot_id = sl.id)`,
    [id, artisanId]
  );
  return rowCount === 1;
}

async function findById(id) {
  const { rows } = await query('SELECT * FROM slots WHERE id = $1', [id]);
  return rows[0] || null;
}

module.exports = { listAvailable, listByArtisan, createMany, findForUpdate, deleteFree, findById };
