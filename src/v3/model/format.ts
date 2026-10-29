import type { Price } from './types';

/** 0.43 (dollars) -> 43 (cents); null stays null. Prices arrive as dollars in the publications. */
export const cents = (dollars: number | null | undefined): number | null =>
  dollars == null || !Number.isFinite(dollars) ? null : Math.round(dollars * 100);

/** "54¢" */
export const fmtCents = (c: number | null | undefined) => (c == null ? '—' : `${c}¢`);
/** "54%" */
export const fmtPct = (p: number | null | undefined, digits = 0) => (p == null ? '—' : `${p.toFixed(digits)}%`);

/** The native prediction-market read: "54¢ · 54% implied". The percentage is the market's, never SIFT's. */
export function priceWords(p: Price): string {
  if (p.ask == null) return 'No quote';
  return `${p.ask}¢ · ${Math.round(p.implied ?? p.ask)}% implied`;
}

export type PriceFormat = 'cents' | 'american' | 'decimal';

/** The viewer's chosen display of one ask. Cents/percent is the default; the others are display conversions of the same ask. */
export function showAsk(askCents: number | null, fmt: PriceFormat): string {
  if (askCents == null) return '—';
  const p = askCents / 100;
  if (fmt === 'decimal') return p > 0 ? (1 / p).toFixed(2) : '—';
  if (fmt === 'american') {
    if (p <= 0 || p >= 1) return '—';
    return p >= 0.5 ? `−${Math.round((p / (1 - p)) * 100)}` : `+${Math.round(((1 - p) / p) * 100)}`;
  }
  return `${askCents}¢`;
}

/** Kalshi's taker fee for one contract at an ask in dollars: ceil(0.07 × C × P × (1−P)) cents, per the published schedule. */
export function takerFeeCents(askCents: number): number {
  const p = askCents / 100;
  return Math.ceil(0.07 * p * (1 - p) * 100 - 1e-9);
}

/** The probability the side must have to break even after the fee. */
export const breakEvenPct = (askCents: number) => askCents + takerFeeCents(askCents);

export function signed(n: number): string {
  if (n === 0) return 'PK';
  return `${n > 0 ? '+' : '−'}${Math.abs(n)}`;
}

const MIN = 60_000;
/** "just now" / "4m ago" / "2h ago": the true age of a quote or score. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return 'time unknown';
  const m = Math.max(0, Math.round((now - t) / MIN));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/** A quote is actionable only while fresh: under 15 minutes (the repo's FRESH bound); anything older is shown but never as a live price. */
export const quoteState = (iso: string | null | undefined, now = Date.now()): 'fresh' | 'aging' | 'stale' | 'unknown' => {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return 'unknown';
  const m = (now - t) / MIN;
  return m < 15 ? 'fresh' : m <= 30 ? 'aging' : 'stale';
};

export const clockTime = (ms: number) => (Number.isFinite(ms) ? new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : 'TBD');
export const dayWord = (ms: number, now = Date.now()) => {
  const d = new Date(ms), n = new Date(now);
  const k = (x: Date) => x.getFullYear() * 400 + x.getMonth() * 32 + x.getDate();
  const diff = k(d) - k(n);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};
