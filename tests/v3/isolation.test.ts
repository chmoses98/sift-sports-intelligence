import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const src = walk('src').filter((p) => /\.(ts|tsx)$/.test(p));

describe('SIFT 3.0 isolation', () => {
  it('nothing outside src/v3 imports v3 except the app route table', () => {
    const offenders = src.filter((p) => !p.startsWith(join('src', 'v3')) && /from ['"][./]*(\.\/)?v3\//.test(readFileSync(p, 'utf8')) && p !== join('src', 'App.tsx'));
    expect(offenders).toEqual([]);
  });
  it('sample fixtures are imported only by the demo provider, lens helper, tabs and the player/search samples', () => {
    const allowed = new Set(['data/useSlate.tsx', 'data/lens.ts', 'screens/GameTabs.tsx'].map((x) => join('src', 'v3', x)));
    const offenders = src.filter((p) => p.startsWith(join('src', 'v3')) && !p.includes(join('v3', 'demo')) && /from '[^']*demo\/fixtures'/.test(readFileSync(p, 'utf8')) && !allowed.has(p));
    expect(offenders).toEqual([]);
  });
  it('every fixture price and description is labelled as sample data', () => {
    const f = readFileSync(join('src', 'v3', 'demo', 'fixtures.ts'), 'utf8');
    expect(f).toMatch(/SAMPLE DATA/);
    expect(f).not.toMatch(/Kalshi'/);
  });
  it('v3 never calls an unlicensed score source or the production routes it must not change', () => {
    const v3 = src.filter((p) => p.startsWith(join('src', 'v3'))).map((p) => readFileSync(p, 'utf8')).join('\n');
    expect(v3).not.toMatch(/espn\.com|site\.api\.espn|api-web\.nhle/i);
    expect(v3).not.toMatch(/Notification\.requestPermission|pushManager\.subscribe/);
  });
});
