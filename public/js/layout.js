// En-tête (navigation selon le rôle) et pied de page, injectés par chaque page.
import { h } from './dom.js';
import { api } from './api.js';
import { HOME, resetSession } from './session.js';
import { ROLE_LABELS } from './format.js';

const NAV = {
  guest: [
    ['/', 'Catalogue'],
    ['/login.html', 'Connexion'],
    ['/register.html', 'Inscription', true],
  ],
  client: [
    ['/', 'Catalogue'],
    ['/client/rendez-vous.html', 'Mes rendez-vous'],
  ],
  artisan: [
    ['/artisan/', 'Tableau de bord'],
    ['/artisan/prestations.html', 'Prestations'],
    ['/artisan/creneaux.html', 'Créneaux'],
    ['/artisan/profil.html', 'Profil'],
  ],
  admin: [['/admin/', 'Administration']],
};

const normalize = (path) => path.replace(/index\.html$/, '');

async function logout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } finally {
    resetSession();
    location.href = '/login.html';
  }
}

export function renderLayout(user) {
  const current = normalize(location.pathname);
  const links = NAV[user ? user.role : 'guest'].map(([href, label, cta]) =>
    h('a', {
      href,
      class: cta ? 'nav-cta' : null,
      'aria-current': normalize(href) === current ? 'page' : null,
    }, label)
  );

  const header = h('header', { class: 'site-header' },
    h('div', { class: 'container bar' },
      h('a', { class: 'brand', href: user ? HOME[user.role] : '/' },
        h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), 'CraftFlow'),
      h('nav', { class: 'nav', 'aria-label': 'Navigation principale' }, links),
      user
        ? h('div', { class: 'account' },
            h('span', null, `${user.firstName} · ${ROLE_LABELS[user.role]}`),
            h('button', { type: 'button', class: 'btn btn-sm', onclick: logout }, 'Se déconnecter'))
        : null
    )
  );

  const footer = h('footer', { class: 'site-footer' },
    h('div', { class: 'container' }, 'CraftFlow · Projet de fin de formation, Holberton School France'));

  document.getElementById('site-header').replaceWith(header);
  document.getElementById('site-footer').replaceWith(footer);
}
