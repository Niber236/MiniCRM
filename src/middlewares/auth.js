const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/pool');
const { unauthorized, forbidden } = require('../utils/httpError');

const COOKIE_NAME = 'craftflow_token';

// Options du cookie de session : inaccessible au JavaScript (HttpOnly → protège du vol par XSS),
// envoyé uniquement en HTTPS en production (Secure) et jamais depuis un autre site (SameSite=Strict → CSRF).
const cookieOptions = {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: 'strict',
  path: '/',
};

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/**
 * Vérifie le JWT du cookie puis recharge l'utilisateur en base :
 * un compte désactivé par l'admin perd l'accès immédiatement, même avec un jeton encore valide.
 */
async function authenticate(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) throw unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      res.clearCookie(COOKIE_NAME, cookieOptions);
      throw unauthorized('Session expirée, veuillez vous reconnecter');
    }

    const { rows } = await query(
      'SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id = $1',
      [payload.sub]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      res.clearCookie(COOKIE_NAME, cookieOptions);
      throw unauthorized('Compte introuvable ou désactivé');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Contrôle d'accès par rôle (RBAC). À placer APRÈS authenticate. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

module.exports = { authenticate, requireRole, signToken, COOKIE_NAME, cookieOptions };
