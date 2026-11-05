// Formatage des montants, dates et statuts (tout en français).

const eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const pad = (n) => String(n).padStart(2, '0');

/** Les montants sont stockés en centimes (entiers) : 8900 → « 89,00 € ». */
export const eur = (cents) => eurFmt.format(cents / 100);

export const formatDay = (iso) => capitalize(dayFmt.format(new Date(iso)));
export const formatTime = (iso) => timeFmt.format(new Date(iso));
export const formatRange = (start, end) => `${formatTime(start)} – ${formatTime(end)}`;
export const formatDateTime = (iso) => dateTimeFmt.format(new Date(iso));
export const formatDate = (iso) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(iso));

export function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest ? `${hours} h ${pad(rest)}` : `${hours} h`;
}

export const minutesBetween = (start, end) => (new Date(end) - new Date(start)) / 60000;

/** Clé « AAAA-MM-JJ » dans le fuseau du navigateur, pour regrouper par jour. */
export function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const STATUS_LABELS = {
  EN_ATTENTE: 'En attente',
  CONFIRME: 'Confirmé',
  TERMINE: 'Terminé',
  ANNULE: 'Annulé',
};

export const ROLE_LABELS = { client: 'Client', artisan: 'Artisan', admin: 'Administrateur' };

/** « 89,5 » ou « 89.50 » → 8950 (centimes), ou null si invalide. */
export function parseEuros(text) {
  const value = Number(String(text).trim().replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export const centsToInput = (cents) => (cents / 100).toFixed(2).replace('.', ',');

/** Regroupe des éléments par jour (clé AAAA-MM-JJ), en gardant l'ordre d'arrivée. */
export function groupByDay(items, getIso) {
  const groups = new Map();
  for (const item of items) {
    const key = dayKey(getIso(item));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}
