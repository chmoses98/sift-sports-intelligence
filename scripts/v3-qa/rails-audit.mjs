// Audit of every row of chips/pills/tabs on the main v3 screens at phone widths: which rows wrap onto several lines, which scroll sideways (and whether
// they are the shared ChipRail), and which push the page sideways.   node --experimental-strip-types scripts/v3-qa/rails-audit.mjs 320 390
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const widths = process.argv.slice(2).map(Number).filter(Boolean);
if (!widths.length) widths.push(320);
const base = process.env.BASE ?? 'http://localhost:5181/sift-sports-intelligence/';
const exe = process.env.SIFT_CHROMIUM ?? ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find(existsSync);
const { useRealFeeds, feedNow } = await import('../../e2e/support/realFeeds.ts');
const ROUTES = ['/v3', '/v3/games?sport=nfl', '/v3/following', '/v3/explore', '/v3/props', '/v3/props?v=1&view=list&sport=nfl', '/v3/team/nfl/DAL', '/v3/stat/nfl/adj_off_epa',
  '/v3/game/nfl/evt_cd335cc6d5f5b8d8f7b3', '/v3/game/nfl/evt_cd335cc6d5f5b8d8f7b3?tab=props', '/v3/settings'];
const b = await chromium.launch(exe ? { executablePath: exe } : {});
for (const w of widths) {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 }, locale: 'en-US', timezoneId: 'America/New_York', hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ onboarded: true })); } catch { /* */ } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(feedNow());
  await useRealFeeds(page);
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  for (const r of ROUTES) {
    await page.goto(`${base}#${r}`);
    await page.waitForSelector('[data-v3-shell]');
    await page.waitForTimeout(6000);
    const rows = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('div, nav, ul, span, header')) {
        const kids = [...el.children].filter((k) => k.matches('button, a, [role=tab], [role=button], label'));
        if (kids.length < 3 || kids.length !== el.children.length) continue;
        const cs = getComputedStyle(el);
        if (!/flex|grid/.test(cs.display)) continue;
        const rects = kids.map((k) => k.getBoundingClientRect()).filter((r) => r.width > 0);
        if (rects.length < 3) continue;
        const h = Math.max(...rects.map((r) => r.height));
        if (h > 64) continue; // cards, not chips
        const tops = new Set(rects.map((r) => Math.round(r.top / 4)));
        const wrapped = tops.size > 1 && cs.display.includes('flex');
        const scrolls = el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(cs.overflowX);
        out.push({ cls: (el.className || el.tagName).toString().slice(0, 48), n: kids.length, wrapped, scrolls, shared: el.classList.contains('v3-xrail'), nowrap: cs.flexWrap });
      }
      return { rows: out, page: document.documentElement.scrollWidth - innerWidth };
    });
    const flagged = rows.rows.filter((x) => x.wrapped || x.scrolls);
    console.log(`${w}  ${r}  pageOverflow=${rows.page}`);
    for (const x of flagged) console.log(`    ${x.wrapped ? 'WRAPS ' : '      '}${x.scrolls ? 'scrolls' : '       '} ${x.shared ? 'ChipRail' : 'native  '} n=${x.n} .${x.cls}`);
  }
  await ctx.close();
}
await b.close();
