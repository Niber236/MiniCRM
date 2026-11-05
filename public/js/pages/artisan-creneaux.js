// Espace artisan : ouvrir des créneaux de disponibilité (par plage horaire) et voir son planning.
import { api } from '../api.js';
import { h, mount } from '../dom.js';
import { requireRole } from '../session.js';
import { renderLayout } from '../layout.js';
import { formatDay, formatRange, groupByDay, formatDuration } from '../format.js';
import { loading, errorBox, emptyState, toast, setBusy, showFieldErrors, clearFieldErrors, confirmButton, statusBadge, alertBox } from '../ui.js';

const user = await requireRole('artisan');
renderLayout(user);

const app = document.getElementById('app');
const planning = h('div', { class: 'stack-lg' }, loading());

/* ---------- Formulaire : une plage horaire découpée en créneaux ---------- */

const pad = (n) => String(n).padStart(2, '0');
const toDateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const tomorrow = new Date(Date.now() + 86_400_000);

const date = h('input', { id: 'date', name: 'date', type: 'date', required: true, value: toDateInput(tomorrow), min: toDateInput(new Date()) });
const startTime = h('input', { id: 'startTime', name: 'startTime', type: 'time', required: true, value: '08:00' });
const endTime = h('input', { id: 'endTime', name: 'endTime', type: 'time', required: true, value: '12:00' });
const duration = h('select', { id: 'duration', name: 'duration' },
  [30, 45, 60, 90, 120, 180].map((m) => h('option', { value: m, selected: m === 60 }, formatDuration(m))));
const preview = h('p', { class: 'hint', 'aria-live': 'polite' });
const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Ouvrir ces créneaux');

const field = (label, control) => h('div', { class: 'field' }, h('label', { for: control.id }, label), control);

const toIso = (day, time) => {
  const d = new Date(`${day}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d;
};

function updatePreview() {
  const start = toIso(date.value, startTime.value);
  const end = toIso(date.value, endTime.value);
  if (!start || !end || end <= start) {
    preview.textContent = 'L\'heure de fin doit être après l\'heure de début.';
    return;
  }
  const count = Math.floor((end - start) / (Number(duration.value) * 60_000));
  preview.textContent = count > 0
    ? `Cela créera ${count} créneau${count > 1 ? 'x' : ''} de ${formatDuration(Number(duration.value))}.`
    : 'La plage est plus courte que la durée d\'un créneau.';
}

const form = h('form', { class: 'card form', novalidate: true },
  h('h2', null, 'Ouvrir des disponibilités'),
  h('p', { class: 'muted' }, 'Indiquez une plage horaire : elle est découpée automatiquement en créneaux réservables par vos clients.'),
  h('div', { class: 'form-row' }, field('Jour', date), field('De', startTime), field('À', endTime), field('Durée d\'un créneau', duration)),
  preview,
  h('div', { class: 'actions' }, submit)
);
form.addEventListener('input', updatePreview);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFieldErrors(form);
  const start = toIso(date.value, startTime.value);
  const end = toIso(date.value, endTime.value);
  if (!start || !end) {
    showFieldErrors(form, { date: 'Choisissez un jour et des heures valides' });
    return;
  }
  setBusy(submit, true, 'Création…');
  try {
    const { slots } = await api('/slots', {
      method: 'POST',
      body: { start: start.toISOString(), end: end.toISOString(), durationMinutes: duration.value },
    });
    toast(`${slots.length} créneau${slots.length > 1 ? 'x' : ''} ouvert${slots.length > 1 ? 's' : ''}`);
    await loadPlanning();
  } catch (error) {
    if (!(error.details && showFieldErrors(form, error.details, { start: 'startTime', end: 'endTime', durationMinutes: 'duration' }))) {
      toast(error.message, 'error');
    }
  }
  setBusy(submit, false);
});

/* ---------- Planning ---------- */

async function removeSlot(slot) {
  try {
    await api(`/slots/${slot.id}`, { method: 'DELETE' });
    toast('Créneau supprimé');
  } catch (error) {
    toast(error.message, 'error');
  }
  await loadPlanning();
}

function slotRow(slot) {
  const booked = slot.appointment_id !== null;
  return h('div', { class: 'card card-compact' },
    h('div', { class: 'appt-head' },
      h('div', null,
        h('div', { class: 'appt-when num' }, formatRange(slot.starts_at, slot.ends_at)),
        booked
          ? h('div', { class: 'muted' }, `${slot.service_title} · ${slot.client_first_name} ${slot.client_last_name}`)
          : h('div', { class: 'muted' }, 'Disponible')),
      booked
        ? statusBadge(slot.appointment_status)
        : h('div', { class: 'actions' },
            h('span', { class: 'badge badge-ok' }, 'Libre'),
            confirmButton({ label: 'Supprimer', confirmLabel: 'Oui, supprimer', onConfirm: () => removeSlot(slot) }))));
}

async function loadPlanning() {
  try {
    const { slots } = await api('/slots');
    if (slots.length === 0) {
      mount(planning, emptyState('Aucun créneau ouvert', 'Utilisez le formulaire ci-dessus : vos clients pourront réserver dès que des créneaux existent.'));
      return;
    }
    mount(planning, [...groupByDay(slots, (s) => s.starts_at).values()].map((daySlots) =>
      h('section', { class: 'day-group' },
        h('h3', null, formatDay(daySlots[0].starts_at)),
        h('div', { class: 'grid' }, daySlots.map(slotRow)))));
  } catch (error) {
    mount(planning, errorBox(error));
  }
}

mount(app,
  h('div', { class: 'page-head' },
    h('h1', null, 'Mes créneaux'),
    h('p', null, 'Vous fixez vos disponibilités à l\'avance : vos clients ne peuvent réserver que dans ces créneaux.')),
  form,
  h('section', { class: 'stack', 'aria-labelledby': 'planning-title' },
    h('h2', { id: 'planning-title' }, 'Planning à venir'),
    alertBox('Un créneau déjà réservé ne peut pas être supprimé : annulez d\'abord le rendez-vous depuis le tableau de bord.'),
    planning)
);
updatePreview();
await loadPlanning();
