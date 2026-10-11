// PRICE MOVEMENT IN PLAIN WORDS (owner item 41): where a contract opened, where it is now and when, from the
// publication's own capture history. The price is the YES midpoint when the quote is two-sided and tight (≤ 20¢ wide),
// else the last trade; captures of an empty book are skipped. Nothing is smoothed, projected or inferred.
import type { HistoryPoint } from '../contract/types';

export interface PricePoint { t: number; v: number }

export interface PriceMove {
  points: PricePoint[];
  open: number;
  openAt: number;
  now: number;
  nowAt: number;
  /** now − open, in dollars (0.07 = 7¢). */
  change: number;
  /** The highest and lowest captured prices. */
  hi: number;
  lo: number;
  /** "Opened 48¢ Oct 3 · now 55¢ · up 7¢ in 8 days". */
  words: string;
}

/**
 * A capture's price, or null when the capture carries no real market: the midpoint of a two-sided quote (a bid above
 * 0¢, an ask below $1, at most 20¢ wide), else a last trade strictly inside 1¢–99¢. An empty book (0¢ bid / $1 ask, or
 * a 0¢ "last") is a placeholder before trading starts, never an opening price.
 */
export function midOf(p: Pick<HistoryPoint, 'yes_bid' | 'yes_ask' | 'last_price'>): number | null {
  if (p.yes_bid != null && p.yes_ask != null && p.yes_bid > 0 && p.yes_ask < 1 && p.yes_ask - p.yes_bid <= 0.2) return (p.yes_bid + p.yes_ask) / 2;
  return p.last_price != null && p.last_price > 0.01 && p.last_price < 0.99 ? p.last_price : null;
}

const c = (v: number) => `${Math.round(v * 100)}¢`;
const day = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function span(ms: number): string {
  const h = ms / 3600e3;
  if (h < 1) return 'under an hour';
  if (h < 36) return `${Math.round(h)} hour${Math.round(h) === 1 ? '' : 's'}`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'}`;
}

/**
 * The move of one contract over its captures. `current` (a newer live midpoint, when Sift has one) and `currentAt`
 * extend the series to now; without them "now" is the last capture. Null with fewer than two prices.
 */
export function priceMove(history: HistoryPoint[], current?: { v: number | null; at: string | null } | null): PriceMove | null {
  const points = history
    .map((p) => ({ t: Date.parse(p.captured_at), v: midOf(p) }))
    .filter((p): p is PricePoint => Number.isFinite(p.t) && p.v != null)
    .sort((a, b) => a.t - b.t);
  const lastT = points[points.length - 1]?.t ?? -Infinity;
  const curT = current?.at ? Date.parse(current.at) : NaN;
  if (current?.v != null && Number.isFinite(curT) && curT > lastT) points.push({ t: curT, v: current.v });
  if (points.length < 2) return null;
  const o = points[0];
  const n = points[points.length - 1];
  const change = n.v - o.v;
  const cents = Math.round(change * 100);
  const dir = cents === 0 ? 'unchanged' : `${cents > 0 ? 'up' : 'down'} ${Math.abs(cents)}¢`;
  const vs = points.map((p) => p.v);
  return {
    points, open: o.v, openAt: o.t, now: n.v, nowAt: n.t, change, hi: Math.max(...vs), lo: Math.min(...vs),
    words: `Opened ${c(o.v)} ${day(o.t)} · now ${c(n.v)} · ${dir} in ${span(n.t - o.t)}`,
  };
}

/** An SVG path for a sparkline in a w × h box (price axis padded to at least 10¢ so tiny wiggles stay small). */
export function sparkPath(points: PricePoint[], w: number, h: number): { line: string; area: string; first: [number, number]; last: [number, number] } {
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const vs = points.map((p) => p.v);
  let lo = Math.min(...vs);
  let hi = Math.max(...vs);
  if (hi - lo < 0.1) { const m = (hi + lo) / 2; lo = m - 0.05; hi = m + 0.05; }
  const x = (t: number) => (t1 === t0 ? w / 2 : ((t - t0) / (t1 - t0)) * (w - 4) + 2);
  const y = (v: number) => h - 3 - ((v - lo) / (hi - lo)) * (h - 6);
  const xy = points.map((p) => [x(p.t), y(p.v)] as [number, number]);
  const line = xy.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join('');
  const area = `${line}L${xy[xy.length - 1][0].toFixed(1)},${h}L${xy[0][0].toFixed(1)},${h}Z`;
  return { line, area, first: xy[0], last: xy[xy.length - 1] };
}
