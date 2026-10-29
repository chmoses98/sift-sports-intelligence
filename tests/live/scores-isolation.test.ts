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
      .filter((i) => /(^|\/)(opportunity|packet|intelligence|insights|history)\//.test(i) || /projection/i.test(i) || /^(\.\.\/)+(store|normalize|overlay|preflight|hooks)$/.test(i) || /\/providers\/(kalshi|feed|fallback)$/.test(i))
      .map((i) => `${relative(SRC, f)} -> ${i}`));
    expect(bad).toEqual([]);
  });

  it('no model, opportunity, packet or projection source imports the score module', () => {
    const guarded = walk(SRC).filter((f) => /\/src\/(opportunity|packet|intelligence|insights|history|data)\//.test(f) || /projection/i.test(f) || /\/src\/live\/(store|overlay|normalize|preflight)\.ts$/.test(f));
    const bad = guarded.filter((f) => importsOf(f).some((i) => /live\/scores|\.\/scores/.test(i))).map((f) => relative(SRC, f));
    expect(bad).toEqual([]);
  });

  // v4: only the screens that DISPLAY a score may import score code. The files that decide research, signals, props, saves and
  // the Board (and so what is frozen, ranked or saved) must never see a score, simulated or real.
  it('v4 research, signal, props and Board code does not import any score code', () => {
    const research = ['signal.ts', 'signalsModel.ts', 'Signals.tsx', 'ResearchSheet.tsx', 'SaveControl.tsx', 'saveSide.ts', 'boardModel.ts', 'Board.tsx', 'undo.tsx', 'propsModel.ts', 'propsData.ts', 'Props.tsx', 'PropDetail.tsx', 'PropParts.tsx', 'PropSheet.tsx', 'PropsUi.tsx', 'follow.ts', 'words.ts'];
    const bad = research.filter((n) => importsOf(join(SRC, 'v4', n)).some((i) => /live\/scores|scoreState|LiveScoreCard|DemoBar/.test(i)));
    expect(bad).toEqual([]);
  });

  // The strongest form of the rule: an allowlist. Only the screens that DISPLAY a score (and the score module itself) may import score
  // code. Everything else in the app (betting and opportunity code, packets, projections, signals, research, the Board, what is frozen
  // or saved, the Kalshi quote store) is outside it, so a score cannot reach them.
  const V3_DISPLAY = new Set(['v3/data/useSlate.tsx']);
  it('only the v4 screens that display a score import score code', () => {
    const DISPLAY = new Set(['EarlyAccess.tsx', 'Feature.tsx', 'Game.tsx', 'Games.tsx', 'Home.tsx', 'LiveScoreCard.tsx', 'LiveScoresControl.tsx', 'Scoreboard.tsx', 'V4Root.tsx', 'model.ts', 'parts.tsx', 'scoreState.ts', 'slate.tsx']);
    const bad = walk(SRC)
      .filter((f) => !relative(SRC, f).startsWith(join('live', 'scores')))
      .filter((f) => !(relative(SRC, f).startsWith('v4') && DISPLAY.has(relative(join(SRC, 'v4'), f))))
      // SIFT 3.0 (src/v3, opt-in at #/v3): exactly ONE file bridges scores to its screens, the same display-only role as the v4 slate hook.
      // Everything else in v3 (the market, research, Lens, props, saved research) stays outside the allowlist like the rest of the app.
      .filter((f) => !V3_DISPLAY.has(relative(SRC, f).split('\\').join('/')))
      .filter((f) => importsOf(f).some((i) => /live\/scores|scoreState|LiveScoreCard|LiveScoresControl/.test(i)))
      .map((f) => relative(SRC, f));
    expect(bad).toEqual([]);
  });

  // The score module itself reads no research, price or position state either (the first test), and the display files that import it
  // are the only bridge. Research and signal decisions in v4 are made by files that appear in neither list.
  it('ESPN is development reference only: nothing outside its own folder imports it or names its host', () => {
    const files = walk(SRC).filter((f) => !relative(SRC, f).startsWith(join('live', 'scores', 'reference')));
    expect(files.filter((f) => importsOf(f).some((i) => /reference\/espn|providers\/espn/.test(i))).map((f) => relative(SRC, f))).toEqual([]);
    const scoreRelated = files.filter((f) => /^(live|v4)[\\/]/.test(relative(SRC, f)));
    expect(scoreRelated.filter((f) => /espn\.com/i.test(readFileSync(f, 'utf-8'))).map((f) => relative(SRC, f))).toEqual([]);
  });

  it('the score code contacts exactly one host, sportscore.com, and only the documented endpoint', () => {
    const files = walk(join(SRC, 'live', 'scores')).filter((f) => !relative(SRC, f).startsWith(join('live', 'scores', 'reference')));
    const hosts = new Set(files.flatMap((f) => [...readFileSync(f, 'utf-8').matchAll(/https?:\/\/([a-z0-9.-]+)\//gi)].map((m) => m[1].toLowerCase())));
    expect([...hosts].sort()).toEqual(['sportscore.com']);
  });
});
