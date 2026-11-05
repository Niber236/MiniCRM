// Création d'éléments DOM SANS innerHTML : tout texte passe par des nœuds texte,
// ce qui rend les failles XSS impossibles côté affichage.

/**
 * h('button', { class: 'btn', onclick: fn }, 'Texte', autreElement)
 * - class, dataset, onXxx (écouteurs) et attributs classiques sont gérés ;
 * - false / null / undefined sont ignorés (pratique pour les conditions).
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export const $ = (selector, root = document) => root.querySelector(selector);

/** Remplace le contenu d'un conteneur. */
export function mount(container, ...nodes) {
  container.replaceChildren(...nodes.flat(Infinity).filter((n) => n !== null && n !== undefined && n !== false));
}

export function debounce(fn, delay = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
