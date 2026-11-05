const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canTransition, allowedTransitions } = require('../src/services/statusMachine');

test('artisan : cycle normal EN_ATTENTE → CONFIRME → TERMINE', () => {
  assert.ok(canTransition('artisan', 'EN_ATTENTE', 'CONFIRME'));
  assert.ok(canTransition('artisan', 'CONFIRME', 'TERMINE'));
});

test('aucun retour en arrière ni saut d\'étape', () => {
  assert.ok(!canTransition('artisan', 'CONFIRME', 'EN_ATTENTE'));
  assert.ok(!canTransition('artisan', 'EN_ATTENTE', 'TERMINE'));
});

test('TERMINE et ANNULE sont des états finaux', () => {
  for (const role of ['client', 'artisan', 'admin']) {
    assert.deepEqual(allowedTransitions(role, 'TERMINE'), []);
    assert.deepEqual(allowedTransitions(role, 'ANNULE'), []);
  }
});

test('le client peut seulement annuler', () => {
  assert.deepEqual(allowedTransitions('client', 'EN_ATTENTE'), ['ANNULE']);
  assert.ok(!canTransition('client', 'EN_ATTENTE', 'CONFIRME'));
});

test('rôle inconnu : aucune transition', () => {
  assert.deepEqual(allowedTransitions('pirate', 'EN_ATTENTE'), []);
});
