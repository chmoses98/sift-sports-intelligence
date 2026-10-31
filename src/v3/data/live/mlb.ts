// MLB StatsAPI -> LiveDetail (state, plays, box-score leaders). BLOCKED-ON-RIGHTS: see rights.ts. This adapter is only ever called when the build
// has enabled the `mlb` source; with the default build nothing here runs and no request to statsapi.mlb.com is made.
//
// The feed's shape (documented, public): the schedule lists `dates[].games[]` with `gamePk`, `gameDate`, and `teams.{away,home}.team.name`; the live feed
// `/api/v1.1/game/{gamePk}/feed/live` carries `metaData.timeStamp`, `gameData.{status,teams}`, `liveData.linescore` (runs, inning, outs, count, runners),
// `liveData.plays.allPlays[]` (the provider's own play sentences) and `liveData.boxscore.teams.{away,home}.players`.
// Parsing is defensive: every read is guarded, a missing field is null, a row that cannot be understood is skipped, never repaired.
import { teamKey } from '../../../live/scores/identity';
import { withDeadline } from '../../../live/scores/providers/net';
import type { DetailLeaders, DetailPhase, DetailPlay, DetailSituation, DetailTarget, LiveDetail, Side } from './types';

// Provider JSON is untrusted; every read below is guarded.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

const API = 'https://statsapi.mlb.com/api';
export const MLB_POLL_MS = 20_000; // the feed's own cadence (docs/LIVE_SCORES_REAL.md: 20 s)
/** How far the schedule's start may differ from SIFT's (a doubleheader's games are hours apart; TV windows move by minutes). */
export const MLB_START_WINDOW_MIN = 60;

export type MlbErrorKind = 'no-match' | 'network' | 'timeout' | 'http' | 'schema';
export class MlbError extends Error {
  constructor(public kind: MlbErrorKind, message: string) { super(message); this.name = 'MlbError'; }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const int = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) ? n : null;
};
const obj = (v: unknown): Raw | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : null);

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86_400_000;

// ---------------------------------------------------------------- matching the SIFT game to a gamePk

/** The schedule game for this SIFT game: both teams in the SIFT orientation and a start within the window; exactly one, else null (never a guess). */
export function pickGamePk(schedule: Raw, t: DetailTarget): number | null {
  const awayK = teamKey('MLB', t.away.name);
  const homeK = teamKey('MLB', t.home.name);
  const hits: number[] = [];
  const dates = Array.isArray(schedule?.dates) ? (schedule.dates as Raw[]) : [];
  for (const d of dates) {
    for (const g of Array.isArray(d?.games) ? (d.games as Raw[]) : []) {
      const pk = int(g?.gamePk);
      const a = str(g?.teams?.away?.team?.name);
      const h = str(g?.teams?.home?.team?.name);
      const start = Date.parse(str(g?.gameDate) ?? '');
      if (pk == null || !a || !h || !Number.isFinite(start)) continue;
      if (teamKey('MLB', a) !== awayK || teamKey('MLB', h) !== homeK) continue;
      if (Math.abs(start - t.startMs) / 60_000 > MLB_START_WINDOW_MIN) continue;
      hits.push(pk);
    }
  }
  return hits.length === 1 ? hits[0] : null;
}

// ---------------------------------------------------------------- parsing the live feed

