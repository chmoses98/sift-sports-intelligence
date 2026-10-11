// ONE SLATE RANKING for player props, shared by /props (TopProps: the full board) and Home (Top Props: the preview).
// Pure: every input is a published field or a stated arithmetic on published fields (views/props/model.ts).
//
//   rankSlate     the board's two criteria, exactly as /props applies them: 'gap' (projection vs line in widths of
//                 the simulation's middle-50% range; role disagreements set aside, touchdown ladders apart) and
//                 'history' (the last 10 games played against today's line, most one-sided first).
//   homeTopProps  Home's preview over the SAME 'gap' ranking: pregame only, at most HOME_TOP_PROPS props, grouped by
//                 player, and only props whose projection the prop board reads as off the line. It never pads: when
//                 three qualify it returns three, with a count of every prop left out and why.
import type { Opportunity } from '../../opportunity/types';
import type { PropRow } from '../../insights/propBoard';
import { rankByGap, rankByHistory, type DiscoveryRow, type DiscoverySort } from './model';

/** The most props Home's Top Props shows. A ceiling, never a target. */
export const HOME_TOP_PROPS = 10;
/** History is shown as a trend only from this many games played (the history ranking's own floor). */
export const HISTORY_MIN_GAMES = 5;

export interface Ranked<H> {
  d: DiscoveryRow;
  h: H | null;
}

/**
 * The slate ranking behind /props' board. `rows` are the slate's prop rows the viewer filtered to (game, family);
 * rows without a priced main line never rank. `touchdowns` ranks the touchdown ladders on their own (their simulated
 * quartiles collapse to 0, and an anytime line lands under in most games). `hit` reads a row's last-10 record: the
 * history criterion needs it; the gap criterion attaches it when given (for display only, never for the order).
 */
export function rankSlate<H extends { over: number; under: number; n: number }>(
  rows: DiscoveryRow[],
  opts: { sort: DiscoverySort; touchdowns?: boolean; hit?: (d: DiscoveryRow) => H | null },
): { ranked: Ranked<H>[]; setAside: DiscoveryRow[] } {
  const td = !!opts.touchdowns;
  const priced = rows.filter((d) => d.row.main);
  if (opts.sort === 'gap') {
    const g = rankByGap(priced, { touchdowns: td });
    return { ranked: g.ranked.map((d) => ({ d, h: opts.hit?.(d) ?? null })), setAside: g.setAside };
  }
  const withH = priced.filter((d) => td === (d.row.family === 'touchdowns')).map((d) => ({ d, h: opts.hit?.(d) ?? null }));
  return { ranked: rankByHistory(withH.filter((x) => x.h && x.h.n > 0)), setAside: [] };
}

/**
 * The line sits inside the simulation's middle-50% range: on the publication's own numbers the prop is close to a
 * coin flip (the prop board says so as a risk). Home still lists such a prop when the board reads the projection as
 * off the line, but says it is a lean, not a separation.
 */
export function lineInsideTypical(row: Pick<PropRow, 'range' | 'line'>): boolean {
  return !!row.range && row.line != null && row.range.typical[0] <= row.line && row.line <= row.range.typical[1];
}

// ------------------------------------------------------------------ authority

export type PropAuthority = 'validated' | 'candidate' | 'research';

export interface AuthorityView {
  level: PropAuthority;
  /** The words on the chip. Never stronger than the opportunity layer's own status. */
  word: string;
  /** The publication's authority word and status reason, for the chip's title. */
  detail: string;
}

const RESEARCH_ONLY: AuthorityView = {
  level: 'research',
  word: 'Research only',
  detail: 'A research ranking of published numbers. The NFL publication rates its prop pricing research only; this is not a validated opportunity.',
};

/**
 * A prop's authority, read from the opportunity layer (src/opportunity/*, never re-judged here): VALIDATED only when
 * that layer marks the exact contract ACTIONABLE; a publication research candidate says so; everything else is
 * research only.
 */
export function propAuthority(marketId: string | null | undefined, byMarket: ReadonlyMap<string, Pick<Opportunity, 'status' | 'authority' | 'statusReason'>>): AuthorityView {
  const o = marketId ? byMarket.get(marketId) : undefined;
  if (!o) return RESEARCH_ONLY;
  if (o.status === 'ACTIONABLE') return { level: 'validated', word: 'Validated', detail: `The publication permits this contract (${o.authority}). ${o.statusReason}` };
  if (o.status === 'RESEARCH_CANDIDATE') return { level: 'candidate', word: 'Research candidate', detail: `Flagged by the publication for research review (${o.authority}), not validated. ${o.statusReason}` };
  return { ...RESEARCH_ONLY, detail: `${RESEARCH_ONLY.detail} Opportunity layer: ${o.status.toLowerCase().replace(/_/g, ' ')} — ${o.statusReason}` };
}

/** The opportunity layer's NFL rows by market id, for propAuthority. */
export function opportunitiesByMarket(opps: readonly Opportunity[], sport = 'NFL'): Map<string, Opportunity> {
  const m = new Map<string, Opportunity>();
  for (const o of opps) if (o.sport === sport && o.marketId && !m.has(o.marketId)) m.set(o.marketId, o);
  return m;
}

// ------------------------------------------------------------------ Home's preview

export type Exclusion = 'kickedOff' | 'noLine' | 'touchdowns' | 'noProjection' | 'roleDisagreement' | 'onTheLine';

