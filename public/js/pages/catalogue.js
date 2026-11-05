// Accueil : catalogue public des prestations, filtrable par métier, ville et mot-clé.
import { api } from '../api.js';
import { h, mount, debounce } from '../dom.js';
import { getUser } from '../session.js';
import { renderLayout } from '../layout.js';
import { eur, formatDuration } from '../format.js';
import { loading, errorBox, emptyState } from '../ui.js';

const user = await getUser();
renderLayout(user);

const app = document.getElementById('app');
const results = h('div', { 'aria-live': 'polite' }, loading('Chargement des prestations…'));

const search = h('input', { id: 'q', type: 'search', placeholder: 'Fuite, prise, serrure…', autocomplete: 'off' });
const city = h('input', { id: 'city', type: 'text', placeholder: 'Paris, Lyon…', autocomplete: 'off' });
const trade = h('select', { id: 'trade' }, h('option', { value: '' }, 'Tous les métiers'));

const field = (label, input) => h('div', { class: 'field' }, h('label', { for: input.id }, label), input);

function serviceCard(service) {
  return h('article', { class: 'card service-card' },
    h('div', { class: 'meta' }, h('span', { class: 'chip' }, service.trade), h('span', { class: 'muted small' }, `${service.business_name} · ${service.city}`)),
    h('h3', null, service.title),
    service.description ? h('p', { class: 'desc' }, service.description) : null,
    h('div', { class: 'foot' },
      h('div', null, h('div', { class: 'price' }, eur(service.price_cents)), h('div', { class: 'muted small' }, `Durée : ${formatDuration(service.duration_minutes)}`)),
      h('a', { class: 'btn btn-primary', href: `/service.html?id=${service.id}` }, 'Voir les créneaux')
    )
  );
}

async function loadServices() {
  mount(results, loading('Chargement des prestations…'));
  try {
    const { services } = await api('/services', {
      query: { trade: trade.value, city: city.value.trim(), q: search.value.trim() },
    });
    if (services.length === 0) {
      mount(results, emptyState('Aucune prestation trouvée', 'Essayez un autre mot-clé, une autre ville ou un autre métier.'));
      return;
    }
    mount(results, h('div', { class: 'grid' }, services.map(serviceCard)));
  } catch (error) {
    mount(results, errorBox(error));
  }
}

async function loadTrades() {
  try {
    const { trades } = await api('/trades');
    trade.append(...trades.map((t) => h('option', { value: t.id }, t.name)));
  } catch {
    // le filtre par métier reste simplement vide si la liste n'est pas disponible
  }
}

const onFilter = debounce(loadServices, 300);
search.addEventListener('input', onFilter);
city.addEventListener('input', onFilter);
trade.addEventListener('change', loadServices);

mount(app,
  h('section', { class: 'hero' },
    h('h1', null, 'Réservez un artisan en trois étapes'),
    h('p', null, 'Plombiers, électriciens, serruriers : choisissez une prestation, prenez un créneau libre et décrivez votre problème. L\'artisan confirme votre demande.'),
    h('ol', { class: 'steps' },
      h('li', null, 'Choisissez une prestation'),
      h('li', null, 'Prenez un créneau libre'),
      h('li', null, 'Décrivez votre panne')
    ),
    user ? null : h('div', { class: 'actions' },
      h('a', { class: 'btn btn-primary', href: '/register.html' }, 'Créer un compte client'),
      h('a', { class: 'btn', href: '/register.html?role=artisan' }, 'Je suis artisan'))
  ),
  h('section', { class: 'stack', 'aria-labelledby': 'catalogue-title' },
    h('div', { class: 'section-title' }, h('h2', { id: 'catalogue-title' }, 'Prestations disponibles')),
    h('form', { class: 'filters', role: 'search', onsubmit: (event) => { event.preventDefault(); loadServices(); } },
      field('Recherche', search), field('Ville', city), field('Métier', trade)),
    results
  )
);

await loadTrades();
await loadServices();
