// usage: node shot.mjs File.dc.html out.png '[{"click":"sel"},{"scroll":".scroll","y":600},{"wait":300}]' [w h]   (env APPW/APPH set the app size, SCALE the pixel ratio)
import { chromium } from '/tmp/claude-0/-home-user-sift-sports-intelligence/b7bf3b8b-424e-5162-b9a0-4c6353eb215d/scratchpad/node_modules/@playwright/test/index.mjs';
import { readFileSync } from 'node:fs';
const ROOT = '/home/user/sift-sports-intelligence/docs/design/mobile-v3/redesign/source/';
const [file, out, actionsJson = '[]', w = '390', h = '844'] = process.argv.slice(2);
const css = readFileSync(ROOT + 'fonts.css', 'utf8');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +(process.env.SCALE || 2) });
const p = await ctx.newPage();
p.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/404/.test(m.text())) console.log('console.' + m.type(), m.text().slice(0, 300)); });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: css.replaceAll('url(/_fonts', 'url(http://localhost:8096/_fonts') }));
await p.route('https://fonts.gstatic.com/**', r => r.abort());
if (process.env.APPW || process.env.APPH) await p.addInitScript(({ w, h }) => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = ':root{' + (w ? '--appw:' + w + 'px;' : '') + (h ? '--apph:' + h + 'px;' : '') + '}'; document.head.appendChild(st); }); }, { w: process.env.APPW, h: process.env.APPH });
await p.goto('http://localhost:8096/' + file); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1300);
for (const a of JSON.parse(actionsJson)) {
  if (a.click) await p.locator(a.click).first().click();
  if (a.scroll) await p.evaluate(({ s, y }) => { document.querySelector(s).scrollTop = y; }, { s: a.scroll, y: a.y });
  if (a.wait) await p.waitForTimeout(a.wait); else await p.waitForTimeout(300);
}
await p.screenshot({ path: out });
await b.close();
