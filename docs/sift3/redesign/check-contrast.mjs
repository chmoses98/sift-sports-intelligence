// node docs/sift3/redesign/check-contrast.mjs
// Accessibility check: every element with a vibrant-cyan fill must carry dark text with >= 4.5:1 contrast.
import { chromium } from 'playwright';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const lum = ([r, g, bl]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
const cr = (a, c) => { const [x, y] = [lum(a), lum(c)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
let bad = 0, n = 0;
for (const s of ['p1', 'p2', 'p3', 'p4', 'g1', 'g2', 'g3']) {
  await p.goto(pathToFileURL(join(here, 'index.html')).href + `?s=${s}`);
  const rows = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.phone *')) {
      const cs = getComputedStyle(el); const bg = cs.backgroundColor, bi = cs.backgroundImage;
      const m = (bg.match(/rgba?\(([^)]+)\)/) || [])[1]; const rgb = m ? m.split(',').map((x) => parseFloat(x)) : null;
      const cyanFill = (rgb && (rgb[3] === undefined || rgb[3] >= 0.5) && Math.abs(rgb[0] - 25) < 12 && Math.abs(rgb[1] - 205) < 14 && Math.abs(rgb[2] - 224) < 14) || /rgb\(25, 205, 224\)/.test(bi);
      const hasText = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
      if (cyanFill && hasText) out.push({ txt: el.textContent.trim().slice(0, 24), color: cs.color });
    }
    return out;
  });
  for (const r of rows) { const rgb = r.color.match(/\d+/g).slice(0, 3).map(Number); const c = cr(rgb, [25, 205, 224]); n++; if (c < 4.5) bad++; console.log(s.padEnd(3), String(r.txt).padEnd(26), r.color.padEnd(18), c.toFixed(2), c >= 4.5 ? 'ok' : 'FAIL'); }
}
console.log(`\n${n} cyan-filled text elements, ${bad} below 4.5:1`);
await b.close();
