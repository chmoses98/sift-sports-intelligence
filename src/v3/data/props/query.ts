// The list's rules, as pure functions over the universe: which view an address is, what passes the filters, how rows are ordered, what
// the shelves hold and what the filter sheet counts. Ordering and the price-range filter use the publication's CAPTURED ask (stable
// between reloads: rows do not jump as quotes tick); the price a row PRINTS is always the gated live quote (data/quoteGate.ts) or "—".
// History is used only for rows whose log is held; a row without one never ranks and never passes a History threshold.
import type { StateOf } from '../../state/url';
import type { propsSchema } from '../../nav/schemas';
import { hitCount } from './history';
import { CAPABILITIES } from '../../model/capabilities';
import { modelPercent } from './model';
import { isBottom, isTop } from './rank';
import type { Matchup, Prop, PropRung } from './types';

export type ListState = StateOf<typeof propsSchema.fields>;
export type SortKey = 'soon' | 'price' | 'hist' | 'model' | 'match' | 'vol';
export const SORT_LABEL: Record<SortKey, string> = { soon: 'Soonest', price: 'Price', hist: 'History', model: 'SIFT model', match: 'Matchup', vol: 'Volume' };
export const SORT_KEYS = Object.keys(SORT_LABEL) as SortKey[];
export const PRESET_LABEL: Record<string, string> = { model: 'SIFT model published', bottom3: 'Bottom-3 defense' };

export const sortOf = (st: Pick<ListState, 'sort'>): SortKey => (SORT_KEYS.includes(st.sort as SortKey) ? (st.sort as SortKey) : 'soon');

/** Any list-state field implies the list; so does `view=list`. Compare is always explicit. */
export function viewOf(st: ListState): 'home' | 'list' | 'compare' {
  if (st.view === 'compare') return 'compare';
  if (st.view === 'list') return 'list';
  const listy = st.sport !== 'all' || st.fam || st.sort || st.q || st.exp || st.cmp.length || st.cmpm || st.team || st.player || st.game || st.preset || st.range || st.hmin != null || st.orank || st.model || st.hide === false || st.pin;
  return listy ? 'list' : 'home';
}

/** `id` or `id@k`. */
export interface PropRef { id: string; k: number | null }
export function parseRef(token: string | null | undefined): PropRef | null {
  if (!token) return null;
  const at = token.lastIndexOf('@');
  if (at > 0 && /^\d+$/.test(token.slice(at + 1))) return { id: token.slice(0, at), k: Number(token.slice(at + 1)) };
  return { id: token, k: null };
}
export const refToken = (p: Pick<Prop, 'id' | 'featured'>, k: number) => (k === p.featured ? p.id : `${p.id}@${k}`);

/** The rung a prop shows: the one an address names when the prop has it, else the featured one. */
export const rungFor = (p: Prop, k: number | null): PropRung => p.rungs.find((r) => r.k === (k ?? p.featured)) ?? p.rungs.find((r) => r.k === p.featured) ?? p.rungs[0];

export interface QueryCtx {
  matchup: (p: Prop) => Matchup | null;
  /** The last games' values for a prop (oldest first), or undefined when its log is not held. */
  values: (p: Prop) => number[] | undefined;
  /**
   * Why a prop has no History: `pending` (its game log is not loaded, is loading or failed: it could still be evaluated) or `none` (no game
   * log can be read for it: no log source for the statistic, or a log with no games before kickoff). Absent: every unevaluated prop is pending.
   */
  histKind?: (p: Prop) => 'pending' | 'none';
}

/** The captured ask of a prop's featured rung, the stable key for ordering and the price-range filter. */
export const keyAsk = (p: Prop): number | null => rungFor(p, null).ask;
const near = (p: Prop) => { const a = keyAsk(p); return a == null ? 99 : Math.abs(a - 50); };

export function parseRange(s: string | null): [number, number] | null {
  const m = /^(\d{1,2})-(\d{1,3})$/.exec(s ?? '');
  return m ? [Number(m[1]), Number(m[2])] : null;
}

const hay = (p: Prop) => `${p.name} ${p.label} ${p.abbr} ${p.fam} ${p.team ?? ''} ${p.opp ?? ''} ${p.away.abbr} ${p.home.abbr} ${p.away.name} ${p.home.name} ${p.sportLabel}`.toLowerCase();

