// overflow, truncation, touch-target and small-text check at 390x844, 375x812, 375x667
import { chromium } from '/tmp/claude-0/-home-user-sift-sports-intelligence/b7bf3b8b-424e-5162-b9a0-4c6353eb215d/scratchpad/node_modules/@playwright/test/index.mjs';
import { readFileSync } from 'node:fs';
const css = readFileSync('/home/user/sift-sports-intelligence/docs/design/mobile-v3/redesign/source/fonts.css', 'utf8');
const checks = readFileSync(new URL('./checks.js', import.meta.url), 'utf8');
const b = await chromium.launch();
const sizes = [[390, 844], [375, 812], [375, 667]];
const T = (t) => ({ click: `button.gtab >> text=${t}` });
const cases = [
  ['Home.dc.html', 'home', []], ['Home.dc.html', 'home-scrolled', [{ scroll: '#sc', y: 560 }]], ['HomePublished.dc.html', 'home-published', []], ['Home.dc.html', 'home-tue', [{ click: 'button.day >> text=Tue' }]],
  ['Game.dc.html', 'game-live', []], ['Game.dc.html', 'game-plays', [{ scroll: '#sc', y: 430 }]], ['Game.dc.html', 'game-matchups', [T('Matchups')]], ['Game.dc.html', 'game-players', [T('Players')]], ['Game.dc.html', 'game-markets', [T('Markets')]],
  ['GamePregame.dc.html', 'game-pregame', []], ['GameFinal.dc.html', 'game-final', []],
  ['Props.dc.html', 'props', []], ['PropsDetail.dc.html', 'props-detail', []], ['Signals.dc.html', 'signals', []], ['States.dc.html', 'states', []]
];
const only = process.argv[2];
for (const [w, h] of sizes) {
  console.log('===== ' + w + 'x' + h);
  for (const [file, name, actions] of cases) {
    if (only && !name.includes(only)) continue;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: false });
    const p = await ctx.newPage();
    await p.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: css.replaceAll('url(/_fonts', 'url(http://localhost:8096/_fonts') }));
    await p.route('https://fonts.gstatic.com/**', (r) => r.abort());
    await p.addInitScript(({ w, h }) => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = ':root{--appw:' + w + 'px;--apph:' + h + 'px}'; document.head.appendChild(st); }); }, { w, h });
    await p.goto('http://localhost:8096/' + file); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1100);
    for (const a of actions) { if (a.click) await p.locator(a.click).first().tap(); if (a.scroll) await p.evaluate(({ s, y }) => { document.querySelector(s).scrollTop = y; }, { s: a.scroll, y: a.y }); await p.waitForTimeout(400); }
    const r = await p.evaluate(`(function(){${checks.replace(/^return \(function \(\) \{/, '').replace(/\}\)\(\);\s*$/, '')}})()`);
    const issues = [];
    if (name !== 'states' && r.docW > r.appW + 1) issues.push('PAGE ' + r.docW + '>' + r.appW);
    if (r.off && r.off.length && name !== 'states') issues.push('OVERFLOW ' + r.off.join('; '));
    if (r.trunc && r.trunc.length) issues.push('TRUNC ' + r.trunc.join('; '));
    if (r.small && r.small.length && name !== 'states') issues.push('SMALL ' + r.small.join('; '));
    if (r.under12 && r.under12.length) issues.push('UNDER12 ' + r.under12.join('; '));
    if (!r.fonts.geist || !r.fonts.sora) issues.push('FONTS ' + JSON.stringify(r.fonts));
    console.log(name.padEnd(16) + (issues.length ? issues.join(' | ') : 'ok'));
    await ctx.close();
  }
}
await b.close();
