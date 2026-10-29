// Publishing to the `live-quotes` branch with "freshest wins".
//
// The branch contract is unchanged: ONE orphan commit holding the whole feed tree, force-replaced every cycle, no history.
// What is added is that the replacement is a compare-and-swap on the branch tip (git push --force-with-lease with the tip
// we read) and that a feed whose `generated_at` is not strictly newer than the branch's is never pushed. Two overlapping
// publishers (a job and its successor during a hand-over) therefore cannot put an older feed over a newer one, whatever
// order their pushes arrive in.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { newestWins } from './handover.mjs';

const run = promisify(execFile);

async function git(cwd, args, { env } = {}) {
  return run('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env }, maxBuffer: 64 * 1024 * 1024 });
}

/** True when a failed `git fetch` only says the branch does not exist yet (not a network or auth error). */
const missingBranch = (e) => /couldn't find remote ref|could not find remote branch/i.test(String(e?.stderr ?? e?.message ?? ''));

/**
 * The branch's tip and the `generated_at` of the feed it holds: { sha, generatedAt }, or null when the branch does not exist.
 * Throws when the remote cannot be read. `probeDir` is a scratch repository kept for the whole job (one shallow fetch per call).
 */
export async function readRemote({ probeDir, url, branch = 'live-quotes' }) {
  if (!existsSync(join(probeDir, '.git')) && !existsSync(join(probeDir, 'HEAD'))) {
    mkdirSync(probeDir, { recursive: true });
    await git(probeDir, ['init', '-q', '--bare']);
  }
  try {
    await git(probeDir, ['fetch', '-q', '--depth=1', '--no-tags', url, `+refs/heads/${branch}:refs/probe/${branch}`]);
  } catch (e) {
    if (missingBranch(e)) return null;
    throw e;
  }
  const sha = (await git(probeDir, ['rev-parse', `refs/probe/${branch}`])).stdout.trim();
  let generatedAt = null;
  try {
    generatedAt = JSON.parse((await git(probeDir, ['show', `${sha}:index.json`])).stdout).generated_at ?? null;
  } catch {
    /* a tip without a readable index.json: treated as "no time", which never blocks a push */
  }
  return { sha, generatedAt };
}

/**
 * Commit `dir` (the feed tree the publisher wrote) as a single orphan commit and push it over the branch, unless the
 * branch already holds a feed that is as new or newer.
 *   remote   optional tip already read by the caller (saves one fetch); a stale hint is harmless: the lease rejects it
 *   yieldAfter  optional `generated_at` of this publisher's own last push: when the branch holds a feed newer than that, somebody
 *            else published since (a successor taking over), and this publisher leaves it alone even if its own feed is newer still
 * Returns { pushed: true, attempts } or { pushed: false, reason: 'superseded' | 'yielded', remote, attempts }. Throws when it cannot decide.
 */
export async function guardedPush({ dir, url, branch = 'live-quotes', probeDir, message, remote: hint, yieldAfter, attempts = 4, identity = { name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' } }) {
  const local = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')).generated_at;
  if (!existsSync(join(dir, '.git'))) await git(dir, ['init', '-q', '-b', branch]);
  await git(dir, ['config', 'user.name', identity.name]);
  await git(dir, ['config', 'user.email', identity.email]);
  await git(dir, ['add', '-A']);
  await git(dir, ['commit', '-q', '-m', message]);
  let remote = hint;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (remote === undefined || attempt > 1) remote = await readRemote({ probeDir, url, branch });
    if (remote && yieldAfter && Date.parse(remote.generatedAt ?? '') > Date.parse(yieldAfter)) return { pushed: false, reason: 'yielded', yielded: true, remote, attempts: attempt };
    if (remote && !newestWins(local, remote.generatedAt)) return { pushed: false, reason: 'superseded', remote, attempts: attempt };
    try {
      await git(dir, ['push', '-q', `--force-with-lease=refs/heads/${branch}:${remote ? remote.sha : ''}`, url, `HEAD:refs/heads/${branch}`]);
      return { pushed: true, attempts: attempt };
    } catch (e) {
      // The tip moved between our read and our push (stale info) or the push raced: read again and decide again.
      if (!/stale info|rejected|fetch first|failed to update ref|cannot lock ref/i.test(String(e?.stderr ?? e?.message ?? '')) || attempt === attempts) throw e;
    }
  }
  throw new Error('unreachable');
}
