// The 26 locked research designs (Player P1-P4, Game G1-G3, Prop Discovery PD1-PD6, Team TR1-TR6, Statistic SD1-SD7) and the four root tabs, as
// reproducible phone scenes over the COMMITTED real-document fixtures (fixtures/real). One table drives two things:
//   * e2e/v3-fidelity.spec.ts       the committed pixel baselines (toHaveScreenshot, 390x844, 1x), offline;
//   * V3_FIDELITY_OUT=<dir>         the same scenes written as 2x PNGs for the reference-vs-implementation comparison images
//                                   (docs/sift3/qa/impl/fidelity/, scripts/v3-qa/fidelity-compare.py).
// Nothing is invented: each family is served by e2e/support/realFeeds.ts / playerFeeds.ts on its pinned clock; quote prices are the published
// ones with only their observation time re-stamped (freshQuotes), exactly as the family specs do.
import { expect, type Page } from '@playwright/test';
import { feedNow, freshQuotes, useRealFeeds as serveRealFeeds, type FeedFamily } from './realFeeds';
import { usePlayerFeeds as servePlayerFeeds } from './playerFeeds';

export const LAMB = 'prt_4c661ae8b854ff5f66dd';
export const PICKENS = 'prt_74580802ab4833992610';
const GAME = '/v3/game/nfl/evt_cd335cc6d5f5b8d8f7b3';
const ADJ = '/v3/stat/nfl/adj_off_epa';
const PLAYER = `/v3/player/nfl/${LAMB}`;

export interface Scene {
  id: string;
  /** The locked reference image (docs/sift3/redesign/out/<ref>.png), or null for a root tab (no locked image). */
  ref: string | null;
  title: string;
  family: FeedFamily;
  route: string;
  /** A selector that is on screen when the scene's data has arrived. */
  ready: string;
  /** Interactions after the route is ready (all deterministic: no timers, no real network). */
  prep?: (page: Page) => Promise<void>;
  /** A screen dense enough that the 375x667 phone is also compared. */
  dense?: boolean;
}

const scrollTo = async (page: Page, y: number) => { await page.evaluate((t) => window.scrollTo(0, t), y); await page.waitForTimeout(250); };
const scrollIntoTop = async (page: Page, sel: string, pad = 70) => {
  await page.evaluate(({ s, p }) => { const el = document.querySelector(s); if (el) window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - p)); }, { s: sel, p: pad });
  await page.waitForTimeout(300);
};

