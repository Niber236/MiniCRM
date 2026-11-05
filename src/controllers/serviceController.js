const serviceModel = require('../models/serviceModel');
const slotModel = require('../models/slotModel');
const artisanModel = require('../models/artisanModel');
const { validate, parseId } = require('../utils/validate');
const { notFound, badRequest } = require('../utils/httpError');

const serviceSchema = {
  title: { type: 'string', required: true, min: 3, max: 120 },
  description: { type: 'string', max: 2000 },
  priceCents: { type: 'int', required: true, min: 0, max: 10_000_000 },
  durationMinutes: { type: 'int', required: true, min: 15, max: 480 },
  isActive: { type: 'bool' },
};

const filterSchema = {
  trade: { type: 'int', min: 1 },
  city: { type: 'string', max: 80 },
  q: { type: 'string', max: 100 },
};

// ---------- Public ----------

async function listPublic(req, res) {
  const { trade, city, q } = validate(filterSchema, req.query);
  const services = await serviceModel.listPublic({ tradeId: trade, city, q });
  res.json({ services });
}

async function getPublic(req, res) {
  const service = await serviceModel.findPublicById(parseId(req.params.id));
  if (!service) throw notFound('Prestation introuvable');
  const profile = await artisanModel.findProfile(service.artisan_id);
  res.json({ service: { ...service, artisan_description: profile.description } });
}

async function listAvailableSlots(req, res) {
  const service = await serviceModel.findPublicById(parseId(req.params.id));
  if (!service) throw notFound('Prestation introuvable');
  const slots = await slotModel.listAvailable(service.artisan_id);
  res.json({ slots });
}

async function listTrades(req, res) {
  res.json({ trades: await artisanModel.listTrades() });
}

// ---------- Espace artisan ----------

async function listMine(req, res) {
  res.json({ services: await serviceModel.listByArtisan(req.user.id) });
}

async function create(req, res) {
  const data = validate(serviceSchema, req.body);
  const service = await serviceModel.create(req.user.id, data);
  res.status(201).json({ service });
}

async function update(req, res) {
  const id = parseId(req.params.id);
  const data = validate(serviceSchema, req.body, { partial: true });
  if (Object.keys(data).length === 0) throw badRequest('Aucun champ à modifier');
  // Le WHERE artisan_id garantit qu'un artisan ne modifie que SES prestations.
  const service = await serviceModel.update(id, req.user.id, data);
  if (!service) throw notFound('Prestation introuvable');
  res.json({ service });
}

/** "Suppression" = désactivation : on conserve l'historique des rendez-vous liés. */
async function deactivate(req, res) {
  const service = await serviceModel.update(parseId(req.params.id), req.user.id, { isActive: false });
  if (!service) throw notFound('Prestation introuvable');
  res.json({ service });
}

module.exports = { listPublic, getPublic, listAvailableSlots, listTrades, listMine, create, update, deactivate };
