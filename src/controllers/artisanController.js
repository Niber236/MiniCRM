const artisanModel = require('../models/artisanModel');
const { validate } = require('../utils/validate');
const { badRequest } = require('../utils/httpError');

const profileSchema = {
  businessName: { type: 'string', min: 2, max: 120 },
  tradeId: { type: 'int', min: 1 },
  city: { type: 'string', min: 2, max: 80 },
  description: { type: 'string', max: 2000 },
};

async function getProfile(req, res) {
  res.json({ profile: await artisanModel.findProfile(req.user.id) });
}

async function updateProfile(req, res) {
  const data = validate(profileSchema, req.body, { partial: true });
  if (data.tradeId && !(await artisanModel.tradeExists(data.tradeId))) {
    throw badRequest('Données invalides', { tradeId: 'Métier inconnu' });
  }
  res.json({ profile: await artisanModel.updateProfile(req.user.id, data) });
}

module.exports = { getProfile, updateProfile };
