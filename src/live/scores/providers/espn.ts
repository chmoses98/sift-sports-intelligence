// ESPN scoreboard -> LiveGame. ESPN's site.api.espn.com scoreboard is UNOFFICIAL: it has no developer licence, no key, no
// documented rate limit and no stability promise. Verified 2026-10-22 from a GitHub runner: it answers 200 with
// `Access-Control-Allow-Origin: *` and 1-10 s cache lifetimes for NFL, CFB, NBA, NHL, MLB, MLS and more, so a browser can read it.
// Its TERMS are the issue (Disney Terms of Use, read in full): a "personal, noncommercial" licence, with no right to "make
// available to the public", and a ban on accessing the products "using a robot, spider, script, or other automated means". So this
// adapter is OFF unless the viewer separately turns it on (src/live/scores/feed.ts), and is never part of any default.
// Nothing here is ESPN-specific beyond parsing: replace the provider and the contract, matching and freshness code do not change.
//
// Parsing is defensive: every field is optional and a missing one is null. A status the adapter does not recognise
// becomes phase UNKNOWN, never LIVE.
import type { GamePhase, LiveClock, LiveGame, LiveScoreProvider, LiveSituation, LiveSport, ObservedEvent, ProviderBatch } from '../types';
import { ScoreProviderError } from '../types';
import { teamKey } from '../identity';

// Provider JSON is untrusted and shape-unchecked here; every read below is guarded.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

/** The scoreboard path per sport. Soccer is per competition (see `espnSoccerPath`); tennis has a different shape and is not read here. */
export const ESPN_PATHS: Partial<Record<LiveSport, string[]>> = {
  NFL: ['football/nfl'],
  CFB: ['football/college-football?groups=80', 'football/college-football?groups=81'],
  NBA: ['basketball/nba'],
  CBB: ['basketball/mens-college-basketball?groups=50'],
  NHL: ['hockey/nhl'],
  MLB: ['baseball/mlb'],
};

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';

/** The publication's league word ("usa.mls") as ESPN's soccer competition path, or null when it is not one ESPN is known to list. */
const SOCCER: Record<string, string> = {
  'usa.mls': 'usa.1', 'eng.premier_league': 'eng.1', 'ger.bundesliga': 'ger.1', 'ita.serie_a': 'ita.1', 'fra.ligue_1': 'fra.1', 'esp.la_liga': 'esp.1',
  'mex.liga_mx': 'mex.1', 'bra.serie_a': 'bra.1', 'uefa.champions': 'uefa.champions', 'uefa.europa': 'uefa.europa',
};
export function espnSoccerPath(league: string | null | undefined): string | null {
  const l = (league ?? '').trim().toLowerCase();
  return SOCCER[l] ? `soccer/${SOCCER[l]}` : null;
}

