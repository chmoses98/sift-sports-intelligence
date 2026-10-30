// The feed heartbeat (health.json): shape, loop/sequence bookkeeping, and that it is a FILE ADDITION only (the
// feed schema, index.json and the per-game files are unchanged). Includes an end-to-end run of the real
// publisher script with a stubbed network and clock.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FEED_SCHEMA, HEALTH_SCHEMA, INDEX_SCHEMA, advanceLoop, buildFiles, buildHeartbeat } from '../../scripts/live-quotes/lib.mjs';
import { SNAPSHOT_DIR } from '../helpers';
import type { SportStatus } from '../../scripts/live-quotes/lib.mjs';

const T0 = '2026-10-04T15:00:00Z';
const SPORT_STATUS: SportStatus[] = [
  { sport: 'NFL', status: 'CURRENT_SLATE', published: true, reason: 'ok', games: 1, markets: 2 },
  { sport: 'NHL', status: 'UNREADABLE_PUBLICATION', published: false, reason: 'unreadable', games: 0, markets: null },
];

describe('advanceLoop: which loop and which cycle', () => {
  it('starts a loop at sequence 1 when there is no prior state', () => {
    expect(advanceLoop(null, { runId: '111', nowIso: T0 })).toEqual({ run_id: '111', loop_started_at: T0, sequence: 1, previous_success_at: null });
  });
  it('continues the loop in the same run: sequence + 1, same loop start, remembers the last success', () => {
    const prev = { run_id: '111', loop_started_at: T0, sequence: 4, last_success_at: '2026-10-04T15:10:00Z' };
    expect(advanceLoop(prev, { runId: '111', nowIso: '2026-10-04T15:13:30Z' })).toEqual({ run_id: '111', loop_started_at: T0, sequence: 5, previous_success_at: '2026-10-04T15:10:00Z' });
  });
  it('a new run id is a new loop (the dispatch chain handed over): sequence restarts at 1', () => {
    const prev = { run_id: '111', loop_started_at: T0, sequence: 16, last_success_at: '2026-10-04T15:55:00Z' };
    expect(advanceLoop(prev, { runId: '222', nowIso: '2026-10-04T16:00:00Z' })).toMatchObject({ run_id: '222', loop_started_at: '2026-10-04T16:00:00Z', sequence: 1, previous_success_at: null });
  });
  it('malformed state never claims continuity', () => {
    for (const prev of [undefined, 'x', 7, {}, { run_id: '111' }, { run_id: '111', sequence: 'a', loop_started_at: T0 }, { run_id: '111', sequence: 0, loop_started_at: T0 }]) {
      expect(advanceLoop(prev, { runId: '111', nowIso: T0 }).sequence).toBe(1);
    }
  });
});

describe('buildHeartbeat: the health.json shape', () => {
  const loop = { run_id: '111', loop_started_at: T0, sequence: 3, previous_success_at: '2026-10-04T15:06:50Z' };
  const hb = buildHeartbeat({
    loop, runAttempt: '1', generatedAt: '2026-10-04T15:10:12Z', cycleStartedAt: '2026-10-04T15:10:00Z', cycleFinishedAt: '2026-10-04T15:10:13Z',
    sweepDurationMs: 11_800, requests: 71, errors: ['series KXFOO: HTTP 500'], sportStatus: SPORT_STATUS, status: 'CURRENT_SLATE', excludedSports: ['NHL'],
  });

  it('has exactly the documented fields', () => {
    expect(hb).toEqual({
      schema: 'sift.live_quotes.health.v1',
      generated_at: '2026-10-04T15:10:12Z',
      run_id: '111',
      run_attempt: '1',
      loop_started_at: T0,
      sequence: 3,
      cycle_started_at: '2026-10-04T15:10:00Z',
      cycle_finished_at: '2026-10-04T15:10:13Z',
      sweep_duration_ms: 11_800,
      requests: 71,
      errors: 1,
      status: 'CURRENT_SLATE',
      excluded_sports: ['NHL'],
      sports: [
        { sport: 'NFL', status: 'CURRENT_SLATE', published: true, games: 1, markets: 2 },
        { sport: 'NHL', status: 'UNREADABLE_PUBLICATION', published: false, games: 0, markets: null },
      ],
      last_success_at: '2026-10-04T15:10:13Z',
      previous_success_at: '2026-10-04T15:06:50Z',
    });
    expect(HEALTH_SCHEMA).toBe('sift.live_quotes.health.v1');
  });
  it('is JSON-serialisable and every timestamp parses', () => {
    const round = JSON.parse(JSON.stringify(hb));
    for (const k of ['generated_at', 'loop_started_at', 'cycle_started_at', 'cycle_finished_at', 'last_success_at']) expect(Date.parse(round[k])).not.toBeNaN();
  });
});

