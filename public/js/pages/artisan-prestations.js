// Espace artisan : CRUD de ses prestations (créer, modifier, désactiver, réactiver).
import { api } from '../api.js';
import { h, mount } from '../dom.js';
import { requireRole } from '../session.js';
import { renderLayout } from '../layout.js';
import { eur, formatDuration, parseEuros, centsToInput } from '../format.js';
import { loading, errorBox, emptyState, alertBox, toast, setBusy, showFieldErrors, clearFieldErrors, confirmButton } from '../ui.js';

const user = await requireRole('artisan');
renderLayout(user);

const app = document.getElementById('app');
const listBox = h('div', { class: 'stack' }, loading());
let editingId = null;

/* ---------- Formulaire (création et modification) ---------- */

const title = h('input', { id: 'title', name: 'title', type: 'text', required: true, maxlength: 120, placeholder: 'Réparation de fuite' });
const description = h('textarea', { id: 'description', name: 'description', maxlength: 2000 });
const price = h('input', { id: 'price', name: 'price', type: 'text', inputmode: 'decimal', required: true, placeholder: '89,00' });
const duration = h('input', { id: 'duration', name: 'duration', type: 'number', min: 15, max: 480, step: 15, required: true, value: 60 });
const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Ajouter la prestation');
const cancelEdit = h('button', { type: 'button', class: 'btn', hidden: true }, 'Annuler la modification');
const formTitle = h('h2', null, 'Nouvelle prestation');

const field = (label, control, hint) =>
  h('div', { class: 'field' }, h('label', { for: control.id }, label), control, hint ? h('p', { class: 'hint' }, hint) : null);

const form = h('form', { class: 'card form', novalidate: true },
  formTitle,
  field('Titre', title),
  field('Description', description, 'Ce que comprend l\'intervention, ce qui est exclu (pièces, déplacement...).'),
  h('div', { class: 'form-row' },
    field('Prix indicatif (€)', price),
    field('Durée (minutes)', duration, 'Entre 15 et 480 minutes.')),
  h('div', { class: 'actions' }, submit, cancelEdit)
);

function resetForm() {
  editingId = null;
  form.reset();
  duration.value = 60;
  clearFieldErrors(form);
  formTitle.textContent = 'Nouvelle prestation';
  submit.textContent = 'Ajouter la prestation';
  cancelEdit.hidden = true;
}

function startEdit(service) {
  editingId = service.id;
  clearFieldErrors(form);
  title.value = service.title;
  description.value = service.description || '';
  price.value = centsToInput(service.price_cents);
  duration.value = service.duration_minutes;
  formTitle.textContent = 'Modifier la prestation';
  submit.textContent = 'Enregistrer';
  cancelEdit.hidden = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  title.focus();
}

cancelEdit.addEventListener('click', resetForm);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFieldErrors(form);
  const priceCents = parseEuros(price.value);
  if (priceCents === null) {
    showFieldErrors(form, { price: 'Indiquez un prix valide, par exemple 89,00' });
    return;
  }
  const body = { title: title.value, description: description.value, priceCents, durationMinutes: duration.value };
  setBusy(submit, true, 'Enregistrement…');
  try {
    await api(editingId ? `/services/${editingId}` : '/services', { method: editingId ? 'PUT' : 'POST', body });
    toast(editingId ? 'Prestation modifiée' : 'Prestation ajoutée');
    setBusy(submit, false);
    resetForm();
    await loadServices();
  } catch (error) {
    setBusy(submit, false);
    if (!(error.details && showFieldErrors(form, error.details, { priceCents: 'price', durationMinutes: 'duration' }))) toast(error.message, 'error');
  }
});

/* ---------- Liste ---------- */

async function setActive(service, isActive) {
  try {
    await api(`/services/${service.id}`, isActive ? { method: 'PUT', body: { isActive: true } } : { method: 'DELETE' });
    toast(isActive ? 'Prestation réactivée' : 'Prestation désactivée');
  } catch (error) {
    toast(error.message, 'error');
  }
  await loadServices();
}

function serviceCard(service) {
  return h('article', { class: 'card service-card' },
    h('div', { class: 'meta' },
      h('span', { class: `badge ${service.is_active ? 'badge-ok' : 'badge-off'}` }, service.is_active ? 'Visible' : 'Désactivée')),
    h('h3', null, service.title),
    service.description ? h('p', { class: 'desc' }, service.description) : null,
    h('div', null, h('div', { class: 'price' }, eur(service.price_cents)), h('div', { class: 'muted small' }, `Durée : ${formatDuration(service.duration_minutes)}`)),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => startEdit(service) }, 'Modifier'),
      service.is_active
        ? confirmButton({ label: 'Désactiver', confirmLabel: 'Oui, désactiver', onConfirm: () => setActive(service, false) })
        : h('button', { type: 'button', class: 'btn btn-sm', onclick: () => setActive(service, true) }, 'Réactiver'))
  );
}

async function loadServices() {
  try {
    const { services } = await api('/services/mine');
    mount(listBox, services.length === 0
      ? emptyState('Aucune prestation', 'Ajoutez votre première prestation avec le formulaire ci-dessus : elle apparaîtra dans le catalogue.')
      : h('div', { class: 'grid' }, services.map(serviceCard)));
  } catch (error) {
    mount(listBox, errorBox(error));
  }
}

mount(app,
  h('div', { class: 'page-head' },
    h('h1', null, 'Mes prestations'),
    h('p', null, 'Votre catalogue : ce que vos clients peuvent réserver. Désactiver une prestation la retire du catalogue sans effacer l\'historique de vos rendez-vous.')),
  form,
  h('section', { class: 'stack', 'aria-labelledby': 'list-title' }, h('h2', { id: 'list-title' }, 'Catalogue'), listBox)
);

try {
  const { profile } = await api('/artisan/profile');
  if (!profile.is_verified) {
    app.querySelector('.page-head').after(alertBox('Vos prestations seront visibles dans le catalogue une fois votre profil validé par un administrateur.', 'warn'));
  }
} catch {
  // information facultative
}
await loadServices();
