import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { NotFoundError, setFetchJson } from '../src/data/fetcher';
import { SportRepo } from '../src/data/repo';
import type { SportSource } from '../src/data/source';
import { CFB_RESEARCH_SIGNALS_URL, sportByCode } from '../src/data/sports';
import { setSignalsLoader } from '../src/data/cfbSignals';
import type { HealthDoc } from '../src/contract/types';

export const SNAPSHOT_DIR = join(__dirname, '..', 'public', 'data', 'nfl', 'app', 'latest');
export const ROOT = 'disk://nfl';
/** A trimmed, real cfb-edge-finder publication carrying the CFB Script Engine (scripts/make_cfb_fixture.py). */
export const CFB_DIR = join(__dirname, 'fixtures', 'cfb', 'app', 'latest');
export const CFB_ROOT = 'disk://cfb';
/** The CFB research-signals contract (cfb_research_signals/1.0.0) for the same ten games. */
export const CFB_SIGNALS_FILE = join(__dirname, 'fixtures', 'cfb', 'signals', 'cfb_research_signals.json');
/** A trimmed, real NHL-edge-finder publication carrying NHL_SCRIPT_V1, findings and the learning scorecard (scripts/make_nhl_fixture.py). */
export const NHL_DIR = join(__dirname, 'fixtures', 'nhl', 'app', 'latest');
export const NHL_ROOT = 'disk://nhl';
/** The real 2026-10-07 NHL slate after puck drop: frozen pregame research, two finals with script postmortems (tests/fixtures/nhl-final/README.md). */
export const NHL_FINAL_DIR = join(__dirname, 'fixtures', 'nhl-final', 'app', 'latest');
export const NHL_FINAL_ROOT = 'disk://nhl-final';
/** The real edge-finder-api MLB publication (2026-10-07) with a synthesized four-game postseason board, event details
 * and mlb.player_prop.v1 extensions on LAD@ATL (scripts/make_mlb_fixture.py; tests/fixtures/mlb/README.md). */
export const MLB_DIR = join(__dirname, 'fixtures', 'mlb', 'app', 'latest');
export const MLB_ROOT = 'disk://mlb';
export const HISTORY_ROOT = 'disk://history';
export const HISTORY_DIR = join(__dirname, '..', 'public', 'data', 'nfl', 'history');

export function readCfb<T>(rel: string): T {
  return JSON.parse(readFileSync(join(CFB_DIR, rel), 'utf-8')) as T;
}

export function readMlb<T>(rel: string): T {
  return JSON.parse(readFileSync(join(MLB_DIR, rel), 'utf-8')) as T;
}

export function readNhl<T>(rel: string): T {
  return JSON.parse(readFileSync(join(NHL_DIR, rel), 'utf-8')) as T;
}

export function readNhlFinal<T>(rel: string): T {
  return JSON.parse(readFileSync(join(NHL_FINAL_DIR, rel), 'utf-8')) as T;
}

export function readSnapshot<T>(rel: string): T {
  return JSON.parse(readFileSync(join(SNAPSHOT_DIR, rel), 'utf-8')) as T;
}

/** Every fetch of disk://nfl/<path> reads public/data/nfl/app/latest/<path> (disk://history/<path> → public/data/nfl/history,
 * disk://cfb/<path> → the CFB fixture); anything else 404s. */
export function useDiskFetch(): void {
  setFetchJson(readDisk);
  setSignalsLoader(readDisk);
}

/** The disk reader behind useDiskFetch (tests that log requests wrap it). */
export async function readDisk(url: string): Promise<unknown> {
  if (url.split('?')[0] === CFB_RESEARCH_SIGNALS_URL) return JSON.parse(readFileSync(CFB_SIGNALS_FILE, 'utf-8'));
  if (url.startsWith(HISTORY_ROOT + '/')) {
    const f = join(HISTORY_DIR, url.slice(HISTORY_ROOT.length + 1));
    if (!existsSync(f)) throw new NotFoundError(url);
    return JSON.parse(readFileSync(f, 'utf-8'));
  }
  const [root, dir] = url.startsWith(CFB_ROOT + '/') ? [CFB_ROOT, CFB_DIR] : url.startsWith(NHL_FINAL_ROOT + '/') ? [NHL_FINAL_ROOT, NHL_FINAL_DIR] : url.startsWith(NHL_ROOT + '/') ? [NHL_ROOT, NHL_DIR] : url.startsWith(MLB_ROOT + '/') ? [MLB_ROOT, MLB_DIR] : [ROOT, SNAPSHOT_DIR];
  if (!url.startsWith(root + '/')) throw new NotFoundError(url);
  const file = join(dir, url.slice(root.length + 1));
  if (!existsSync(file)) throw new NotFoundError(url);
  return JSON.parse(readFileSync(file, 'utf-8'));
}

export function cfbRepo(): SportRepo {
  const sport = sportByCode('CFB')!;
  const source: SportSource = {
    sport, mode: 'live', root: CFB_ROOT, liveHealth: readCfb<HealthDoc>('health.json'), liveError: null,
    snapshot: null, reason: 'test fixture',
  };
  return new SportRepo(source);
}

export function nhlRepo(): SportRepo {
  const sport = sportByCode('NHL')!;
  const source: SportSource = {
    sport, mode: 'live', root: NHL_ROOT, liveHealth: readNhl<HealthDoc>('health.json'), liveError: null,
    snapshot: null, reason: 'test fixture',
  };
  return new SportRepo(source);
}

export function nhlFinalRepo(): SportRepo {
  const sport = sportByCode('NHL')!;
  const source: SportSource = {
    sport, mode: 'live', root: NHL_FINAL_ROOT, liveHealth: readNhlFinal<HealthDoc>('health.json'), liveError: null,
    snapshot: null, reason: 'test fixture',
  };
  return new SportRepo(source);
}

export function mlbRepo(): SportRepo {
  const sport = sportByCode('MLB')!;
  const source: SportSource = {
    sport, mode: 'live', root: MLB_ROOT, liveHealth: readMlb<HealthDoc>('health.json'), liveError: null,
    snapshot: null, reason: 'test fixture',
  };
  return new SportRepo(source);
}

export function nflRepo(): SportRepo {
  const sport = sportByCode('NFL')!;
  const source: SportSource = {
    sport, mode: 'snapshot', root: ROOT, liveHealth: readSnapshot<HealthDoc>('health.json'), liveError: null,
    snapshot: null, reason: 'test snapshot',
  };
  return new SportRepo(source);
}
