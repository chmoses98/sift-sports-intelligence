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

// Start-time formatting (clock time, day word, dates) lives in ./time.ts: one module, the viewer's local zone.