describe('file addition only: the feed itself is unchanged', () => {
  const games = [{ key: '26OCT04NEBUF', sport: 'NFL', event_id: 'e1', tickers: ['KXNFLGAME-26OCT04NEBUF-BUF'], series: ['KXNFLGAME'] }];
  const byKey = new Map([['26OCT04NEBUF', new Map([['KXNFLGAME-26OCT04NEBUF-BUF', { ticker: 'KXNFLGAME-26OCT04NEBUF-BUF', yes_bid_dollars: '0.6400', observed_at: '2026-10-04T15:00:06Z' }]])]]);

  it('buildFiles never emits health.json and keeps both schemas', () => {
    const files = buildFiles(games, byKey, { generatedAt: '2026-10-04T15:00:12Z', requests: 3 });
    expect([...files.keys()].sort()).toEqual(['games/26OCT04NEBUF.json', 'index.json']);
    expect(files.get('index.json')!.schema).toBe(INDEX_SCHEMA);
    expect(files.get('games/26OCT04NEBUF.json')!.schema).toBe(FEED_SCHEMA);
    expect(FEED_SCHEMA).toBe('sift.live_quotes.v1');
  });
});

describe('the real publisher script, end to end (stubbed network and clock)', () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const tmp = () => {
    const d = mkdtempSync(join(tmpdir(), 'sift-hb-'));
    dirs.push(d);
    return d;
  };

  function cycle(root: string, runId: string, out: string) {
    execFileSync(process.execPath, ['--import', join(__dirname, 'support', 'publisher-preload.mjs'), join(__dirname, '..', '..', 'scripts', 'publish-live-quotes.mjs'), out], {
      env: { PATH: process.env.PATH ?? '', TEST_NFL_SNAPSHOT_DIR: SNAPSHOT_DIR, GITHUB_RUN_ID: runId, GITHUB_RUN_ATTEMPT: '1', SIFT_HEARTBEAT_STATE: join(root, 'state.json') },
      stdio: 'pipe',
    });
  }
  const read = (out: string, f: string) => JSON.parse(readFileSync(join(out, f), 'utf8'));

  it('writes health.json beside index.json each cycle, advancing the sequence within a run and restarting on a new run', () => {
    const root = tmp();
    const out1 = join(root, 'feed');
    cycle(root, '111', out1);
    expect(existsSync(join(out1, 'health.json'))).toBe(true);
    const h1 = read(out1, 'health.json');
    const i1 = read(out1, 'index.json');
    expect(h1).toMatchObject({ schema: HEALTH_SCHEMA, run_id: '111', run_attempt: '1', sequence: 1, previous_success_at: null, generated_at: i1.generated_at, status: i1.status, errors: 0 });
    expect(h1.requests).toBe(i1.requests);
    expect(h1.requests).toBeGreaterThan(0);
    expect(h1.sweep_duration_ms).toBeGreaterThan(0);
    expect(Date.parse(h1.cycle_finished_at)).toBeGreaterThanOrEqual(Date.parse(h1.cycle_started_at));
    expect(h1.sports.map((s: { sport: string }) => s.sport)).toEqual(['NFL', 'NHL', 'MLB']);
    expect(h1.sports.find((s: { sport: string }) => s.sport === 'NFL')).toMatchObject({ published: true });
    expect(h1.excluded_sports).toEqual(['NHL', 'MLB']);

    // The next cycle of the same run (the workflow wipes the feed tree between cycles).
    rmSync(out1, { recursive: true, force: true });
    const out2 = join(root, 'feed');
    cycle(root, '111', out2);
    const h2 = read(out2, 'health.json');
    expect(h2).toMatchObject({ run_id: '111', sequence: 2, loop_started_at: h1.loop_started_at, previous_success_at: h1.last_success_at });

    // The dispatch chain hands over to a new run: a new loop.
    rmSync(out2, { recursive: true, force: true });
    cycle(root, '222', out2);
    expect(read(out2, 'health.json')).toMatchObject({ run_id: '222', sequence: 1, previous_success_at: null });
  });

  it('adds only health.json: everything else in the feed tree is what the publisher always wrote', () => {
    const root = tmp();
    const out = join(root, 'feed');
    cycle(root, '333', out);
    const files = (function walk(d: string, base = ''): string[] {
      return readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name), `${base}${e.name}/`) : [`${base}${e.name}`]));
    })(out).sort();
    expect(files.filter((f) => f !== 'health.json' && !f.startsWith('games/'))).toEqual(['README.md', 'index.json', 'relay/vercel.json']);
    expect(files).toContain('health.json');
    // The Vercel project sift-quote-relay is connected to this repository: without relay/vercel.json (Git deployments off) every push to the data
    // branch is a failed Vercel deployment, and one push every 3 minutes exhausts the plan's daily deployment limit, which blocks main's too.
    expect(read(out, 'relay/vercel.json')).toMatchObject({ git: { deploymentEnabled: false } });
    expect(files).toContain('games/26OCT04NEBUF.json');
    // every game file listed by index.json exists, and nothing else is under games/
    expect(files.filter((f) => f.startsWith('games/')).sort()).toEqual(read(out, 'index.json').games.map((g: { file: string }) => g.file).sort());
    expect(read(out, 'index.json').schema).toBe(INDEX_SCHEMA);
    expect(read(out, 'games/26OCT04NEBUF.json').schema).toBe(FEED_SCHEMA);
    // index.json does not mention the heartbeat: consumers that ignore unknown files see no difference.
    expect(JSON.stringify(read(out, 'index.json'))).not.toContain('health');
  });

  it('a corrupt state file starts a new loop instead of failing the cycle', () => {
    const root = tmp();
    writeFileSync(join(root, 'state.json'), '{not json');
    const out = join(root, 'feed');
    cycle(root, '444', out);
    expect(read(out, 'health.json')).toMatchObject({ run_id: '444', sequence: 1 });
  });
});
