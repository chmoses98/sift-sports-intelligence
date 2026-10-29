// The staged CI drill (scripts/quote-monitor-drill.mjs --ci, run by .github/workflows/quote-drill.yml on a throwaway
// branch). Here the "real" relay and feed are a loopback fake, so the logic of every stage is proved without the network:
// what each stage expects, that a mismatch fails the run and NAMES the stage, that a forced failure which unexpectedly
// passes is caught, and that nothing in the output can become a real workflow annotation unless a stage mismatched.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SCENARIOS, STAGE3_SCENARIOS, STAGE_NAMES, neutralise, runCiDrill, startFakeWorld } from '../../scripts/quote-monitor-drill.mjs';

type World = Awaited<ReturnType<typeof startFakeWorld>>;
let world: World | null = null;
afterEach(async () => {
  await world?.close();
  world = null;
});

const fastHeartbeat: Record<string, string> = { SIFT_MONITOR_POLL_S: '0.2', SIFT_MONITOR_SEQUENCE_WINDOW_S: '3', SIFT_MONITOR_RETRY_DELAY_S: '0.3' };
async function fakeReal(scenario: keyof typeof SCENARIOS | typeof SCENARIOS[keyof typeof SCENARIOS]) {
  world = await startFakeWorld();
  world.state.scenario = typeof scenario === 'string' ? SCENARIOS[scenario] : scenario;
  return { SIFT_FEED_URL: `${world.base}/feed`, SIFT_QUOTE_RELAY_URL: `${world.base}/relay`, GITHUB_REPOSITORY: 'owner/repo' };
}
const collect = () => {
  const lines: string[] = [];
  return { lines, log: (l: string) => lines.push(...String(l).split('\n')), text: () => lines.join('\n') };
};
const annotations = (lines: string[]) => lines.filter((l) => /^::(error|warning)/.test(l));
const notices = (lines: string[]) => lines.filter((l) => /^::notice title=Quote drill stage/.test(l));

