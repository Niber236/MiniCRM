// Erreur métier portant un code HTTP, interceptée par le middleware errorHandler.
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const badRequest = (msg, details) => new HttpError(400, msg, details);
const unauthorized = (msg = 'Authentification requise') => new HttpError(401, msg);
const forbidden = (msg = 'Accès refusé') => new HttpError(403, msg);
const notFound = (msg = 'Ressource introuvable') => new HttpError(404, msg);
const conflict = (msg) => new HttpError(409, msg);
const unprocessable = (msg) => new HttpError(422, msg);

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict, unprocessable };
