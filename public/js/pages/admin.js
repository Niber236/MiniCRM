// Espace administrateur : statistiques, validation des artisans, comptes et modération des rendez-vous.
import { api } from '../api.js';
import { h, mount } from '../dom.js';
import { requireRole } from '../session.js';
import { renderLayout } from '../layout.js';
import { appointmentCard, sortAppointments, statusTabs, tabsBar } from '../components.js';
import { formatDate, ROLE_LABELS } from '../format.js';
import { loading, errorBox, emptyState, toast, confirmButton } from '../ui.js';

const user = await requireRole('admin');
renderLayout(user);

const app = document.getElementById('app');

const TABS = [
  { key: 'apercu', label: 'Vue d\'ensemble' },
  { key: 'artisans', label: 'Artisans' },
  { key: 'utilisateurs', label: 'Utilisateurs' },
  { key: 'rendez-vous', label: 'Rendez-vous' },
];

let tab = TABS.some((t) => `#${t.key}` === location.hash) ? location.hash.slice(1) : 'apercu';
let stats = null;
let users = [];
let appointments = [];
let roleFilter = '';
let statusFilter = 'ALL';

/* ---------- Actions ---------- */

async function act(request, successMessage) {
  try {
    await request();
    toast(successMessage);
  } catch (error) {
    toast(error.message, 'error');
  }
  await refresh();
}

const verify = (artisan, isVerified) =>
  act(() => api(`/admin/artisans/${artisan.id}/verify`, { method: 'PATCH', body: { isVerified } }),
    isVerified ? 'Artisan validé : ses prestations sont visibles' : 'Validation retirée');

const setActive = (target, isActive) =>
  act(() => api(`/admin/users/${target.id}/active`, { method: 'PATCH', body: { isActive } }),
    isActive ? 'Compte réactivé' : 'Compte suspendu');

const fullName = (u) => `${u.first_name} ${u.last_name}`;

function suspendControl(target) {
  if (target.role === 'admin') return h('span', { class: 'muted small' }, 'Protégé');
  return target.is_active
    ? confirmButton({ label: 'Suspendre', confirmLabel: 'Oui, suspendre', onConfirm: () => setActive(target, false) })
    : h('button', { type: 'button', class: 'btn btn-sm', onclick: () => setActive(target, true) }, 'Réactiver');
}

/* ---------- Onglets ---------- */

const stat = (value, label) => h('div', { class: 'card stat' }, h('strong', null, value), h('span', null, label));

function artisanCard(artisan) {
  return h('article', { class: 'card service-card' },
    h('div', { class: 'meta' },
      h('span', { class: `badge ${artisan.is_verified ? 'badge-ok' : 'badge-warn'}` }, artisan.is_verified ? 'Validé' : 'À valider'),
      artisan.is_active ? null : h('span', { class: 'badge badge-off' }, 'Compte suspendu')),
    h('h3', null, artisan.business_name),
    h('p', { class: 'desc' }, `${artisan.trade} · ${artisan.city}`),
    h('p', { class: 'small muted' }, `${fullName(artisan)} · ${artisan.email}`),
    h('div', { class: 'actions' },
      artisan.is_verified
        ? h('button', { type: 'button', class: 'btn btn-sm', onclick: () => verify(artisan, false) }, 'Retirer la validation')
        : h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => verify(artisan, true) }, 'Valider'),
      suspendControl(artisan))
  );
}

