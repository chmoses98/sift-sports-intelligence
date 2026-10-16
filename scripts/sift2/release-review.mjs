// Build a portable screenshot review from completed Playwright outputs. No deployment.
// node scripts/sift2/release-review.mjs /absolute/output [test-results webkit-results]
import { mkdirSync, readdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
const [destination, ...inputs] = process.argv.slice(2);
if (!destination) throw new Error('Supply an output directory outside the test results.');
const output = resolve(destination);
const roots = inputs.length ? inputs : ['test-results', 'webkit-results'];
const shots = [];
mkdirSync(join(output, 'screenshots'), { recursive: true });
const escape = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
for (const root of roots) {
  for (const folder of readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory())) {
    for (const file of readdirSync(join(root, folder.name)).filter(f => f.endsWith('.png') && !f.startsWith('test-failed'))) {
      const project = ['iphone-se', 'iphone', 'desktop', 'phone'].find(p => folder.name.endsWith(`-${p}`)) ?? 'other';
      const name = `${basename(root)}--${folder.name}--${file}`;
      copyFileSync(join(root, folder.name, file), join(output, 'screenshots', name));
      shots.push({ project, screen: file.replace(/\.png$/, ''), path: `screenshots/${name}`, journey: folder.name });
    }
  }
}
shots.sort((a, b) => a.project.localeCompare(b.project) || a.screen.localeCompare(b.screen));
const head = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SIFT 2.0 release review</title>
<style>body{margin:0;background:#040d17;color:#e2edf9;font:16px/1.5 system-ui}header,main{max-width:1440px;margin:auto;padding:24px}h1{margin:0 0 10px}p{max-width:85ch}nav{display:flex;gap:12px;flex-wrap:wrap}a{color:#77c6ff}section{margin:36px 0}article{padding:16px;border:1px solid #274665;border-radius:12px;background:#081624;margin:20px 0}img{display:block;max-width:100%;height:auto;max-height:900px;object-fit:contain;object-position:top left}summary{cursor:pointer;padding:10px 0}small{color:#a8bbd0}code{overflow-wrap:anywhere}</style>
<header><h1>SIFT 2.0 — integration review</h1><p>Actual browser captures, not new mockups. Layouts and existing licensed assets are preserved. These screenshots replay historical publications and explicitly test-only CBB/MLB prop extensions; they do not show current odds or establish betting opportunities. Technical checks are separate from owner design approval. No production merge or deployment.</p><p>Open images at native resolution to inspect detail. The evidence notes identify test results, source restrictions and remaining gates.</p><nav>${['desktop', 'phone', 'iphone', 'iphone-se'].map(p => `<a href="#${p}">${p}</a>`).join('')}<a href="EVIDENCE.md">Evidence / blockers</a></nav></header><main>`;
const sections = ['desktop', 'phone', 'iphone', 'iphone-se'].map(project => `<section id="${project}"><h2>${project}</h2>${shots.filter(s => s.project === project).map(s => `<article><h3>${escape(s.screen)}</h3><small>${escape(s.journey)}</small><details><summary>Show capture</summary><a href="${escape(s.path)}">Open native image</a><img loading="lazy" src="${escape(s.path)}" alt="${escape(s.screen)} in ${project}"></details></article>`).join('')}</section>`).join('');
writeFileSync(join(output, 'index.html'), `${head}${sections}</main></html>`);
writeFileSync(join(output, 'screenshots.json'), JSON.stringify(shots, null, 2));
console.log(JSON.stringify({ output, screenshots: shots.length }));
