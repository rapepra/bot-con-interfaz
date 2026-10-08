/** Formateadores de la terminal (locale es-ES, estética de cinta financiera). */
const nf = (digits) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const n0 = nf(0);
const n2 = nf(2);
const n1 = nf(1);

export const price = (value) => n2.format(value);

export function money(value) {
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${n2.format(value / 1e6)} M€`;
  if (abs >= 1e4) return `${n1.format(value / 1e3)} k€`;
  return `${n0.format(value)} €`;
}

export const pct = (value, digits = 1) => `${value >= 0 ? '+' : ''}${nf(digits).format(value * 100)}%`;

/** Clase CSS según signo: up / down / flat. */
export const tone = (value, epsilon = 1e-9) => (value > epsilon ? 'up' : value < -epsilon ? 'down' : 'flat');

export const arrow = (value) => (value > 0 ? '▲' : value < 0 ? '▼' : '■');

export const SECTOR_LABELS = { mineria: 'Minería', shipping: 'Shipping', ingenieria: 'Ingeniería', energia: 'Energía' };

export const ACTION_LABELS = { BUY: 'COMPRA', HOLD: 'MANTIENE', TRIM: 'REDUCE', EXIT: 'VENDE' };

/** Escapa texto para interpolarlo en plantillas HTML. */
export function esc(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

export function leverageLabel(leverage) {
  if (leverage < 0) return { text: 'CAJA NETA', cls: 'up' };
  if (leverage < 1.5) return { text: `${n1.format(leverage)}x`, cls: 'flat' };
  if (leverage < 3) return { text: `${n1.format(leverage)}x`, cls: 'warn' };
  return { text: `${n1.format(leverage)}x`, cls: 'down' };
}
