import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('./project/_fonts/fonts.css', import.meta.url), 'utf8');
const checks = readFileSync(new URL('./checks.js', import.meta.url), 'utf8').replace(/^return /, 'return ');
const b = await chromium.launch();
const sizes = [[390, 844], [375, 812], [375, 667]];
const cases = [
  ['Main.dc.html', 'home', []], ['Main.dc.html', 'home-fri', [{ click: 'button.day >> text=Fri' }]], ['_Main_pub.dc.html', 'home-published', []],
  ['Game.dc.html', 'game-live', []], ['Game.dc.html', 'game-players', [{ click: 'button.gtab >> text=Players' }]], ['Game.dc.html', 'game-markets', [{ click: 'button.gtab >> text=Markets' }]],
  ['_Game_pre.dc.html', 'game-pre', []], ['_Game_fin.dc.html', 'game-final', []], ['Signal.dc.html', 'signals', [{ click: 'button[aria-label=Close]' }]]
];
for (const [w, h] of sizes) {
  console.log('===== ' + w + 'x' + h);
  for (const [file, name, actions] of cases) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    await p.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: css.replaceAll('url(/_fonts', 'url(http://localhost:8099/_fonts') }));
    await p.route('https://fonts.gstatic.com/**', r => r.abort());
    await p.addInitScript(({ w, h }) => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = ':root{--appw:' + w + 'px;--apph:' + h + 'px}'; document.head.appendChild(st); }); }, { w, h });
    await p.goto('http://localhost:8099/' + file); await p.waitForTimeout(1100);
    for (const a of actions) { await p.locator(a.click).first().tap(); await p.waitForTimeout(400); }
    const r = await p.evaluate(`(function(){${checks.replace(/^return \(function\(\)\{/, '').replace(/\}\)\(\);\s*$/, '')}})()`);
    const issues = [];
    if (r.off && r.off.length) issues.push('OVERFLOW ' + r.off.join('; '));
    if (r.trunc && r.trunc.length) issues.push('TRUNC ' + r.trunc.join('; '));
    if (r.small && r.small.length) issues.push('SMALL ' + r.small.join('; '));
    console.log(name.padEnd(16) + (issues.length ? issues.join(' | ') : 'ok'));
    if (process.env.SHOTS) await p.screenshot({ path: 'shots/L-' + name + '-' + w + 'x' + h + '.png' });
    await ctx.close();
  }
}
await b.close();
