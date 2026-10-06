import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { NotFoundError, setFetchJson } from '../src/data/fetcher';
import { SportRepo } from '../src/data/repo';
import type { SportSource } from '../src/data/source';
import { sportByCode } from '../src/data/sports';
import type { HealthDoc } from '../src/contract/types';

export const SNAPSHOT_DIR = join(__dirname, '..', 'public', 'data', 'nfl', 'app', 'latest');
export const ROOT = 'disk://nfl';
export const HISTORY_ROOT = 'disk://history';
export const HISTORY_DIR = join(__dirname, '..', 'public', 'data', 'nfl', 'history');

export function readSnapshot<T>(rel: string): T {
  return JSON.parse(readFileSync(join(SNAPSHOT_DIR, rel), 'utf-8')) as T;
}

/** Every fetch of disk://nfl/<path> (and disk://history/<path> → public/data/nfl/history) reads public/data/nfl/app/latest/<path>; anything else 404s. */
export function useDiskFetch(): void {
  setFetchJson(async (url: string) => {
    if (url.startsWith(HISTORY_ROOT + '/')) {
      const f = join(HISTORY_DIR, url.slice(HISTORY_ROOT.length + 1));
      if (!existsSync(f)) throw new NotFoundError(url);
      return JSON.parse(readFileSync(f, 'utf-8'));
    }
    if (!url.startsWith(ROOT + '/')) throw new NotFoundError(url);
    const file = join(SNAPSHOT_DIR, url.slice(ROOT.length + 1));
    if (!existsSync(file)) throw new NotFoundError(url);
    return JSON.parse(readFileSync(file, 'utf-8'));
  });
}

export function nflRepo(): SportRepo {
  const sport = sportByCode('NFL')!;
  const source: SportSource = {
    sport, mode: 'snapshot', root: ROOT, liveHealth: readSnapshot<HealthDoc>('health.json'), liveError: null,
    snapshot: null, reason: 'test snapshot',
  };
  return new SportRepo(source);
}
