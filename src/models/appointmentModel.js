const { query } = require('../db/pool');

const SELECT_FULL = `
  SELECT a.id, a.status, a.address, a.description, a.created_at, a.updated_at,
         sl.id AS slot_id, sl.starts_at, sl.ends_at,
         s.id AS service_id, s.title AS service_title, a.price_cents, s.duration_minutes,
         ap.user_id AS artisan_id, ap.business_name, ap.city AS artisan_city,
         c.id AS client_id, c.first_name AS client_first_name, c.last_name AS client_last_name,
         c.email AS client_email, c.phone AS client_phone
    FROM appointments a
    JOIN slots sl ON sl.id = a.slot_id
    JOIN services s ON s.id = a.service_id
    JOIN artisan_profiles ap ON ap.user_id = a.artisan_id
    JOIN users c ON c.id = a.client_id`;

async function create(db, { clientId, artisanId, serviceId, slotId, priceCents, address, description }) {
  const { rows } = await db.query(
    `INSERT INTO appointments (client_id, artisan_id, service_id, slot_id, price_cents, address, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [clientId, artisanId, serviceId, slotId, priceCents, address, description]
  );
  return rows[0];
}

async function addHistory(db, { appointmentId, fromStatus, toStatus, changedBy }) {
  await db.query(
    `INSERT INTO appointment_status_history (appointment_id, from_status, to_status, changed_by)
     VALUES ($1, $2, $3, $4)`,
    [appointmentId, fromStatus, toStatus, changedBy]
  );
}

/**
 * Liste filtrée selon le "périmètre" de l'utilisateur :
 *   - client  → ses propres rendez-vous
 *   - artisan → les rendez-vous de SES prestations
 *   - admin   → tous
 */
async function list({ clientId = null, artisanId = null, status = null } = {}) {
  const { rows } = await query(
    `${SELECT_FULL}
      WHERE ($1::int IS NULL OR a.client_id = $1)
        AND ($2::int IS NULL OR a.artisan_id = $2)
        AND ($3::appointment_status IS NULL OR a.status = $3)
      ORDER BY sl.starts_at DESC`,
    [clientId, artisanId, status]
  );
  return rows;
}

async function findById(id) {
  const { rows } = await query(`${SELECT_FULL} WHERE a.id = $1`, [id]);
  return rows[0] || null;
}

/** Verrouille le rendez-vous pendant le changement de statut (évite deux transitions concurrentes). */
async function findForUpdate(db, id) {
  const { rows } = await db.query(
    `SELECT id, status, client_id, artisan_id
       FROM appointments
      WHERE id = $1
      FOR UPDATE`,
    [id]
  );
  return rows[0] || null;
}

async function updateStatus(db, id, status) {
  await db.query('UPDATE appointments SET status = $2, updated_at = NOW() WHERE id = $1', [id, status]);
}

async function history(appointmentId) {
  const { rows } = await query(
    `SELECT h.from_status, h.to_status, h.changed_at,
            u.first_name, u.last_name, u.role
       FROM appointment_status_history h
       LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.appointment_id = $1
      ORDER BY h.changed_at, h.id`,
    [appointmentId]
  );
  return rows;
}

async function stats() {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE role = 'client')::int                         AS clients,
       (SELECT COUNT(*) FROM users WHERE role = 'artisan')::int                        AS artisans,
       (SELECT COUNT(*) FROM artisan_profiles WHERE NOT is_verified)::int              AS artisans_pending,
       (SELECT COUNT(*) FROM services WHERE is_active)::int                            AS active_services,
       (SELECT COUNT(*) FROM appointments)::int                                        AS appointments,
       (SELECT COUNT(*) FROM appointments WHERE status = 'EN_ATTENTE')::int            AS appointments_pending,
       (SELECT COUNT(*) FROM appointments WHERE status = 'CONFIRME')::int              AS appointments_confirmed,
       (SELECT COUNT(*) FROM appointments WHERE status = 'TERMINE')::int               AS appointments_done,
       (SELECT COUNT(*) FROM appointments WHERE status = 'ANNULE')::int                AS appointments_cancelled`
  );
  return rows[0];
}

module.exports = { create, addHistory, list, findById, findForUpdate, updateStatus, history, stats };