describe('the staged CI drill (loopback stand-in for the real relay and feed)', () => {
  it('lists five stages, in the order the brief gives', () => {
    expect(Object.keys(STAGE_NAMES)).toEqual(['1', '2', '3', '4', '5']);
    expect(STAGE_NAMES[1]).toMatch(/healthy.*real relay.*real feed/);
    expect(STAGE_NAMES[2]).toMatch(/forced outage.*actual relay URL path/);
    expect(STAGE_NAMES[3]).toMatch(/429.*empty.*delisted.*closed.*partial/);
    expect(STAGE_NAMES[4]).toMatch(/recovery/);
    expect(STAGE_NAMES[5]).toMatch(/heartbeat/);
    for (const n of STAGE3_SCENARIOS) expect(SCENARIOS, n).toHaveProperty(n);
  });

  it('every stage matches while the feed heartbeat is unpublished: HEARTBEAT_NOT_PUBLISHED is the distinct non-failing state, and only the strict switch fails on it', async () => {
    const env = await fakeReal({ ...SCENARIOS.healthy, heartbeat: 'missing' });
    const out = collect();
    const r = await runCiDrill({ env, log: out.log, tune: fastHeartbeat, summaryFile: undefined });
    expect(r.failedStages).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.stages.map((s) => [s.stage, s.ok])).toEqual([[1, true], [2, true], [3, true], [4, true], [5, true]]);
    const text = out.text();
    expect(text).toMatch(/DRILL PASSED: all 5 stage\(s\) matched/);
    // stage 1: the relay was actually exercised
    expect(text).toMatch(/\[PASS\] Relay quote batch: HTTP 200, 3 of 3 requested markets/);
    // stage 2: each forced failure has its own diagnosis
    expect(text).toMatch(/relay unreachable.*the same on the single retry/);
    expect(text).toMatch(/relay answered HTTP 404/);
    expect(text).toMatch(/is \d+s old; limit 0s/);
    expect(text).toMatch(/\[FAIL\] Feed generated_at is recent: .* limit 1s/);
    // stage 3: the loopback relay scenarios
    expect(text).toMatch(/GAME_OVER: HTTP 200 with a current observation/);
    expect(text).toMatch(/HTTP 200, 2 of 3 requested markets/);
    expect(text).toMatch(/relay answered HTTP 429 \(Retry-After 1\)/);
    // stage 5: the distinct state, then the strict switch
    expect(text).toMatch(/heartbeat state on the real feed branch: HEARTBEAT_NOT_PUBLISHED/);
    expect(text).toMatch(/RESULT: PASS \(heartbeat not published yet: not a failure\)/);
    expect(text).toMatch(/SIFT_MONITOR_REQUIRE_HEARTBEAT is set/);
    // a matching drill emits no error or warning: forced failures are neutralised; one informational notice per stage
    expect(annotations(out.lines)).toEqual([]);
    expect(notices(out.lines)).toHaveLength(5);
    expect(notices(out.lines).every((l) => /matched \(/.test(l) && !l.includes('\n'))).toBe(true);
    expect(text).toMatch(/\[annotation, not emitted by the drill: error\]/);
  }, 240_000);

  it('a published heartbeat is checked for real (sequence advances); the stall and missing-heartbeat detection is proved on the loopback too', async () => {
    const env = await fakeReal('healthy');
    const out = collect();
    const r = await runCiDrill({ env, stages: [5], log: out.log, tune: fastHeartbeat, summaryFile: undefined });
    expect(r.ok).toBe(true);
    const text = out.text();
    expect(text).toMatch(/heartbeat state on the real feed branch: PUBLISHED/);
    expect(text).toMatch(/\[PASS\] Heartbeat sequence advances: run 9001 sequence/);
    expect(text).toMatch(/\[FAIL\] Heartbeat sequence advances: run 9001 is still at sequence/); // loopback: heartbeat-stalled
    expect(text).toMatch(/loopback: heartbeat-missing-required/);
  }, 60_000);

  it('a genuinely stale real feed fails stage 1 (and the real half of stage 4) with the feed named, but not the heartbeat stage', async () => {
    const env = await fakeReal({ ...SCENARIOS['feed-stale'], heartbeat: 'missing' });
    const out = collect();
    const r = await runCiDrill({ env, stages: [1, 5], log: out.log, tune: fastHeartbeat, summaryFile: undefined });
    expect(r.failedStages).toEqual([1]);
    expect(out.text()).toMatch(/\[MISMATCH\] healthy run, real relay and feed => FAIL \(FAIL\);.*failing checks: Feed generated_at is recent: newest generated_at .* \d+s old; limit 600s/);
    expect(out.text()).toMatch(/\[MATCH\] heartbeat on the real feed branch.*HEARTBEAT_NOT_PUBLISHED/);
  }, 120_000);

  it('a mismatch fails the drill and NAMES the stage (real error annotation, exit-worthy result)', async () => {
    const env = await fakeReal('always503' as never);
    // the "real" relay is down: stage 1 expects healthy and must fail by name
    world!.state.scenario = SCENARIOS.outage;
    const out = collect();
    const r = await runCiDrill({ env, stages: [1], log: out.log, tune: fastHeartbeat, summaryFile: undefined });
    expect(r.ok).toBe(false);
    expect(r.failedStages).toEqual([1]);
    expect(out.text()).toMatch(/DRILL FAILED: stage\(s\) 1 \(healthy run against the real relay and the real feed\) did not match/);
    expect(annotations(out.lines)).toHaveLength(1);
    expect(annotations(out.lines)[0]).toMatch(/^::error title=Quote drill: stage 1 did not match \(healthy run against the real relay and the real feed\)::/);
  }, 60_000);

  it('only the stages that failed are named, and the others still run to completion', async () => {
    const env = await fakeReal(SCENARIOS.outage);
    const out = collect();
    const r = await runCiDrill({ env, stages: [1, 4], log: out.log, tune: fastHeartbeat, summaryFile: undefined });
    // stage 1 (healthy expected) fails; stage 4's loopback halves pass but its real-relay run fails too
    expect(r.failedStages).toEqual([1, 4]);
    const named = annotations(out.lines).map((l) => /stage (\d)/.exec(l)![1]);
    expect(named).toEqual(['1', '4']);
  }, 120_000);

  it('an unset SIFT_QUOTE_RELAY_URL variable fails stage 1 loudly instead of passing without exercising the relay', async () => {
    const env = await fakeReal('healthy');
    const out = collect();
    const r = await runCiDrill({ env: { ...env, SIFT_QUOTE_RELAY_URL: '' }, stages: [1], log: out.log, tune: fastHeartbeat, summaryFile: undefined });
    expect(r.ok).toBe(false);
    expect(out.text()).toMatch(/SIFT_QUOTE_RELAY_URL repository variable is not set/);
    expect(out.text()).toMatch(/expected the relay check to be pass, got skip/);
  }, 60_000);

  it('a forced failure that unexpectedly PASSES is caught: stage 2 mismatches when the unroutable host answers', async () => {
    const env = await fakeReal({ ...SCENARIOS.healthy, heartbeat: 'missing' });
    const base = world!.base;
    // a "network" in which the bogus hosts are reachable and healthy: the monitor then passes where it must fail
    const fetchImpl = (url: string, init?: RequestInit) => fetch(url.replace(/^https:\/\/(sift-quote-relay-drill-unroutable\.invalid|192\.0\.2\.1)/, `${base}/relay-ignored`).replace(`${base}/relay-ignored`, `${base}/relay`), init);
    const out = collect();
    const r = await runCiDrill({ env, stages: [2], log: out.log, deps: { fetchImpl: fetchImpl as typeof fetch }, tune: fastHeartbeat, summaryFile: undefined });
    expect(r.ok).toBe(false);
    expect(r.failedStages).toEqual([2]);
    const bad = r.stages[0].items.filter((i: { ok: boolean }) => !i.ok).map((i: { name: string }) => i.name);
    expect(bad).toEqual(['unroutable host (DNS cannot resolve it)', 'black-holed address (TEST-NET-1, nothing answers)']);
  }, 120_000);

  it('neutralise() defuses every workflow command the monitor prints', () => {
    const raw = '::error title=x::boom\n::notice title=y::z\n::warning::w\n::group::g\n::endgroup::\n::add-mask::secret\nplain ::error mid-line';
    const safe = neutralise(raw);
    expect(safe.split('\n').filter((l) => l.startsWith('::'))).toEqual([]);
    expect(safe).toContain('plain ::error mid-line'); // only a line-leading command is a command
  });

  it('writes a markdown step summary with one row per item when GITHUB_STEP_SUMMARY is set', async () => {
    const { mkdtempSync, readFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'drill-'));
    const file = join(dir, 'summary.md');
    const env = await fakeReal('healthy');
    const out = collect();
    await runCiDrill({ env, stages: [1], log: out.log, tune: fastHeartbeat, summaryFile: file });
    const md = readFileSync(file, 'utf8');
    expect(md).toMatch(/### Quote CI drill/);
    expect(md).toMatch(/\| 1\. healthy run against the real relay and the real feed \| healthy run, real relay and feed \|/);
    expect(md).toMatch(/\*\*DRILL PASSED: all 1 stage\(s\) matched/);
  }, 60_000);

  it('the --ci command line: exit 0 on a clean drill (stage 3 needs no network), exit 1 naming the stage otherwise', async () => {
    const script = join(__dirname, '..', '..', 'scripts', 'quote-monitor-drill.mjs');
    const run = (args: string[], env: Record<string, string>) =>
      new Promise<{ code: number | null; out: string }>((resolve) => {
        const p = spawn(process.execPath, [script, ...args], { env: { PATH: process.env.PATH ?? '', ...env } });
        let out = '';
        p.stdout.on('data', (d) => (out += d));
        p.stderr.on('data', (d) => (out += d));
        p.on('close', (code) => resolve({ code, out }));
      });
    const ok = await run(['--ci', '--stages=3'], {});
    expect(ok.code).toBe(0);
    expect(ok.out).toMatch(/::group::Stage 3: forced 429/);
    expect(ok.out).toMatch(/DRILL PASSED: all 1 stage\(s\) matched/);
    expect(ok.out).not.toMatch(/^::error/m);
    const bad = await run(['--ci', '--stages=1'], { SIFT_FEED_URL: 'http://127.0.0.1:9/feed' });
    expect(bad.code).toBe(1);
    expect(bad.out).toMatch(/::error title=Quote drill: stage 1 did not match/);
  }, 120_000);
});