/** `metaData.timeStamp` is "YYYYMMDD_HHMMSS" in UTC. */
export function mlbTimeStamp(v: unknown): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/.exec(String(v ?? ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
}

function phaseOf(status: Raw | null, inningState: string | null): DetailPhase {
  const abstract = (str(status?.abstractGameState) ?? '').toLowerCase();
  const detailed = (str(status?.detailedState) ?? '').toLowerCase();
  if (abstract === 'final' || /^(final|game over|completed early)/.test(detailed)) return 'final';
  if (abstract === 'live' && /^in progress/.test(detailed)) return inningState === 'Middle' || inningState === 'End' ? 'break' : 'live';
  return 'other'; // Preview, Warmup, Delayed, Suspended, Manager challenge, or a word nothing here understands
}

const ordinal = (n: number) => { const v = n % 100; return `${n}${v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`; };

function periodLabel(ls: Raw | null, phase: DetailPhase): string | null {
  if (phase === 'final' || !ls) return null;
  const inning = int(ls.currentInning);
  const ord = str(ls.currentInningOrdinal) ?? (inning != null ? ordinal(inning) : null);
  const state = str(ls.inningState) ?? str(ls.inningHalf);
  if (!ord || !state) return null;
  const word = state === 'Top' || state === 'Bottom' ? state : state === 'Middle' ? 'Mid' : state === 'End' ? 'End' : null;
  return word ? `${word} ${ord}` : null;
}

function situationOf(ls: Raw | null, phase: DetailPhase): DetailSituation | null {
  if (!ls || phase !== 'live') return null;
  const half = str(ls.inningHalf)?.toLowerCase();
  const off = obj(ls.offense);
  return {
    kind: 'baseball',
    half: half === 'top' || half === 'bottom' ? half : null,
    inning: int(ls.currentInning),
    outs: int(ls.outs),
    balls: int(ls.balls),
    strikes: int(ls.strikes),
    // The feed lists a runner under first/second/third only while one is there.
    bases: off ? [!!obj(off.first), !!obj(off.second), !!obj(off.third)] : null,
  };
}

function playsOf(live: Raw | null): DetailPlay[] | null {
  const all = live?.plays?.allPlays;
  if (!Array.isArray(all)) return null;
  const out: DetailPlay[] = [];
  for (const p of all as Raw[]) {
    const about = obj(p?.about);
    const text = str(p?.result?.description);
    if (!about || !text || about.isComplete === false) continue; // a play still in progress is not a result yet
    const half = str(about.halfInning)?.toLowerCase();
    const inning = int(about.inning);
    const aw = int(p?.result?.awayScore);
    const hs = int(p?.result?.homeScore);
    // The team at bat scores: the away side bats in the top of an inning.
    const scoring: Side | null = about.isScoringPlay === true && (half === 'top' || half === 'bottom') ? (half === 'top' ? 'away' : 'home') : null;
    out.push({
      id: String(int(about.atBatIndex) ?? out.length),
      periodLabel: inning != null && (half === 'top' || half === 'bottom') ? `${half === 'top' ? 'Top' : 'Bot'} ${ordinal(inning)}` : null,
      clock: null,
      text, scoring,
      score: aw != null && hs != null ? { away: aw, home: hs } : null,
    });
  }
  return out.reverse(); // newest first
}

function leadersOf(live: Raw | null): DetailLeaders[] | null {
  const teams = obj(live?.boxscore?.teams);
  if (!teams) return null;
  const out: DetailLeaders[] = [];
  for (const side of ['away', 'home'] as const) {
    const players = obj(teams[side]?.players);
    if (!players) continue;
    const rows = Object.values(players) as Raw[];
    const bat = rows
      .map((p) => ({ name: str(p?.person?.fullName), b: obj(p?.stats?.batting) }))
      .filter((r): r is { name: string; b: Raw } => !!r.name && !!r.b && (int(r.b.atBats) ?? 0) + (int(r.b.baseOnBalls) ?? 0) > 0)
      .map((r) => {
        const h = int(r.b.hits) ?? 0, ab = int(r.b.atBats) ?? 0, hr = int(r.b.homeRuns) ?? 0, rbi = int(r.b.rbi) ?? 0, bb = int(r.b.baseOnBalls) ?? 0;
        const parts = [`${h}-for-${ab}`, hr > 0 ? (hr > 1 ? `${hr} HR` : 'HR') : '', rbi > 0 ? `${rbi} RBI` : '', bb > 0 ? `${bb} BB` : ''].filter(Boolean);
        return { name: r.name, rank: h + hr * 2 + rbi, line: parts.join(', ') };
      })
      .filter((r) => r.rank > 0)
      .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))
      .slice(0, 3);
    if (bat.length) out.push({ side, title: 'Batting', rows: bat.map(({ name, line }) => ({ name, line })) });
    const pit = rows
      .map((p) => ({ name: str(p?.person?.fullName), s: obj(p?.stats?.pitching) }))
      .filter((r): r is { name: string; s: Raw } => !!r.name && !!r.s && str(r.s.inningsPitched) != null && parseFloat(str(r.s.inningsPitched)!) > 0)
      .map((r) => ({ name: r.name, ip: parseFloat(str(r.s.inningsPitched)!), line: `${str(r.s.inningsPitched)} IP, ${int(r.s.strikeOuts) ?? 0} K, ${int(r.s.earnedRuns) ?? 0} ER` }))
      .sort((a, b) => b.ip - a.ip || a.name.localeCompare(b.name))
      .slice(0, 2);
    if (pit.length) out.push({ side, title: 'Pitching', rows: pit.map(({ name, line }) => ({ name, line })) });
  }
  return out;
}

