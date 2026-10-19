// User-facing wording: one authoritative projection per statistic, in plain words. Development vocabulary (shadow model,
// challenger / incumbent / legacy comparisons, "research arm", "simulation mean") belongs in code, repositories, audit logs and
// benchmarks, never on a screen. This scans the source text a user can read (string literals and JSX text, not comments or
// identifiers) so a new label cannot slip in; the rendered-page checks are in tests/projectionPages.test.tsx and
// e2e/projection-surfaces.spec.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFUSING } from './support/terminology';

const SRC = join(__dirname, '..', 'src');

/**
 * Files that keep their own, different vocabulary, each with the reason. None of them shows a projection for a statistic that has
 * an approved engine: they describe a betting-research ledger, a separate sport's model roster or a publisher-supplied status.
 */
const ALLOW: Record<string, string> = {
  'views/cbb/Home.tsx': 'CBB is a research-only vertical that publishes a frozen model roster and its comparison by design (no player-stat projections)',
  'views/cbb/Game.tsx': 'CBB model roster, as above',
  'views/cbb/data.ts': 'CBB model roster role names, as above',
  'views/nhl/NhlScorecard.tsx': 'NHL research-candidate ledger (paper results of never-placed candidates), not a projection',
  'lib/nhl.ts': 'NHL research-candidate ledger status words supplied by the publication',
  'opportunity/record.ts': 'NHL research-candidate ledger record',
  'lib/plainLabels.ts': 'translates internal model-version strings into plain words for readers',
  'lib/projectionApprovals.ts': 'the owner-facing approval record (reasons are read by the owner and in the docs, not rendered on a page)',
  'lib/projectionPolicy.ts': 'promotion-policy reasons, as above',
  'intelligence/evidence.ts': 'Research Lab study descriptions of published walk-forward studies (a study, not a projection)',
  'lib/tennis.ts': 'Challenger is a tennis tournament tier',
  'views/tennis/TennisHome.tsx': 'Challenger is a tennis tournament tier',
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

/** The text a reader could see on one source line: string / template literals and JSX text, with comments removed. */
function readable(line: string): string[] {
  const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
  const out: string[] = [];
  for (const m of code.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) out.push(m[1] ?? m[2] ?? m[3] ?? '');
  for (const m of code.matchAll(/>([^<>{}]+)</g)) out.push(m[1]);
  return out;
}

describe('no development vocabulary in user-facing text', () => {
  const files = walk(SRC).map((f) => ({ f, rel: relative(SRC, f).replace(/\\/g, '/') }));
  const hits: string[] = [];
  for (const { f, rel } of files) {
    if (ALLOW[rel]) continue;
    const text = readFileSync(f, 'utf-8');
    let inBlock = false;
    text.split('\n').forEach((line, i) => {
      // skip block comments
      if (inBlock) { if (line.includes('*/')) inBlock = false; return; }
      if (/^\s*\/\*/.test(line) && !line.includes('*/')) { inBlock = true; return; }
      if (/^\s*(\/\/|\*)/.test(line)) return;
      for (const piece of readable(line)) {
        for (const re of CONFUSING) if (re.test(piece)) hits.push(`${rel}:${i + 1}  ${piece.trim().slice(0, 100)}`);
      }
    });
  }
  it('finds none outside the documented allowances', () => {
    expect(hits).toEqual([]);
  });
  it('every allowance still exists (a stale allowance hides a future regression)', () => {
    const rels = new Set(files.map((x) => x.rel));
    for (const k of Object.keys(ALLOW)) expect(rels.has(k), k).toBe(true);
  });
});

describe('the scan itself', () => {
  const found = (line: string) => readable(line).some((p) => CONFUSING.some((re) => re.test(p)));
  it('catches the labels this release removed', () => {
    expect(found(`<li><span>{ok ? 'Projection' : 'Shadow model'} P(over)</span></li>`)).toBe(true);
    expect(found(`<Px k="Shadow v2 P(YES)" v={x} sub="research arm" />`)).toBe(true);
    expect(found(`'simulation mean · research'`)).toBe(true);
    expect(found(`title={\`Shadow model: \${state}\`}`)).toBe(true);
    expect(found(`<small>vs the incumbent</small>`)).toBe(true);
  });
  it('ignores comments, identifiers and the approved wording', () => {
    expect(found(`const shadowOf = (mp) => mp; // shadow model`)).toBe(false);
    expect(found(`role: p.role === 'production' ? 'production' : 'shadow',`)).toBe(false);
    expect(found(`<dt>Probability of over</dt>`)).toBe(false);
    expect(found(`<span>Established projection</span>`)).toBe(false);
  });
});
