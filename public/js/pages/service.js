// Détail d'une prestation + réservation d'un créneau (parcours client en 3 étapes).
import { api } from '../api.js';
import { h, mount } from '../dom.js';
import { getUser } from '../session.js';
import { renderLayout } from '../layout.js';
import { eur, formatDay, formatRange, formatDuration, minutesBetween, groupByDay, formatDateTime } from '../format.js';
import { loading, errorBox, alertBox, emptyState, setBusy, showFieldErrors, clearFieldErrors, toast, statusBadge } from '../ui.js';

async function run() {
  const user = await getUser();
  renderLayout(user);

  const app = document.getElementById('app');
  const serviceId = Number(new URLSearchParams(location.search).get('id'));

  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    mount(app, emptyState('Prestation introuvable', null, h('a', { class: 'btn', href: '/' }, 'Retour au catalogue')));
    return;
  }

  let service;
  try {
    ({ service } = await api(`/services/${serviceId}`));
  } catch (error) {
    mount(app, error.status === 404
      ? emptyState('Prestation introuvable', 'Elle n\'existe plus ou n\'est plus proposée.', h('a', { class: 'btn', href: '/' }, 'Retour au catalogue'))
      : errorBox(error));
    return;
  }
  document.title = `${service.title} · CraftFlow`;

  let selectedSlot = null;
  const slotsBox = h('div', { class: 'stack' }, loading('Chargement des créneaux…'));
  const bookingBox = h('div');
  const nextUrl = encodeURIComponent(location.pathname + location.search);

  /* ---------- Créneaux ---------- */

  async function loadSlots() {
    try {
      const { slots } = await api(`/services/${serviceId}/slots`);
      // On ne propose que les créneaux assez longs pour la durée de la prestation.
      const usable = slots.filter((slot) => minutesBetween(slot.starts_at, slot.ends_at) >= service.duration_minutes);
      if (!usable.some((slot) => slot.id === selectedSlot?.id)) selectedSlot = null;
      renderSlots(usable);
      renderBooking();
    } catch (error) {
      mount(slotsBox, errorBox(error));
    }
  }

  function renderSlots(slots) {
    if (slots.length === 0) {
      mount(slotsBox, emptyState('Aucun créneau disponible', 'L\'artisan n\'a pas encore ouvert de créneau pour cette prestation. Revenez bientôt.'));
      return;
    }
    const canPick = user?.role === 'client';
    const groups = [...groupByDay(slots, (slot) => slot.starts_at).values()];
    mount(slotsBox, groups.map((daySlots) =>
      h('div', { class: 'day-group' },
        h('h3', null, formatDay(daySlots[0].starts_at)),
        h('div', { class: 'slot-grid' }, daySlots.map((slot) =>
          h('button', {
            type: 'button',
            class: 'slot',
            'aria-pressed': String(slot.id === selectedSlot?.id),
            disabled: !canPick,
            onclick: () => { selectedSlot = slot; renderSlots(slots); renderBooking(); },
          }, formatRange(slot.starts_at, slot.ends_at))
        ))
      )
    ));
  }

  /* ---------- Formulaire de réservation ---------- */

  function renderBooking() {
    if (!user) {
      mount(bookingBox, h('div', { class: 'card stack' },
        h('h2', null, 'Réserver'),
        alertBox('Connectez-vous pour réserver un créneau.'),
        h('div', { class: 'actions' },
          h('a', { class: 'btn btn-primary', href: `/login.html?next=${nextUrl}` }, 'Se connecter'),
          h('a', { class: 'btn', href: `/register.html?next=${nextUrl}` }, 'Créer un compte'))));
      return;
    }
    if (user.role !== 'client') {
      mount(bookingBox, h('div', { class: 'card stack' }, h('h2', null, 'Réserver'),
        alertBox('Seuls les comptes client peuvent réserver une prestation.', 'warn')));
      return;
    }

    const address = h('input', { id: 'address', name: 'address', type: 'text', required: true, minlength: 5, maxlength: 255, autocomplete: 'street-address', placeholder: '12 rue de Rivoli, 75004 Paris' });
    const description = h('textarea', { id: 'description', name: 'description', required: true, minlength: 10, maxlength: 2000, placeholder: 'Ex. : fuite sous l\'évier de la cuisine, l\'eau goutte en continu.' });
    const submit = h('button', { type: 'submit', class: 'btn btn-primary', disabled: !selectedSlot }, 'Envoyer la demande');
    const message = h('div');

    const form = h('form', { class: 'form', novalidate: true },
      selectedSlot
        ? h('p', null, h('strong', null, `${formatDay(selectedSlot.starts_at)}, ${formatRange(selectedSlot.starts_at, selectedSlot.ends_at)}`))
        : alertBox('Choisissez d\'abord un créneau dans la liste.'),
      h('div', { class: 'field' }, h('label', { for: 'address' }, 'Adresse de l\'intervention'), address),
      h('div', { class: 'field' }, h('label', { for: 'description' }, 'Décrivez votre problème'), description,
        h('p', { class: 'hint' }, 'Plus c\'est précis, mieux l\'artisan peut se préparer.')),
      message,
      submit
    );

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors(form);
      mount(message);
      if (!selectedSlot) {
        mount(message, alertBox('Choisissez un créneau.', 'error'));
        return;
      }
      setBusy(submit, true, 'Envoi…');
      try {
        const { appointment } = await api('/appointments', {
          method: 'POST',
          body: { serviceId, slotId: selectedSlot.id, address: address.value, description: description.value },
        });
        renderConfirmation(appointment);
      } catch (error) {
        setBusy(submit, false);
        if (error.status === 409) {
          toast(error.message, 'error');
          selectedSlot = null;
          await loadSlots(); // le créneau vient d'être pris : on rafraîchit la liste
          return;
        }
        if (!(error.details && showFieldErrors(form, error.details))) mount(message, alertBox(error.message, 'error'));
      }
    });

    mount(bookingBox, h('div', { class: 'card stack' }, h('h2', null, 'Votre demande'), form));
  }

  /** Page de confirmation : récapitulatif de la réservation qui vient d'être créée. */
  function renderConfirmation(a) {
    mount(app,
      h('div', { class: 'page-head' },
        h('h1', null, 'Demande envoyée'),
        h('p', null, 'L\'artisan va examiner votre demande et la confirmer. Vous verrez son statut dans « Mes rendez-vous ».')),
      h('div', { class: 'card stack', role: 'status' },
        h('div', { class: 'section-title' }, h('h2', null, a.service_title), statusBadge(a.status)),
        h('dl', { class: 'facts' },
          h('div', null, h('dt', null, 'Date'), h('dd', null, `${formatDay(a.starts_at)}, ${formatRange(a.starts_at, a.ends_at)}`)),
          h('div', null, h('dt', null, 'Artisan'), h('dd', null, `${a.business_name} (${a.artisan_city})`)),
          h('div', null, h('dt', null, 'Adresse'), h('dd', null, a.address)),
          h('div', null, h('dt', null, 'Prix indicatif'), h('dd', null, eur(a.price_cents))),
          h('div', null, h('dt', null, 'Demande créée le'), h('dd', null, formatDateTime(a.created_at)))),
        h('div', { class: 'actions' },
          h('a', { class: 'btn btn-primary', href: '/client/rendez-vous.html' }, 'Voir mes rendez-vous'),
          h('a', { class: 'btn', href: '/' }, 'Retour au catalogue')))
    );
    window.scrollTo({ top: 0 });
  }

  /* ---------- Page ---------- */

  mount(app,
    h('div', { class: 'page-head' },
      h('a', { href: '/' }, '← Catalogue'),
      h('h1', null, service.title),
      h('p', null, `${service.business_name} · ${service.city}`)),
    h('div', { class: 'split' },
      h('div', { class: 'stack-lg' },
        h('section', { class: 'card stack', 'aria-labelledby': 'about' },
          h('h2', { id: 'about' }, 'La prestation'),
          service.description ? h('p', null, service.description) : null,
          h('dl', { class: 'facts' },
            h('div', null, h('dt', null, 'Prix indicatif'), h('dd', { class: 'num' }, eur(service.price_cents))),
            h('div', null, h('dt', null, 'Durée'), h('dd', null, formatDuration(service.duration_minutes))),
            h('div', null, h('dt', null, 'Métier'), h('dd', null, service.trade)),
            h('div', null, h('dt', null, 'Artisan'), h('dd', null, service.business_name))),
          service.artisan_description ? h('p', { class: 'muted small' }, service.artisan_description) : null),
        h('section', { class: 'stack', 'aria-labelledby': 'slots-title' },
          h('h2', { id: 'slots-title' }, '1. Choisissez un créneau'),
          slotsBox)),
      h('aside', { class: 'sticky', 'aria-label': 'Réservation' }, bookingBox))
  );

  await loadSlots();
}

await run();
