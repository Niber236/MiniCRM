const { badRequest } = require('./httpError');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9 .-]{6,20}$/;

/**
 * Validateur de schéma maison (aucune dépendance) — utilisé AVANT toute écriture en base.
 *
 * Exemple de schéma :
 *   { email: { type: 'email', required: true }, age: { type: 'int', min: 18 } }
 *
 * Retourne un objet "propre" ne contenant QUE les champs déclarés (les champs
 * inconnus sont ignorés → impossible d'injecter `role: 'admin'` par exemple).
 * Lève une erreur 400 avec le détail par champ si la validation échoue.
 */
function validate(schema, input = {}, { partial = false } = {}) {
  const errors = {};
  const clean = {};

  for (const [field, rule] of Object.entries(schema)) {
    let value = input[field];

    if (typeof value === 'string' && rule.type !== 'password') value = value.trim();

    const isEmpty = value === undefined || value === null || value === '';
    if (isEmpty) {
      if (rule.required && !partial) errors[field] = 'Champ obligatoire';
      continue;
    }

    const error = checkRule(rule, value);
    if (error) {
      errors[field] = error;
      continue;
    }
    clean[field] = convert(rule, value);
  }

  if (Object.keys(errors).length > 0) {
    throw badRequest('Données invalides', errors);
  }
  return clean;
}

function checkRule(rule, value) {
  switch (rule.type) {
    case 'string':
    case 'password': {
      if (typeof value !== 'string') return 'Doit être une chaîne de caractères';
      const min = rule.min ?? 0;
      const max = rule.max ?? 255;
      if (value.length < min) return `Minimum ${min} caractères`;
      if (value.length > max) return `Maximum ${max} caractères`;
      if (rule.type === 'password' && !/[A-Za-z]/.test(value)) return 'Doit contenir au moins une lettre';
      if (rule.type === 'password' && !/[0-9]/.test(value)) return 'Doit contenir au moins un chiffre';
      if (rule.pattern && !rule.pattern.test(value)) return rule.patternMessage || 'Format invalide';
      return null;
    }
    case 'email':
      if (typeof value !== 'string' || value.length > 255 || !EMAIL_RE.test(value)) return 'Email invalide';
      return null;
    case 'phone':
      if (typeof value !== 'string' || !PHONE_RE.test(value)) return 'Numéro de téléphone invalide';
      return null;
    case 'int': {
      const n = Number(value);
      if (!Number.isInteger(n)) return 'Doit être un nombre entier';
      if (rule.min !== undefined && n < rule.min) return `Minimum ${rule.min}`;
      if (rule.max !== undefined && n > rule.max) return `Maximum ${rule.max}`;
      return null;
    }
    case 'bool':
      if (typeof value !== 'boolean') return 'Doit être vrai ou faux';
      return null;
    case 'enum':
      if (!rule.values.includes(value)) return `Valeur attendue : ${rule.values.join(', ')}`;
      return null;
    case 'datetime':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return 'Date invalide';
      return null;
    default:
      return 'Type de champ inconnu';
  }
}

function convert(rule, value) {
  switch (rule.type) {
    case 'email':
      return value.toLowerCase();
    case 'int':
      return Number(value);
    case 'datetime':
      return new Date(value);
    default:
      return value;
  }
}

/** Valide un identifiant passé dans l'URL (/:id). */
function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide');
  return id;
}

module.exports = { validate, parseId };
