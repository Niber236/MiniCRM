const { HttpError } = require('../utils/httpError');
const config = require('../config');

// Codes d'erreur PostgreSQL traduits en réponses HTTP compréhensibles.
const PG_ERRORS = {
  '23505': { status: 409, message: 'Cette ressource existe déjà ou est déjà réservée' }, // unique_violation
  '23P01': { status: 409, message: 'Chevauchement avec un créneau existant' },          // exclusion_violation
  '23503': { status: 400, message: 'Référence invalide' },                              // foreign_key_violation
  '23514': { status: 400, message: 'Valeur hors limites' },                             // check_violation
};

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Route introuvable' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON invalide' });
  }
  if (err.code && PG_ERRORS[err.code]) {
    const { status, message } = PG_ERRORS[err.code];
    return res.status(status).json({ error: message });
  }

  // Erreur inattendue : on la journalise côté serveur sans exposer de détails au client.
  if (config.env !== 'test') console.error(err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
}

module.exports = { errorHandler, notFoundHandler };