export const SCENES: Scene[] = [
  // ---- Player Research -------------------------------------------------------------------------------------------------------------------------
  { id: 'P1', ref: 'p1', title: 'Player overview, chart first', family: 'player', route: PLAYER, ready: '.v3p-hb', dense: true },
  {
    id: 'P2', ref: 'p2', title: 'Drag the line, compare every rung', family: 'player', route: PLAYER, ready: '.v3p-hb', dense: true,
    prep: async (page) => { await scrollTo(page, 560); await expect(page.locator('.v3p-ladder').first()).toBeVisible(); },
  },
  {
    id: 'P3', ref: 'p3', title: 'Research builder', family: 'player', route: PLAYER, ready: '.v3p-hb', dense: true,
    prep: async (page) => {
      await page.locator('.v3p-pill--f').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      const away = page.getByRole('button', { name: /^Away/ });
      if (await away.count()) await away.first().click();
      await page.waitForTimeout(500);
    },
  },
  { id: 'P4', ref: 'p4', title: 'Matchup tab', family: 'player', route: `${PLAYER}?tab=matchup`, ready: '.v3p-sl', dense: true },
  // ---- Game Detail / Matchup -------------------------------------------------------------------------------------------------------------------
  { id: 'G1', ref: 'g1', title: 'Matchup: offense against defense', family: 'game', route: `${GAME}?v=1&tab=matchup`, ready: '.mx-tug', dense: true },
  { id: 'G2', ref: 'g2', title: 'One unit, in depth', family: 'game', route: `${GAME}?v=1&tab=matchup&dir=DAL&unit=pass`, ready: '[data-testid=unit-view]', dense: true },
  {
    id: 'G3', ref: 'g3', title: 'Lens, game shape, key matchups', family: 'game', route: `${GAME}?v=1&tab=matchup`, ready: '.mx-tug', dense: true,
    prep: async (page) => { await scrollIntoTop(page, '[data-testid=sift-lens]'); },
  },
  // ---- Prop Discovery --------------------------------------------------------------------------------------------------------------------------
  { id: 'PD1', ref: 'pd1', title: 'Discover', family: 'props', route: '/v3/props', ready: '.pd-card, .pd-row', dense: true },
  { id: 'PD2', ref: 'pd2', title: 'All props', family: 'props', route: '/v3/props?v=1&view=list&sport=nhl&fam=points', ready: '.pd-row', dense: true },
  {
    id: 'PD3', ref: 'pd3', title: 'Peek', family: 'props', route: '/v3/props?v=1&view=list&sport=nhl&fam=points', ready: '.pd-row', dense: true,
    prep: async (page) => {
      const id = await page.locator('.pd-row').first().getAttribute('data-prop');
      await page.goto(`./#/v3/props?v=1&view=list&sport=nhl&fam=points&exp=${id}&pin=1`);
      await page.waitForSelector('.pd-peek');
      await page.waitForTimeout(800);
      await page.evaluate(() => window.scrollTo(0, Math.max(0, (document.querySelector('.pd-row.is-open')?.getBoundingClientRect().top ?? 0) + window.scrollY - 70)));
      await page.waitForTimeout(400);
    },
  },
  {
    id: 'PD4', ref: 'pd4', title: 'Sort and filter', family: 'props', route: '/v3/props?v=1&view=list&sport=nhl&fam=points&sort=price', ready: '.pd-row', dense: true,
    prep: async (page) => { await page.getByRole('button', { name: /Open sort and filters/ }).click(); await page.waitForSelector('.pd-fs'); await page.waitForTimeout(600); },
  },
  {
    id: 'PD5', ref: 'pd5', title: 'Compare', family: 'props', route: '/v3/props?v=1&view=list&sport=nfl&fam=receptions', ready: '.pd-row', dense: true,
    prep: async (page) => {
      const nfl = await page.evaluate(() => [...document.querySelectorAll('.pd-row[data-prop]')].slice(0, 2).map((e) => e.getAttribute('data-prop')));
      await page.goto('./#/v3/props?v=1&view=list&sport=nhl&fam=points');
      await page.waitForSelector('.pd-row');
      const nhl = await page.evaluate(() => [...document.querySelectorAll('.pd-row[data-prop]')].slice(0, 1).map((e) => e.getAttribute('data-prop')));
      await page.goto(`./#/v3/props?v=1&view=compare&cmp=${[...nfl, ...nhl].join(',')}`);
      await page.waitForSelector('.pd-compare');
      await page.waitForTimeout(600);
    },
  },
  {
    id: 'PD6', ref: 'pd6', title: 'The exact contract', family: 'props', route: '/v3/props?v=1&view=list&sport=nhl&fam=points', ready: '.pd-row', dense: true,
    prep: async (page) => {
      const id = await page.locator('.pd-row').first().getAttribute('data-prop');
      await page.goto(`./#/v3/props?v=1&view=list&sport=nhl&fam=points&exp=${id}&pin=1`);
      await page.waitForSelector('.pd-peek');
      await page.locator('.pd-peek .pd-acts a[data-tap="price"]').click();
      await page.waitForSelector('.v3c');
      await page.waitForTimeout(1000);
    },
  },
  // ---- Team Research ---------------------------------------------------------------------------------------------------------------------------
  { id: 'TR1', ref: 'tr1', title: 'Overview', family: 'team', route: '/v3/team/nfl/DAL', ready: '.tm-idt .idr', dense: true },
  { id: 'TR2', ref: 'tr2', title: 'Profile', family: 'team', route: '/v3/team/nfl/DAL?tab=profile&adj=0', ready: '.tm .prr', dense: true },
  { id: 'TR3', ref: 'tr3', title: 'Form', family: 'team', route: '/v3/team/nfl/DAL?tab=form', ready: '.tm .res', dense: true },
  { id: 'TR4', ref: 'tr4', title: 'Schedule', family: 'team', route: '/v3/team/nfl/DAL?tab=schedule', ready: '.tm .sch', dense: true },
  { id: 'TR5', ref: 'tr5', title: 'Players', family: 'team', route: '/v3/team/nfl/DAL?tab=players', ready: '.tm .plr', dense: true },
  { id: 'TR6', ref: 'tr6', title: 'Overview, hockey', family: 'team', route: '/v3/team/nhl/TOR', ready: '.tm-idt .idr', dense: true },
  // ---- Statistic Detail and League Rankings -----------------------------------------------------------------------------------------------------
  { id: 'SD1', ref: 'sd1', title: 'Ranking', family: 'stat', route: `${ADJ}?v=1&sel=DAL&opp=PHI`, ready: '.st-hd h1', dense: true },
  { id: 'SD2', ref: 'sd2', title: 'Trend', family: 'stat', route: '/v3/stat/nfl/points_for?v=1&tab=trend&sel=DAL', ready: '.st-obs svg [data-obs]', dense: true },
  { id: 'SD3', ref: 'sd3', title: 'Raw versus adjusted', family: 'stat', route: `${ADJ}?v=1&sbs=1&sel=DAL`, ready: '.st-hd h1', dense: true },
  { id: 'SD4', ref: 'sd4', title: 'Compare teams', family: 'stat', route: `${ADJ}?v=1&tab=compare&sel=DAL&opp=PHI`, ready: '.st-hd h1', dense: true },
  { id: 'SD5', ref: 'sd5', title: 'Compare players', family: 'stat', route: `${ADJ}?v=1&tab=compare&sel=DAL&opp=PHI&cmpm=players&a=${LAMB}&b=${PICKENS}&cs=receptions&thr=5`, ready: '.st-hd h1', dense: true },
  { id: 'SD6', ref: 'sd6', title: 'About', family: 'stat', route: `${ADJ}?v=1&tab=about&sel=DAL&opp=PHI`, ready: '.st-hd h1', dense: true },
  { id: 'SD7', ref: 'sd7', title: 'Hockey ranking', family: 'stat', route: '/v3/stat/nhl/pp_pct?v=1&sel=TOR&opp=CGY', ready: '.st-hd h1', dense: true },
  // ---- Root tabs (no locked image) --------------------------------------------------------------------------------------------------------------
  { id: 'ROOT-Home', ref: null, title: 'Home', family: 'props', route: '/v3', ready: '.v3-main', dense: true },
  { id: 'ROOT-Games', ref: null, title: 'Games', family: 'props', route: '/v3/games', ready: '.v3-main', dense: true },
  { id: 'ROOT-Explore', ref: null, title: 'Explore', family: 'props', route: '/v3/explore', ready: '.v3-main', dense: true },
  {
    id: 'ROOT-Following', ref: null, title: 'Following', family: 'player', route: PLAYER, ready: '.v3p-hb', dense: true,
    prep: async (page) => {
      await page.getByRole('button', { name: 'Save this research' }).first().click();
      await page.locator('.v3-nav a', { hasText: /^Following$/ }).first().click();
      await expect(page).toHaveURL(/#\/v3\/following/);
      await page.waitForTimeout(800);
    },
  },
];

/** Serve one scene's family: feeds, quote re-stamp where the family has quotes, a fixed clock, no other network, a welcomed device. */
export async function serveScene(page: Page, family: FeedFamily): Promise<void> {
  await page.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ priceFormat: 'cents', reduceMotion: false, textScale: 'default', onboarded: true })); } catch { /* storage may be blocked */ } });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  if (family === 'player') { await servePlayerFeeds(page); return; }
  await page.clock.setFixedTime(feedNow(family));
  await serveRealFeeds(page, { family });
  if (family === 'game' || family === 'props') await freshQuotes(page, { family });
}

/** Everything that would make two runs differ: no animation or transition, no caret, system scroll, web fonts and images decoded. */
export async function steady(page: Page): Promise<void> {
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = i.onerror = () => r(null); }))));
  });
  await page.waitForTimeout(250);
}