/** Why a prop is not on Home, in a reader's words (count first). */
export const EXCLUSION_WORDS: Record<Exclusion, (n: number) => string> = {
  kickedOff: (n) => `${n} from games that have kicked off (pregame research cannot be saved after kickoff)`,
  noLine: (n) => `${n} with no priced line (no two-sided quote in the publication)`,
  touchdowns: (n) => `${n} touchdown ladders, which rank on their own on the props board`,
  noProjection: (n) => `${n} with no simulated projection for that stat (market price only)`,
  roleDisagreement: (n) => `${n} where the line sits outside the simulation’s 5th–95th range (the market and the simulation price different roles)`,
  onTheLine: (n) => `${n} where the projection sits on the line (the prop board reads “Sim on the line”: no direction to rank)`,
};
export const EXCLUSION_ORDER: Exclusion[] = ['onTheLine', 'roleDisagreement', 'noProjection', 'touchdowns', 'noLine', 'kickedOff'];

export interface HomePick {
  d: DiscoveryRow;
  /** 1-based position in the shared ranking of qualifying props. */
  rank: number;
  authority: AuthorityView;
  /** 'separated': the line sits outside the simulation's middle-50% range; 'lean': inside it (close to a coin flip). */
  strength: 'separated' | 'lean';
}

export interface HomePlayer {
  key: string;
  row: PropRow;
  d: DiscoveryRow;
  picks: HomePick[];
}

export interface HomeTopPropsResult {
  /** Props shown, ranking order (validated opportunities first), at most `limit`. */
  picks: HomePick[];
  /** The same picks, one card per player, in the order of each player's best pick. */
  players: HomePlayer[];
  validated: HomePlayer[];
  research: HomePlayer[];
  /** Props that cleared every gate (may exceed what is shown). */
  qualifying: number;
  /** Every player-prop row on the slate that was considered. */
  considered: number;
  /** Rows with a priced main line on pregame games. */
  priced: number;
  excluded: Record<Exclusion, number>;
}

function group(picks: HomePick[]): HomePlayer[] {
  const by = new Map<string, HomePlayer>();
  for (const p of picks) {
    const key = `${p.d.eventId}|${p.d.row.playerId}`;
    const g = by.get(key);
    if (g) g.picks.push(p);
    else by.set(key, { key, row: p.d.row, d: p.d, picks: [p] });
  }
  return [...by.values()];
}

/**
 * Home's Top Props over the shared ranking. A prop qualifies when its game has not kicked off, it has a priced main
 * line and a simulated projection, it is not a touchdown ladder, the line is inside the simulation's 5th–95th range
 * (else a role disagreement, set aside) and the prop board reads the projection as above or below the line (its
 * 'ON' read — "Sim on the line" — has no direction to rank). Qualifying props keep rankSlate's 'gap' order; a prop the opportunity layer marks ACTIONABLE is a
 * validated opportunity and leads (it needs no research gate: the publication has judged it). At most `limit`, never
 * padded: fewer qualifying props means fewer shown.
 */
export function homeTopProps(rows: DiscoveryRow[], opts: { now: number; limit?: number; byMarket?: ReadonlyMap<string, Pick<Opportunity, 'status' | 'authority' | 'statusReason'>> }): HomeTopPropsResult {
  const limit = opts.limit ?? HOME_TOP_PROPS;
  const byMarket = opts.byMarket ?? new Map();
  const pre = rows.filter((d) => Date.parse(d.kickoff) > opts.now);
  const { ranked, setAside } = rankSlate(pre, { sort: 'gap', touchdowns: false });
  const offLine = (d: DiscoveryRow) => d.row.read === 'ABOVE' || d.row.read === 'BELOW';
  const research = ranked.map((x) => x.d).filter(offLine);
  const authorityOf = (d: DiscoveryRow) => propAuthority(d.row.main?.market.market_id, byMarket);
  const validated = pre.filter((d) => d.row.main && authorityOf(d).level === 'validated');
  const seen = new Set<DiscoveryRow>();
  const ordered: DiscoveryRow[] = [];
  for (const d of [...validated, ...research]) if (!seen.has(d)) { seen.add(d); ordered.push(d); }
  const picks = ordered.slice(0, limit).map((d, i): HomePick => ({ d, rank: i + 1, authority: authorityOf(d), strength: lineInsideTypical(d.row) ? 'lean' : 'separated' }));
  const players = group(picks);
  const excluded: Record<Exclusion, number> = {
    kickedOff: rows.length - pre.length,
    noLine: pre.filter((d) => !d.row.main).length,
    touchdowns: pre.filter((d) => d.row.main && d.row.family === 'touchdowns' && !seen.has(d)).length,
    noProjection: pre.filter((d) => d.row.main && d.row.family !== 'touchdowns' && (d.row.separation == null || d.row.projection == null) && !seen.has(d)).length,
    roleDisagreement: setAside.filter((d) => !seen.has(d)).length,
    onTheLine: ranked.filter((x) => !offLine(x.d) && !seen.has(x.d)).length,
  };
  return {
    picks, players,
    validated: group(picks.filter((p) => p.authority.level === 'validated')),
    research: group(picks.filter((p) => p.authority.level !== 'validated')),
    qualifying: ordered.length, considered: rows.length, priced: pre.filter((d) => d.row.main).length, excluded,
  };
}
