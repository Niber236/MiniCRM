const { withTransaction } = require('../db/pool');
const slotModel = require('../models/slotModel');
const { validate, parseId } = require('../utils/validate');
const { badRequest, conflict } = require('../utils/httpError');

const MAX_SLOTS_PER_BATCH = 48;
const MAX_RANGE_HOURS = 16;

const batchSchema = {
  start: { type: 'datetime', required: true },
  end: { type: 'datetime', required: true },
  durationMinutes: { type: 'int', required: true, min: 15, max: 480 },
};

async function listMine(req, res) {
  const includePast = req.query.includePast === 'true';
  res.json({ slots: await slotModel.listByArtisan(req.user.id, { includePast }) });
}

/**
 * Génère des créneaux consécutifs sur une plage horaire.
 * Ex. : 08:00 → 12:00 par tranches de 60 min = 4 créneaux.
 */
async function createBatch(req, res) {
  const { start, end, durationMinutes } = validate(batchSchema, req.body);

  if (start <= new Date()) throw badRequest('Données invalides', { start: 'Le début doit être dans le futur' });
  if (end <= start) throw badRequest('Données invalides', { end: 'La fin doit être après le début' });
  if (end - start > MAX_RANGE_HOURS * 3600_000) {
    throw badRequest('Données invalides', { end: `Plage limitée à ${MAX_RANGE_HOURS} heures` });
  }

  const step = durationMinutes * 60_000;
  const ranges = [];
  for (let t = start.getTime(); t + step <= end.getTime(); t += step) {
    ranges.push({ startsAt: new Date(t), endsAt: new Date(t + step) });
  }
  if (ranges.length === 0) throw badRequest('La plage est plus courte que la durée d\'un créneau');
  if (ranges.length > MAX_SLOTS_PER_BATCH) throw badRequest(`Maximum ${MAX_SLOTS_PER_BATCH} créneaux à la fois`);

  try {
    // Tout ou rien : si un seul créneau chevauche l'existant, aucun n'est créé.
    const slots = await withTransaction((db) => slotModel.createMany(db, req.user.id, ranges));
    res.status(201).json({ slots });
  } catch (err) {
    if (err.code === '23P01') throw conflict('Ces créneaux chevauchent des disponibilités existantes');
    throw err;
  }
}

async function remove(req, res) {
  const deleted = await slotModel.deleteFree(parseId(req.params.id), req.user.id);
  if (!deleted) throw conflict('Créneau introuvable ou déjà lié à un rendez-vous');
  res.status(204).end();
}

module.exports = { listMine, createBatch, remove };
