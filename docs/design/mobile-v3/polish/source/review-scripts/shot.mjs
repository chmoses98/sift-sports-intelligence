// usage: node shot.mjs File.dc.html out.png '[{"click":"text=Players"},{"scroll":".scroll","y":600},{"wait":300}]' [w h]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const [file, out, actionsJson='[]', w='390', h='844'] = process.argv.slice(2);
const css = readFileSync(new URL('./project/_fonts/fonts.css', import.meta.url), 'utf8');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on('console', m => { if (['error','warning'].includes(m.type())) console.log('console.'+m.type(), m.text().slice(0,300)); });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: css.replaceAll('url(/_fonts', 'url(http://localhost:8099/_fonts') }));
await p.route('https://fonts.gstatic.com/**', r => r.abort());
const BM = JSON.parse(readFileSync(new URL('./blobmap.json', import.meta.url), 'utf8'));
await p.route('**/_blob/*', r => { const id = r.request().url().split('/_blob/')[1]; const f = BM[id]; if (!f) return r.abort(); const ext = f.endsWith('jpg') ? 'image/jpeg' : 'image/webp'; r.fulfill({ status: 200, contentType: ext, body: readFileSync(new URL('./project/' + f, import.meta.url)) }); });
if (process.env.APPW || process.env.APPH) await p.addInitScript(({w,h}) => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = ':root{' + (w ? '--appw:' + w + 'px;' : '') + (h ? '--apph:' + h + 'px;' : '') + '}'; document.head.appendChild(st); }); }, { w: process.env.APPW, h: process.env.APPH });
await p.goto('http://localhost:8099/' + file); await p.waitForTimeout(1200);
for (const a of JSON.parse(actionsJson)) {
  if (a.click) await p.locator(a.click).first().click();
  if (a.scroll) await p.evaluate(({s,y}) => { document.querySelector(s).scrollTop = y; }, { s: a.scroll, y: a.y });
  if (a.wait) await p.waitForTimeout(a.wait); else await p.waitForTimeout(250);
}
await p.screenshot({ path: out });
await b.close();
