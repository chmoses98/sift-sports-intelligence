// Reachability crawl of the captured-data preview: starting from each root tab, reach BY TAPPING (never by typing an address) every one of the 26
// locked research designs (Player P1-P4, Game G1-G3, Prop Discovery PD1-PD6, Team TR1-TR6, Statistic SD1-SD7) and assert that each renders its locked
// structure with data. The built preview (dist-v3-snapshot/, scripts/build-v3-captured-preview.mjs) is served statically; the only network is
// localhost (every other host is refused and counted). Output: docs/sift3/qa/impl/preview/{crawl-report.json,crawl-report.md,<id>.png,...}.
//
//   node scripts/v3-qa/preview-routes.mjs [--root dist-v3-snapshot] [--only P1,PD3] [--out docs/sift3/qa/impl/preview] [--write-order] [--write-assets]
//   SIFT_CHROMIUM=<chrome> (default: the sandbox Chromium); PREVIEW_PORT (default: a free port); PREVIEW_TZ (default America/New_York)
//
// --write-order  rewrites scripts/v3-preview/pack-order.json (documents grouped by the design that first read them: the build packs them together)
// --write-assets rewrites docs/sift3/qa/impl/preview/local-assets.json (same-origin images and data the crawled routes requested; the build bundles them)
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '../v3-preview/static-server.mjs';
import { DESIGNS, ROOT_TABS, STATES, SWEEPS } from './preview-designs.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i > -1 ? argv[i + 1] : d; };
const flag = (n) => argv.includes(`--${n}`);
const root = arg('root', 'dist-v3-snapshot');
const out = arg('out', 'docs/sift3/qa/impl/preview');
const only = arg('only', '') ? new Set(arg('only').split(',')) : null;
const exe = process.env.SIFT_CHROMIUM ?? ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find(existsSync);
mkdirSync(out, { recursive: true });

const sha1 = (s) => createHash('sha1').update(s).digest('hex');
const srv = await serve(root, Number(process.env.PREVIEW_PORT ?? 0));
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, timezoneId: process.env.PREVIEW_TZ ?? 'America/New_York', locale: 'en-US', serviceWorkers: 'block' });

// ---- network accounting: only same-origin is allowed; everything else is refused and counted -------------------------------------------------
const net = { local: new Map(), external: [], blockedInPage: [], liveQuoteNetwork: [], served: new Map(), missed: new Set() };
await context.route((u) => u.origin !== srv.url.replace(/\/$/, ''), (r) => { net.external.push(r.request().url()); return r.abort(); });
context.on('request', (r) => {
  const u = new URL(r.url());
  if (u.origin === srv.url.replace(/\/$/, '')) net.local.set(u.pathname, (net.local.get(u.pathname) ?? 0) + 1);
  if (/live-quotes|relay\.|kalshi/i.test(r.url()) && u.origin !== srv.url.replace(/\/$/, '')) net.liveQuoteNetwork.push(r.url());
});
// The first design opens Home with no stored preferences: the first-run Welcome must appear once, be dismissed by a tap, and never return.
const report = { builtFrom: root, startedAt: new Date().toISOString(), viewport: '390x844', timezone: process.env.PREVIEW_TZ ?? 'America/New_York', welcome: null, roots: [], designs: [], sweeps: [], network: null };

// ---- helpers ---------------------------------------------------------------------------------------------------------------------------------
async function open(label) {
  const page = await context.newPage();
  page.__inflight = 0;
  page.on('request', (r) => { if (r.url().startsWith(srv.url)) page.__inflight++; });
  page.on('requestfinished', (r) => { if (r.url().startsWith(srv.url)) page.__inflight--; });
  page.on('requestfailed', (r) => { if (r.url().startsWith(srv.url)) page.__inflight--; });
  page.__errors = [];
  page.setDefaultTimeout(25_000);
  page.on('pageerror', (e) => page.__errors.push(String(e).slice(0, 300)));
  await page.goto(srv.url);
  await page.waitForSelector('[data-capture-banner]', { timeout: 30_000 });
  await settle(page);
  void label;
  return page;
}

