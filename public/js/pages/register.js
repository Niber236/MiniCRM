// Inscription : un client ou un artisan. Le rôle « admin » n'est jamais proposé (créé via un script serveur).
import { api } from '../api.js';
import { h, mount } from '../dom.js';
import { getUser, resetSession, safeNext, HOME } from '../session.js';
import { renderLayout } from '../layout.js';
import { setBusy, showFieldErrors, alertBox } from '../ui.js';

const existing = await getUser();
if (existing) location.replace(HOME[existing.role]);
renderLayout(existing);

const params = new URLSearchParams(location.search);
const next = safeNext(params.get('next'));
const startsAsArtisan = params.get('role') === 'artisan';

const message = h('div');
const input = (id, attrs = {}) => h('input', { id, name: id, ...attrs });
const field = (label, control, hint) =>
  h('div', { class: 'field' }, h('label', { for: control.id }, label), control, hint ? h('p', { class: 'hint' }, hint) : null);

const roleClient = h('input', { type: 'radio', name: 'role', value: 'client', checked: !startsAsArtisan });
const roleArtisan = h('input', { type: 'radio', name: 'role', value: 'artisan', checked: startsAsArtisan });

const trade = h('select', { id: 'tradeId', name: 'tradeId' }, h('option', { value: '' }, 'Choisir un métier'));
const artisanFields = h('fieldset', { class: 'stack', hidden: !startsAsArtisan },
  h('legend', { class: 'visually-hidden' }, 'Informations professionnelles'),
  field('Nom de votre entreprise', input('businessName', { type: 'text', maxlength: 120, autocomplete: 'organization' })),
  h('div', { class: 'form-row' }, field('Métier', trade), field('Ville', input('city', { type: 'text', maxlength: 80, autocomplete: 'address-level2' }))),
  field('Présentation', h('textarea', { id: 'description', name: 'description', maxlength: 2000 }), 'Facultatif. Visible par vos clients.'),
  alertBox('Votre profil sera visible dans le catalogue après validation par un administrateur.', 'warn')
);

const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Créer mon compte');

const form = h('form', { class: 'form card', novalidate: true },
  h('fieldset', { class: 'field' },
    h('legend', null, 'Je suis'),
    h('div', { class: 'choice-row' },
      h('label', { class: 'choice' }, roleClient, 'Un client'),
      h('label', { class: 'choice' }, roleArtisan, 'Un artisan'))),
  h('div', { class: 'form-row' },
    field('Prénom', input('firstName', { type: 'text', required: true, maxlength: 80, autocomplete: 'given-name' })),
    field('Nom', input('lastName', { type: 'text', required: true, maxlength: 80, autocomplete: 'family-name' }))),
  field('Email', input('email', { type: 'email', required: true, autocomplete: 'email' })),
  field('Téléphone', input('phone', { type: 'tel', autocomplete: 'tel' }), 'Facultatif. Transmis à l\'artisan pour organiser l\'intervention.'),
  field('Mot de passe', input('password', { type: 'password', required: true, minlength: 8, autocomplete: 'new-password' }), '8 caractères minimum, avec au moins une lettre et un chiffre.'),
  artisanFields,
  submit
);

const selectedRole = () => (roleArtisan.checked ? 'artisan' : 'client');
form.addEventListener('change', (event) => {
  if (event.target.name === 'role') artisanFields.hidden = selectedRole() !== 'artisan';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  mount(message);
  const role = selectedRole();
  const data = Object.fromEntries(new FormData(form));
  const body = {
    role,
    email: data.email,
    password: data.password,
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone,
  };
  if (role === 'artisan') Object.assign(body, { businessName: data.businessName, tradeId: data.tradeId, city: data.city, description: data.description });

  setBusy(submit, true, 'Création…');
  try {
    const { user } = await api('/auth/register', { method: 'POST', body });
    resetSession();
    location.href = user.role === 'artisan' ? '/artisan/' : (next || '/');
  } catch (error) {
    if (!(error.details && showFieldErrors(form, error.details))) mount(message, alertBox(error.message, 'error'));
    setBusy(submit, false);
  }
});

try {
  const { trades } = await api('/trades');
  trade.append(...trades.map((t) => h('option', { value: t.id }, t.name)));
} catch {
  mount(message, alertBox('La liste des métiers n\'a pas pu être chargée.', 'warn'));
}

mount(document.getElementById('app'),
  h('div', { class: 'page-head' }, h('h1', null, 'Créer un compte'), h('p', null, 'Gratuit, en moins d\'une minute.')),
  message,
  form,
  h('p', { class: 'muted' }, 'Déjà inscrit ? ', h('a', { href: next ? `/login.html?next=${encodeURIComponent(next)}` : '/login.html' }, 'Connectez-vous'))
);
