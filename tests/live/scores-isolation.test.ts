// A live score is a fact about a game. It must never reach a model, a projection, a packet, a recommendation or the
// market clock. This guard reads the sources: nothing outside src/live/scores (and the future screens that display
// scores) may import it, and the score module may not import any model, opportunity, packet or quote code.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..', 'src');
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
});
const importsOf = (f: string) => [...readFileSync(f, 'utf-8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);

describe('live scores stay out of models, betting and the market clock', () => {
  it('the score module imports nothing from models, opportunities, packets, projections or the quote store', () => {
    const bad = walk(join(SRC, 'live', 'scores')).flatMap((f) => importsOf(f)
      .filter((i) => /(^|\/)(opportunity|packet|intelligence|insights|history)\//.test(i) || /projection/i.test(i) || /\/store$/.test(i) || /\/providers\/(kalshi|feed|fallback)$/.test(i) || /\/(normalize|overlay)$/.test(i))
      .map((i) => `${relative(SRC, f)} -> ${i}`));
    expect(bad).toEqual([]);
  });

  it('no model, opportunity, packet or projection source imports the score module', () => {
    const guarded = walk(SRC).filter((f) => /\/src\/(opportunity|packet|intelligence|insights|history|data)\//.test(f) || /projection/i.test(f) || /\/src\/live\/(store|overlay|normalize|preflight)\.ts$/.test(f));
    const bad = guarded.filter((f) => importsOf(f).some((i) => /live\/scores|\.\/scores/.test(i))).map((f) => relative(SRC, f));
    expect(bad).toEqual([]);
  });
});
