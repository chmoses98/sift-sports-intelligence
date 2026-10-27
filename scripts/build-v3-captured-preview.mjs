// Build the captured-data preview of SIFT 3.0 (every root tab and every research route on real published documents captured on disk) into
// dist-v3-snapshot/, ready to publish as a Claude Artifact. Nothing here enters the production bundle.
//
//   node scripts/build-v3-captured-preview.mjs [--base DIR] [--also name=DIR]... [--gaps DIR] [--cap-kb 1500] [--min-kb 250] [--pack-encoding bin|b64]
//                                              [--no-check] [--provenance]
//   V3_FEED_CACHE (base cache dir, default .v3-feed-cache; it must hold captured_at.txt)
//   V3_ALSO_CACHES ("player=DIR,team=DIR,stat=DIR,game=DIR": other families; a document is added only where the base lacks that URL;
//                   default: .v3-feed-cache-families/{player,team,stat,game})
//   V3_GAP_CACHE (default .v3-feed-cache-gaps: static research documents fetched by scripts/v3-preview/fetch-gaps.mjs)
//
// Output: dist-v3-snapshot/{artifact-page.html, assets/*, snapshot/index.json, packs/*, <teams|players|heroes images the crawl requested>,
// MANIFEST.json (every file to publish, sizes, counts, self-check)}. See docs/sift3/PREVIEW.md.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { FORMAT, buildPacks, mergeCaches, planPacks, readCapturedAt, writePacks } from './v3-preview/capture-lib.mjs';
import { contentType, serve } from './v3-preview/static-server.mjs';

const out = 'dist-v3-snapshot';
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i > -1 ? argv[i + 1] : d; };
const all = (n) => argv.flatMap((a, i) => (a === `--${n}` ? [argv[i + 1]] : []));
const flag = (n) => argv.includes(`--${n}`);

const baseDir = arg('base', process.env.V3_FEED_CACHE ?? '.v3-feed-cache');
const famRoot = '.v3-feed-cache-families';
const alsoSpec = [...all('also'), ...(process.env.V3_ALSO_CACHES ? process.env.V3_ALSO_CACHES.split(',') : []),
  ...(!all('also').length && !process.env.V3_ALSO_CACHES && existsSync(famRoot) ? ['player', 'team', 'stat', 'game'].filter((n) => existsSync(`${famRoot}/${n}`)).map((n) => `${n}=${famRoot}/${n}`) : [])]
  .map((s) => { const [name, ...d] = s.split('='); return { name, dir: d.join('=') }; });
const gapDir = arg('gaps', process.env.V3_GAP_CACHE ?? '.v3-feed-cache-gaps');
const capBytes = Number(arg('cap-kb', '1500')) * 1024;
const encoding = arg('pack-encoding', 'bin');
if (encoding !== 'bin' && encoding !== 'b64') throw new Error('--pack-encoding must be bin or b64');
const read = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);

const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const dirty = execSync('git status --porcelain -- src scripts package.json', { encoding: 'utf8' }).trim() !== '';
const capturedAt = readCapturedAt(baseDir);

// 1. The app bundle (production-mode vite build of the preview entry; the captured shim is enabled by SIFT_PREVIEW_SNAPSHOT).
execSync('npx vite build -c vite.v3-preview.config.ts', { stdio: 'inherit', env: { ...process.env, SIFT_PREVIEW_SHA: sha, SIFT_PREVIEW_SAMPLE_ONLY: '1', SIFT_PREVIEW_SNAPSHOT: '1' } });

// 2. The unified capture: base + only the documents the other families add + gap fills. Never overwrites a document the base has.
const merged = mergeCaches({ name: 'props', dir: baseDir }, alsoSpec.filter((f) => existsSync(f.dir)), existsSync(gapDir) ? { name: 'gap-fill', dir: gapDir } : null);
for (const f of alsoSpec) if (!existsSync(f.dir)) console.warn(`warning: family ${f.name} not found at ${f.dir}: skipped`);

// 3. Packs, grouped by the screens that read them (first-use order recorded by the crawl; documents no screen read follow, by kind).
const order = read('scripts/v3-preview/pack-order.json', []);
const built = buildPacks(merged.docs, planPacks(merged.docs, order, capBytes), capBytes, Number(arg('min-kb', '250')) * 1024);
mkdirSync(`${out}/snapshot`, { recursive: true });
const { meta, entries } = writePacks(out, built, encoding);

