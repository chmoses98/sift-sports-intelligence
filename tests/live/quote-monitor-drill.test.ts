// The local failure-injection drill (scripts/quote-monitor-drill.mjs): a fake feed and a fake relay on 127.0.0.1, the
// real monitor pointed at them through its environment overrides. Run here as real child processes so the exact
// command in docs/quote-track/CI_DRILL.md is the one under test.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runMonitor } from '../../scripts/quote-monitor.mjs';

const SCRIPT = join(__dirname, '..', '..', 'scripts', 'quote-monitor-drill.mjs');
const drill = (args: string[]) =>
  new Promise<{ code: number | null; out: string }>((resolve) => {
    const p = spawn(process.execPath, [SCRIPT, ...args], { env: { PATH: process.env.PATH ?? '' } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out }));
  });

describe('quote monitor drill (local, loopback only)', () => {
  it('lists the scenarios and what the monitor must conclude for each', async () => {
    const r = await drill(['--list']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/healthy\s+expects PASS/);
    expect(r.out).toMatch(/outage\s+expects FAIL/);
    expect(r.out).toMatch(/heartbeat-missing\s+expects PASS \(PASS_HEARTBEAT_NOT_PUBLISHED\)/);
  });

  it('outage followed by recovery: FAIL on the first run, PASS on the very next, nothing left over', async () => {
    const r = await drill(['outage', 'healthy']);
    expect(r.code).toBe(0);
    const [outage, healthy] = r.out.split('=== scenario: healthy');
    expect(outage).toMatch(/\[FAIL\] Relay quote batch: relay answered HTTP 503.*the same on the single retry/);
    expect(outage).toMatch(/RESULT: FAIL/);
    expect(healthy).toMatch(/RESULT: PASS/);
    expect(healthy).not.toMatch(/FAIL|::error|::notice|retry/);
    expect(r.out).toMatch(/DRILL PASSED: 2 of 2 scenarios matched/);
  }, 60_000);

  it('a transient relay failure inside a run is retried once and passes with a notice', async () => {
    const r = await drill(['relay-flaky', 'relay-429-once']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/recovered on the single retry after 0s \(first attempt: relay answered HTTP 503/);
    expect(r.out).toMatch(/::notice title=Quote monitor: transient failure recovered::/);
    expect(r.out).not.toMatch(/::error/);
  }, 60_000);

  it('empty and delisted markets: tolerated while another game answers, a failure when none does', async () => {
    const r = await drill(['relay-delisted-game', 'all-games-delisted', 'no-open-contracts']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/1 other game\(s\) came back empty and are treated as delisted or closed/);
    expect(r.out).toMatch(/no markets for the 2 game\(s\) tried/);
    expect(r.out).toMatch(/\[SKIP\] Relay quote batch: skipped: the feed lists no open contract/);
  }, 60_000);

  it('every scenario matches, and nothing outside 127.0.0.1 is contacted', async () => {
    const r = await drill([]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/DRILL PASSED: 15 of 15 scenarios matched/);
    expect(r.out).not.toMatch(/https:\/\//);
    expect(r.out).not.toMatch(/MISMATCH/);
  }, 120_000);

  it('the monitor accepts a plain-http relay URL only for a loopback address', async () => {
    const env = { SIFT_FEED_URL: 'https://feed.invalid/live-quotes', SIFT_QUOTE_RELAY_URL: 'http://relay.example.com/kalshi' };
    const fetchImpl = async (url: string) =>
      new Response(JSON.stringify(url.endsWith('index.json') ? { schema: 'sift.live_quotes.index.v1', generated_at: new Date().toISOString(), games: [] } : {}), { status: url.endsWith('index.json') ? 200 : 404 });
    const r = await runMonitor({ env, fetchImpl, sleep: async () => {} });
    expect(r.checks.find((c) => c.id === 'relay')).toMatchObject({ status: 'fail' });
    // with no game file there is nothing to ask a loopback relay, so it is skipped rather than rejected
    const r2 = await runMonitor({ env: { ...env, SIFT_QUOTE_RELAY_URL: 'http://127.0.0.1:9/relay' }, fetchImpl, sleep: async () => {} });
    expect(r2.checks.find((c) => c.id === 'relay')?.status).toBe('skip');
  });
});
