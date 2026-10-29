// @vitest-environment node
// The live-quote loop's hand-over and its freshest-wins publish guard (scripts/live-quotes/{handover,guard,loop}.mjs).
// Real git (a local bare repository stands in for GitHub) for the guard; a fake clock and fake GitHub for the loop.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { guardedPush, readRemote, type RemoteTip } from '../../scripts/live-quotes/guard.mjs';
import { HANDOVER, cadenceWaitMs, decide, newestWins, nextSlot, successorOf, type RunInfo } from '../../scripts/live-quotes/handover.mjs';
import { makeDispatch, runLoop } from '../../scripts/live-quotes/loop.mjs';

const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

describe('freshest wins (pure rules)', () => {
  it('pushes only a strictly newer feed', () => {
    expect(newestWins('2026-10-27T19:10:00Z', '2026-10-27T19:07:00Z')).toBe(true);
    expect(newestWins('2026-10-27T19:07:00Z', '2026-10-27T19:07:00Z')).toBe(false); // equal: keep the branch
    expect(newestWins('2026-10-27T19:04:00Z', '2026-10-27T19:07:00Z')).toBe(false); // older: never
  });
  it('never blocks on an unreadable branch time, never publishes a feed without a time', () => {
    expect(newestWins('2026-10-27T19:07:00Z', null)).toBe(true);
    expect(newestWins('2026-10-27T19:07:00Z', 'garbage')).toBe(true);
    expect(newestWins(null, '2026-10-27T19:07:00Z')).toBe(false);
    expect(newestWins('garbage', null)).toBe(false);
  });
  it('shares one cadence with an overlapping publisher', () => {
    const now = Date.parse('2026-10-27T19:10:00Z');
    expect(cadenceWaitMs('2026-10-27T19:07:00Z', now)).toBe(0); // 180 s old: go
    expect(cadenceWaitMs('2026-10-27T19:07:30Z', now)).toBe(0); // exactly 150 s: go
    expect(cadenceWaitMs('2026-10-27T19:09:00Z', now)).toBe(90_000); // 60 s old: wait 90 s
    expect(cadenceWaitMs(null, now)).toBe(0);
    expect(cadenceWaitMs('2026-10-27T19:11:00Z', now)).toBe(HANDOVER.minAgeMs); // remote clock ahead: bounded
  });
});

describe('who is my successor', () => {
  const loop = (id: number, status: string, extra: Partial<RunInfo> = {}): RunInfo => ({ id, event: 'workflow_dispatch', status, display_title: 'Live quotes loop b', ...extra });
  it('counts only younger, active, dispatched loop runs', () => {
    const runs: RunInfo[] = [
      loop(90, 'in_progress'), // older: my predecessor
      loop(100, 'in_progress'), // me
      loop(110, 'queued'), // my successor
      loop(120, 'completed'), // finished: ignored
      { id: 130, event: 'schedule', status: 'queued', display_title: 'Live quotes watchdog' }, // a watchdog is never a successor
      { id: 140, event: 'workflow_dispatch', status: 'queued', display_title: 'something else' },
    ];
    expect(successorOf(runs, 100)).toEqual({ exists: true, started: false, ids: [110] });
    expect(successorOf([...runs, loop(115, 'in_progress')], 100)).toEqual({ exists: true, started: true, ids: [110, 115] });
    expect(successorOf(runs.filter((r) => r.id !== 110), 100).exists).toBe(false);
    expect(successorOf(null, 100).exists).toBe(false);
  });
  it('alternates the concurrency slot', () => {
    expect(nextSlot('a')).toBe('b');
    expect(nextSlot('b')).toBe('a');
    expect(nextSlot('w')).toBe('a'); // a watchdog restart hands over to a
    expect(nextSlot(undefined)).toBe('a');
  });
});

