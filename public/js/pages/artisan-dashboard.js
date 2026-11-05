// Espace artisan : tableau de bord des demandes (confirmer, terminer, annuler).
import { api } from '../api.js';
import { h, mount } from '../dom.js';
import { requireRole } from '../session.js';
import { renderLayout } from '../layout.js';
import { appointmentCard, sortAppointments, statusTabs } from '../components.js';
import { eur } from '../format.js';
import { loading, errorBox, emptyState, alertBox } from '../ui.js';

const user = await requireRole('artisan');
renderLayout(user);

const app = document.getElementById('app');
let all = [];
let filter = 'EN_ATTENTE';
let profile = null;

const count = (status) => all.filter((a) => a.status === status).length;
const stat = (value, label) => h('div', { class: 'card stat' }, h('strong', null, value), h('span', null, label));

function render() {
  const visible = sortAppointments(filter === 'ALL' ? all : all.filter((a) => a.status === filter), filter);
  const revenue = all.filter((a) => a.status === 'TERMINE').reduce((sum, a) => sum + a.price_cents, 0);

  mount(app,
    h('div', { class: 'page-head' },
      h('h1', null, `Bonjour ${user.firstName}`),
      h('p', null, 'Traitez les demandes de vos clients et suivez vos interventions.')),
    profile && !profile.is_verified
      ? alertBox('Votre profil est en attente de validation par un administrateur : vos prestations ne sont pas encore visibles dans le catalogue.', 'warn')
      : null,
    h('div', { class: 'stats' },
      stat(count('EN_ATTENTE'), 'Demandes à traiter'),
      stat(count('CONFIRME'), 'Interventions confirmées'),
      stat(count('TERMINE'), 'Interventions terminées'),
      stat(eur(revenue), 'Montant des interventions terminées')),
    h('div', { class: 'stack' },
      statusTabs(all, filter, (key) => { filter = key; render(); }),
      visible.length === 0
        ? emptyState(
            filter === 'EN_ATTENTE' ? 'Aucune demande à traiter' : 'Aucun rendez-vous dans cette catégorie',
            filter === 'EN_ATTENTE' ? 'Les nouvelles demandes de vos clients apparaîtront ici. Pensez à ouvrir des créneaux pour en recevoir.' : null,
            filter === 'EN_ATTENTE' ? h('a', { class: 'btn btn-primary', href: '/artisan/creneaux.html' }, 'Gérer mes créneaux') : null)
        : h('div', { class: 'list' }, visible.map((a) => appointmentCard(a, { role: 'artisan', onChanged: refresh }))))
  );
}

async function refresh() {
  try {
    ({ appointments: all } = await api('/appointments'));
    render();
  } catch (error) {
    mount(app, errorBox(error));
  }
}

mount(app, loading());
try {
  ({ profile } = await api('/artisan/profile'));
} catch {
  // l'absence de profil ne bloque pas l'affichage des rendez-vous
}
await refresh();
