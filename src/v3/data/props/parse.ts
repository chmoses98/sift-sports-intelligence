// Pure parse and join: one game's published markets to Prop rows. No fetching, no React, no clock. A contract belongs to a prop when it
// is a player statistic ladder ("Name: 3+ receptions"); the player is joined to published identity (player id, team, position) from the
// roster and history hints the caller supplies, falling back to the contract's own words only where the publication names nothing.
import type { Market } from '../../../contract/types';
import { nameKey } from '../../../insights/context';
import { teamKey } from '../../../lib/projections';
import { isTradableWord } from '../../model/marketStatus';
import type { V3Team } from '../../model/types';
import { familyFor } from './families';
import type { Prop, PropRung } from './types';

/** The game a market list belongs to. */
export interface GameCtx {
  slug: string;
  sportLabel: string;
  eventId: string;
  key: string;
  startMs: number;
  away: V3Team;
  home: V3Team;
  /** Published team participant ids, when the explorer lists them (a market's own participant id resolves a team). */
  awayId?: string | null;
  homeId?: string | null;
  provenance?: 'publication' | 'demo';
  /** The game's injury rows were readable (default true). */
  availKnown?: boolean;
  /** The injury rows live in a document that has not been read yet (default false): the props are built with `availPending`. */
  availPending?: boolean;
}

/** What the caller knows about published identity. Every function may return null: the join then falls through. */
export interface IdentityHints {
  /** The team code a published roster lists this player under. */
  teamOfPlayer?: (playerId: string) => string | null;
  /** The history layer's record for an NFL player (gsis id first, then name), with the team code it uses. */
  history?: (gsis: string | null, name: string) => { team: string | null; position: string | null } | null;
  /** True when Player Research can open this player (a published profile in a sport whose player research is ready). */
  hasPlayerPage?: (playerId: string | null) => boolean;
  /** Availability by name key (OUT, DOUBTFUL…), read from the event's published injury rows. */
  outOf?: (name: string, team: string | null) => string | null;
}

type Ext = {
  stat?: string | null; subject?: string | null; subject_kind?: string | null; operator?: string | null; comparator?: string | null;
  entity_name?: string | null; player?: string | null; player_name?: string | null; gsis_id?: string | null; comparison_operator?: string | null;
};

const PLAYER_FAMILY = /^(player|hitter|pitcher|goalie)_/;
/** Player-level families that are not a count ladder (first scorer, unknowns). */
const NOT_A_LADDER = new Set(['player_unknown', 'player_first_td', 'player_leader']);

/** Open or no status (model/marketStatus.ts); any other word, an unrecognised one included, is withheld. The quote gate still decides what shows. */
const OPEN = (m: Market) => isTradableWord(m.market_status);
const FULL = (m: Market) => m.period == null || /^full(_game)?$/i.test(m.period);
const cents = (d: number | null | undefined) => (d == null || !Number.isFinite(d) || d <= 0 || d >= 1 ? null : Math.round(d * 100));
const ext = (m: Market) => (m.extensions ?? {}) as Ext;

/** The statistic a market is about: football names it in `extensions.stat`; hockey and baseball in the market family. */
export function statOf(m: Market): string | null {
  const x = ext(m);
  if (m.market_family === 'player_stat') return x.stat ?? null;
  if (PLAYER_FAMILY.test(m.market_family) && !NOT_A_LADDER.has(m.market_family)) return m.market_family;
  return null;
}

/** The count a rung settles on. Contracts say "at least k" (`>=` / AT_LEAST, threshold k) or "more than k - 0.5" (`gt`, threshold k - 0.5). */
export function rungOf(m: Market): number | null {
  const t = m.threshold ?? m.line;
  if (t == null || !Number.isFinite(t)) return null;
  const x = ext(m);
  const atLeast = x.operator === '>=' || /AT_LEAST/i.test(x.comparison_operator ?? '');
  const greater = x.comparator === 'gt' || /greater/i.test((x as { strike_type?: string }).strike_type ?? '');
  if (atLeast) return t;
  if (greater || !Number.isInteger(t)) return Math.floor(t) + 1;
  return t;
}

/** The player a contract names, in the publication's own words. */
export function subjectOf(m: Market): string | null {
  const x = ext(m);
  const named = x.subject ?? x.entity_name ?? x.player ?? x.player_name;
  if (named) return named;
  return /^(?:Full Game: )?(.+?):\s*\d+\+/.exec(m.yes_description ?? '')?.[1] ?? null;
}

/** A contract whose subject is a team or a unit ("DAL Cowboys D/ST", "Dallas"), not a player: a team field-goal or defense ladder. */
export function isTeamSubject(who: string, g: Pick<GameCtx, 'away' | 'home'>): boolean {
  if (/\bD\/ST\b/i.test(who)) return true;
  const k = nameKey(who);
  return [g.away, g.home].some((t) => {
    const city = t.name.endsWith(t.nick) ? t.name.slice(0, t.name.length - t.nick.length).trim() : '';
    return [t.name, t.nick, t.abbr, city].some((x) => !!x && nameKey(x) === k);
  });
}

