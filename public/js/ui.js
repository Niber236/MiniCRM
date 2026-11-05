// Éléments d'interface réutilisables : messages, états vides, badges, formulaires.
import { h } from './dom.js';
import { STATUS_LABELS } from './format.js';

let toastBox;

/** Petit message temporaire en bas de l'écran (annoncé aux lecteurs d'écran). */
export function toast(message, type = 'ok') {
  if (!toastBox) {
    toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastBox);
  }
  const node = h('div', { class: `toast ${type === 'error' ? 'toast-error' : ''}` }, message);
  toastBox.append(node);
  setTimeout(() => node.remove(), 4000);
}

export const loading = (text = 'Chargement…') => h('p', { class: 'loading' }, text);

export const alertBox = (message, type = 'info') =>
  h('div', { class: `alert ${type === 'info' ? '' : `alert-${type}`}`, role: type === 'error' ? 'alert' : null }, message);

export const errorBox = (error) => alertBox(error?.message || 'Une erreur est survenue.', 'error');

/** État vide : explique pourquoi la liste est vide et propose une action. */
export function emptyState(title, text, action) {
  return h('div', { class: 'empty' }, h('strong', null, title), text ? h('p', null, text) : null, action || null);
}

export const statusBadge = (status) =>
  h('span', { class: `badge status-${status}` }, STATUS_LABELS[status] || status);

/** Désactive un bouton pendant un appel réseau (évite les doubles envois). */
export function setBusy(button, busy, busyText = 'Envoi…') {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

export function clearFieldErrors(form) {
  form.querySelectorAll('.field-error').forEach((node) => node.remove());
  form.querySelectorAll('[aria-invalid]').forEach((node) => node.removeAttribute('aria-invalid'));
}

/**
 * Affiche les erreurs de validation renvoyées par l'API sous chaque champ.
 * `map` permet de relier un nom de champ de l'API à un champ du formulaire
 * (ex. { priceCents: 'price' }). Retourne true si au moins une erreur a été placée.
 */
export function showFieldErrors(form, details, map = {}) {
  clearFieldErrors(form);
  let placed = false;
  for (const [apiField, message] of Object.entries(details || {})) {
    const input = form.querySelector(`[name="${map[apiField] || apiField}"]`);
    const wrapper = input?.closest('.field');
    if (!wrapper) continue;
    input.setAttribute('aria-invalid', 'true');
    wrapper.append(h('p', { class: 'field-error', role: 'alert' }, message));
    if (!placed) input.focus();
    placed = true;
  }
  return placed;
}

/**
 * Bouton à confirmation en deux temps (sans fenêtre confirm()) :
 * un clic affiche « Confirmer ? » + « Garder », le second clic exécute l'action.
 */
export function confirmButton({ label, confirmLabel, onConfirm, className = 'btn btn-danger btn-sm' }) {
  const slot = h('span', { class: 'actions' });
  const ask = () => {
    slot.replaceChildren(
      h('button', { type: 'button', class: className, onclick: async (event) => {
        event.target.disabled = true;
        await onConfirm();
      } }, confirmLabel),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: reset }, 'Garder')
    );
  };
  const reset = () => slot.replaceChildren(h('button', { type: 'button', class: className, onclick: ask }, label));
  reset();
  return slot;
}
