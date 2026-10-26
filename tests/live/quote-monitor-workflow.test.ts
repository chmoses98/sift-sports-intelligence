// Isolation guarantees of .github/workflows/quote-monitor.yml, checked on its text: read-only, no secrets, its
// own concurrency group, every 15 minutes, manually dispatchable, and nothing that could touch the feed loop.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const yml = readFileSync(join(ROOT, '.github', 'workflows', 'quote-monitor.yml'), 'utf8');
const code = yml.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');

describe('quote-monitor.yml', () => {
  it('is scheduled every 15 minutes and can be dispatched by hand', () => {
    const cron = /cron:\s*'([^']+)'/.exec(code)![1];
    const [minute, ...rest] = cron.split(' ');
    expect(rest).toEqual(['*', '*', '*', '*']);
    expect(minute.split(',').map(Number).sort((a, b) => a - b).map((m, i, a) => (a[i + 1] ?? a[0] + 60) - m)).toEqual([15, 15, 15, 15]);
    expect(code).toMatch(/^\s*workflow_dispatch:/m);
  });

  it('is read-only: contents: read is the only permission, at workflow level, with no write scope anywhere', () => {
    expect(code.match(/^permissions:\n((?: {2}.+\n)+)/m)![1]).toBe('  contents: read\n');
    expect(code).not.toMatch(/:\s*write\b/);
    expect(code).not.toMatch(/\bactions:\s/);
  });

  it('uses no secrets and no token', () => {
    expect(code).not.toMatch(/secrets\./);
    expect(code).not.toMatch(/GITHUB_TOKEN|GH_TOKEN|github\.token/);
  });

  it('has its own concurrency group, distinct from live-quotes, and never cancels another run', () => {
    expect(code).toMatch(/concurrency:\n\s+group: quote-monitor\n\s+cancel-in-progress: false/);
    expect(code).not.toMatch(/group:\s*live-quotes/);
  });

  it('does not dispatch, push or commit anything, and does not run the feed publisher', () => {
    expect(code).not.toMatch(/gh workflow|git push|git commit|git init|publish-live-quotes/);
  });

  it('reads the relay URL from the SIFT_QUOTE_RELAY_URL repository variable (not a secret)', () => {
    expect(code).toMatch(/SIFT_QUOTE_RELAY_URL: \$\{\{ vars\.SIFT_QUOTE_RELAY_URL \}\}/);
  });

  it('runs the monitor script and nothing else with side effects', () => {
    const runs = [...code.matchAll(/^\s+run: (.+)$/gm)].map((m) => m[1]);
    expect(runs).toEqual(['node scripts/quote-monitor.mjs']);
  });
});