async function settle(page, quiet = 450) {
  const t0 = Date.now();
  let stableSince = Date.now(); let last = '';
  while (Date.now() - t0 < 40_000) {
    const s = await page.evaluate(() => `${window.__siftCapture?.served.length}/${window.__siftCapture?.missed.length}/${document.querySelectorAll('.v3-skel,[aria-busy="true"]').length}`).catch(() => '');
    if (s !== last || page.__inflight > 0) { last = s; stableSince = Date.now(); }
    if (Date.now() - stableSince >= quiet && !/\/[1-9]\d*$/.test(last)) return;
    await page.waitForTimeout(100);
  }
}

/** Harvest what the page asked for (called before a page closes). */
async function harvest(page, group) {
  const c = await page.evaluate(() => window.__siftCapture ? { served: window.__siftCapture.served, missed: window.__siftCapture.missed, blocked: window.__siftCapture.blocked, packs: window.__siftCapture.packsFetched } : null).catch(() => null);
  if (!c) return { served: 0, missed: 0, blocked: 0 };
  for (const u of c.served) if (!net.served.has(u)) net.served.set(u, group);
  for (const u of c.missed) net.missed.add(u);
  net.blockedInPage.push(...c.blocked);
  return { served: c.served.length, missed: c.missed.length, blocked: c.blocked.length, packs: c.packs };
}

const ctxFor = (page, d) => {
  const path = []; const checks = []; const notes = [];
  const t = {
    page, path, checks, notes, d,
    /** One tap: record it in the path, perform it, wait for the screen to settle. */
    async tap(label, target, o = {}) {
      const loc = typeof target === 'string' ? page.locator(target).first() : target;
      path.push(label);
      await loc.scrollIntoViewIfNeeded({ timeout: 20_000 });
      await page.waitForTimeout(120);
      await loc.click({ timeout: 20_000, ...(o.click ?? {}) });
      await settle(page, o.quiet);
    },
    check(what, ok, detail = '') { checks.push({ what, ok: !!ok, ...(detail ? { detail } : {}) }); return !!ok; },
    /** Structure: selector count (min/max) and optional text; polls for up to `wait` ms (a lazy screen chunk may still be arriving). */
    async has(what, selector, o = {}) {
      const loc = page.locator(selector);
      const end = Date.now() + (o.wait ?? 8000);
      let ok = false; let detail = '';
      for (;;) {
        const n = await loc.count();
        ok = n >= (o.min ?? 1) && (o.max == null || n <= o.max);
        detail = `${n} found`;
        if (ok && o.text) { const txt = (await loc.first().innerText()).replace(/\s+/g, ' '); ok = o.text.test(txt); detail = `${n} found; text "${txt.slice(0, 90)}"`; }
        if (ok || Date.now() > end) break;
        await page.waitForTimeout(250);
      }
      return t.check(what, ok, detail);
    },
    async text(what, re, selector = '.v3-main') {
      const loc = page.locator(selector).first();
      const end = Date.now() + 8000;
      let txt = '';
      for (;;) {
        txt = (await loc.innerText().catch(() => '')).replace(/\s+/g, ' ');
        if (re.test(txt) || Date.now() > end) break;
        await page.waitForTimeout(250);
      }
      return t.check(what, re.test(txt), re.test(txt) ? '' : `text was "${txt.slice(0, 120)}"`);
    },
    async hash() { return page.evaluate(() => location.hash); },
    async tab(name) { return t.tap(`${name} tab`, page.locator('.v3-nav a', { hasText: name }).first()); },
    async root(name) { return t.tap(`${name} (bottom tab)`, page.locator('.v3-nav a', { hasText: new RegExp(`^${name}$`) }).first()); },
    /** The in-screen tab strip (Overview, Props, ...). */
    async sub(name, o = {}) { return t.tap(`${name}`, page.getByRole('tab', { name: new RegExp(`^${name}`) }).first(), o); },
  };
  return t;
};

async function shot(page, id) { const f = `${id}.png`; await page.waitForTimeout(150); await page.screenshot({ path: join(out, f) }); return f; }