/** The US-Eastern calendar day ESPN files a game under (`dates=YYYYMMDD`). */
export function espnDay(ms: number): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}${g('month')}${g('day')}`;
}

const int = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/** ESPN status.type.{state,name,completed} -> phase. `state` is pre | in | post. */
export function espnPhase(type: Raw | undefined): GamePhase {
  const name = String(type?.name ?? '').toUpperCase();
  if (/POSTPONED/.test(name)) return 'POSTPONED';
  if (/CANCEL/.test(name)) return 'CANCELLED';
  if (/SUSPENDED/.test(name)) return 'SUSPENDED';
  if (/DELAY/.test(name)) return 'DELAYED';
  if (/HALFTIME|END_PERIOD|INTERMISSION|END_OF/.test(name)) return 'BREAK';
  switch (String(type?.state ?? '').toLowerCase()) {
    case 'pre': return 'SCHEDULED';
    case 'in': return 'LIVE';
    case 'post': return type?.completed === false ? 'UNKNOWN' : 'FINAL';
    default: return 'UNKNOWN';
  }
}

function clockOf(sport: LiveSport, status: Raw): LiveClock | null {
  const period = int(status.period);
  const display = str(status.displayClock);
  if (period == null && display == null) return null;
  const seconds = typeof status.clock === 'number' && Number.isFinite(status.clock) ? status.clock : null;
  // Baseball and tennis have no game clock: ESPN reports 0 / "0:00" there, which must not be shown as a clock.
  const hasClock = sport !== 'MLB' && sport !== 'TENNIS';
  return {
    period,
    periodLabel: str(status.type?.shortDetail) ?? str(status.type?.detail),
    display: hasClock ? display : null,
    seconds: hasClock ? seconds : null,
    direction: hasClock ? (sport === 'SOCCER' ? 'up' : 'down') : null,
    // ESPN gives no running/stopped flag; report unknown rather than guess from state.
    running: null,
  };
}

function situationOf(sport: LiveSport, comp: Raw): LiveSituation | null {
  const s = comp.situation as Raw | undefined;
  if (!s) return null;
  const out: LiveSituation = {};
  if (sport === 'NFL' || sport === 'CFB') {
    out.downDistance = str(s.shortDownDistanceText) ?? str(s.downDistanceText);
    out.yardLine = str(s.possessionText);
    const poss = str(s.possession);
    const byId = (comp.competitors as Raw[] | undefined)?.find((c) => String(c.id) === poss || String(c.team?.id) === poss);
    out.possessionTeam = byId?.team?.abbreviation ? teamKey(sport, byId.team.abbreviation) : null;
  }
  if (sport === 'MLB') {
    out.outs = int(s.outs);
    out.bases = [!!s.onFirst, !!s.onSecond, !!s.onThird];
  }
  out.lastPlay = str(s.lastPlay?.text);
  return Object.values(out).some((v) => v != null) ? out : null;
}

export function parseEspnScoreboard(sport: LiveSport, body: Raw, fetchedAt: string): LiveGame[] {
  const events = Array.isArray(body?.events) ? (body.events as Raw[]) : null;
  if (!events) throw new ScoreProviderError('schema', 'ESPN scoreboard has no events array');
  const out: LiveGame[] = [];
  for (const ev of events) {
    const comp = (ev.competitions as Raw[] | undefined)?.[0];
    const competitors = comp?.competitors as Raw[] | undefined;
    const home = competitors?.find((c) => c.homeAway === 'home');
    const away = competitors?.find((c) => c.homeAway === 'away');
    const startUtc = str(ev.date) ?? str(comp?.date);
    if (!ev.id || !home?.team || !away?.team || !startUtc) continue; // a malformed row is skipped, never repaired
    const status = (comp?.status ?? ev.status ?? {}) as Raw;
    const phase = espnPhase(status.type);
    const hs = int(home.score);
    const as = int(away.score);
    // A scheduled game has no score: ESPN reports "0" there on some leagues; null is the honest value.
    const hasScore = phase !== 'SCHEDULED' && phase !== 'POSTPONED' && phase !== 'CANCELLED' && hs != null && as != null;
    const ref = (c: Raw) => ({
      key: teamKey(sport, str(c.team.abbreviation) ?? str(c.team.displayName) ?? String(c.team.id)),
      name: str(c.team.displayName) ?? str(c.team.name) ?? String(c.team.id),
      abbr: str(c.team.abbreviation),
      providerTeamId: c.team.id == null ? null : String(c.team.id),
    });
    out.push({
      schema: 'sift.live_game/1',
      sport,
      league: str(body.leagues?.[0]?.abbreviation) ?? null,
      startUtc: new Date(startUtc).toISOString(),
      home: ref(home),
      away: ref(away),
      phase,
      rawStatus: str(status.type?.name),
      score: hasScore ? { home: hs!, away: as! } : null,
      clock: phase === 'LIVE' || phase === 'BREAK' || phase === 'DELAYED' ? clockOf(sport, status) : null,
      situation: phase === 'LIVE' ? situationOf(sport, comp ?? {}) : null,
      provenance: {
        provider: 'espn',
        providerGameId: String(ev.id),
        // ESPN's scoreboard carries no per-game "state as of" time: freshness falls back to the fetch time.
        providerUpdatedAt: null,
        fetchedAt,
        attribution: null,
      },
    });
  }
  return out;
}

export interface EspnOptions {
  /** The events the screens are showing: the days and (for soccer) the competitions asked about come from them. */
  events?: (sport: LiveSport) => ObservedEvent[];
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function espnProvider(o: EspnOptions = {}): LiveScoreProvider {
  const fetchImpl = o.fetchImpl ?? fetch;
  const now = o.now ?? Date.now;
  const events = o.events ?? (() => []);
  return {
    id: 'espn',
    label: 'ESPN public scoreboard (unofficial)',
    // ESPN caches these answers for 1-10 s; 15 s is courtesy, not need.
    minIntervalMs: 15_000,
    sports: [...(Object.keys(ESPN_PATHS) as LiveSport[]), 'SOCCER'],
    async fetchScoreboard(sport, signal): Promise<ProviderBatch> {
      const evs = events(sport);
      const days = [...new Set(evs.map((e) => espnDay(Date.parse(e.ref.startUtc))).filter((d) => /^\d{8}$/.test(d)))].slice(0, 3);
      if (!days.length) days.push(espnDay(now()));
      const paths = sport === 'SOCCER'
        ? [...new Set(evs.map((e) => espnSoccerPath(e.league)).filter((x): x is string => !!x))].slice(0, 6)
        : ESPN_PATHS[sport] ?? [];
      if (!paths.length) throw new ScoreProviderError('unsupported', `ESPN adapter has no scoreboard for ${sport}`);
      const games: LiveGame[] = [];
      let fetchedAt = new Date(now()).toISOString();
      for (const path of paths) {
        for (const day of days) {
          const [p, q] = path.split('?');
          const url = `${BASE}/${p}/scoreboard?${q ? `${q}&` : ''}dates=${day}&limit=300`;
          let res: Response;
          try {
            res = await fetchImpl(url, { signal });
          } catch (e) {
            throw new ScoreProviderError(e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : 'network', String(e));
          }
          fetchedAt = new Date(now()).toISOString();
          if (res.status === 429) throw new ScoreProviderError('rate_limited', 'ESPN 429', 429, Number(res.headers.get('retry-after') ?? 30) * 1000);
          if (!res.ok) throw new ScoreProviderError('http', `ESPN HTTP ${res.status}`, res.status);
          let body: Raw;
          try { body = (await res.json()) as Raw; } catch { throw new ScoreProviderError('schema', 'ESPN answered non-JSON'); }
          games.push(...parseEspnScoreboard(sport, body, fetchedAt));
        }
      }
      return { provider: 'espn', games, fetchedAt };
    },
  };
}
