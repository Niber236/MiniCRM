// Espace artisan : profil professionnel et état de la validation par l'administrateur.
import { api } from '../api.js';
import { h, mount } from '../dom.js';
import { requireRole } from '../session.js';
import { renderLayout } from '../layout.js';
import { loading, errorBox, alertBox, toast, setBusy, showFieldErrors, clearFieldErrors } from '../ui.js';

async function run() {
  const user = await requireRole('artisan');
  renderLayout(user);

  const app = document.getElementById('app');
  mount(app, loading());

  let profile;
  let trades;
  try {
    [{ profile }, { trades }] = await Promise.all([api('/artisan/profile'), api('/trades')]);
  } catch (error) {
    mount(app, errorBox(error));
    return;
  }

  const field = (label, control, hint) =>
    h('div', { class: 'field' }, h('label', { for: control.id }, label), control, hint ? h('p', { class: 'hint' }, hint) : null);

  const businessName = h('input', { id: 'businessName', name: 'businessName', type: 'text', required: true, maxlength: 120, value: profile.business_name });
  const tradeId = h('select', { id: 'tradeId', name: 'tradeId' }, trades.map((t) => h('option', { value: t.id, selected: t.id === profile.trade_id }, t.name)));
  const city = h('input', { id: 'city', name: 'city', type: 'text', required: true, maxlength: 80, value: profile.city });
  const description = h('textarea', { id: 'description', name: 'description', maxlength: 2000 }, profile.description || '');
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Enregistrer');

  const form = h('form', { class: 'card form', novalidate: true },
    field('Nom de l\'entreprise', businessName),
    h('div', { class: 'form-row' }, field('Métier', tradeId), field('Ville', city)),
    field('Présentation', description, 'Affichée aux clients sur la page de vos prestations.'),
    h('div', { class: 'actions' }, submit)
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldErrors(form);
    setBusy(submit, true, 'Enregistrement…');
    try {
      await api('/artisan/profile', {
        method: 'PUT',
        body: { businessName: businessName.value, tradeId: tradeId.value, city: city.value, description: description.value },
      });
      toast('Profil enregistré');
    } catch (error) {
      if (!(error.details && showFieldErrors(form, error.details))) toast(error.message, 'error');
    }
    setBusy(submit, false);
  });

  mount(app,
    h('div', { class: 'page-head' }, h('h1', null, 'Mon profil'), h('p', null, 'Ces informations sont visibles par vos clients.')),
    profile.is_verified
      ? alertBox('Profil validé : vos prestations sont visibles dans le catalogue.', 'ok')
      : alertBox('Profil en attente de validation par un administrateur. Vos prestations n\'apparaissent pas encore dans le catalogue.', 'warn'),
    form
  );
}

await run();
