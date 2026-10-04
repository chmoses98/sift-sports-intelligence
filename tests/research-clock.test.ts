// The research clock: documents are memoised for navigation speed, re-read in the background after
// the revalidation period, and a failed re-read keeps the copy already shown.
import { afterAll, describe, expect, it } from 'vitest';
import { getJson, RESEARCH_REVALIDATE_MS, setFetchJson } from '../src/data/fetcher';
import { useDiskFetch } from './helpers';

afterAll(() => useDiskFetch());

describe('research fetch cache', () => {
  it('de-duplicates within the period and re-reads after it', async () => {
    let t = 0;
    let n = 0;
    let version = 1;
    setFetchJson(async () => (n++, { schema_version: 'edge_finder.app.v1', version }), () => t);
    const a = await getJson<{ version: number }>('x://doc');
    t += RESEARCH_REVALIDATE_MS - 1;
    version = 2;
    expect((await getJson<{ version: number }>('x://doc')).version).toBe(1);
    expect(n).toBe(1);
    t += 2;
    expect((await getJson<{ version: number }>('x://doc')).version).toBe(2);
    expect(n).toBe(2);
    expect(a.version).toBe(1);
  });

  it('keeps the previous copy when a re-read fails (offline)', async () => {
    let t = 0;
    let fail = false;
    setFetchJson(async () => {
      if (fail) throw new Error('offline');
      return { schema_version: 'edge_finder.app.v1', v: 'first' };
    }, () => t);
    await getJson('x://doc2');
    fail = true;
    t += RESEARCH_REVALIDATE_MS + 1;
    expect(await getJson<{ v: string }>('x://doc2')).toMatchObject({ v: 'first' });
  });

  it('still rejects an unsupported schema version', async () => {
    setFetchJson(async () => ({ schema_version: 'edge_finder.app.v9' }));
    await expect(getJson('x://bad')).rejects.toMatchObject({ name: 'SchemaVersionError' });
  });
});

describe('SportRepo without a readable root', () => {
  it('rejects (never throws synchronously into a render or effect)', async () => {
    const { SportRepo } = await import('../src/data/repo');
    const { sportByCode } = await import('../src/data/sports');
    const repo = new SportRepo({ sport: sportByCode('NFL')!, mode: 'unavailable', root: null, liveHealth: null, liveError: 'x', snapshot: null, reason: 'nothing could be read' });
    let p: Promise<unknown> | null = null;
    expect(() => (p = repo.board())).not.toThrow();
    await expect(p).rejects.toMatchObject({ name: 'NotFoundError' });
  });
});