describe('decide', () => {
  const none = { exists: false, started: false, ids: [] as number[] };
  const queued = { exists: true, started: false, ids: [2] };
  const running = { exists: true, started: true, ids: [2] };
  it('publishes without looking before the dispatch point', () => {
    expect(decide({ elapsedMin: 44.9, successor: null, dispatched: false, handedOver: false }).action).toBe('publish');
  });
  it('dispatches once at the dispatch point', () => {
    expect(decide({ elapsedMin: 45, successor: none, dispatched: false, handedOver: false }).action).toBe('dispatch');
    expect(decide({ elapsedMin: 46, successor: none, dispatched: true, handedOver: false }).action).toBe('publish');
  });
  it('does not dispatch a second successor when a younger run exists', () => {
    expect(decide({ elapsedMin: 50, successor: queued, dispatched: false, handedOver: false }).action).toBe('publish');
  });
  it('keeps publishing while the successor is queued, however long (until the cap)', () => {
    expect(decide({ elapsedMin: 100, successor: queued, dispatched: true, handedOver: false }).action).toBe('publish');
    expect(decide({ elapsedMin: HANDOVER.capMin - 0.1, successor: queued, dispatched: true, handedOver: false }).action).toBe('publish');
    expect(decide({ elapsedMin: HANDOVER.capMin, successor: queued, dispatched: true, handedOver: false }).action).toBe('finish');
  });
  it('finishes only when the successor runs AND its publication is on the branch', () => {
    expect(decide({ elapsedMin: 60, successor: running, dispatched: true, handedOver: false }).action).toBe('publish');
    expect(decide({ elapsedMin: 60, successor: running, dispatched: true, handedOver: true }).action).toBe('finish');
  });
  it('dispatches to be safe when the run list cannot be read', () => {
    expect(decide({ elapsedMin: 50, successor: null, dispatched: false, handedOver: false }).action).toBe('dispatch');
    expect(decide({ elapsedMin: 50, successor: null, dispatched: true, handedOver: false }).action).toBe('publish');
  });
  it('the job timeout sits above the cap', () => {
    const yml = readFileSync(join(__dirname, '../../.github/workflows/live-quotes.yml'), 'utf8');
    const timeout = Number(/timeout-minutes:\s*(\d+)/.exec(yml)?.[1]);
    expect(timeout).toBeGreaterThanOrEqual(HANDOVER.capMin + 5);
    expect(yml).toMatch(/cancel-in-progress:\s*false/);
    expect(yml).toMatch(/group:.*inputs\.slot/);
    expect(yml).toMatch(/- name: Make sure a successor exists\s+if: always\(\)/);
  });
});