/** "KXNHLPTS-26OCT26TORCGY-TORKMARCHENKO86-1" has team TOR in its player segment; used only when nothing published names the team. */
export function teamFromTicker(ticker: string, codes: string[]): string | null {
  const seg = ticker.split('-')[2] ?? '';
  const hits = codes.filter((c) => c && seg.toUpperCase().startsWith(c.toUpperCase()));
  return hits.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** The prop id: the ticker without its rung segment ("KXNFLREC-26OCT26DALPHI-DALCLAMB88"). */
export function propIdOf(tickers: string[], fallback: string): string {
  const stems = new Set(tickers.map((t) => t.split('-').slice(0, -1).join('-')));
  return stems.size === 1 && [...stems][0].includes('-') ? [...stems][0] : fallback;
}

/** The rung nearest a coin flip at the captured ask; the lower rung on a tie. Rungs with no ask are never featured. */
export function featuredRung(rungs: PropRung[]): number {
  const priced = rungs.filter((r) => r.ask != null);
  const pool = priced.length ? priced : rungs;
  return [...pool].sort((a, b) => Math.abs((a.ask ?? 50) - 50) - Math.abs((b.ask ?? 50) - 50) || a.k - b.k)[0].k;
}

const sameTeam = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && teamKey(a) === teamKey(b);

/** Rows for one game. Sidelined players are KEPT (flagged) so "Hide out" can count and reveal them. */
export function parseGameProps(g: GameCtx, markets: Market[], hints: IdentityHints = {}): Prop[] {
  const groups = new Map<string, { stat: string; ms: Market[] }>();
  const seen = new Set<string>();
  for (const m of markets) {
    if (seen.has(m.kalshi_ticker)) continue;
    seen.add(m.kalshi_ticker);
    const stat = statOf(m);
    if (!stat || !OPEN(m) || !FULL(m) || cents(m.yes_ask) == null || rungOf(m) == null) continue;
    const x = ext(m);
    if (x.subject_kind && x.subject_kind !== 'player') continue;
    const who = subjectOf(m);
    if (!who || isTeamSubject(who, g)) continue;
    const k = `${m.player_id ?? x.gsis_id ?? nameKey(who)}|${stat}`;
    const cur = groups.get(k) ?? { stat, ms: [] };
    cur.ms.push(m);
    groups.set(k, cur);
  }
  const codes = [g.away.abbr, g.home.abbr];
  const out: Prop[] = [];
  for (const [gk, { stat, ms }] of groups) {
    const first = ms[0];
    const x = ext(first);
    const name = subjectOf(first)!;
    const gsis = x.gsis_id ?? null;
    const rungs: PropRung[] = ms.map((m) => ({
      k: rungOf(m)!, ticker: m.kalshi_ticker, ask: cents(m.yes_ask), bid: cents(m.yes_bid), volume: m.volume ?? null, capturedAt: m.captured_at, source: 'Kalshi' as const, status: m.market_status ?? null,
    })).sort((a, b) => a.k - b.k).filter((r, i, a) => i === 0 || r.k !== a[i - 1].k);
    const fam = familyFor(g.slug, stat);
    const hist = hints.history?.(gsis, name) ?? null;
    // Team: the contract's own participant, then a published roster, then the history layer, then the ticker's own words.
    const inGame = (c: string | null | undefined) => (sameTeam(c, g.away.abbr) ? g.away.abbr : sameTeam(c, g.home.abbr) ? g.home.abbr : null);
    const byParticipant = first.participant_id && first.participant_id === g.awayId ? g.away.abbr : first.participant_id && first.participant_id === g.homeId ? g.home.abbr : null;
    const team = byParticipant ?? inGame(first.player_id ? hints.teamOfPlayer?.(first.player_id) : null) ?? inGame(hist?.team) ?? teamFromTicker(first.kalshi_ticker, codes);
    const opp = team ? (sameTeam(team, g.away.abbr) ? g.home.abbr : g.away.abbr) : null;
    const histId = fam.history?.kind === 'nfl' ? gsis : fam.history?.kind === 'nhl' ? first.player_id : null;
    const featured = featuredRung(rungs);
    out.push({
      id: propIdOf(rungs.map((r) => r.ticker), `${g.eventId}:${gk}`),
      slug: g.slug, sportLabel: g.sportLabel, eventId: g.eventId, gameKey: g.key, startMs: g.startMs, away: g.away, home: g.home,
      playerId: first.player_id, histId, name, team, opp, position: hist?.position ?? null,
      stat, fam: fam.fam, label: fam.label, abbr: fam.abbr, playerStat: fam.playerStat, history: fam.history, oppUnit: fam.oppUnit,
      rungs, featured,
      playerPage: !!hints.hasPlayerPage?.(first.player_id),
      out: hints.outOf?.(name, team) ?? null, availKnown: g.availKnown ?? true, availPending: g.availPending ?? false,
      model: { state: 'none', reason: 'not evaluated' },
      provenance: g.provenance ?? 'publication',
    });
  }
  return out.sort((a, b) => a.startMs - b.startMs || a.name.localeCompare(b.name) || a.fam.localeCompare(b.fam));
}

/**
 * Injury rows to availability by name key, keeping only designations that sideline him. Two published shapes: football research rows
 * ("Name (POS, TEAM): …" in `detail`, status OUT / INJURED_RESERVE / DOUBTFUL / SUSPENDED) and hockey event rows (`player_name`, status
 * "Injured Reserve" / "Out" / "Day-To-Day"). "Day-To-Day" and "Questionable" do not sideline anyone here.
 */
export function sidelinedByName(rows: { detail?: string | null; player_name?: string | null; status: string }[] | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows ?? []) {
    const name = r.player_name ?? /^(.+?) \(/.exec(r.detail ?? '')?.[1];
    const s = (r.status ?? '').toUpperCase().replace(/[\s-]+/g, '_');
    const word = s === 'OUT' ? 'OUT' : s === 'DOUBTFUL' ? 'DOUBTFUL' : s === 'SUSPENDED' ? 'SUSPENDED' : /INJURED_RESERVE|^IR$/.test(s) ? 'IR' : null;
    if (name && word) out.set(nameKey(name), word);
  }
  return out;
}
