// NBA team research as a pure view over ONE published team profile (nba-edge-finder explorer `teams/<participant>.json`). Nothing here fetches.
//
// The screen opens ONLY when the data says it is current (`nbaCurrency`): the profile's season is the season `now` falls in, its blended and
// current-season metrics exist and rest on games, and its newest observation is recent. There is no capability flag to flip: last season's
// numbers can never pass this check, and when the publication stops updating the screen closes itself again.
//
// Raw current-season statistics and the SIFT blended estimate are separate objects with separate labels (`cur` and `blend`): the blend is a predictive
// estimate (this season weighted by n/(n+k), last season carried over by roster continuity), the current-season figures are observations.
import type { EntityProfileDoc, Observation } from '../../contract/types';
import { completedGames } from '../../lib/gamedata';

export const MAX_AGE_DAYS = 3;

/** The NBA season a date falls in: July to December belong to the season that starts that year, January to June to the one that started last year. */
export function seasonAt(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-${String(y + 1).slice(2)}`;
}

const short = (id: string) => id.replace(/^met_nba\.team_/, '');

/** The observation of a published metric (short id) in the window whose label satisfies `win`, or null. */
function obsOf(p: EntityProfileDoc, id: string, win?: (label: string) => boolean): Observation | null {
  return (p.metrics ?? []).find((o) => !o.split && short(o.metric_id) === id && (!win || win(o.window?.label ?? ''))) ?? null;
}

export interface NbaCurrency { ok: boolean; reasons: string[]; season: string | null; asOf: string | null; games: number }

/** Is this profile current enough to show as this season's research? Every failed test is named (the lock says exactly what is missing). */
export function nbaCurrency(p: EntityProfileDoc | null | undefined, now: number): NbaCurrency {
  if (!p) return { ok: false, reasons: ['The team profile is not loaded.'], season: null, asOf: null, games: 0 };
  const want = seasonAt(now);
  const reasons: string[] = [];
  const asOf = p.quality?.data_as_of ?? null;
  if (p.season !== want) reasons.push(`The publication’s team statistics are for ${p.season ?? 'an unknown season'}, not ${want}.`);
  const blend = obsOf(p, 'blend_net');
  const cur = obsOf(p, 'cur_adj_net');
  if (!blend || !cur) reasons.push('The publication carries no current-season or blended ratings yet.');
  const games = blend?.sample_size ?? 0;
  if (blend && games <= 0) reasons.push('No games of this season are in the ratings.');
  const t = asOf ? Date.parse(asOf) : NaN;
  if (!Number.isFinite(t)) reasons.push('The publication gives no as-of time.');
  else if (now - t > MAX_AGE_DAYS * 86_400_000) reasons.push(`The newest game in the publication is from ${asOf!.slice(0, 10)}, over ${MAX_AGE_DAYS} days ago.`);
  return { ok: reasons.length === 0, reasons, season: p.season, asOf, games };
}

export interface Rated { off: number | null; def: number | null; net: number | null; netRank: number | null; offRank: number | null; defRank: number | null; n: number | null }
export interface Factor {
  id: string;
  label: string;
  /** Short unit-bearing value, ready to print ("53.4%"). */
  text: string;
  value: number | null;
  rank: number | null;
  n: number | null;
  /** League average (same units as `value`). */
  league: number | null;
  /** True when a higher value is better, false when lower is, null when the statistic is style, not quality (never ranked as strength or weakness). */
  hib: boolean | null;
  group: 'scoring' | 'shooting' | 'ball' | 'boards' | 'pace';
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const one = (v: number) => v.toFixed(1);
const FACTORS: { id: string; label: string; group: Factor['group']; fmt: (v: number) => string; hib: boolean | null }[] = [
  { id: 'off_rtg', label: 'Offensive rating', group: 'scoring', fmt: one, hib: true },
  { id: 'def_rtg', label: 'Defensive rating', group: 'scoring', fmt: one, hib: false },
  { id: 'pace_poss', label: 'Pace (possessions)', group: 'pace', fmt: one, hib: null },
  { id: 'efg_pct', label: 'Shooting (eFG%)', group: 'shooting', fmt: pct, hib: true },
  { id: 'opp_efg_pct', label: 'Opponent eFG%', group: 'shooting', fmt: pct, hib: false },
  { id: 'fg3_rate', label: 'Three-point rate', group: 'shooting', fmt: pct, hib: null },
  { id: 'tov_rate', label: 'Turnovers per 100', group: 'ball', fmt: one, hib: false },
  { id: 'opp_tov_pct', label: 'Forced turnovers per 100', group: 'ball', fmt: one, hib: true },
  { id: 'ast_pct', label: 'Assisted baskets', group: 'ball', fmt: pct, hib: null },
  { id: 'orb_pct', label: 'Offensive rebounds', group: 'boards', fmt: pct, hib: true },
  { id: 'drb_pct', label: 'Defensive rebounds', group: 'boards', fmt: pct, hib: true },
  { id: 'fta_rate', label: 'Free-throw rate', group: 'shooting', fmt: (v) => v.toFixed(3), hib: null },
];

const seasonWindow = (l: string) => /^SEASON$/i.test(l);

export interface FormGameVM { eventId: string | null; date: string; oppId: string; oppName: string; home: boolean; for: number; against: number; outcome: 'W' | 'L' | 'T'; margin: number }
export interface NbaTeamView {
  season: string;
  priorSeason: string | null;
  asOf: string | null;
  games: number;
  record: string | null;
  blend: Rated & { weightCurrent: number | null; carryOver: number | null; continuity: number | null; priorNet: number | null };
  cur: Rated;
  factors: Factor[];
  strengths: Factor[];
  weaknesses: Factor[];
  form: FormGameVM[];
  availability: { player: string; status: string; detail: string | null }[];
  roster: { id: string; name: string; role: string | null }[];
}

const rated = (p: EntityProfileDoc, prefix: 'blend' | 'cur_adj', win?: (l: string) => boolean): Rated => {
  const o = obsOf(p, `${prefix}_off`, win), d = obsOf(p, `${prefix}_def`, win), n = obsOf(p, `${prefix}_net`, win);
  return { off: o?.value ?? null, def: d?.value ?? null, net: n?.value ?? null, netRank: n?.context?.rank ?? null, offRank: o?.context?.rank ?? null, defRank: d?.context?.rank ?? null, n: n?.sample_size ?? null };
};

/** The page's numbers. Statistics the document lacks are left out, never replaced. */
export function nbaTeamView(p: EntityProfileDoc): NbaTeamView {
  const bn = obsOf(p, 'blend_net');
  const ext = (bn?.extensions ?? {}) as Record<string, unknown>;
  const factors: Factor[] = [];
  for (const f of FACTORS) {
    // `pace_poss` is the published `possessions` metric (possessions per game).
    const id = f.id === 'pace_poss' ? 'possessions' : f.id;
    const o = obsOf(p, id, seasonWindow);
    if (!o || o.value == null) continue;
    factors.push({ id: f.id, label: f.label, text: f.fmt(o.value), value: o.value, rank: o.context?.rank ?? null, n: o.context?.universe_size ?? null,
      league: o.context?.league_average ?? null, hib: f.hib, group: f.group });
  }
  const ranked = factors.filter((f) => f.hib != null && f.rank != null && f.n != null);
  const third = (n: number) => Math.max(3, Math.round(n / 4));
  const strengths = ranked.filter((f) => f.rank! <= third(f.n!)).sort((a, b) => a.rank! - b.rank!).slice(0, 3);
  const weaknesses = ranked.filter((f) => f.rank! > f.n! - third(f.n!)).sort((a, b) => b.rank! - a.rank!).slice(0, 3);
  const season = p.season ?? '';
  const startIso = `${season.slice(0, 4)}-07-01`;
  const form = completedGames(p).filter((g) => g.date >= startIso).slice(0, 10).map((g): FormGameVM => ({
    eventId: g.eventId ?? null, date: g.date, oppId: g.opponentId, oppName: g.opponentName, home: g.home, for: g.for, against: g.against, outcome: g.outcome as 'W' | 'L' | 'T', margin: g.for - g.against,
  }));
  const thisSeason = completedGames(p).filter((g) => g.date >= startIso);
  const w = thisSeason.filter((g) => g.outcome === 'W').length;
  const l = thisSeason.filter((g) => g.outcome === 'L').length;
  return {
    season,
    priorSeason: typeof ext.prior_season === 'string' ? ext.prior_season : null,
    asOf: p.quality?.data_as_of ?? null,
    games: bn?.sample_size ?? 0,
    record: thisSeason.length ? `${w}-${l}` : null,
    blend: { ...rated(p, 'blend'), weightCurrent: num(ext.weight_current), carryOver: num(ext.carry_over), continuity: num(ext.roster_continuity), priorNet: null },
    cur: rated(p, 'cur_adj'),
    factors, strengths, weaknesses, form,
    availability: (p.availability ?? []).filter((a) => a.status && a.status !== 'ACTIVE').map((a) => ({ player: (/^(.+?) \(/.exec(a.detail ?? '')?.[1] ?? a.detail ?? ''), status: a.status, detail: a.detail })),
    roster: (p.players ?? []).map((x) => ({ id: x.participant_id, name: x.display_name, role: x.role ?? null })),
  };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** "+4.5" / "-2.1" for a rating relative to the league. */
export const signed = (v: number | null, d = 1): string => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`);

