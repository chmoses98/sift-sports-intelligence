// One-off, read-only CBB production verification of the LIVE Sift site (GitHub Pages), Chromium desktop +
// WebKit iPhone. Run from a temporary branch's workflow; never merged.
import { chromium, devices, webkit } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.SIFT_URL ?? 'https://chmoses98.github.io/sift-sports-intelligence/';
const CBB = 'https://raw.githubusercontent.com/chmoses98/cbb-edge-finder/app-data/app/latest/';
const fails = [];
const ok = (c, m) => { console.log(`${c ? '  ok  ' : '  FAIL'} ${m}`); if (!c) fails.push(m); };
mkdirSync('shots', { recursive: true });

const health = await (await fetch(`${CBB}health.json`)).json();
const st = health.extensions.cbb;
const events = (await (await fetch(`${CBB}events.json`)).json()).items;
const seen = (loc) => loc.first().waitFor({ timeout: 30_000 }).then(() => true, () => false);
const name = (e, id) => e.participants.find((p) => p.participant_id === id)?.display_name ?? '';
const gp = events.find((e) => /Gonzaga/.test(name(e, e.away_participant) + name(e, e.home_participant)) && /Purdue/.test(name(e, e.away_participant) + name(e, e.home_participant)));
const purdue = gp && [gp.home_participant, gp.away_participant].find((id) => /Purdue/.test(name(gp, id)));
const tbd = events.find((e) => e.extensions.cbb.tbd);
console.log(`publication ${health.generated_at} · status ${st.research_status} · N=${st.prospective.game_1.N} · projected ${st.projection_states.PROJECTED ?? 0} · leaders ${Object.keys(st.leaders ?? {}).length}`);
ok(!!gp && !!purdue, 'Gonzaga vs Purdue is on the live CBB schedule');

async function overflow(page, what) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(w <= 1, `${what}: no horizontal overflow (${w}px)`);
}
async function noError(page, what) {
  ok((await page.locator('.notice--error').count()) === 0, `${what}: no error state`);
}

