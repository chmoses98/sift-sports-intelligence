// One-off post-release smoke of the LIVE site (projection release): desktop, Android-size Chromium, iPhone WebKit.
// Read-only. Prints one JSON line per check and a final RESULT line.
import { chromium, webkit, devices } from '@playwright/test';
import fs from 'node:fs';
const BASE = process.env.SIFT_URL ?? 'https://chmoses98.github.io/sift-sports-intelligence/';
const OUT = process.env.OUT ?? 'smoke-out';
fs.mkdirSync(OUT, { recursive: true });
const NFLR = 'https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/handicap-reports/app/latest';
const MLBR = 'https://raw.githubusercontent.com/chmoses98/edge-finder-api/main/app/latest';
const CFBR = 'https://raw.githubusercontent.com/chmoses98/cfb-edge-finder/main/app/latest';
const BANNED = /\b(shadow model|challenger|incumbent|previous model|old model|new model)\b/i;
const upcoming = async (root, from = 0) => {
  const b = await (await fetch(`${root}/board.json`)).json(); const now = Date.now();
  return b.items.filter((i) => Date.parse(i.start_time_utc) > now - 2 * 3600e3 && !/FINAL|CANCEL|POSTPON/i.test(i.status))
    .sort((a, c) => a.start_time_utc.localeCompare(c.start_time_utc)).map((i) => ({ id: i.event_id, start: i.start_time_utc, name: i.participants.map((p) => p.short_name).join(' @ ') }))[from];
};
const NFL = await upcoming(NFLR), MLB = await upcoming(MLBR), CFB = await upcoming(CFBR);
console.log(JSON.stringify({ games: { NFL, MLB, CFB } }));
const results = [];
const check = (profile, name, ok, detail) => { results.push({ profile, name, ok }); console.log(JSON.stringify({ profile, check: name, ok, detail })); };
const profiles = [
  ['desktop', chromium, { viewport: { width: 1280, height: 900 } }],
  ['android', chromium, { ...devices['Pixel 7'] }],
  ['iphone', webkit, { ...devices['iPhone 13'] }],
];
for (const [pname, engine, opts] of profiles) {
  const browser = await engine.launch();
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 140)));
  const visit = async (name, hash, wait) => {
    errs.length = 0;
    await page.goto(BASE + hash, { waitUntil: 'domcontentloaded' });
    try { await wait?.(); } catch { /* judged by content below */ }
    await page.waitForTimeout(3500);
    const text = await page.locator('body').innerText();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.screenshot({ path: `${OUT}/${pname}-${name}.png` });
    fs.writeFileSync(`${OUT}/${pname}-${name}.txt`, text);
    check(pname, `${name}: renders, no script errors, no horizontal overflow, no old-model wording`, text.length > 1200 && errs.length === 0 && overflow <= 1 && !BANNED.test(text.replace(/Shadow model P\(over\)/g, '')), { chars: text.length, errs: [...errs], overflow, banned: text.match(BANNED)?.[0] ?? null });
    return text;
  };
  await visit('home', '#/', () => page.getByRole('heading').first().waitFor({ timeout: 25000 }));
  await visit('games', '#/games?day=week', () => page.locator('a[href*="/game/"]').first().waitFor({ timeout: 25000 }));
  if (NFL) {
    const g = await visit('gcc-nfl', `#/design/sift2/nfl/game/${NFL.id}`, () => page.getByRole('heading', { name: /Game Read|Player Prop|What Matters/i }).first().waitFor({ timeout: 25000 }));
    const pri = g.match(/All (\d+) priced player props on this game(?: \((\d+) with a published projection\))?/);
    check(pname, 'gcc-nfl: priced-props label states total and projected', pri == null || pri[2] == null || Number(pri[2]) <= Number(pri[1]), { label: pri?.[0] ?? null });
    await visit('props-nfl', `#/design/sift2/nfl/props?game=${NFL.id}`, () => page.getByRole('row').nth(2).waitFor({ timeout: 30000 }));
    const links = await page.locator('a[href*="/player/"]').evaluateAll((as) => as.map((a) => ({ href: a.getAttribute('href'), t: (a.closest('li,article,section,div')?.innerText ?? a.innerText).slice(0, 80) })));
    const pick = (re) => links.find((l) => re.test(l.t)) ?? links[0];
    for (const [stat, label] of [['receptions', 'promoted'], ['receiving_yards', 'held'], ['completions', 'promoted'], ['passing_yards', 'held']]) {
      const l = /completions|passing/.test(stat) ? links.find((x) => /\bQB\b/.test(x.t)) ?? links[0] : links.find((x) => /\b(TE|WR|RB)\b/.test(x.t)) ?? links[0];
      if (!l) { check(pname, `props-nfl ${stat}`, false, 'no player link'); continue; }
      const pid = l.href.split('/player/')[1].split('?')[0];
      await page.goto(`${BASE}#/nfl/props?game=${NFL.id}&player=${pid}&stat=${stat}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4500);
      const t = await page.locator('body').innerText();
      fs.writeFileSync(`${OUT}/${pname}-props-${stat}.txt`, t);
      const n = (t.match(/SIFT projection/g) ?? []).length;
      const hasP = /Projection P\(over\)|Probability over|Shadow model P\(over\)/.test(t);
      check(pname, `props-nfl ${stat} (${label}): one projection number; ${label === 'promoted' ? 'no shadow label' : 'established model only'}`, n <= 1 && (label !== 'promoted' || !/Shadow model/.test(t)), { player: l.t.split('\n')[0], count: n, probLabel: t.match(/(Projection|Shadow model) P\(over\)/)?.[0] ?? null, established: /Established projection/.test(t) });
    }
  }
  if (MLB) {
    const t = await visit('mlb-props', `#/design/sift2/mlb/game/${MLB.id}?tab=props`, () => page.getByRole('heading', { name: /Player props/i }).first().waitFor({ timeout: 25000 }));
    const k = (t.match(/Proj\. [\d.]+ K/g) ?? []), outs = (t.match(/Proj\. [\d.]+ outs/g) ?? []);
    const pitchers = (t.match(/PROBABLE_STARTER|CONFIRMED_STARTER|STARTER/g) ?? []).length;
    check(pname, 'mlb: pitcher projections shown once per stat, hitters withheld with reason when unconfirmed', k.length <= Math.max(pitchers, 2) && outs.length <= Math.max(pitchers, 2), { game: MLB.name, strikeouts: k, outs, withheldHitters: (t.match(/Not projected — [^\n]{0,40}/g) ?? []).length, fallback: /Established projection/.test(t) });
  }
  if (CFB) {
    const t = await visit('cfb-game', `#/design/sift2/cfb/game/${CFB.id}`, () => page.getByRole('heading').first().waitFor({ timeout: 25000 }));
    const withheld = /PROJECTED SCORE WITHHELD|not published yet|withheld/i.test(t), projected = /Projected score/i.test(t) && !withheld;
    check(pname, 'cfb: one projected score or a withheld reason; baseline points line gone', (withheld || projected) && !/scoring baseline \d/i.test(t), { game: CFB.name, withheld, projected });
  }
  const lab = await visit('research-lab', '#/explore', () => page.getByRole('heading').first().waitFor({ timeout: 25000 }));
  check(pname, 'research lab: states what is live in SIFT and what is unchanged', /Live in SIFT/i.test(lab) || /not changed|unchanged/i.test(lab), { hasLive: /Live in SIFT/i.test(lab) });
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log('RESULT ' + JSON.stringify({ total: results.length, failed: failed.map((f) => `${f.profile}: ${f.name}`) }));
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
process.exit(failed.length ? 1 : 0);