/** A strength or weakness as one plain sentence fragment: "3rd in forced turnovers per 100 (17.1)". */
export function factorLine(f: Factor): string {
  const r = f.rank!;
  const suffix = r % 100 >= 11 && r % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[r % 10] ?? 'th';
  return `${r}${suffix} of ${f.n} · ${f.label.replace(/ \(.*\)$/, '').toLowerCase()} (${f.text})`;
}

export interface Comparison { label: string; mine: string; theirs: string; edge: 'mine' | 'theirs' | 'even' | null }
/** Two teams side by side on the statistics both profiles publish: who has the edge on each, by published value and its direction. */
export function compareTeams(a: NbaTeamView, b: NbaTeamView): Comparison[] {
  const out: Comparison[] = [];
  const row = (label: string, av: number | null, bv: number | null, at: string, bt: string, hib: boolean | null) => {
    if (av == null || bv == null) return;
    const edge: Comparison['edge'] = hib == null ? null : Math.abs(av - bv) < 1e-9 ? 'even' : (av > bv) === hib ? 'mine' : 'theirs';
    out.push({ label, mine: at, theirs: bt, edge });
  };
  row('SIFT blended net', a.blend.net, b.blend.net, signed(a.blend.net), signed(b.blend.net), true);
  row(`${a.season} only, net`, a.cur.net, b.cur.net, signed(a.cur.net), signed(b.cur.net), true);
  for (const f of a.factors) {
    const g = b.factors.find((x) => x.id === f.id);
    if (g) row(f.label, f.value, g.value, f.text, g.text, f.hib);
  }
  return out;
}
