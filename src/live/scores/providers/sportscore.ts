// SportScore -> LiveGame. SportScore's free API (https://sportscore.com/developers/) states its terms in writing: free for personal,
// hobby, open-source and early-stage projects, key-free, CORS-open, edge-cached for 60 s, ~10,000 requests per day per IP, caching on
// your side allowed, and ONE condition: a visible, crawlable "Powered by SportScore" dofollow link wherever its data is shown.
// That makes it the one feed here whose own terms cover this use. It carries football (soccer), basketball (NBA among them) and tennis;
// NOT American football, hockey or baseball. Terms: https://sportscore.com/developers/terms/ (read 2026-10-22, "Last updated 23 April 2026").
//
// The feed gives names (no abbreviations), a start time, a status word and scores, and a feed-level `updated` time. It gives no
// period or game clock in the match list, so a live game shows its score and the feed's own status text, never an invented clock.
// Parsing is defensive: every field is optional and a missing one is null.
import type { GamePhase, LiveClock, LiveGame, LiveScoreProvider, LiveSport, ObservedEvent, ProviderBatch } from '../types';
import { ScoreProviderError } from '../types';
import { teamKey } from '../identity';

// Provider JSON is untrusted and shape-unchecked here; every read below is guarded.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

const BASE = 'https://sportscore.com/api/v1/fixtures/';
// Soccer is deliberately not read: the day list is capped at 200 rows and a football day has more, so the games SIFT lists can fall outside it.
export const SPORTSCORE_SPORT: Partial<Record<LiveSport, string>> = { NBA: 'basketball', TENNIS: 'tennis' };
/** Only these competitions are the sport SIFT means (SportScore's basketball also lists EuroLeague, CBA, ...). */
const NBA_COMPETITION = /^national basketball association$|^nba$/i;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const int = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) ? n : null;
};

/** SportScore status words -> phase. An unrecognised word is UNKNOWN, never LIVE. */
export function sportscorePhase(status: unknown): GamePhase {
  const s = String(status ?? '').toLowerCase().replace(/[\s_-]+/g, '');
  if (!s) return 'UNKNOWN';
  if (/^(finished|ended|final|fulltime|ft|aet|afterpenalties|pen|complete|completed)$/.test(s)) return 'FINAL';
  if (/^(live|inplay|inprogress|started|1sthalf|2ndhalf|firsthalf|secondhalf|extratime|overtime|ot|q1|q2|q3|q4)$/.test(s)) return 'LIVE';
  if (/^(halftime|ht|break|intermission|endofquarter)$/.test(s)) return 'BREAK';
  if (/^(notstarted|upcoming|scheduled|fixture|ns|tbd|pre)$/.test(s)) return 'SCHEDULED';
  if (/postponed/.test(s)) return 'POSTPONED';
  if (/cancel|abandon/.test(s)) return 'CANCELLED';
  if (/delay/.test(s)) return 'DELAYED';
  if (/suspend|interrupt/.test(s)) return 'SUSPENDED';
  return 'UNKNOWN';
}

export function parseSportscore(sport: LiveSport, body: Raw, fetchedAt: string): LiveGame[] {
  const list = Array.isArray(body?.matches) ? body.matches : Array.isArray(body?.fixtures) ? body.fixtures : Array.isArray(body?.results) ? body.results : null;
  if (!list) throw new ScoreProviderError('schema', 'SportScore answer has no match list');
  const updated = str(body.updated);
  const out: LiveGame[] = [];
  for (const m of list as Raw[]) {
    const home = str(m.home) ?? str(m.home_team?.name) ?? str(m.home_name);
    const away = str(m.away) ?? str(m.away_team?.name) ?? str(m.away_name);
    const start = str(m.time) ?? str(m.start_time) ?? str(m.kickoff);
    if (!home || !away || !start || !Number.isFinite(Date.parse(start))) continue; // a malformed row is skipped, never repaired
    if (sport === 'NBA' && !NBA_COMPETITION.test(str(m.competition) ?? '')) continue;
    const phase = sportscorePhase(m.status);
    const hs = int(m.home_score);
    const as = int(m.away_score);
    const scored = phase === 'LIVE' || phase === 'BREAK' || phase === 'FINAL' || phase === 'DELAYED' || phase === 'SUSPENDED';
    const text = str(m.status_text);
    const clock: LiveClock | null = phase === 'LIVE' || phase === 'BREAK' ? { period: null, periodLabel: text, display: null, seconds: null, direction: null, running: null } : null;
    const slug = str(m.slug) ?? str(m.url) ?? `${home}|${away}|${start}`;
    const mk = (name: string) => ({ key: teamKey(sport, name), name, abbr: null, providerTeamId: null });
    out.push({
      schema: 'sift.live_game/1', sport, league: str(m.competition),
      startUtc: new Date(start).toISOString(),
      home: mk(home), away: mk(away),
      phase, rawStatus: str(m.status),
      score: scored && hs != null && as != null ? { home: hs, away: as } : null,
      clock, situation: null,
      provenance: { provider: 'sportscore', providerGameId: slug, providerUpdatedAt: updated, fetchedAt, attribution: 'Powered by SportScore' },
    });
  }
  return out;
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface SportscoreOptions {
  /** The events the screens are showing: the dates asked about come from their start times. */
  events: (sport: LiveSport) => ObservedEvent[];
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function sportscoreProvider(o: SportscoreOptions): LiveScoreProvider {
  const fetchImpl = o.fetchImpl ?? fetch;
  const now = o.now ?? Date.now;
  return {
    id: 'sportscore',
    label: 'SportScore (free tier, attribution)',
    // The feed is edge-cached for 60 s: asking more often only costs the shared quota.
    minIntervalMs: 30_000,
    sports: Object.keys(SPORTSCORE_SPORT) as LiveSport[],
    async fetchScoreboard(sport, signal): Promise<ProviderBatch> {
      const s = SPORTSCORE_SPORT[sport];
      if (!s) throw new ScoreProviderError('unsupported', `SportScore has no ${sport}`);
      // UTC days of the games on screen (a late game can start on the next UTC day).
      const days = [...new Set(o.events(sport).map((e) => utcDay(Date.parse(e.ref.startUtc))).filter((d) => d.length === 10))].slice(0, 3);
      if (!days.length) days.push(utcDay(now()));
      const games: LiveGame[] = [];
      let fetchedAt = new Date(now()).toISOString();
      for (const day of days) {
        let res: Response;
        try {
          res = await fetchImpl(`${BASE}?sport=${s}&date=${day}&limit=200&src=sift-personal`, { signal });
        } catch (e) {
          throw new ScoreProviderError(e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : 'network', String(e));
        }
        fetchedAt = new Date(now()).toISOString();
        if (res.status === 429) throw new ScoreProviderError('rate_limited', 'SportScore 429', 429, Number(res.headers.get('retry-after') ?? 60) * 1000);
        if (!res.ok) throw new ScoreProviderError('http', `SportScore HTTP ${res.status}`, res.status);
        let body: Raw;
        try { body = (await res.json()) as Raw; } catch { throw new ScoreProviderError('schema', 'SportScore answered non-JSON'); }
        games.push(...parseSportscore(sport, body, fetchedAt));
      }
      return { provider: 'sportscore', games, fetchedAt };
    },
  };
}
