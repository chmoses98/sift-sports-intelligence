// Synthetic published slates of any size and sport mix, for layout and large-slate acceptance tests.
//
// The app reads each sport's board from its raw GitHub root (src/data/sports.ts). A spec that wants a 0 / 2 / 10 / 40 /
// 100+ game slate answers those requests here: a health document and a board, nothing else (recommendations and the
// explorer answer 404, which is how a v1-only publication looks, so Sift shows games with no research and invents none).
// NFL stays on the bundled same-run snapshot (the shared acceptance data); every other sport is synthetic.
import type { BrowserContext } from '@playwright/test';

export type SlateSport = 'MLB' | 'CFB' | 'NBA' | 'NHL' | 'SOCCER' | 'CBB' | 'TENNIS';
export type SlateSpec = Partial<Record<SlateSport, number>>;

const ROOTS: Record<SlateSport, string> = {
  MLB: 'chmoses98/edge-finder-api/main/app/latest',
  CFB: 'chmoses98/cfb-edge-finder/main/app/latest',
  NBA: 'chmoses98/nba-edge-finder/data-archive/app/latest',
  NHL: 'chmoses98/NHL-edge-finder/data-archive/app/latest',
  SOCCER: 'chmoses98/soccer-edge-finder/data-archive/app/latest',
  CBB: 'chmoses98/cbb-edge-finder/app-data/app/latest',
  TENNIS: 'chmoses98/Tennis-Edge-Finder/tennis-data/tennis-edge-finder/data/app/latest',
};

const TEAMS: Record<SlateSport, [string, string][]> = {
  NBA: [['Boston Celtics', 'BOS'], ['New York Knicks', 'NYK'], ['Los Angeles Lakers', 'LAL'], ['Golden State Warriors', 'GSW'], ['Denver Nuggets', 'DEN'], ['Milwaukee Bucks', 'MIL'], ['Miami Heat', 'MIA'], ['Dallas Mavericks', 'DAL'], ['Phoenix Suns', 'PHX'], ['Oklahoma City Thunder', 'OKC']],
  NHL: [['Boston Bruins', 'BOS'], ['Toronto Maple Leafs', 'TOR'], ['Colorado Avalanche', 'COL'], ['Vegas Golden Knights', 'VGK'], ['New York Rangers', 'NYR'], ['Edmonton Oilers', 'EDM'], ['Carolina Hurricanes', 'CAR'], ['Dallas Stars', 'DAL'], ['Tampa Bay Lightning', 'TBL'], ['Florida Panthers', 'FLA']],
  MLB: [['Los Angeles Dodgers', 'LAD'], ['Atlanta Braves', 'ATL'], ['New York Yankees', 'NYY'], ['Houston Astros', 'HOU'], ['Philadelphia Phillies', 'PHI'], ['Baltimore Orioles', 'BAL'], ['San Diego Padres', 'SD'], ['Seattle Mariners', 'SEA'], ['Texas Rangers', 'TEX'], ['Chicago Cubs', 'CHC']],
  CFB: [['Ohio State Buckeyes', 'OSU'], ['Georgia Bulldogs', 'UGA'], ['University at Albany Great Danes', 'ALB'], ['Stony Brook Seawolves', 'STBK'], ['Massachusetts Minutemen', 'UMASS'], ['Miami (OH) RedHawks', 'M-OH'], ['Texas A&M Aggies', 'TAMU'], ['Brigham Young Cougars', 'BYU'], ['Iowa State Cyclones', 'ISU'], ['Missouri Tigers', 'MIZ']],
  CBB: [['Duke Blue Devils', 'DUKE'], ['Kansas Jayhawks', 'KU'], ['Saint Joseph’s Hawks', 'SJU'], ['Florida Atlantic Owls', 'FAU'], ['Loyola Chicago Ramblers', 'LUC'], ['UNC Greensboro Spartans', 'UNCG'], ['Houston Cougars', 'HOU'], ['Gonzaga Bulldogs', 'GONZ'], ['Purdue Boilermakers', 'PUR'], ['Tennessee Volunteers', 'TENN']],
  SOCCER: [['Arsenal', 'ARS'], ['Manchester City', 'MCI'], ['Real Madrid', 'RMA'], ['FC Barcelona', 'BAR'], ['Bayern Munich', 'BAY'], ['Paris Saint-Germain', 'PSG'], ['Inter Milan', 'INT'], ['Borussia Dortmund', 'BVB'], ['Atlético Madrid', 'ATM'], ['Liverpool', 'LIV']],
  TENNIS: [['Jannik Sinner', 'SIN'], ['Carlos Alcaraz', 'ALC'], ['Novak Djokovic', 'DJO'], ['Alexander Zverev', 'ZVE'], ['Daniil Medvedev', 'MED'], ['Taylor Fritz', 'FRI'], ['Casper Ruud', 'RUU'], ['Grigor Dimitrov', 'DIM'], ['Stefanos Tsitsipas', 'TSI'], ['Arthur Rinderknech', 'RIN']],
};

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** `day` is 0 for the browser's today, 1 for tomorrow. Hours stay within NOW-1h … NOW+8h so the local date is steady in any zone. */
export function slateStart(now: Date, i: number, n: number, day = 0): string {
  const frac = n <= 1 ? 0.5 : i / (n - 1);
  const ms = now.getTime() + day * 86_400_000 + (-1 + frac * 9) * 3_600_000;
  return new Date(Math.round(ms / 60_000) * 60_000).toISOString();
}

