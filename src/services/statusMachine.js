/**
 * Machine à états des rendez-vous.
 *
 *            ┌──────────► ANNULE ◄──────────┐
 *            │                              │
 *   EN_ATTENTE ───────► CONFIRME ───────► TERMINE
 *
 * Les transitions autorisées dépendent du RÔLE de l'utilisateur :
 *   - l'artisan pilote l'intervention (confirmer, terminer, annuler)
 *   - le client peut seulement annuler sa demande tant qu'elle n'est pas terminée
 *   - l'admin peut annuler (modération)
 * TERMINE et ANNULE sont des états finaux.
 */
const STATUSES = ['EN_ATTENTE', 'CONFIRME', 'TERMINE', 'ANNULE'];

const TRANSITIONS = {
  artisan: {
    EN_ATTENTE: ['CONFIRME', 'ANNULE'],
    CONFIRME: ['TERMINE', 'ANNULE'],
  },
  client: {
    EN_ATTENTE: ['ANNULE'],
    CONFIRME: ['ANNULE'],
  },
  admin: {
    EN_ATTENTE: ['ANNULE'],
    CONFIRME: ['ANNULE'],
  },
};

function allowedTransitions(role, fromStatus) {
  return (TRANSITIONS[role] && TRANSITIONS[role][fromStatus]) || [];
}

function canTransition(role, fromStatus, toStatus) {
  return allowedTransitions(role, fromStatus).includes(toStatus);
}

module.exports = { STATUSES, allowedTransitions, canTransition };
