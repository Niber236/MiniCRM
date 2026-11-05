const { withTransaction } = require('../db/pool');
const appointmentModel = require('../models/appointmentModel');
const serviceModel = require('../models/serviceModel');
const slotModel = require('../models/slotModel');
const { validate, parseId } = require('../utils/validate');
const { badRequest, notFound, conflict, unprocessable } = require('../utils/httpError');
const { STATUSES, canTransition, allowedTransitions } = require('../services/statusMachine');

const createSchema = {
  serviceId: { type: 'int', required: true, min: 1 },
  slotId: { type: 'int', required: true, min: 1 },
  address: { type: 'string', required: true, min: 5, max: 255 },
  description: { type: 'string', required: true, min: 10, max: 2000 },
};

const statusSchema = {
  status: { type: 'enum', values: STATUSES, required: true },
};

/** Périmètre de visibilité selon le rôle (RBAC au niveau des données). */
function scopeFor(user) {
  if (user.role === 'client') return { clientId: user.id };
  if (user.role === 'artisan') return { artisanId: user.id };
  return {}; // admin : tout
}

function canSee(user, appointment) {
  if (user.role === 'admin') return true;
  if (user.role === 'client') return appointment.client_id === user.id;
  return appointment.artisan_id === user.id;
}

function withActions(user, appointment) {
  return { ...appointment, allowed_transitions: allowedTransitions(user.role, appointment.status) };
}

async function list(req, res) {
  const { status } = validate({ status: { type: 'enum', values: STATUSES } }, req.query);
  const rows = await appointmentModel.list({ ...scopeFor(req.user), status });
  res.json({ appointments: rows.map((a) => withActions(req.user, a)) });
}

async function getOne(req, res) {
  const appointment = await appointmentModel.findById(parseId(req.params.id));
  // 404 (et non 403) pour ne pas révéler l'existence d'un rendez-vous d'autrui.
  if (!appointment || !canSee(req.user, appointment)) throw notFound('Rendez-vous introuvable');
  const history = await appointmentModel.history(appointment.id);
  res.json({ appointment: withActions(req.user, appointment), history });
}

/**
 * Réservation (client).
 * Protection contre la double réservation, en deux couches :
 *   1. SELECT ... FOR UPDATE verrouille le créneau : les réservations concurrentes s'exécutent l'une après l'autre ;
 *   2. l'index unique partiel `appointments_one_active_per_slot` rejette en dernier recours tout doublon.
 */
async function create(req, res) {
  const data = validate(createSchema, req.body);

  const service = await serviceModel.findPublicById(data.serviceId);
  if (!service) throw notFound('Prestation introuvable ou indisponible');

  try {
    const { id } = await withTransaction(async (db) => {
      const slot = await slotModel.findForUpdate(db, data.slotId);
      if (!slot || slot.artisan_id !== service.artisan_id) {
        throw badRequest('Données invalides', { slotId: 'Ce créneau ne correspond pas à cette prestation' });
      }
      if (new Date(slot.starts_at) <= new Date()) {
        throw badRequest('Données invalides', { slotId: 'Ce créneau est déjà passé' });
      }
      const slotMinutes = (new Date(slot.ends_at) - new Date(slot.starts_at)) / 60_000;
      if (service.duration_minutes > slotMinutes) {
        throw badRequest('Données invalides', { slotId: 'Ce créneau est trop court pour cette prestation' });
      }

      const appointment = await appointmentModel.create(db, {
        ...data,
        clientId: req.user.id,
        artisanId: service.artisan_id,
        priceCents: service.price_cents, // tarif figé au moment de la réservation
      });
      await appointmentModel.addHistory(db, {
        appointmentId: appointment.id,
        fromStatus: null,
        toStatus: 'EN_ATTENTE',
        changedBy: req.user.id,
      });
      return appointment;
    });

    // Notification simulée (hors périmètre MVP : pas d'email réel).
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[notification] Nouvelle demande #${id} pour l'artisan #${service.artisan_id}`);
    }

    const appointment = await appointmentModel.findById(id);
    res.status(201).json({ appointment: withActions(req.user, appointment) });
  } catch (err) {
    if (err.code === '23505') throw conflict('Ce créneau vient d\'être réservé. Merci d\'en choisir un autre.');
    throw err;
  }
}

/** Changement de statut, contrôlé par la machine à états ET par le propriétaire. */
async function changeStatus(req, res) {
  const id = parseId(req.params.id);
  const { status } = validate(statusSchema, req.body);

  await withTransaction(async (db) => {
    const current = await appointmentModel.findForUpdate(db, id);
    if (!current || !canSee(req.user, current)) throw notFound('Rendez-vous introuvable');

    if (!canTransition(req.user.role, current.status, status)) {
      throw unprocessable(`Transition interdite : ${current.status} → ${status}`);
    }

    await appointmentModel.updateStatus(db, id, status);
    await appointmentModel.addHistory(db, {
      appointmentId: id,
      fromStatus: current.status,
      toStatus: status,
      changedBy: req.user.id,
    });
  });

  if (process.env.NODE_ENV !== 'test') {
    console.log(`[notification] Rendez-vous #${id} → ${status} (par ${req.user.role} #${req.user.id})`);
  }

  const appointment = await appointmentModel.findById(id);
  res.json({ appointment: withActions(req.user, appointment) });
}

module.exports = { list, getOne, create, changeStatus };