/** The live feed's body as a LiveDetail. Throws `schema` when the document is not a live feed at all. */
export function parseMlbFeed(body: Raw, fetchedAt: number): LiveDetail {
  const live = obj(body?.liveData);
  const status = obj(body?.gameData?.status);
  if (!live || !status) throw new MlbError('schema', 'MLB answer is not a live feed');
  const ls = obj(live.linescore);
  const phase = phaseOf(status, str(ls?.inningState));
  const away = int(ls?.teams?.away?.runs);
  const home = int(ls?.teams?.home?.runs);
  const hasScore = (phase === 'live' || phase === 'break' || phase === 'final') && away != null && home != null;
  return {
    source: { id: 'mlb', label: 'MLB StatsAPI', attribution: null },
    fetchedAt,
    providerAt: mlbTimeStamp(body?.metaData?.timeStamp),
    phase,
    score: hasScore ? { away: away!, home: home! } : null,
    period: { label: periodLabel(ls, phase), clock: null },
    situation: situationOf(ls, phase),
    plays: playsOf(live),
    leaders: leadersOf(live),
  };
}

/** A feed for a different pairing than the SIFT game is never shown (the schedule matched the gamePk, the feed itself must agree). */
export function feedAgrees(body: Raw, t: DetailTarget): boolean {
  const a = str(body?.gameData?.teams?.away?.name);
  const h = str(body?.gameData?.teams?.home?.name);
  return !!a && !!h && teamKey('MLB', a) === teamKey('MLB', t.away.name) && teamKey('MLB', h) === teamKey('MLB', t.home.name);
}

// ---------------------------------------------------------------- fetching

export interface MlbFetchOptions { fetchImpl?: typeof fetch; now?: () => number; signal?: AbortSignal; /** gamePk by SIFT event id, kept across polls so the schedule is asked once. */ pkCache?: Map<string, number> }

async function getJson(url: string, o: MlbFetchOptions): Promise<Raw> {
  const f = o.fetchImpl ?? fetch;
  const dl = withDeadline(o.signal);
  let res: Response;
  try {
    res = await f(url, { signal: dl.signal });
  } catch (e) {
    throw new MlbError(dl.signal.aborted && (dl.signal.reason as Error | undefined)?.name === 'TimeoutError' ? 'timeout' : 'network', String(e));
  } finally { dl.done(); }
  if (!res.ok) throw new MlbError('http', `MLB HTTP ${res.status}`);
  try { return (await res.json()) as Raw; } catch { throw new MlbError('schema', 'MLB answered non-JSON'); }
}

export async function fetchMlbDetail(t: DetailTarget, o: MlbFetchOptions = {}): Promise<LiveDetail> {
  const now = o.now ?? Date.now;
  let pk = o.pkCache?.get(t.eventId) ?? null;
  if (pk == null) {
    const sched = await getJson(`${API}/v1/schedule?sportId=1&startDate=${utcDay(t.startMs - DAY)}&endDate=${utcDay(t.startMs + DAY)}`, o);
    pk = pickGamePk(sched, t);
    if (pk == null) throw new MlbError('no-match', 'the MLB schedule has no single game for these teams at this start time');
    o.pkCache?.set(t.eventId, pk);
  }
  const body = await getJson(`${API}/v1.1/game/${pk}/feed/live`, o);
  if (!feedAgrees(body, t)) { o.pkCache?.delete(t.eventId); throw new MlbError('no-match', 'the MLB feed is for a different pairing'); }
  return parseMlbFeed(body, now());
}