// ----------------------------------------------------------------------------------------------------------------------
describe('the publish guard against a real git remote', () => {
  let root: string;
  let remoteDir: string;
  let probeDir: string;
  let n = 0;
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

  /** A feed tree as the publisher writes it, generated at `generatedAt`. */
  function feed(generatedAt: string, game = 'GAME1') {
    const dir = join(root, `feed-${n++}`);
    mkdirSync(join(dir, 'games'), { recursive: true });
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ schema: 'sift.live_quotes.index.v1', generated_at: generatedAt, games: [{ key: game }] }));
    writeFileSync(join(dir, 'games', `${game}.json`), JSON.stringify({ schema: 'sift.live_quotes.v1', game_key: game, generated_at: generatedAt, markets: [] }));
    writeFileSync(join(dir, 'README.md'), '# Sift live-quote feed\n');
    return dir;
  }
  const tip = () => git(remoteDir, 'rev-parse', 'refs/heads/live-quotes');
  const tipGeneratedAt = () => JSON.parse(git(remoteDir, 'show', 'refs/heads/live-quotes:index.json')).generated_at as string;
  const push = (generatedAt: string, o: { remote?: RemoteTip | null } = {}) => guardedPush({ dir: feed(generatedAt), url: remoteDir, probeDir, message: `live quotes ${generatedAt}`, ...o });

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'live-quotes-guard-'));
    probeDir = join(root, 'probe.git');
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const fresh = () => {
    remoteDir = join(root, `remote-${n++}.git`);
    git(root, 'init', '-q', '--bare', remoteDir);
  };

  it('creates the branch as ONE orphan commit holding the whole feed tree', async () => {
    fresh();
    expect(await readRemote({ probeDir, url: remoteDir })).toBeNull();
    expect(await push('2026-10-27T19:00:00Z')).toMatchObject({ pushed: true });
    expect(git(remoteDir, 'rev-list', '--count', 'refs/heads/live-quotes')).toBe('1');
    expect(git(remoteDir, 'ls-tree', '-r', '--name-only', 'refs/heads/live-quotes').split('\n').sort()).toEqual(['README.md', 'games/GAME1.json', 'index.json']);
    expect(git(remoteDir, 'log', '-1', '--format=%s', 'refs/heads/live-quotes')).toBe('live quotes 2026-10-27T19:00:00Z');
  });

  it('a newer feed replaces it and the branch keeps no history', async () => {
    fresh();
    await push('2026-10-27T19:00:00Z');
    const before = tip();
    expect(await push('2026-10-27T19:03:00Z')).toMatchObject({ pushed: true });
    expect(tip()).not.toBe(before);
    expect(tipGeneratedAt()).toBe('2026-10-27T19:03:00Z');
    expect(git(remoteDir, 'rev-list', '--count', 'refs/heads/live-quotes')).toBe('1');
  });

  it('an OLDER feed arriving later never overwrites a newer one', async () => {
    fresh();
    await push('2026-10-27T19:10:00Z');
    const newer = tip();
    const res = await push('2026-10-27T19:07:00Z');
    expect(res).toMatchObject({ pushed: false, reason: 'superseded' });
    expect(tip()).toBe(newer);
    expect(tipGeneratedAt()).toBe('2026-10-27T19:10:00Z');
  });

  it('an equal generated_at leaves the branch alone', async () => {
    fresh();
    await push('2026-10-27T19:10:00Z', {});
    const t = tip();
    expect(await push('2026-10-27T19:10:00Z')).toMatchObject({ pushed: false });
    expect(tip()).toBe(t);
  });

  it('a stale read cannot clobber a newer push: the lease rejects it and the retry decides again (older loses)', async () => {
    fresh();
    await push('2026-10-27T19:00:00Z');
    const stale = await readRemote({ probeDir, url: remoteDir }); // publisher B reads the tip ...
    await push('2026-10-27T19:10:00Z'); // ... publisher C pushes a newer feed ...
    const res = await push('2026-10-27T19:05:00Z', { remote: stale }); // ... then B pushes with its stale tip
    expect(res).toMatchObject({ pushed: false, reason: 'superseded', attempts: 2 });
    expect(tipGeneratedAt()).toBe('2026-10-27T19:10:00Z');
  });

  it('a stale read of an OLDER tip still lets a newer feed through after the retry', async () => {
    fresh();
    await push('2026-10-27T19:00:00Z');
    const stale = await readRemote({ probeDir, url: remoteDir });
    await push('2026-10-27T19:10:00Z');
    const res = await push('2026-10-27T19:12:00Z', { remote: stale });
    expect(res).toMatchObject({ pushed: true, attempts: 2 });
    expect(tipGeneratedAt()).toBe('2026-10-27T19:12:00Z');
  });

  it('six concurrent publishers in any order: the branch ends at the newest feed and only ever moves forward', async () => {
    fresh();
    await push('2026-10-27T19:00:00Z');
    const times = [3, 1, 5, 2, 6, 4].map((m) => `2026-10-27T19:0${m}:00Z`);
    const seen: string[] = [];
    let stop = false;
    const watcher = (async () => {
      while (!stop) {
        const g = tipGeneratedAt();
        if (seen[seen.length - 1] !== g) seen.push(g);
        await new Promise((r) => setTimeout(r, 5));
      }
    })();
    // each publisher is its own process in production, so each has its own probe repository; the lease is what serialises them
    const results = await Promise.all(times.map((t, i) => guardedPush({ dir: feed(t), url: remoteDir, probeDir: join(root, `probe-${n}-${i}.git`), message: `live quotes ${t}`, attempts: 12 })));
    expect(results.filter((r) => r.pushed).length).toBeGreaterThanOrEqual(1);
    stop = true;
    await watcher;
    expect(tipGeneratedAt()).toBe('2026-10-27T19:06:00Z');
    const sorted = [...seen].sort();
    expect(seen).toEqual(sorted); // never observed going backwards
  });
});

