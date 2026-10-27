// Isolation guarantees of .github/workflows/quote-drill.yml (the throwaway drill; exists only on claude/quote-drill):
// triggered by a push to that branch only (plus a manual dispatch), read-only, no secrets, own concurrency group, a job
// timeout, only the SIFT_QUOTE_RELAY_URL repository variable, GET-only work.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const yml = readFileSync(join(ROOT, '.github', 'workflows', 'quote-drill.yml'), 'utf8');
const code = yml.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');

describe('quote-drill.yml', () => {
  it('runs on a push to claude/quote-drill only, or by hand: no schedule, no other branch, no pull_request', () => {
    expect(code).toMatch(/^on:\n {2}push:\n {4}branches: \[claude\/quote-drill\]\n {2}workflow_dispatch:\n/m);
    expect(code).not.toMatch(/schedule:|pull_request|branches:\s*\[.*main|tags:/);
  });

  it('is read-only: contents: read is the only permission, no write scope anywhere', () => {
    expect(code.match(/^permissions:\n((?: {2}.+\n)+)/m)![1]).toBe('  contents: read\n');
    expect(code).not.toMatch(/:\s*write\b/);
  });

  it('uses no secret and no token; the only variable is SIFT_QUOTE_RELAY_URL', () => {
    expect(code).not.toMatch(/secrets\.|GITHUB_TOKEN|GH_TOKEN|github\.token/);
    const refs = [...code.matchAll(/\$\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]);
    expect(refs).toEqual(['vars.SIFT_QUOTE_RELAY_URL']);
  });

  it('has its own concurrency group (not the monitor, not live-quotes) and a job timeout', () => {
    expect(code).toMatch(/concurrency:\n\s+group: quote-drill\n/);
    expect(code).not.toMatch(/group:\s*(live-quotes|quote-monitor)\b/);
    expect(code).toMatch(/timeout-minutes: \d+/);
  });

  it('only runs the drill script; nothing dispatches, pushes, commits or runs the publisher', () => {
    const runs = [...code.matchAll(/^\s+run: (.+)$/gm)].map((m) => m[1]);
    expect(runs).toEqual(['node scripts/quote-monitor-drill.mjs --ci']);
    expect(code).not.toMatch(/gh workflow|git push|git commit|publish-live-quotes|curl .*-X (POST|PUT|PATCH|DELETE)/);
  });
});
