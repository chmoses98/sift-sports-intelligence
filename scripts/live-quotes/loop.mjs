#!/usr/bin/env node
// The live-quote loop driver (run by .github/workflows/live-quotes.yml).
//   node scripts/live-quotes/loop.mjs           publish every 3 minutes, hand over to a successor (see handover.mjs)
//   node scripts/live-quotes/loop.mjs ensure    last step of a job (also after failure/cancel): make sure a successor exists
//
// What a cycle does is what the workflow's old bash loop did: node scripts/publish-live-quotes.mjs <dir>, then replace the
// `live-quotes` branch with one orphan commit. Differences: the replacement is guarded (guard.mjs: freshest wins), the
// job dispatches its successor early and keeps publishing until the successor is publishing (handover.mjs), and the
// scheduled run is a watchdog that restarts the loop only when the feed is stale.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardedPush, readRemote } from './guard.mjs';
import { HANDOVER, activeLoops, cadenceWaitMs, decide, nextSlot, successorOf } from './handover.mjs';

const WORKFLOW = 'live-quotes.yml';
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * The loop, with every side effect injected (tests drive it with a fake clock and fake GitHub).
 * deps: now() ms, sleep(ms), log(s), publish(dir) -> Promise<boolean>, readRemote(), push({dir, remote, message}), listRuns(), dispatch(slot),
 *       workDir, runId, slot, cfg
 * Returns { ok, failed, superseded, dispatched, reason }.
 */
export async function runLoop(deps) {
  const { now, sleep, log, cfg = HANDOVER, runId, slot } = deps;
  const started = now();
  let ok = 0;
  let failed = 0;
  let superseded = 0;
  let dispatched = false;
  let lastOwn = null; // generated_at of this job's last feed (pushed or superseded)
  let yielded = false; // a successor's feed landed on the branch while this job was about to replace it
  let reason = '';
  for (;;) {
    const cycleStart = now();
    const elapsedMin = (cycleStart - started) / 60_000;
    // ---- the hand-over decision
    let remote;
    try {
      remote = await deps.readRemote();
    } catch (e) {
      remote = undefined;
      log(`::warning::could not read the live-quotes branch: ${e.message ?? e}`);
    }
    let successor = null;
    if (elapsedMin >= cfg.dispatchAtMin) {
      try {
        successor = successorOf(await deps.listRuns(), runId);
      } catch (e) {
        log(`::warning::could not list the loop runs: ${e.message ?? e}`);
      }
    }
    const handedOver = yielded || Boolean(remote && lastOwn && Date.parse(remote.generatedAt ?? '') > Date.parse(lastOwn));
    const d = decide({ elapsedMin, successor, dispatched, handedOver }, cfg);
    if (d.action === 'finish') {
      reason = d.reason;
      log(`hand-over: finishing after ${elapsedMin.toFixed(1)} min: ${d.reason}`);
      break;
    }
    if (d.action === 'dispatch') {
      try {
        await deps.dispatch(nextSlot(slot));
        dispatched = true;
        log(`hand-over: dispatched the successor (slot ${nextSlot(slot)}) after ${elapsedMin.toFixed(1)} min; this job keeps publishing until it is running (cap ${cfg.capMin} min)`);
      } catch (e) {
        log(`::warning::could not dispatch the successor: ${e.message ?? e}; will retry next cycle`);
      }
    } else if (elapsedMin >= cfg.dispatchAtMin) {
      log(`hand-over: ${d.reason}`);
    }
    // ---- share one cadence with an overlapping publisher: do not sweep when the branch was just written
    const wait = cadenceWaitMs(remote?.generatedAt, now(), cfg.minAgeMs);
    if (wait > 0) {
      log(`feed is ${((cfg.minAgeMs - wait) / 1000).toFixed(0)} s old (another publisher is running); waiting ${(wait / 1000).toFixed(0)} s`);
      await sleep(wait);
    }
    // ---- one publish
    let published = false;
    try {
      published = await deps.publish(deps.workDir);
    } catch (e) {
      log(`::warning::publish failed: ${e.message ?? e}`);
    }
    if (published) {
      try {
        const doc = JSON.parse(readFileSync(join(deps.workDir, 'index.json'), 'utf8'));
        // With a running successor, never replace a feed it wrote after this job's last one: this job's sweep is newer only because it
        // started later, and replacing it every cycle would keep the successor from ever being seen to publish (starvation).
        const res = await deps.push({ dir: deps.workDir, remote: wait > 0 ? undefined : remote, message: `live quotes ${iso(now())}`, yieldAfter: successor?.started ? (lastOwn ?? undefined) : undefined });
        if (res.yielded) {
          yielded = true;
          superseded++;
          log(`hand-over: not pushed: the successor's feed ${res.remote.generatedAt} is on the branch; leaving it`);
        } else {
          lastOwn = doc.generated_at;
          if (res.pushed) ok++;
          else {
            superseded++;
            log(`not pushed: the branch already holds ${res.remote.generatedAt}, newer than ${doc.generated_at}`);
          }
        }
      } catch (e) {
        failed++;
        log(`::warning::publish failed: ${e.message ?? e}`);
      }
    } else {
      failed++;
      log('::warning::publish failed');
    }
    // ---- until the next cycle
    const next = cycleStart + cfg.cycleMs - now();
    if (next > 0) await sleep(next);
  }
  log(`published ${ok} times, ${superseded} superseded by a newer publisher, ${failed} failures`);
  return { ok, failed, superseded, dispatched, reason };
}

