const bcrypt = require('bcrypt');
const config = require('../config');
const { withTransaction } = require('../db/pool');
const userModel = require('../models/userModel');
const artisanModel = require('../models/artisanModel');
const { validate } = require('../utils/validate');
const { badRequest, unauthorized, forbidden, conflict } = require('../utils/httpError');
const { signToken, COOKIE_NAME, cookieOptions } = require('../middlewares/auth');

const userSchema = {
  email: { type: 'email', required: true },
  password: { type: 'password', required: true, min: 8, max: 72 }, // bcrypt tronque au-delà de 72 octets
  firstName: { type: 'string', required: true, min: 1, max: 80 },
  lastName: { type: 'string', required: true, min: 1, max: 80 },
  phone: { type: 'phone' },
  // L'inscription publique ne permet JAMAIS de créer un compte admin.
  role: { type: 'enum', values: ['client', 'artisan'], required: true },
};

const artisanSchema = {
  businessName: { type: 'string', required: true, min: 2, max: 120 },
  tradeId: { type: 'int', required: true, min: 1 },
  city: { type: 'string', required: true, min: 2, max: 80 },
  description: { type: 'string', max: 2000 },
};

const loginSchema = {
  email: { type: 'email', required: true },
  password: { type: 'password', required: true, min: 1, max: 72 },
};

// Hash factice : on exécute bcrypt.compare même si l'email n'existe pas,
// pour que le temps de réponse ne révèle pas quels emails sont inscrits.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-0', 10);

function toPublicUser(user, profile = null) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    phone: user.phone,
    role: user.role,
    artisanProfile: profile,
  };
}

function setSessionCookie(res, user) {
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions);
}

async function register(req, res) {
  const data = validate(userSchema, req.body);
  const artisanData = data.role === 'artisan' ? validate(artisanSchema, req.body) : null;

  if (artisanData && !(await artisanModel.tradeExists(artisanData.tradeId))) {
    throw badRequest('Données invalides', { tradeId: 'Métier inconnu' });
  }
  if (await userModel.findByEmail(data.email)) {
    throw conflict('Un compte existe déjà avec cet email');
  }

  const passwordHash = await bcrypt.hash(data.password, config.bcryptRounds);

  // Utilisateur + profil artisan créés ensemble ou pas du tout (transaction).
  const user = await withTransaction(async (db) => {
    const created = await userModel.create(db, { ...data, passwordHash });
    if (artisanData) {
      await artisanModel.createProfile(db, { userId: created.id, ...artisanData });
    }
    return created;
  });

  const profile = artisanData ? await artisanModel.findProfile(user.id) : null;
  setSessionCookie(res, user);
  res.status(201).json({ user: toPublicUser(user, profile) });
}

async function login(req, res) {
  const { email, password } = validate(loginSchema, req.body);
  const user = await userModel.findByEmail(email);

  const passwordOk = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !passwordOk) {
    throw unauthorized('Email ou mot de passe incorrect');
  }
  if (!user.is_active) {
    throw forbidden('Ce compte a été désactivé. Contactez l\'administrateur.');
  }

  const profile = user.role === 'artisan' ? await artisanModel.findProfile(user.id) : null;
  setSessionCookie(res, user);
  res.json({ user: toPublicUser(user, profile) });
}

function logout(req, res) {
  res.clearCookie(COOKIE_NAME, cookieOptions);
  res.status(204).end();
}

async function me(req, res) {
  const user = await userModel.findById(req.user.id);
  const profile = user.role === 'artisan' ? await artisanModel.findProfile(user.id) : null;
  res.json({ user: toPublicUser(user, profile) });
}

module.exports = { register, login, logout, me };
