// Session de l'utilisateur courant (récupérée auprès du serveur via le cookie HttpOnly).
import { api } from './api.js';

/** Page d'accueil de chaque rôle. */
export const HOME = { client: '/', artisan: '/artisan/', admin: '/admin/' };

let cached;

/** Retourne l'utilisateur connecté, ou null s'il n'y a pas de session valide. */
export function getUser() {
  cached ??= api('/auth/me')
    .then((data) => data.user)
    .catch((error) => {
      if (error.status === 401 || error.status === 403) return null;
      throw error;
    });
  return cached;
}

export function resetSession() {
  cached = undefined;
}

/**
 * Garde d'accès côté interface : redirige vers la connexion (ou vers l'espace du bon rôle).
 * La VRAIE protection reste côté serveur (middleware requireRole) ; ceci évite juste d'afficher
 * une page inutilisable.
 */
export async function requireRole(role) {
  const user = await getUser();
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.replace(`/login.html?next=${next}`);
    return new Promise(() => {}); // on arrête le script le temps de la redirection
  }
  if (user.role !== role) {
    location.replace(HOME[user.role]);
    return new Promise(() => {});
  }
  return user;
}

/** N'accepte qu'un chemin interne du site (évite les redirections vers un site extérieur). */
export function safeNext(value) {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return value;
}
