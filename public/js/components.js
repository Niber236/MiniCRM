// Composants partagés entre les espaces client, artisan et administration.
import { api } from './api.js';
import { h } from './dom.js';
import { eur, formatDay, formatRange, formatDuration, formatDateTime, STATUS_LABELS, ROLE_LABELS } from './format.js';
import { statusBadge, toast, confirmButton, setBusy } from './ui.js';

/**
 * Libellé du bouton pour chaque transition, selon le rôle.
 * Le serveur renvoie `allowed_transitions` : on n'affiche QUE ce qu'il autorise
 * (et il revérifie à chaque requête, l'interface n'est qu'un confort).
 */
function actionLabel(role, current, target) {
  if (target === 'CONFIRME') return 'Confirmer';
  if (target === 'TERMINE') return 'Marquer comme terminé';
  if (target === 'ANNULE') {
    if (role === 'client') return 'Annuler ma demande';
    if (role === 'admin') return 'Annuler (modération)';
    return current === 'EN_ATTENTE' ? 'Refuser' : 'Annuler';
  }
  return target;
}

async function changeStatus(id, status, onChanged) {
  try {
    await api(`/appointments/${id}/status`, { method: 'PATCH', body: { status } });
    toast(`Rendez-vous « ${STATUS_LABELS[status].toLowerCase()} »`);
  } catch (error) {
    toast(error.message, 'error');
  }
  await onChanged();
}

function timeline(history) {
  return h('ol', { class: 'timeline' }, history.map((entry) => {
    const who = entry.first_name ? `${entry.first_name} ${entry.last_name} (${ROLE_LABELS[entry.role].toLowerCase()})` : 'compte supprimé';
    const what = entry.from_status ? `${STATUS_LABELS[entry.from_status]} → ${STATUS_LABELS[entry.to_status]}` : 'Demande créée';
    return h('li', null, h('time', { datetime: entry.changed_at }, formatDateTime(entry.changed_at)), h('span', null, `${what} · ${who}`));
  }));
}

const phoneHref = (phone) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/**
 * Carte d'un rendez-vous.
 * role = rôle de la personne qui regarde (change les infos affichées et les actions possibles).
 */
export function appointmentCard(a, { role, onChanged }) {
  const detail = h('div', { hidden: true });
  let loaded = false;
  const toggle = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-expanded': 'false' }, 'Voir le suivi');
  toggle.addEventListener('click', async () => {
    const open = detail.hidden;
    detail.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Masquer le suivi' : 'Voir le suivi';
    if (open && !loaded) {
      try {
        const { history } = await api(`/appointments/${a.id}`);
        detail.replaceChildren(timeline(history));
        loaded = true;
      } catch (error) {
        detail.replaceChildren(h('p', { class: 'field-error' }, error.message));
      }
    }
  });

  const actions = (a.allowed_transitions || []).map((target) => {
    const label = actionLabel(role, a.status, target);
    if (target === 'ANNULE') {
      return confirmButton({ label, confirmLabel: 'Oui, annuler', onConfirm: () => changeStatus(a.id, target, onChanged) });
    }
    const button = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, label);
    button.addEventListener('click', async () => {
      setBusy(button, true, '…');
      await changeStatus(a.id, target, onChanged);
    });
    return button;
  });

  const showClient = role === 'artisan' || role === 'admin';
  const showArtisan = role === 'client' || role === 'admin';

  return h('article', { class: 'card appt' },
    h('div', { class: 'appt-head' },
      h('div', null,
        h('div', { class: 'appt-when' }, `${formatDay(a.starts_at)} · ${formatRange(a.starts_at, a.ends_at)}`),
        h('div', { class: 'muted' }, `${a.service_title} · ${eur(a.price_cents)} · ${formatDuration(a.duration_minutes)}`)),
      statusBadge(a.status)),
    h('div', { class: 'appt-meta' },
      showArtisan ? h('span', null, 'Artisan : ', h('strong', null, a.business_name), ` (${a.artisan_city})`) : null,
      showClient ? h('span', null, 'Client : ', h('strong', null, `${a.client_first_name} ${a.client_last_name}`)) : null,
      showClient && a.client_phone ? h('a', { href: phoneHref(a.client_phone) }, a.client_phone) : null,
      showClient ? h('a', { href: `mailto:${a.client_email}` }, a.client_email) : null),
    h('div', { class: 'appt-body' },
      h('span', { class: 'small muted' }, 'Adresse d\'intervention'),
      h('span', null, a.address)),
    h('p', { class: 'appt-desc' }, a.description),
    h('div', { class: 'actions' }, actions, toggle),
    detail
  );
}

/** Tri : les rendez-vous à venir par date croissante, l'historique du plus récent au plus ancien. */
export function sortAppointments(list, filter) {
  const upcoming = filter === 'EN_ATTENTE' || filter === 'CONFIRME';
  return [...list].sort((x, y) => (upcoming ? 1 : -1) * (new Date(x.starts_at) - new Date(y.starts_at)));
}

/** Barre d'onglets accessible (role="tablist"). */
export function tabsBar(items, selected, onSelect) {
  return h('div', { class: 'tabs', role: 'tablist' }, items.map((item) =>
    h('button', {
      type: 'button',
      role: 'tab',
      class: 'tab',
      'aria-selected': String(item.key === selected),
      onclick: () => onSelect(item.key),
    }, item.label, item.count !== undefined ? h('span', { class: 'count' }, `(${item.count})`) : null)
  ));
}

export const STATUS_TABS = [
  { key: 'ALL', label: 'Tous' },
  { key: 'EN_ATTENTE', label: 'En attente' },
  { key: 'CONFIRME', label: 'Confirmés' },
  { key: 'TERMINE', label: 'Terminés' },
  { key: 'ANNULE', label: 'Annulés' },
];

/** Onglets de statut avec le nombre de rendez-vous dans chacun. */
export function statusTabs(appointments, selected, onSelect) {
  return tabsBar(STATUS_TABS.map((tab) => ({
    ...tab,
    count: tab.key === 'ALL' ? appointments.length : appointments.filter((a) => a.status === tab.key).length,
  })), selected, onSelect);
}