/** The cheap facets: everything that needs no game log. History facets are checked separately because they need logs. */
export function passesBase(p: Prop, st: ListState, ctx: QueryCtx): boolean {
  if (st.hide && p.out) return false;
  if (st.sport !== 'all' && p.slug !== st.sport) return false;
  if (st.fam && p.fam !== st.fam) return false;
  if (st.team && !(p.team === st.team || (p.team && p.team.toUpperCase() === st.team.toUpperCase()))) return false;
  if (st.game && p.eventId !== st.game) return false;
  if (st.player && p.playerId !== st.player && p.name !== st.player) return false;
  const q = (st.q ?? '').toLowerCase().trim();
  if (q) { const h = hay(p); if (!q.split(/\s+/).every((t) => h.includes(t))) return false; }
  if (st.model || st.preset === 'model') { if (p.model.state !== 'published') return false; }
  if (st.preset === 'bottom3') { const m = ctx.matchup(p); if (!m || !isBottom(m, 3) || p.out) return false; }
  const range = parseRange(st.range);
  if (range) { const a = keyAsk(p); if (a == null || a < range[0] || a > range[1]) return false; }
  if (st.orank) {
    const m = ctx.matchup(p);
    if (!m) return false;
    if (st.orank === 'bottom10' && !isBottom(m, 10)) return false;
    if (st.orank === 'top10' && !isTop(m, 10)) return false;
  }
  return true;
}

/** Hits at the featured rung over the History window the filter counts. */
export function histHits(p: Prop, ctx: QueryCtx, win: 5 | 10 = 10): { h: number; n: number } | null {
  const v = ctx.values(p);
  return v ? hitCount(v, rungFor(p, null).k, win) : null;
}

export const historyFilterOn = (st: ListState) => st.hmin != null && st.hmin > 0;

/** A prop's standing for a History order or threshold: evaluated (History computed from a loaded log), or not, and why not. */
export type HistClass = 'evaluated' | 'pending' | 'none';
export function histClassOf(p: Prop, ctx: QueryCtx): HistClass {
  if (histHits(p, ctx)) return 'evaluated';
  return ctx.histKind?.(p) ?? 'pending';
}

/** How many of these props are evaluated, waiting for a log, or have none: the numbers "Evaluated N of M" prints. */
export function histSummary(props: Prop[], ctx: QueryCtx): { evaluated: number; pending: number; none: number; total: number } {
  const o = { evaluated: 0, pending: 0, none: 0, total: props.length };
  for (const p of props) o[histClassOf(p, ctx)]++;
  return o;
}

export function passes(p: Prop, st: ListState, ctx: QueryCtx): boolean {
  if (!passesBase(p, st, ctx)) return false;
  if (historyFilterOn(st)) {
    const h = histHits(p, ctx, st.hwin === 'L5' ? 5 : 10);
    if (!h || h.h < st.hmin!) return false;
  }
  return true;
}

export function comparator(sort: SortKey, ctx: QueryCtx): (a: Prop, b: Prop) => number {
  const byName = (a: Prop, b: Prop) => a.name.localeCompare(b.name) || a.fam.localeCompare(b.fam);
  // History is computed from a log (not free): once per prop for the whole sort.
  const hist = new Map<Prop, { c: number; share: number; n: number }>();
  const histOf = (p: Prop) => {
    let e = hist.get(p);
    if (!e) {
      const h = histHits(p, ctx);
      e = h ? { c: 0, share: h.h / h.n, n: h.n } : { c: ctx.histKind?.(p) === 'none' ? 2 : 1, share: -1, n: 0 };
      hist.set(p, e);
    }
    return e;
  };
  const model = (p: Prop) => modelPercent(p.model, rungFor(p, null).k) ?? -1;
  const match = (p: Prop) => { const m = ctx.matchup(p); return m ? m.rank / m.n : -1; };
  const soonest = (a: Prop, b: Prop) => a.startMs - b.startMs || near(a) - near(b) || byName(a, b);
  switch (sort) {
    case 'price': return (a, b) => (keyAsk(a) ?? 999) - (keyAsk(b) ?? 999) || a.startMs - b.startMs || byName(a, b);
    // Evaluated props are ranked by their History; the rest are NOT ranked at all: they follow in start order, props waiting for a log
    // first and props that have none last, so the order can never be read as a ranking of rows that were never evaluated.
    case 'hist': return (a, b) => {
      const x = histOf(a), y = histOf(b);
      if (x.c !== y.c) return x.c - y.c;
      return x.c === 0 ? y.share - x.share || y.n - x.n || near(a) - near(b) || byName(a, b) : soonest(a, b);
    };
    case 'model': return (a, b) => model(b) - model(a) || near(a) - near(b) || byName(a, b);
    case 'match': return (a, b) => match(b) - match(a) || near(a) - near(b) || byName(a, b);
    case 'vol': return (a, b) => (rungFor(b, null).volume ?? -1) - (rungFor(a, null).volume ?? -1) || byName(a, b);
    default: return soonest;
  }
}

