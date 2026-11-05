// Configuration centralisée : toutes les variables d'environnement passent par ici.
require('dotenv').config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

const env = process.env.NODE_ENV || 'development';

const config = {
  env,
  isProduction: env === 'production',
  port: Number(process.env.PORT) || 3000,
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 12,
};

if (config.isProduction && config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET doit contenir au moins 32 caractères en production');
}

module.exports = config;
