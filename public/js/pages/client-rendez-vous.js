// Espace client : « Mes rendez-vous » avec filtre par statut, suivi et annulation.
import { api } from '../api.js';
import { h, mount } from '../dom.js';
import { requireRole } from '../session.js';
import { renderLayout } from '../layout.js';
import { appointmentCard, sortAppointments, statusTabs } from '../components.js';
import { loading, errorBox, emptyState } from '../ui.js';

const user = await requireRole('client');
renderLayout(user);

const app = document.getElementById('app');
let all = [];
let filter = 'ALL';

function render() {
  const visible = sortAppointments(filter === 'ALL' ? all : all.filter((a) => a.status === filter), filter);
  mount(app,
    h('div', { class: 'page-head' },
      h('h1', null, 'Mes rendez-vous'),
      h('p', null, 'Suivez l\'avancement de vos demandes. Vous pouvez en annuler tant que l\'intervention n\'est pas terminée.')),
    all.length === 0
      ? emptyState('Aucun rendez-vous pour l\'instant', 'Choisissez une prestation et réservez votre premier créneau.',
          h('a', { class: 'btn btn-primary', href: '/' }, 'Parcourir le catalogue'))
      : h('div', { class: 'stack' },
          statusTabs(all, filter, (key) => { filter = key; render(); }),
          visible.length === 0
            ? emptyState('Aucun rendez-vous dans cette catégorie')
            : h('div', { class: 'list' }, visible.map((a) => appointmentCard(a, { role: 'client', onChanged: refresh }))))
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

mount(app, loading('Chargement de vos rendez-vous…'));
await refresh();