/** The list for an address. `pinned` lifts the expanded prop to the top when the viewer arrived from a shelf's lanes. */
export function listProps(props: Prop[], st: ListState, ctx: QueryCtx): Prop[] {
  const out = props.filter((p) => passes(p, st, ctx)).sort(comparator(sortOf(st), ctx));
  const ref = parseRef(st.exp);
  if (st.pin && ref) {
    const i = out.findIndex((p) => p.id === ref.id);
    if (i > 0) out.unshift(out.splice(i, 1)[0]);
  }
  return out;
}

/** Rows hidden by "Hide out": the count the toggle names. */
export const hiddenOut = (props: Prop[]) => props.filter((p) => p.out).length;

/** The number of distinct players whose logs History needs for these props (the cost of ranking or filtering by History). */
export const logPlayers = (props: Prop[]) => new Set(props.filter((p) => p.history && p.histId).map((p) => `${p.history!.kind}:${p.histId}`)).size;

/** The sheet's live count by sport, for the current draft state (history facets count only rows whose log is held). */
export function countBySport(props: Prop[], st: ListState, ctx: QueryCtx): { total: number; bySport: { slug: string; label: string; n: number }[] } {
  const hit = props.filter((p) => passes(p, st, ctx));
  const labels = new Map<string, string>();
  for (const p of props) labels.set(p.slug, p.sportLabel);
  const slugs = [...labels.keys()];
  return { total: hit.length, bySport: slugs.map((slug) => ({ slug, label: labels.get(slug)!, n: hit.filter((p) => p.slug === slug).length })) };
}

/** Counts for the home's sport rail and stat chips (the whole universe, so the chips do not change with the viewer's own filters). */
export function railCounts(props: Prop[]): { sports: { slug: string; label: string; n: number }[]; fams: { fam: string; label: string; n: number }[] } {
  const sports = new Map<string, { slug: string; label: string; n: number }>();
  const fams = new Map<string, { fam: string; label: string; n: number }>();
  for (const p of props) {
    const s = sports.get(p.slug) ?? { slug: p.slug, label: p.sportLabel, n: 0 }; s.n++; sports.set(p.slug, s);
    const f = fams.get(p.fam) ?? { fam: p.fam, label: p.label, n: 0 }; f.n++; fams.set(p.fam, f);
  }
  const order = Object.keys(CAPABILITIES);
  return { sports: [...sports.values()].sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug)), fams: [...fams.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)) };
}

/** Shelf 1: props with a published SIFT model estimate, nearest a coin flip first. */
export function shelfModel(props: Prop[], limit = 4): { rows: Prop[]; total: number; scope: string } {
  const all = props.filter((p) => p.model.state === 'published' && !p.out);
  const rows = [...all].sort((a, b) => near(a) - near(b) || a.name.localeCompare(b.name)).slice(0, limit);
  const scope = [...new Set(all.map((p) => `${p.sportLabel} ${p.label.toLowerCase()}`))].join(', ');
  return { rows, total: props.filter((p) => p.model.state === 'published').length, scope };
}

/** Shelf 2: props facing a bottom-3 unit, near-even prices first. */
export function shelfBottom3(props: Prop[], matchup: (p: Prop) => Matchup | null, limit = 4): { rows: Prop[]; total: number } {
  const hit = props.filter((p) => { const m = matchup(p); return !!m && isBottom(m, 3) && !p.out; });
  const rows = [...hit].filter((p) => { const a = keyAsk(p); return a != null && a >= 35 && a <= 65; }).sort((a, b) => near(a) - near(b) || a.name.localeCompare(b.name)).slice(0, limit);
  return { rows, total: hit.length };
}

/** The title of a filtered list. */
export function listTitle(st: ListState, p: { player?: Prop | null; game?: Prop | null }): string {
  if (st.player) return p.player?.name ?? 'Player props';
  if (st.game && p.game) return `${p.game.away.abbr} at ${p.game.home.abbr} props`;
  if (st.team) return `${st.team} props`;
  return 'All props';
}