const stampRange = (() => {
  let lo = null; let hi = null;
  for (const { bytes } of merged.docs.values()) {
    let j; try { j = JSON.parse(bytes.toString('utf8')); } catch { continue; }
    const t = typeof j?.generated_at === 'string' ? j.generated_at : typeof j?.generated_utc === 'string' ? j.generated_utc : null;
    const ms = t ? Date.parse(t) : NaN;
    if (!Number.isFinite(ms)) continue;
    if (lo == null || ms < lo) lo = ms;
    if (hi == null || ms > hi) hi = ms;
  }
  const iso = (m) => (m == null ? null : new Date(m).toISOString().replace('.000Z', 'Z'));
  return { earliest: iso(lo), latest: iso(hi) };
})();

const families = {};
const kinds = {};
for (const d of merged.docs.values()) { families[d.family] = (families[d.family] ?? 0) + 1; kinds[d.kind] = (kinds[d.kind] ?? 0) + 1; }
// The About sheet's statements: the static ones (scripts/v3-preview/about.json) plus the counts only this build knows.
const k = (n) => kinds[n] ?? 0;
const about = read('scripts/v3-preview/about.json', {});
about.real = [
  `The capture is ${merged.docs.size.toLocaleString('en-US')} published documents: ${k('event_detail')} game documents, ${k('event_research')} game research documents, ${k('entity_profile')} team and player profiles, ${k('ranking')} statistic rankings, ${k('explorer_index') + k('search_index') + k('metric_registry')} indexes and metric definitions, ${k('board')} boards, ${k('sift.projections.v1')} model projection files and ${k('sift.live_quotes.v1')} Kalshi quote files.`,
  ...(about.real ?? []),
];
const missedRankings = read('docs/sift3/qa/impl/preview/missed-documents.json', { urls: [] }).urls.filter((u) => /\/explorer\/rankings\//.test(u)).length;
about.notCaptured = [
  ...(missedRankings ? [`Statistic rankings: the crawl found ${missedRankings} ranking documents linked from the team pages it opened that no cache holds, so tapping those statistics shows that screen's own "not published" state (${k('ranking')} rankings are captured). They cannot be added now: the publication has been republished since the capture, and a newer ranking would contradict the team page that links to it.`] : []),
  `Kalshi quote files exist for only ${k('sift.live_quotes.v1')} games. A game without one shows the price from its own game document where that has one, otherwise "No lines listed". No quote was fetched for this preview.`,
  ...(about.notCaptured ?? []),
];
const index = {
  format: FORMAT, capturedAt, clockAt: new Date(Date.parse(capturedAt) - 3000).toISOString(), stamps: stampRange, families, total: merged.docs.size,
  packs: meta, docs: entries, about, build: `build ${sha.slice(0, 7)}${dirty ? '+local' : ''}, ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
};
writeFileSync(`${out}/snapshot/index.json`, JSON.stringify(index));

// 4. Images and data the crawled routes requested from the page's own origin (derived from the crawl; nothing else is bundled).
const assets = read('docs/sift3/qa/impl/preview/local-assets.json', { paths: [] }).paths;
let copied = 0; const missingAssets = [];
for (const p of assets) {
  if (!existsSync(`public/${p}`)) { missingAssets.push(p); continue; }
  mkdirSync(join(out, p, '..'), { recursive: true });
  cpSync(`public/${p}`, `${out}/${p}`);
  copied++;
}
if (existsSync('public/icons/sift.svg')) { mkdirSync(`${out}/icons`, { recursive: true }); cpSync('public/icons/sift.svg', `${out}/icons/sift.svg`); }

// 5. The page fragment the Artifact viewer wraps (script and link tags of the vite page, relative URLs).
const html = readFileSync(`${out}/v3-preview.html`, 'utf8');
const tags = [...html.matchAll(/<(?:script|link)\b[^>]*>(?:<\/script>)?/g)].map((m) => m[0].replace(/ crossorigin/g, '').replace(/\.\/assets/, 'assets')).join('\n');
writeFileSync(`${out}/artifact-page.html`, `<title>SIFT 3.0 Captured Preview</title>\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />\n<meta name="theme-color" content="#080b10" />\n<style>html,body{background:#080b10;margin:0}</style>\n${tags}\n<div id="root"></div>\n`);
rmSync(`${out}/v3-preview.html`);

// 6. Manifest: every file to publish.
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const writeManifest = (selfCheck) => {
  const files = walk(out).map((f) => relative(out, f)).filter((p) => p !== 'MANIFEST.json').sort().map((p) => ({ path: p, bytes: statSync(join(out, p)).size, contentType: contentType(p) }));
  const manifest = {
    commit: sha, dirty, builtAt: new Date().toISOString(), capturedAt, clockAt: index.clockAt, page: 'artifact-page.html', root: out,
    fileCount: files.length + 1, totalBytes: files.reduce((a, f) => a + f.bytes, 0), largestFileBytes: Math.max(...files.map((f) => f.bytes)),
    capture: { documents: merged.docs.size, families, skippedFromOtherFamilies: merged.skipped, packEncoding: encoding, packs: meta.map((p) => ({ file: p.file, name: p.name, docs: p.docs, bytes: p.bytes })) },
    assets: { copied, missing: missingAssets },
    selfCheck,
    publish: { note: 'Publish artifact-page.html as the page and every other file below (relative path = published path) through `files`; MANIFEST.json need not be published.', files: files.filter((f) => f.path !== 'artifact-page.html') },
  };
  writeFileSync(`${out}/MANIFEST.json`, JSON.stringify(manifest, null, 1));
  return manifest;
};
writeManifest({ ran: false });

// 7. Self-check: the production-built bundle, served statically with no network but localhost, must load Home on the captured slate.
let selfCheck = { ran: false };
if (!flag('no-check')) {
  const { chromium } = await import('@playwright/test');
  const exe = process.env.SIFT_CHROMIUM ?? ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find(existsSync);
  const srv = await serve(out);
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
    const external = []; const errors = [];
    page.on('request', (r) => { if (!r.url().startsWith(srv.url) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ priceFormat: 'cents', reduceMotion: false, textScale: 'default', onboarded: true })); } catch { /* storage may be blocked */ } });
    await page.goto(srv.url);
    await page.waitForSelector('[data-capture-banner]', { timeout: 30_000 });
    const hasSlate = await page.waitForSelector('.v3-main a[data-tap="game"], .v3-main a[href*="/v3/game/"]', { timeout: 60_000 }).then(() => true).catch(() => false);
    const banner = await page.locator('[data-capture-banner]').innerText();
    const sampleStrip = await page.locator('.v3-demo').count();
    selfCheck = { ran: true, ok: hasSlate && sampleStrip === 0 && external.length === 0 && errors.length === 0, slateRendered: hasSlate, sampleStrip, banner, externalRequests: external, pageErrors: errors, requests: srv.log.length };
  } finally { await browser.close(); await srv.close(); }
}
const m = writeManifest(selfCheck);
if (flag('provenance')) {
  mkdirSync('docs/sift3/qa/impl/preview', { recursive: true });
  const gaps = read(join(gapDir, 'gaps.json'), {});
  writeFileSync('docs/sift3/qa/impl/preview/capture-manifest.json', JSON.stringify({
    capturedAt, clockAt: index.clockAt, baseFamily: 'props', documents: merged.docs.size, families, stamps: stampRange,
    additionsFromOtherFamilies: merged.additions.filter((a) => a.family !== 'gap-fill'),
    gapFills: merged.additions.filter((a) => a.family === 'gap-fill').map((a) => ({ ...a, url: gaps[a.hash]?.url ?? null, fetchedAt: gaps[a.hash]?.fetchedAt ?? null })),
    gapFillAttemptsRejected: Object.values(gaps).filter((g) => /^rejected/.test(g.verdict ?? '')).map((g) => ({ url: g.url, run_id: g.run_id, generated_at: g.generated_at, verdict: g.verdict })),
    skippedBecauseBaseHasUrl: merged.skipped,
  }, null, 1) + '\n');
}
console.log(`captured preview ready in ${out}/ : ${m.fileCount} files, ${(m.totalBytes / 1048576).toFixed(2)} MB, largest ${(m.largestFileBytes / 1048576).toFixed(2)} MB, ${merged.docs.size} documents in ${meta.length} packs; self-check ${selfCheck.ran ? (selfCheck.ok ? 'PASS' : 'FAIL') : 'skipped'}`);
if (selfCheck.ran && !selfCheck.ok) { console.error(JSON.stringify(selfCheck, null, 1)); process.exit(1); }
