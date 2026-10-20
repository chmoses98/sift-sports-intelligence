import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('./project/_fonts/fonts.css', import.meta.url), 'utf8');
const BM = JSON.parse(readFileSync(new URL('./blobmap.json', import.meta.url), 'utf8'));
const b = await chromium.launch();
const cases = [
  ['Main.dc.html', 'home', []], ['Main.dc.html', 'home-sheet-open', [{ click: 'button.sigchip' }]],
  ['_Main_pub.dc.html', 'home-published', []],
  ['Game.dc.html', 'game-live', []], ['Game.dc.html', 'game-matchups', [{ click: 'button.gtab >> text=Matchups' }]],
  ['Game.dc.html', 'game-players', [{ click: 'button.gtab >> text=Players' }]], ['Game.dc.html', 'game-markets', [{ click: 'button.gtab >> text=Markets' }]],
  ['_Game_pre.dc.html', 'game-pregame', []], ['Game.dc.html', 'game-sheet-open', [{ click: 'button.sigline' }]],
  ['Signal.dc.html', 'signals-sheet-half', []], ['Signal.dc.html', 'signals-list', [{ click: 'button[aria-label=Close]' }]],
  ['Signal.dc.html', 'signals-sheet-full-sources', [{ click: 'button.grab' }, { click: 'button.stab >> text=Sources' }]]
];
const only = process.argv[2];
for (const [file, name, actions] of cases) {
  if (only && !name.includes(only)) continue;
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: css.replaceAll('url(/_fonts', 'url(http://localhost:8099/_fonts') }));
  await p.route('https://fonts.gstatic.com/**', r => r.abort());
  await p.goto('http://localhost:8099/' + file); await p.waitForTimeout(1200);
  for (const a of actions) { await p.locator(a.click).first().click(); await p.waitForTimeout(500); }
  const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  console.log('## ' + name + ': ' + r.violations.length + ' violations');
  for (const v of r.violations) console.log('  - ' + v.id + ' [' + v.impact + '] x' + v.nodes.length + ' · ' + v.nodes.slice(0, 2).map(n => n.target.join(' ').slice(0, 70) + (n.any[0] ? ' => ' + n.any[0].message.slice(0, 90) : '')).join(' | '));
  await ctx.close();
}
await b.close();
