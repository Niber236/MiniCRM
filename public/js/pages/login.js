// Connexion : le serveur pose le cookie de session (HttpOnly), puis on redirige selon le rôle.
import { api } from '../api.js';
import { h, mount } from '../dom.js';
import { getUser, resetSession, safeNext, HOME } from '../session.js';
import { renderLayout } from '../layout.js';
import { setBusy, showFieldErrors, alertBox } from '../ui.js';

const existing = await getUser();
if (existing) location.replace(HOME[existing.role]);
renderLayout(existing);

const next = safeNext(new URLSearchParams(location.search).get('next'));
const message = h('div');

const email = h('input', { id: 'email', name: 'email', type: 'email', required: true, autocomplete: 'email' });
const password = h('input', { id: 'password', name: 'password', type: 'password', required: true, autocomplete: 'current-password' });
const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Se connecter');

const form = h('form', { class: 'form card', novalidate: true },
  h('div', { class: 'field' }, h('label', { for: 'email' }, 'Email'), email),
  h('div', { class: 'field' }, h('label', { for: 'password' }, 'Mot de passe'), password),
  submit
);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  mount(message);
  setBusy(submit, true, 'Connexion…');
  try {
    const { user } = await api('/auth/login', { method: 'POST', body: { email: email.value, password: password.value } });
    resetSession();
    location.href = next || HOME[user.role];
  } catch (error) {
    if (!(error.details && showFieldErrors(form, error.details))) mount(message, alertBox(error.message, 'error'));
    setBusy(submit, false);
  }
});

mount(document.getElementById('app'),
  h('div', { class: 'page-head' }, h('h1', null, 'Connexion'), h('p', null, 'Accédez à votre espace client, artisan ou administrateur.')),
  message,
  form,
  h('p', { class: 'muted' }, 'Pas encore de compte ? ', h('a', { href: next ? `/register.html?next=${encodeURIComponent(next)}` : '/register.html' }, 'Inscrivez-vous'))
);
