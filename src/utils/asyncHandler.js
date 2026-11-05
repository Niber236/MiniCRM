// Express 4 ne capture pas les erreurs des fonctions async : ce wrapper les transmet à next().
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
