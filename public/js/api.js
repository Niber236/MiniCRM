// Point d'entrée unique pour tous les appels à l'API REST.
// Toutes les pages passent par `api()` : gestion JSON et erreurs au même endroit.

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details || null; // erreurs par champ : { email: 'Email invalide' }
  }
}

function withQuery(path, query) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

/**
 * api('/services', { query: { q: 'fuite' } })
 * api('/appointments', { method: 'POST', body: { ... } })
 * Le cookie de session (HttpOnly) est envoyé automatiquement : le JavaScript ne voit jamais le jeton.
 */
export async function api(path, { method = 'GET', body, query } = {}) {
  const init = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(withQuery(`/api${path}`, query), init);
  } catch {
    throw new ApiError(0, 'Connexion au serveur impossible. Vérifiez votre réseau et réessayez.');
  }

  if (response.status === 204) return null;

  let data = null;
  try {
    data = await response.json();
  } catch {
    // réponse sans JSON : on garde un message générique
  }

  if (!response.ok) {
    throw new ApiError(response.status, data?.error || 'Une erreur est survenue.', data?.details);
  }
  return data;
}
