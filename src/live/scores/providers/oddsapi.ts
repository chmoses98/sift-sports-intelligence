// The Odds API /v4/sports/{sport}/scores -> LiveGame. A second, deliberately different adapter: it proves the
// contract does not assume a clock. This feed carries team names, `commence_time`, `completed`, per-team scores
// and `last_update`, and (as far as this repository could verify, see docs/LIVE_SCORES.md) NO clock, period or
// situation, so every LiveGame it produces has clock = null and situation = null. It identifies teams by full
// name only, so identity matching leans on teamKey() name normalisation and the start-time window.
//
// Requires a key (server-side only; the key is a query parameter). Not wired to anything; here for the chain test.
import type { GamePhase, LiveGame, LiveScoreProvider, LiveSport, ProviderBatch } from '../types';
import { ScoreProviderError } from '../types';
import { teamKey } from '../identity';

// Provider JSON is untrusted and shape-unchecked here; every read below is guarded.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

export const ODDS_SPORT_KEYS: Partial<Record<LiveSport, string[]>> = {
  NFL: ['americanfootball_nfl'],
  CFB: ['americanfootball_ncaaf'],
  NBA: ['basketball_nba'],
  CBB: ['basketball_ncaab'],
  NHL: ['icehockey_nhl'],
  MLB: ['baseball_mlb'],
  SOCCER: ['soccer_epl', 'soccer_usa_mls'],
};

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isInteger(n) ? n : null;
};

export function parseOddsScores(sport: LiveSport, rows: unknown, fetchedAt: string): LiveGame[] {
  if (!Array.isArray(rows)) throw new ScoreProviderError('schema', 'Odds API scores is not an array');
  const out: LiveGame[] = [];
  for (const r of rows as Raw[]) {
    if (!r?.id || !r.home_team || !r.away_team || !r.commence_time) continue;
    const scores = Array.isArray(r.scores) ? (r.scores as Raw[]) : null;
    const hs = num(scores?.find((s) => s.name === r.home_team)?.score);
    const as = num(scores?.find((s) => s.name === r.away_team)?.score);
    const started = Date.parse(r.commence_time) <= Date.parse(fetchedAt);
    // This feed has no explicit "in play": scores present + not completed = in play (the only evidence it gives).
    const phase: GamePhase = r.completed === true ? 'FINAL' : scores && hs != null && as != null ? 'LIVE' : started ? 'UNKNOWN' : 'SCHEDULED';
    out.push({
      schema: 'sift.live_game/1',
      sport,
      league: str(r.sport_title),
      startUtc: new Date(r.commence_time).toISOString(),
      home: { key: teamKey(sport, r.home_team), name: r.home_team, abbr: null, providerTeamId: null },
      away: { key: teamKey(sport, r.away_team), name: r.away_team, abbr: null, providerTeamId: null },
      phase,
      rawStatus: r.completed === true ? 'completed' : scores ? 'scores_present' : null,
      score: hs != null && as != null && phase !== 'SCHEDULED' ? { home: hs, away: as } : null,
      clock: null,
      situation: null,
      provenance: { provider: 'oddsapi', providerGameId: String(r.id), providerUpdatedAt: typeof r.last_update === 'string' ? r.last_update : null, fetchedAt, attribution: null },
    });
  }
  return out;
}
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export interface OddsOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function oddsApiProvider(o: OddsOptions): LiveScoreProvider {
  const fetchImpl = o.fetchImpl ?? fetch;
  const now = o.now ?? Date.now;
  return {
    id: 'oddsapi',
    label: 'The Odds API scores',
    minIntervalMs: 30_000,
    sports: (Object.keys(ODDS_SPORT_KEYS) as LiveSport[]),
    async fetchScoreboard(sport, signal): Promise<ProviderBatch> {
      const keys = ODDS_SPORT_KEYS[sport];
      if (!keys?.length) throw new ScoreProviderError('unsupported', `no Odds API key for ${sport}`);
      const fetchedAt = new Date(now()).toISOString();
      const games: LiveGame[] = [];
      let quota: string | null = null;
      for (const k of keys) {
        let res: Response;
        try {
          res = await fetchImpl(`https://api.the-odds-api.com/v4/sports/${k}/scores/?apiKey=${encodeURIComponent(o.apiKey)}`, { signal });
        } catch (e) {
          throw new ScoreProviderError('network', String(e));
        }
        if (res.status === 401) throw new ScoreProviderError('unauthorized', 'Odds API key rejected', 401);
        if (res.status === 429) throw new ScoreProviderError('rate_limited', 'Odds API 429', 429, 60_000);
        if (!res.ok) throw new ScoreProviderError('http', `Odds API HTTP ${res.status}`, res.status);
        quota = `remaining ${res.headers.get('x-requests-remaining') ?? '?'} / used ${res.headers.get('x-requests-used') ?? '?'}`;
        games.push(...parseOddsScores(sport, await res.json(), fetchedAt));
      }
      return { provider: 'oddsapi', games, fetchedAt, quota };
    },
  };
}