async function run(browserType, opts, label) {
  console.log(`\n== ${label}`);
  const b = await browserType.launch();
  const ctx = await b.newContext({ ...opts, timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const mobile = !!opts.isMobile;
  const go = async (h) => { await page.goto(`${BASE}#${h}`); await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {}); };

  // navigation
  await go('/');
  if (!mobile) ok(await seen(page.locator('.snav').getByRole('link', { name: 'CBB' })), 'CBB in the top navigation');
  await go('/sports');
  ok(await seen(page.locator('.sportcard2', { hasText: "NCAA Division I Men's Basketball" })), 'CBB on Sports');

  // CBB home
  await go('/cbb');
  await page.getByRole('heading', { name: 'CBB', level: 1 }).waitFor({ timeout: 30_000 });
  const homeText = await page.locator('main').innerText();
  ok(/Research only/.test(homeText), 'home: research only');
  ok(new RegExp(`N = ${st.prospective.game_1.N}`).test(homeText), `home: prospective N = ${st.prospective.game_1.N}`);
  if (st.research_status === 'PRESEASON') {
    ok(/Preseason: the prospective experiment is armed/.test(homeText), 'home: preseason status');
    ok(/No conclusion yet/.test(homeText), 'home: no conclusion yet');
    ok(/Projection pending/.test(homeText), 'home: projection pending shown');
  }
  ok(/not published/.test(homeText), 'home: markets not published (none invented)');
  if (Object.keys(st.leaders ?? {}).length) ok(await seen(page.getByRole('heading', { name: 'National picture' })), 'home: national picture from the published leaders');
  await noError(page, 'home');
  await overflow(page, 'home');
  await page.screenshot({ path: `shots/${label}-home.png` });

  // slate
  await go('/cbb/slate');
  await page.getByRole('heading', { name: 'Slate', level: 1 }).waitFor({ timeout: 30_000 });
  const rows = await page.locator('.cgame').count();
  ok(rows === events.length, `slate: every game listed (${rows} of ${events.length})`);
  if (tbd) ok((await page.locator('.cgame__time.is-tbd', { hasText: 'TBD' }).count()) > 0, 'slate: TBD tips stay TBD');
  ok((await page.locator('.cgame__score').count()) === (st.projection_states.PROJECTED ?? 0) || st.research_status !== 'PRESEASON', 'slate: no projection shown that the publication does not carry');
  await overflow(page, 'slate');
  await page.screenshot({ path: `shots/${label}-slate.png` });

  // Gonzaga vs Purdue
  await go(`/cbb/game/${gp.event_id}`);
  await page.locator('.cgh').waitFor({ timeout: 30_000 });
  const hero = await page.locator('.cgh').innerText();
  ok(/Gonzaga/.test(hero) && /Purdue/.test(hero), 'game: both teams in the hero');
  if (gp.extensions.cbb.event_name) ok(hero.includes(gp.extensions.cbb.event_name), `game: event label (${gp.extensions.cbb.event_name})`);
  if (gp.extensions.cbb.neutral_site) ok(/Neutral site/.test(hero), 'game: neutral-site label');
  if (!gp.extensions.cbb.primary) ok(/Projection pending|Capture window open|No pre-tip projection/.test(hero), 'game: pending state, no invented projection');
  ok((await page.locator('.cgh .cconf').count()) === 2, 'game: roster confidence for both teams');
  const logos = await page.locator('.cgh img').evaluateAll((els) => els.map((i) => ({ src: i.getAttribute('src'), w: i.naturalWidth })));
  ok(logos.length === 2 && logos.every((l) => l.w > 0 && /teams\/cbb\/\d+\.webp$/.test(l.src ?? '')), `game: school logos load (${JSON.stringify(logos)})`);
  const ca = await page.locator('.cbbg').evaluate((e) => [getComputedStyle(e).getPropertyValue('--ca').trim(), getComputedStyle(e).getPropertyValue('--ch').trim()]);
  const lum = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0); };
  ok(ca.every((c) => /^#[0-9a-f]{6}$/i.test(c) && lum(c) >= 0.06) && ca[0] !== ca[1], `game: team accents readable on the dark page and distinct (${ca.join(', ')})`);
  ok(/not a confirmed starting lineup/.test(await page.locator('main').innerText()), 'game: rotation is not a confirmed lineup');
  ok(!/starter/i.test(await page.locator('#cg-roster').innerText()), 'game: no "starter" claim in the rotation');
  if (mobile) {
    await page.locator('.cbbg__toc').getByRole('link', { name: 'Rosters' }).click();
    await page.waitForTimeout(800);
    const top = await page.locator('#cg-roster').evaluate((e) => e.getBoundingClientRect().top);
    ok(top >= -5 && top < 300, `mobile: section tab scrolls to Rosters (top ${Math.round(top)})`);
  }
  await noError(page, 'game');
  await overflow(page, 'game');
  await page.screenshot({ path: `shots/${label}-game.png` });

  // deep link reload
  await page.reload();
  await page.locator('.cgh').waitFor({ timeout: 30_000 });
  ok(/Purdue/.test(await page.locator('.cgh').innerText()), 'game deep link survives reload');

  // logo fallback: block one school's logo
  const espn = (await page.locator('.cgh img').first().getAttribute('src')).match(/(\d+)\.webp$/)[1];
  await page.route(`**/teams/cbb/${espn}.webp`, (r) => r.abort());
  await page.reload();
  await page.locator('.cgh').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  ok((await page.locator('.cgh .clogo--mono').count()) >= 1, 'logo failure falls back to the school monogram');
  await page.unroute(`**/teams/cbb/${espn}.webp`);

  // Purdue
  await go(`/cbb/team/${purdue}`);
  await page.getByRole('heading', { name: 'Purdue Boilermakers', level: 1 }).waitFor({ timeout: 30_000 });
  ok(true, 'Purdue team page loads');
  ok(/not opponent-adjusted/i.test(await page.locator('main').innerText()), 'team: roster metrics labelled not opponent-adjusted');
  await noError(page, 'team');
  await overflow(page, 'team');
  if (mobile) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const nav = [...document.querySelectorAll('nav')].find((n) => getComputedStyle(n).position === 'fixed' && n.getBoundingClientRect().top > window.innerHeight / 2);
      const last = [...document.querySelectorAll('main details, main section, main p')].filter((e) => e.getBoundingClientRect().height > 0).pop();
      return nav && last ? { navTop: nav.getBoundingClientRect().top, lastBottom: last.getBoundingClientRect().bottom } : null;
    });
    ok(!!r && r.lastBottom <= r.navTop + 1, `mobile: bottom navigation does not cover the end of content (${JSON.stringify(r)})`);
  }
  await page.screenshot({ path: `shots/${label}-team.png` });

  // a national ranking: exactly the published entries
  const rk = Object.values(st.leaders ?? {})[0];
  if (rk) {
    const doc = await (await fetch(`${CBB}explorer/rankings/${rk.ranking_id}.json`)).json();
    await go(`/cbb/ranking/${rk.ranking_id}`);
    await page.locator('.rankbars__row').first().waitFor({ timeout: 30_000 });
    ok((await page.locator('.rankbars__row').count()) === doc.entries.length, `ranking: ${doc.entries.length} published entries, nothing invented`);
    await overflow(page, 'ranking');
  }

  // other sports unaffected
  for (const [h, re] of [['/nfl', /NFL/], ['/nhl', /NHL/], ['/mlb', /MLB/]]) {
    await go(h);
    await page.locator('h1').first().waitFor({ timeout: 30_000 });
    ok(re.test(await page.locator('h1').first().innerText()) || re.test(await page.title()), `${h} loads`);
    await noError(page, h);
  }
  await go('/nfl/slate');
  const card = page.locator('a[href*="/nfl/game/"]').first();
  if (await card.count()) {
    await card.click();
    await page.locator('h1').first().waitFor({ timeout: 30_000 });
    ok(true, 'NFL game page opens from the slate');
    await noError(page, 'nfl game');
  }
  ok(errs.length === 0, `no page errors (${errs.join(' | ')})`);
  await b.close();
}

await run(chromium, { viewport: { width: 1440, height: 1000 } }, 'chromium-desktop');
await run(webkit, { ...devices['iPhone 15 Pro'] }, 'webkit-iphone');
console.log(fails.length ? `\n${fails.length} FAILED:\n- ${fails.join('\n- ')}` : '\nALL CBB PRODUCTION CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