/**
 * The loop's push dependency over the publish guard. Every option runLoop passes (remote hint, message, yieldAfter) must reach the guard:
 * 2026-10-29 the real wiring dropped yieldAfter, so a predecessor never yielded to its running successor and replaced the successor's feed
 * with its own newer-swept one every cycle until its 150 minute cap (the tests' fake push honoured yieldAfter, the real one did not).
 */
export const makePush = ({ url, probeDir, guard = guardedPush }) => ({ dir, remote, message, yieldAfter }) => guard({ dir, url, probeDir, message, remote, yieldAfter });

/**
 * Dispatch the workflow on main with the slot input. If the workflow on main does not declare `slot` (the change was rolled
 * back while this job was running) GitHub answers 422 "Unexpected inputs"; dispatch again without inputs so the chain survives.
 */
export function makeDispatch({ url, headers, fetchImpl = fetch }) {
  const post = (inputs) => fetchImpl(url, { method: 'POST', headers, body: JSON.stringify({ ref: 'main', ...(inputs ? { inputs } : {}) }) });
  return async (slot) => {
    let res = await post({ slot });
    if (res.status === 422) res = await post(null);
    if (res.status !== 204) throw new Error(`HTTP ${res.status} dispatching`);
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Real dependencies (GitHub REST with GITHUB_TOKEN; git over HTTPS) and the entry point.

function realDeps(env) {
  const repo = env.GITHUB_REPOSITORY;
  const token = env.GH_TOKEN ?? env.GITHUB_TOKEN;
  const api = `https://api.github.com/repos/${repo}`;
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'sift-live-quotes-loop' };
  const url = `https://x-access-token:${token}@github.com/${repo}.git`;
  const tmp = env.RUNNER_TEMP ?? '/tmp';
  const workDir = join(tmp, 'feed');
  const probeDir = join(tmp, 'feed-probe.git');
  const root = fileURLToPath(new URL('../..', import.meta.url));
  return {
    now: Date.now,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (s) => console.log(s),
    workDir,
    runId: Number(env.GITHUB_RUN_ID),
    slot: env.SIFT_LOOP_SLOT || 'a',
    cfg: HANDOVER,
    readRemote: () => readRemote({ probeDir, url }),
    push: makePush({ url, probeDir }),
    publish: (dir) => {
      rmSync(dir, { recursive: true, force: true });
      return new Promise((resolve) => {
        const p = spawn('node', ['scripts/publish-live-quotes.mjs', dir], { cwd: root, stdio: 'inherit' });
        p.on('exit', (code) => resolve(code === 0));
        p.on('error', () => resolve(false));
      });
    },
    listRuns: async () => {
      const res = await fetch(`${api}/actions/workflows/${WORKFLOW}/runs?per_page=50`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status} listing runs`);
      return (await res.json()).workflow_runs;
    },
    dispatch: makeDispatch({ url: `${api}/actions/workflows/${WORKFLOW}/dispatches`, headers }),
    statePath: join(tmp, 'live-quotes-handover.json'),
  };
}

async function main() {
  const mode = process.argv[2] ?? 'loop';
  const env = process.env;
  const deps = realDeps(env);
  const onMain = env.GITHUB_REF === 'refs/heads/main';
  const save = (o) => writeFileSync(deps.statePath, JSON.stringify(o));
  if (mode === 'ensure') {
    // Runs after the loop step even if it failed, timed out or was cancelled: the chain must not die with this job.
    let state = {};
    try {
      state = JSON.parse(readFileSync(deps.statePath, 'utf8'));
    } catch {
      /* the loop step never got far enough to write it */
    }
    if (!onMain || state.reason === 'watchdog: nothing to do') return;
    let runs = [];
    try {
      runs = await deps.listRuns();
    } catch (e) {
      console.log(`::warning::could not list the loop runs (${e.message ?? e}); dispatching to be safe`);
    }
    if (activeLoops(runs, deps.runId).length > 0) return console.log('a loop run is already queued or running; no dispatch needed');
    await deps.dispatch(nextSlot(deps.slot));
    return console.log(`dispatched the next loop (slot ${nextSlot(deps.slot)})`);
  }
  if (env.GITHUB_EVENT_NAME === 'schedule') {
    // Watchdog: the loop restarts itself, so the cron only matters when it has broken. Restart only when the feed is stale.
    let remote = null;
    try {
      remote = await deps.readRemote();
    } catch (e) {
      console.log(`::warning::could not read the live-quotes branch: ${e.message ?? e}`);
    }
    const ageMin = remote?.generatedAt ? (Date.now() - Date.parse(remote.generatedAt)) / 60_000 : Infinity;
    if (ageMin <= HANDOVER.staleRestartMin) {
      console.log(`watchdog: the feed is ${ageMin.toFixed(1)} min old (limit ${HANDOVER.staleRestartMin}); nothing to do`);
      save({ reason: 'watchdog: nothing to do' });
      return;
    }
    console.log(`watchdog: the feed is ${Number.isFinite(ageMin) ? ageMin.toFixed(1) : 'unreadable'} min old; restarting the loop`);
  }
  mkdirSync(deps.workDir, { recursive: true });
  const res = await runLoop({ ...deps, dispatch: onMain ? deps.dispatch : async () => console.log('not on main: no successor dispatched') });
  save({ ...res });
  if (!(res.ok + res.superseded > 0)) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
