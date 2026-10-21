// Builds source/ from src/: expands [[ic name]] icon macros into a Phosphor sprite, adds the simulated status bar,
// and copies the shared stylesheet. Run: node build.mjs
import { readFileSync, writeFileSync, readdirSync, copyFileSync, mkdirSync } from 'node:fs';
const here = (p) => new URL(p, import.meta.url);
const icons = JSON.parse(readFileSync(here('./src/icons.json'), 'utf8'));
mkdirSync(here('./source/'), { recursive: true });
const STATUS = `<div class="status" aria-hidden="true"><span>9:41</span><span class="status__r">
<svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
<svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 2.4c2.3 0 4.4.9 6 2.4l1-1.1A10.4 10.4 0 0 0 8.5.8c-2.8 0-5.4 1.1-7.5 2.9l1 1.1a8.8 8.8 0 0 1 6.5-2.4Zm0 3.5c1.4 0 2.7.5 3.7 1.4l1-1.1a7.2 7.2 0 0 0-9.4 0l1 1.1c1-.9 2.3-1.4 3.7-1.4Zm0 3.4c.7 0 1.3.2 1.8.7L8.5 12 6.7 10c.5-.5 1.1-.7 1.8-.7Z"/></svg>
<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".45"/><rect x="2" y="2" width="20" height="9" rx="2.2"/><path d="M25 4.5v4c.8-.3 1.5-1.2 1.5-2s-.7-1.7-1.5-2Z" opacity=".5"/></svg></span></div>`;
for (const f of readdirSync(here('./src/'))) {
  if (!f.endsWith('.dc.html')) continue;
  let s = readFileSync(here('./src/' + f), 'utf8');
  s = s.replace(/\[\[ic ([a-z0-9-]+)(?: ([^\]]+))?\]\]/g, (m, n, c) => `<svg class="ic${c ? ' ' + c : ''}" viewBox="0 0 256 256" aria-hidden="true"><use href="#i-${n}"/></svg>`);
  s = s.replace(/<!--CSS:([A-Za-z]+)-->/g, (m, n) => { const t = readFileSync(here('./src/' + n + '.dc.html'), 'utf8'); const a = t.indexOf('<style>') + 7; return t.slice(a, t.indexOf('</style>', a)); });
  s = s.replace('<!--STATUS-->', STATUS);
  const ids = [...new Set([...s.matchAll(/#i-([a-z0-9-]+)/g)].map((m) => m[1]))];
  const missing = ids.filter((i) => !icons[i]);
  if (missing.length) console.log(f, 'missing icons:', missing.join(', '));
  const sprite = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${ids.filter((i) => icons[i]).map((i) => `<symbol id="i-${i}" viewBox="0 0 256 256">${icons[i]}</symbol>`).join('')}</defs></svg>`;
  s = s.replace('<!--SPRITE-->', sprite);
  writeFileSync(here('./source/' + f), s);
  console.log('built', f, ids.length, 'icons');
}
for (const f of ['sift.css', 'fonts.css', 'canvas.json']) copyFileSync(here('./src/' + f), here('./source/' + f));