export interface SlateOptions {
  now: Date;
  /** Day offsets games cycle through; [0] is all today, [0, 0, 1] puts a third on tomorrow. */
  days?: number[];
  /** Sports whose feed fails (HTTP 500), to exercise partial coverage. */
  failing?: SlateSport[];
}

export function board(sport: SlateSport, n: number, o: SlateOptions) {
  const teams = TEAMS[sport];
  const days = o.days ?? [0];
  const items = Array.from({ length: n }, (_, i) => {
    const a = teams[(i * 3) % teams.length];
    let h = teams[(i * 3 + 1 + (i % 4)) % teams.length];
    // Distinct ids so long slates never pair a team with itself; a 100-game slate reuses pairings across times.
    if (h[1] === a[1]) h = teams[(i * 3 + 2) % teams.length];
    const id = `evt_${sport.toLowerCase()}_${String(i).padStart(3, '0')}_${(hash(`${sport}${i}`) % 9999).toString(16)}`;
    const away = { participant_id: `prt_${sport}_${a[1]}_${i}`, display_name: a[0], short_name: a[1], participant_type: sport === 'TENNIS' ? 'PLAYER' : 'TEAM' };
    const home = { participant_id: `prt_${sport}_${h[1]}_${i}`, display_name: h[0], short_name: h[1], participant_type: sport === 'TENNIS' ? 'PLAYER' : 'TEAM' };
    return {
      event_id: id,
      league: sport,
      competition: 'regular',
      status: 'SCHEDULED',
      start_time_utc: slateStart(o.now, i, n, days[i % days.length]),
      home_participant: home.participant_id,
      away_participant: away.participant_id,
      participants: [home, away],
      data_freshness: 'FRESH',
      health_flags: [],
      detail_path: `event_detail/${id}.json`,
      market_captured_at: null,
      model_generated_at: null,
      markets_available: 3 + (i % 5),
      markets_priced: 0,
      recommendations_count: 0,
      wagers_count: 0,
    };
  });
  return { schema_version: 'edge_finder.app.v1', kind: 'board', sport, run_id: 'run_synthetic', generated_at: o.now.toISOString(), overall_status: 'HEALTHY', bet_authority: 'MANUAL', count: items.length, items };
}

function health(sport: SlateSport, o: SlateOptions) {
  const at = o.now.toISOString();
  return {
    schema_version: 'edge_finder.app.v1', kind: 'health', sport, run_id: 'run_synthetic', generated_at: at, overall_status: 'HEALTHY', freshness_status: 'FRESH', bet_authority: 'MANUAL',
    components: {}, thresholds: {}, errors: [], last_export_attempt: at, last_market_capture: at, last_model_generated: at, last_successful_run: at, next_scheduled_run: null, payload_run_id: 'run_synthetic', data_age_seconds: 60, commit_sha: null,
  };
}

/** Answer the raw GitHub roots for every synthetic sport; unnamed sports publish an empty board. */
export async function installSlates(context: BrowserContext, spec: SlateSpec, o: SlateOptions): Promise<void> {
  const json = (body: unknown, status = 200) => ({ status, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  await context.route(/^https:\/\/raw\.githubusercontent\.com\//, async (route) => {
    const url = route.request().url().replace('https://raw.githubusercontent.com/', '');
    const sport = (Object.keys(ROOTS) as SlateSport[]).find((s) => url.startsWith(`${ROOTS[s]}/`));
    if (!sport) return route.abort();
    if (o.failing?.includes(sport)) return route.fulfill(json({ error: 'mock failure' }, 500));
    const file = url.slice(ROOTS[sport].length + 1);
    if (file === 'health.json') return route.fulfill(json(health(sport, o)));
    if (file === 'board.json') return route.fulfill(json(board(sport, spec[sport] ?? 0, o)));
    return route.fulfill(json({ error: 'not published' }, 404));
  });
}
