// Hilfsfunktionen für Zahlen und Datumswerte im deutschen Format.

/** "1.234,56" -> 1234.56 ; "0,829" -> 0.829 ; "-1.00" (englisch) -> -1 */
export function parseDe(input: string | undefined | null): number {
  if (input == null) return NaN;
  const s = String(input).trim().replace(/\s/g, '');
  if (s === '') return NaN;
  if (s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.'));
  return Number(s);
}

/** Englisches Zahlenformat ("1234.56") */
export function parseEn(input: string | undefined | null): number {
  if (input == null) return NaN;
  const s = String(input).trim();
  if (s === '') return NaN;
  return Number(s.replace(/,/g, ''));
}

/** "26.06.2026" -> "2026-06-26" */
export function deDateToIso(d: string): string {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(d.trim());
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function isoToDe(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
}

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const pct = new Intl.NumberFormat('de-DE', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function fmtEur(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return '–';
  return eur.format(n);
}

/** Kurs mit bis zu 4 Nachkommastellen */
export function fmtPrice(n: number | undefined, suffix = ' €'): string {
  if (n == null || !Number.isFinite(n)) return '–';
  const digits = Math.abs(n) < 1 ? 6 : Math.abs(n) < 100 ? 4 : 2;
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: digits }) + suffix;
}

export function fmtQty(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return '–';
  return n.toLocaleString('de-DE', { maximumFractionDigits: 8 });
}

export function fmtPct(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return '–';
  return pct.format(n);
}

export function todayIso(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
