import { chromium } from '/tmp/claude-0/-home-user-sift-sports-intelligence/b7bf3b8b-424e-5162-b9a0-4c6353eb215d/scratchpad/node_modules/@playwright/test/index.mjs';
import AxeBuilder from '/tmp/claude-0/-home-user-sift-sports-intelligence/b7bf3b8b-424e-5162-b9a0-4c6353eb215d/scratchpad/node_modules/@axe-core/playwright/dist/index.mjs';
import { readFileSync } from 'node:fs';
const css = readFileSync('/home/user/sift-sports-intelligence/docs/design/mobile-v3/redesign/source/fonts.css', 'utf8');
const b = await chromium.launch();
const T = (t) => ({ click: `button.gtab >> text=${t}` });
const cases = [
  ['Home.dc.html', 'home', []], ['Home.dc.html', 'home-sheet-open', [{ click: '.gr .sigchip' }]], ['HomePublished.dc.html', 'home-published', []], ['Home.dc.html', 'home-empty-day', [{ click: 'button.day >> text=Tue' }]],
  ['Game.dc.html', 'game-live', []], ['Game.dc.html', 'game-matchups', [T('Matchups')]], ['Game.dc.html', 'game-players', [T('Players')]], ['Game.dc.html', 'game-markets', [T('Markets')]],
  ['GamePregame.dc.html', 'game-pregame', []], ['GameFinal.dc.html', 'game-final', []], ['Game.dc.html', 'game-sheet-open', [{ click: '.sigrow' }]],
  ['Props.dc.html', 'props-list', []], ['PropsDetail.dc.html', 'props-detail', []], ['PropsDetail.dc.html', 'props-sheet-open', [{ click: '.anote' }]],
  ['Signals.dc.html', 'signals-list', []], ['Signals.dc.html', 'signals-sheet-open', [{ click: '.sigbtn' }]], ['Signals.dc.html', 'signals-sheet-full', [{ click: '.sigbtn' }, { click: 'button.grab' }, { click: 'button.stab >> text=Sources' }]]
];
const only = process.argv[2];
for (const [file, name, actions] of cases) {
  if (only && !name.includes(only)) continue;
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: css.replaceAll('url(/_fonts', 'url(http://localhost:8096/_fonts') }));
  await p.route('https://fonts.gstatic.com/**', (r) => r.abort());
  await p.goto('http://localhost:8096/' + file); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1200);
  for (const a of actions) { await p.locator(a.click).first().click(); await p.waitForTimeout(600); }
  const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  console.log('## ' + name + ': ' + r.violations.length + ' violations');
  for (const v of r.violations) console.log('  - ' + v.id + ' [' + v.impact + '] x' + v.nodes.length + ' · ' + v.nodes.slice(0, 3).map((n) => n.target.join(' ').slice(0, 70)).join(' | '));
  await ctx.close();
}
await b.close();