// The three derived lists accumulate across runs (a run with --only adds what its designs read; nothing is removed): the build needs the union.
// They are written after every design so an interrupted crawl keeps what it learned.
const readJson = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);
const union = (a, b) => [...new Set([...(a ?? []), ...b])].sort();
const isBuilt = (p) => p === '/' || /^\/(assets|snapshot|packs)\//.test(p);
function derived() {
  const assets = [...net.local.keys()].filter((p) => !isBuilt(p) && p !== '/favicon.ico').map((p) => p.replace(/^\//, ''));
  return { assets, assetsOk: assets.filter((p) => existsSync(join('public', p))) };
}
function flushDerived() {
  const { assets, assetsOk } = derived();
  if (flag('write-missed')) {
    const f = join(out, 'missed-documents.json');
    writeFileSync(f, JSON.stringify({ note: 'Published-document URLs the crawled routes requested that the capture does not hold (answered 404).', urls: union(readJson(f, {}).urls, [...net.missed]) }, null, 1) + '\n');
  }
  if (flag('write-assets')) {
    const f = join(out, 'local-assets.json');
    const old = readJson(f, {});
    writeFileSync(f, JSON.stringify({ note: 'Same-origin images and data requested by the crawled routes (derived by scripts/v3-qa/preview-routes.mjs --write-assets); the build copies each from public/.', paths: union(old.paths, assetsOk), notInPublic: union(old.notInPublic, assets.filter((p) => !existsSync(join('public', p)))) }, null, 1) + '\n');
  }
  if (flag('write-order')) {
    const f = 'scripts/v3-preview/pack-order.json';
    const groups = new Map();
    for (const [u, g] of net.served) (groups.get(g) ?? groups.set(g, []).get(g)).push(sha1(u));
    const prev = readJson(f, []).filter((g) => !groups.has(g.group));
    writeFileSync(f, JSON.stringify([...prev, ...[...groups].map(([group, hashes]) => ({ group, hashes }))]) + '\n');
  }
}

// ---- first-run Welcome (once) ------------------------------------------------------------------------------------------------------------------
{
  const page = await context.newPage();
  page.__inflight = 0;
  await page.goto(srv.url);
  await page.waitForSelector('[data-capture-banner]', { timeout: 30_000 });
  const shows = await page.waitForSelector('.v3-welcome', { timeout: 40_000 }).then(() => true).catch(() => false);
  let dismissed = false;
  if (shows) {
    await page.getByRole('button', { name: /Explore without setup|Start/ }).click();
    dismissed = await page.waitForSelector('.v3-welcome', { state: 'detached', timeout: 5000 }).then(() => true).catch(() => false);
  }
  await page.reload();
  await page.waitForSelector('[data-capture-banner]');
  await page.waitForTimeout(4000);
  const again = (await page.locator('.v3-welcome').count()) > 0;
  const blocks = shows ? await page.locator('.v3-nav').isVisible() : null;
  report.welcome = { shownOnFirstVisit: shows, dismissedByTap: dismissed, shownAgainAfterReload: again, tabBarVisibleBeforeDismiss: blocks, ok: shows && dismissed && !again };
  await harvest(page, 'home');
  await page.close();
}

// ---- root tabs ---------------------------------------------------------------------------------------------------------------------------------
for (const r of ROOT_TABS) {
  if (only && !only.has(r.id)) continue;
  const page = await open(r.id);
  const t = ctxFor(page, r);
  const started = Date.now();
  try { await r.run(t); } catch (e) { t.check('crawl step failed', false, String(e.message ?? e).split('\n')[0]); }
  const shotFile = await shot(page, r.id);
  const h = await harvest(page, r.id);
  if (page.__errors.length) t.check('no uncaught page errors', false, page.__errors.join(' | '));
  report.roots.push({ id: r.id, title: r.title, from: r.from, path: t.path, pass: t.checks.every((c) => c.ok), checks: t.checks, notes: t.notes, requests: h, screenshot: shotFile, ms: Date.now() - started });
  console.log(`${t.checks.every((c) => c.ok) ? 'PASS' : 'FAIL'} ${r.id} ${r.title}`);
  await page.close();
  flushDerived();
}

// ---- the 26 designs ----------------------------------------------------------------------------------------------------------------------------
for (const d of DESIGNS) {
  if (only && !only.has(d.id)) continue;
  const page = await open(d.id);
  const t = ctxFor(page, d);
  const started = Date.now();
  try { await d.run(t); } catch (e) { t.check('crawl step failed', false, String(e.message ?? e).split('\n')[0]); }
  const shotFile = await shot(page, d.id).catch(() => null);
  const h = await harvest(page, d.id);
  if (page.__errors.length) t.check('no uncaught page errors', false, page.__errors.join(' | '));
  const pass = t.checks.length > 0 && t.checks.every((c) => c.ok);
  report.designs.push({ id: d.id, title: d.title, from: d.from, path: t.path, pass, checks: t.checks, notes: t.notes, requests: h, screenshot: shotFile, ms: Date.now() - started });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${d.id} ${d.title}${pass ? '' : '  <- ' + t.checks.filter((c) => !c.ok).map((c) => `${c.what}: ${c.detail ?? ''}`).join('; ')}`);
  await page.close();
  flushDerived();
}

// ---- sweeps: render every list the preview offers once so the assets they show are known (logos, photos) --------------------------------------------
for (const s of SWEEPS) {
  if (only && !only.has(s.id)) continue;
  const page = await open(s.id);
  const t = ctxFor(page, s);
  try { await s.run(t); } catch (e) { t.check('sweep step failed', false, String(e.message ?? e).split('\n')[0]); }
  await harvest(page, s.id);
  report.sweeps.push({ id: s.id, title: s.title, ok: t.checks.every((c) => c.ok), checks: t.checks, notes: t.notes });
  console.log(`${t.checks.every((c) => c.ok) ? 'PASS' : 'FAIL'} ${s.id} ${s.title} ${t.notes.join(' ')} ${t.checks.map((c) => `${c.what}: ${c.detail ?? ''}`).join('; ')}`);
  await page.close();
  flushDerived();
}

// ---- states of the preview itself (the withheld-price demo; restores the switch) -----------------------------------------------------------------
report.states = [];
for (const d of STATES) {
  if (only && !only.has(d.id)) continue;
  const page = await open(d.id);
  const t = ctxFor(page, d);
  try { await d.run(t); } catch (e) { t.check('crawl step failed', false, String(e.message ?? e).split('\n')[0]); }
  const shotFile = await shot(page, d.id).catch(() => null);
  await harvest(page, d.id);
  const pass = t.checks.length > 0 && t.checks.every((c) => c.ok);
  report.states.push({ id: d.id, title: d.title, from: d.from, path: t.path, pass, checks: t.checks, notes: t.notes, screenshot: shotFile });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${d.id} ${d.title}${pass ? '' : '  <- ' + t.checks.filter((c) => !c.ok).map((c) => `${c.what}: ${c.detail ?? ''}`).join('; ')}`);
  await page.close();
  flushDerived();
}

// ---- network assertions --------------------------------------------------------------------------------------------------------------------------
const origin = srv.url.replace(/\/$/, '');
const localPaths = [...net.local.keys()];
const quoteDocs = [...net.served.keys()].filter((u) => /live-quotes\/games\//.test(u));
const quoteMissed = [...net.missed].filter((u) => /live-quotes\/games\//.test(u));
const { assets } = derived();
report.network = {
  origin,
  localRequests: localPaths.length,
  localByKind: { built: localPaths.filter(isBuilt).length, images_and_data: assets.length },
  externalHostRequestsAttempted: net.external.length,
  externalHosts: [...new Set(net.external.map((u) => new URL(u).host))],
  attemptsRefusedInsideThePage: net.blockedInPage.length,
  liveQuoteNetworkFetches: net.liveQuoteNetwork.length,
  documentsServedFromTheCapture: net.served.size,
  quoteFeedDocumentsServedFromTheCapture: quoteDocs.length,
  quoteFeedDocumentsNotCaptured: quoteMissed.length,
  documentsRequestedButNotCaptured: net.missed.size,
  localAssetsRequestedButNotBundled: assets.filter((p) => !existsSync(join(root, p))).length,
  sameOriginRequestsThatAnswered404: srv.log.filter((l) => l.status === 404).map((l) => l.path).filter((p, i, a) => a.indexOf(p) === i),
};
// Which documents the crawled routes read came from a family other than the base (provenance: docs/sift3/qa/impl/preview/capture-manifest.json)?
{
  const prov = readJson(join(out, 'capture-manifest.json'), null) ?? readJson('docs/sift3/qa/impl/preview/capture-manifest.json', null);
  const add = new Map((prov?.additionsFromOtherFamilies ?? []).map((a) => [a.hash, a]));
  const used = [];
  for (const [u, g] of net.served) { const a = add.get(sha1(u)); if (a) used.push({ family: a.family, kind: a.kind, firstReadBy: g }); }
  report.network.documentsReadFromOtherFamilies = used.sort((x, y) => (x.family + x.kind).localeCompare(y.family + y.kind));
  report.network.additionsInTheCapture = add.size;
}
report.assertions = [
  { what: 'zero requests to an external host', ok: net.external.length === 0 },
  { what: 'zero attempts by the app at an external host (the shim would have refused them)', ok: net.blockedInPage.length === 0 },
  { what: 'zero live-quote network fetches (quote documents come only from snapshot packs)', ok: net.liveQuoteNetwork.length === 0 },
  { what: 'only same-origin snapshot files: no request left the origin', ok: net.external.length === 0 && net.liveQuoteNetwork.length === 0 },
];
report.finishedAt = new Date().toISOString();
const all = [...report.roots, ...report.designs, ...report.states];
report.summary = { designs: report.designs.length, designsPassed: report.designs.filter((d) => d.pass).length, rootsPassed: report.roots.filter((d) => d.pass).length, roots: report.roots.length, assertionsPassed: report.assertions.every((a) => a.ok), welcomeOk: report.welcome.ok, allPass: all.every((d) => d.pass) && report.assertions.every((a) => a.ok) && report.welcome.ok };

if (!only) {
  writeFileSync(join(out, 'crawl-report.json'), JSON.stringify(report, null, 1) + '\n');
  writeFileSync(join(out, 'crawl-report.md'), toMarkdown(report));
}
await browser.close(); await srv.close();
console.log(JSON.stringify(report.summary));
console.log(JSON.stringify(report.network));
process.exit(report.summary.allPass || only ? 0 : 1);
void origin;

function toMarkdown(r) {
  const rows = (arr) => arr.map((d) => `| ${d.id} | ${d.title} | ${d.from ?? ''} | ${d.path.join(' > ')} | ${d.pass ? 'PASS' : 'FAIL'} | ${d.checks.filter((c) => c.ok).length}/${d.checks.length} |`).join('\n');
  const fails = [...r.roots, ...r.designs, ...r.states].filter((d) => !d.pass).map((d) => `- ${d.id}: ${d.checks.filter((c) => !c.ok).map((c) => `${c.what} (${c.detail ?? ''})`).join('; ')}`).join('\n');
  return `# Captured preview: reachability crawl\n\nBuilt from \`${r.builtFrom}\`, 390x844, time zone ${r.timezone}, ${r.startedAt}. Every path below is taps only, starting from a root tab; the page was loaded once at its start address.\n\n` +
    `Welcome (first visit): ${JSON.stringify(r.welcome)}\n\n## Root tabs\n| id | what | start tab | tap path (taps only) | result | checks |\n|---|---|---|---|---|---|\n${rows(r.roots)}\n\n## The 26 locked designs\n| id | design | start tab | tap path (taps only) | result | checks |\n|---|---|---|---|---|---|\n${rows(r.designs)}\n\n## States of the preview itself\n| id | what | start tab | tap path (taps only) | result | checks |\n|---|---|---|---|---|---|\n${rows(r.states)}\n\n` +
    `## Sweeps (render every reachable list once; record what the capture can and cannot open)\n${r.sweeps.map((x) => `- **${x.id}** (${x.ok ? 'PASS' : 'FAIL'}): ${(x.notes ?? []).join(' ') || x.title}`).join('\n')}\n\n## Notes by design\n${[...r.roots, ...r.designs, ...r.states].filter((d) => d.notes.length).map((d) => `- **${d.id}**: ${d.notes.join(' ')}`).join('\n')}\n\n${fails ? `## Failures\n${fails}\n\n` : ''}## Network\n${'```'}json\n${JSON.stringify(r.network, null, 1)}\n${'```'}\n\n${r.assertions.map((a) => `- ${a.ok ? 'PASS' : 'FAIL'}: ${a.what}`).join('\n')}\n`;
}
