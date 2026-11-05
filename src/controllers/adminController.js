const userModel = require('../models/userModel');
const artisanModel = require('../models/artisanModel');
const appointmentModel = require('../models/appointmentModel');
const { validate, parseId } = require('../utils/validate');
const { notFound, badRequest } = require('../utils/httpError');

async function stats(req, res) {
  res.json({ stats: await appointmentModel.stats() });
}

async function listUsers(req, res) {
  const { role } = validate({ role: { type: 'enum', values: ['client', 'artisan', 'admin'] } }, req.query);
  res.json({ users: await userModel.listForAdmin({ role }) });
}

async function setUserActive(req, res) {
  const id = parseId(req.params.id);
  const { isActive } = validate({ isActive: { type: 'bool', required: true } }, req.body);

  const target = await userModel.findById(id);
  if (!target) throw notFound('Utilisateur introuvable');
  // Garde-fou : un admin ne peut pas désactiver un autre admin ni se bloquer lui-même.
  if (target.role === 'admin') throw badRequest('Impossible de modifier un compte administrateur');

  res.json({ user: await userModel.setActive(id, isActive) });
}

async function verifyArtisan(req, res) {
  const id = parseId(req.params.id);
  const { isVerified } = validate({ isVerified: { type: 'bool', required: true } }, req.body);
  const profile = await artisanModel.setVerified(id, isVerified);
  if (!profile) throw notFound('Artisan introuvable');
  res.json({ profile });
}

module.exports = { stats, listUsers, setUserActive, verifyArtisan };
