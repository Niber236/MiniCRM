const { HttpError } = require('../utils/httpError');

/**
 * Limiteur de débit en mémoire (fenêtre fixe), par adresse IP.
 * Sert à freiner les attaques par force brute sur /login et /register.
 * Suffisant pour une instance unique ; en multi-instance on utiliserait Redis.
 */
function rateLimit({ windowMs, max }) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return next(new HttpError(429, 'Trop de tentatives, réessayez dans quelques minutes'));
    }
    next();
  };
}

module.exports = rateLimit;