function overviewPanel() {
  const pending = users.filter((u) => u.role === 'artisan' && !u.is_verified);
  return h('div', { class: 'stack-lg' },
    h('div', { class: 'stats' },
      stat(stats.clients, 'Clients'),
      stat(stats.artisans, 'Artisans'),
      stat(stats.artisans_pending, 'Artisans à valider'),
      stat(stats.active_services, 'Prestations actives')),
    h('div', { class: 'stats' },
      stat(stats.appointments, 'Rendez-vous au total'),
      stat(stats.appointments_pending, 'En attente'),
      stat(stats.appointments_confirmed, 'Confirmés'),
      stat(stats.appointments_done, 'Terminés'),
      stat(stats.appointments_cancelled, 'Annulés')),
    h('section', { class: 'stack', 'aria-labelledby': 'pending-title' },
      h('h2', { id: 'pending-title' }, 'Artisans à valider'),
      pending.length === 0
        ? emptyState('Aucun artisan en attente', 'Les nouvelles inscriptions d\'artisans apparaîtront ici.')
        : h('div', { class: 'grid' }, pending.map(artisanCard))));
}

function artisansPanel() {
  const artisans = users.filter((u) => u.role === 'artisan');
  return artisans.length === 0
    ? emptyState('Aucun artisan inscrit')
    : h('div', { class: 'grid' }, artisans.map(artisanCard));
}

function usersPanel() {
  const rows = users.filter((u) => !roleFilter || u.role === roleFilter);
  const select = h('select', { id: 'role-filter' },
    h('option', { value: '' }, 'Tous les rôles'),
    ['client', 'artisan', 'admin'].map((r) => h('option', { value: r, selected: r === roleFilter }, ROLE_LABELS[r])));
  select.addEventListener('change', () => { roleFilter = select.value; render(); });

  return h('div', { class: 'stack' },
    h('div', { class: 'toolbar' }, h('div', { class: 'field' }, h('label', { for: 'role-filter' }, 'Filtrer par rôle'), select)),
    h('div', { class: 'table-wrap' },
      h('table', null,
        h('thead', null, h('tr', null, ['Nom', 'Email', 'Rôle', 'Statut', 'Inscrit le', 'Action'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', null, rows.map((u) =>
          h('tr', null,
            h('td', null, fullName(u)),
            h('td', null, u.email),
            h('td', null, ROLE_LABELS[u.role]),
            h('td', null, h('span', { class: `badge ${u.is_active ? 'badge-ok' : 'badge-off'}` }, u.is_active ? 'Actif' : 'Suspendu')),
            h('td', { class: 'nowrap' }, formatDate(u.created_at)),
            h('td', null, suspendControl(u))))))));
}

function appointmentsPanel() {
  const visible = sortAppointments(statusFilter === 'ALL' ? appointments : appointments.filter((a) => a.status === statusFilter), statusFilter);
  return h('div', { class: 'stack' },
    statusTabs(appointments, statusFilter, (key) => { statusFilter = key; render(); }),
    visible.length === 0
      ? emptyState('Aucun rendez-vous dans cette catégorie')
      : h('div', { class: 'list' }, visible.map((a) => appointmentCard(a, { role: 'admin', onChanged: refresh }))));
}

const PANELS = { apercu: overviewPanel, artisans: artisansPanel, utilisateurs: usersPanel, 'rendez-vous': appointmentsPanel };

function render() {
  const items = TABS.map((t) => ({ ...t, count: t.key === 'artisans' && stats.artisans_pending ? stats.artisans_pending : undefined }));
  mount(app,
    h('div', { class: 'page-head' }, h('h1', null, 'Administration'), h('p', null, 'Validez les artisans, gérez les comptes et modérez les rendez-vous.')),
    tabsBar(items, tab, (key) => { tab = key; history.replaceState(null, '', `#${key}`); render(); }),
    h('div', { role: 'tabpanel' }, PANELS[tab]())
  );
}

async function refresh() {
  try {
    [{ stats }, { users }, { appointments }] = await Promise.all([api('/admin/stats'), api('/admin/users'), api('/appointments')]);
    render();
  } catch (error) {
    mount(app, errorBox(error));
  }
}

// Retour arrière ou lien direct avec un autre #onglet : on affiche l'onglet demandé.
window.addEventListener('hashchange', () => {
  const key = location.hash.slice(1);
  if (stats && PANELS[key] && key !== tab) {
    tab = key;
    render();
  }
});

mount(app, loading());
await refresh();