// ----------------------------------------------------------------------------------------------------------------------
describe('the loop hand-over on a fake clock', () => {
  /** A fake GitHub + branch. The "successor" (another publisher) starts at `successorStartsMin` after the job began. */
  function world(opts: { successorStartsMin: number | null; listFails?: boolean; dispatchFailures?: number; successorPublishes?: boolean }) {
    const t0 = Date.parse('2026-10-27T19:00:00Z');
    let clock = t0;
    const pushes: number[] = []; // times at which the branch received a feed (this job or the successor)
    let branch: RemoteTip | null = null;
    const dispatches: { at: number; slot: string }[] = [];
    let failures = opts.dispatchFailures ?? 0;
    let dispatched = false;
    const setBranch = (g: string) => {
      branch = { sha: `sha-${g}`, generatedAt: g };
      pushes.push(clock);
    };
    let nextOther = Infinity;
    const advance = (to: number) => {
      // the successor (another job) publishes on its own 3-minute cadence once it runs
      while (opts.successorStartsMin !== null && opts.successorPublishes !== false && nextOther <= to) {
        const save = clock;
        clock = nextOther;
        if (!branch || newestWins(iso(clock), branch.generatedAt)) setBranch(iso(clock));
        nextOther += 3 * MIN;
        clock = save;
      }
      clock = to;
    };
    if (opts.successorStartsMin !== null) nextOther = t0 + (opts.successorStartsMin + 0.5) * MIN;
    const deps = {
      now: () => clock,
      sleep: async (ms: number) => advance(clock + ms),
      log: () => undefined,
      publish: async (dir: string) => {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'index.json'), JSON.stringify({ generated_at: iso(clock) }));
        return true;
      },
      readRemote: async () => branch,
      push: async ({ dir }: { dir: string; remote?: RemoteTip | null; message: string }) => {
        const g = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')).generated_at as string;
        if (branch && !newestWins(g, branch.generatedAt)) return { pushed: false as const, remote: branch };
        setBranch(g);
        return { pushed: true as const };
      },
      listRuns: async (): Promise<RunInfo[]> => {
        if (opts.listFails) throw new Error('HTTP 502');
        const me: RunInfo = { id: 100, event: 'workflow_dispatch', status: 'in_progress', display_title: 'Live quotes loop a' };
        if (!dispatched) return [me];
        const running = opts.successorStartsMin !== null && clock >= t0 + opts.successorStartsMin * MIN;
        return [me, { id: 101, event: 'workflow_dispatch', status: running ? 'in_progress' : 'queued', display_title: 'Live quotes loop b' }];
      },
      dispatch: async (slot: string) => {
        if (failures > 0) {
          failures--;
          throw new Error('HTTP 500');
        }
        dispatched = true;
        dispatches.push({ at: (clock - t0) / MIN, slot });
      },
      workDir: join(mkdtempSync(join(tmpdir(), 'live-quotes-loop-')), 'feed'),
      runId: 100,
      slot: 'a',
    };
    const gaps = (fromMin: number, toMin: number) => {
      const ts = pushes.filter((p) => p >= t0 + fromMin * MIN && p <= t0 + toMin * MIN).sort((a, b) => a - b);
      return ts.slice(1).map((p, i) => (p - ts[i]) / MIN);
    };
    return { deps, pushes, dispatches, gaps, t0, now: () => clock };
  }

  it('a 69-minute queue wait for the successor does not stop the feed (the 2026-10-27 22:14 case)', async () => {
    const w = world({ successorStartsMin: 45 + 69 });
    const res = await runLoop(w.deps);
    expect(w.dispatches).toEqual([{ at: 45, slot: 'b' }]); // once, 45 minutes in, to the other slot
    expect((w.now() - w.t0) / MIN).toBeGreaterThanOrEqual(45 + 69); // it held on until the successor ran
    expect((w.now() - w.t0) / MIN).toBeLessThan(45 + 69 + 8);
    expect(res.reason).toMatch(/running and publishing/);
    expect(Math.max(...w.gaps(0, 45 + 69 + 6))).toBeLessThanOrEqual(3.1); // no gap in the feed, ever
  });

  it('with no queue wait, the overlap is only about one cycle', async () => {
    const w = world({ successorStartsMin: 45 });
    await runLoop(w.deps);
    expect((w.now() - w.t0) / MIN).toBeLessThan(45 + 7);
    expect(Math.max(...w.gaps(0, 50))).toBeLessThanOrEqual(3.1);
  });

  it('gives up waiting at the cap, with the successor still queued, and has dispatched exactly once', async () => {
    const w = world({ successorStartsMin: null });
    const res = await runLoop(w.deps);
    expect(res.reason).toMatch(/cap/);
    expect((w.now() - w.t0) / MIN).toBeGreaterThanOrEqual(HANDOVER.capMin);
    expect((w.now() - w.t0) / MIN).toBeLessThan(HANDOVER.capMin + 3.5);
    expect(w.dispatches).toHaveLength(1);
  });

  it('a successor that started but never publishes does not end the job early', async () => {
    const w = world({ successorStartsMin: 50, successorPublishes: false });
    const res = await runLoop(w.deps);
    expect(res.reason).toMatch(/cap/);
  });

  it('retries a failed dispatch every cycle and keeps publishing meanwhile', async () => {
    const w = world({ successorStartsMin: 60, dispatchFailures: 2 });
    await runLoop(w.deps);
    expect(w.dispatches.map((d) => d.at)).toEqual([51]); // 45 and 48 failed, 51 worked
    expect(Math.max(...w.gaps(0, 60))).toBeLessThanOrEqual(3.1);
  });

  it('dispatches (to be safe) when the run list cannot be read, then finishes at the cap', async () => {
    const w = world({ successorStartsMin: null, listFails: true });
    const res = await runLoop(w.deps);
    expect(w.dispatches).toHaveLength(1);
    expect(res.reason).toMatch(/cap/);
  });

  it('publishes about every 3 minutes (the Kalshi request rate is unchanged)', async () => {
    const w = world({ successorStartsMin: 45 });
    const res = await runLoop(w.deps);
    const perHour = (res.ok / ((w.now() - w.t0) / MIN)) * 60;
    expect(perHour).toBeGreaterThan(19);
    expect(perHour).toBeLessThan(22);
  });
});

describe('dispatching the successor', () => {
  const call = (status: number[]) => {
    const bodies: unknown[] = [];
    let i = 0;
    const fetchImpl = (async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return new Response(null, { status: status[i++] });
    }) as unknown as typeof fetch;
    return { bodies, dispatch: makeDispatch({ url: 'https://api.test/dispatches', headers: {}, fetchImpl }) };
  };
  it('sends ref main and the slot', async () => {
    const c = call([204]);
    await c.dispatch('b');
    expect(c.bodies).toEqual([{ ref: 'main', inputs: { slot: 'b' } }]);
  });
  it('after a roll-back of the workflow (no slot input: 422) dispatches again without inputs, so the chain survives', async () => {
    const c = call([422, 204]);
    await c.dispatch('b');
    expect(c.bodies).toEqual([{ ref: 'main', inputs: { slot: 'b' } }, { ref: 'main' }]);
  });
  it('reports any other failure', async () => {
    await expect(call([500]).dispatch('a')).rejects.toThrow(/HTTP 500/);
  });
});
