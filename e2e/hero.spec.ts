// Game heroes, every sport with game pages, on the real pages (Chromium phone + desktop, WebKit iPhone + iPhone SE):
// the hero must say at a glance whose home game it is — or that nobody is at home — and never show a photograph of
// another event. The decision itself is unit-tested (tests/hero*.test.ts); this proves the pages render it.
//
// HERO_SHOTS=<dir> also writes each hero (and the page around it) as PNGs for the visual review sheets.
import type { Locator, Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, MLB_FIXTURE, NHL_FIXTURE, noHorizontalOverflow, test } from './fixtures';

const BLOCKED = (JSON.parse(readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), '..', 'scripts', 'heroes', 'blocklist.json'), 'utf-8')) as { files: { file: string }[] }).files;
const SHOTS = process.env.HERO_SHOTS;
const CFB_FIXTURE = join(NHL_FIXTURE, '..', '..', '..', 'cfb', 'app', 'latest');

async function serve(page: Page, re: RegExp, dir: string) {
  await page.context().route(re, async (route) => {
    const rel = re.exec(route.request().url())![1].split('?')[0];
    const file = join(dir, rel);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } });
    return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(file, 'utf-8'), headers: { 'access-control-allow-origin': '*' } });
  });
}

async function openGame(page: Page, sport: string, id: string, selector = 'header.gh') {
  await page.goto(`./#/${sport}/game/${id}`);
  const hero = page.locator(selector).first();
  await expect(hero).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return hero;
}

/** The hero's art finished: its photo (when it has one) or its logo watermark decoded; never a broken image. */
async function artSettled(hero: Locator) {
  const kind = await hero.getAttribute('data-hero-kind');
  if (kind === 'photo') {
    const img = hero.locator('.hart__photo');
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(600);
  }
  for (const img of await hero.locator('img').all()) await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
}

/** Readability: the identity line sits inside the hero and is not covered or clipped. */
async function identityReadable(hero: Locator, text: RegExp) {
  const label = hero.locator('[data-hero-label]').first();
  await expect(label).toHaveText(text);
  const [h, l] = [await hero.boundingBox(), await label.boundingBox()];
  expect(h && l).toBeTruthy();
  expect(l!.x).toBeGreaterThanOrEqual(h!.x - 1);
  expect(l!.x + l!.width).toBeLessThanOrEqual(h!.x + h!.width + 1);
  expect(l!.y).toBeGreaterThanOrEqual(h!.y - 1);
}

async function shot(page: Page, hero: Locator, name: string, project: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.mouse.move(0, 0);
  await hero.screenshot({ path: join(SHOTS, `${project}__${name}__hero.png`), animations: 'disabled' });
  await page.screenshot({ path: join(SHOTS, `${project}__${name}__page.png`), animations: 'disabled' });
}

async function noBlockedPhoto(page: Page) {
  const srcs = await page.locator('img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).currentSrc || (e as HTMLImageElement).src));
  for (const s of srcs) expect(s).not.toMatch(/\/stadiums\//); // the retired venue-only photo set is gone
  const credits = await page.locator('.gh__credit, .fcard__credit').allTextContents();
  for (const b of BLOCKED) for (const c of credits) expect(c).not.toContain(b.file);
}

test.describe('NFL heroes', () => {
  test('Saints at the Superdome: a Saints home game, never Super Bowl LIX @smoke', async ({ page }, info) => {
    const hero = await openGame(page, 'nfl', 'evt_639f74e87ff25310c542');
    await expect(hero).toHaveAttribute('data-hero-team', 'NO');
    await expect(hero).toHaveAttribute('data-hero-context', 'home');
    await expect(hero).toHaveAttribute('data-hero-venue', 'caesars-superdome');
    await identityReadable(hero, /Saints home game/i);
    const photo = await hero.getAttribute('data-hero-photo');
    if (photo) expect(photo).toMatch(/^nfl-no-/); // a photo, when one is approved, is a SAINTS photo
    else await expect(hero.locator('.hart__logo--home')).toHaveAttribute('src', /.+/); // else the Saints' own identity
    await expect(hero.locator('.gh__at')).toHaveText('at');
    await expect(hero.locator('.gh__venue')).toContainText('Caesars Superdome');
    await artSettled(hero);
    await noBlockedPhoto(page);
    await noHorizontalOverflow(page, 'Saints hero');
    await shot(page, hero, 'nfl-saints-superdome', info.project.name);
  });

  test('an approved home photograph: Commanders at Cowboys shows the Cowboys at AT&T Stadium @smoke', async ({ page }, info) => {
    const hero = await openGame(page, 'nfl', 'evt_e32b72d8bcbdfb509d10');
    await expect(hero).toHaveAttribute('data-hero-kind', 'photo');
    await expect(hero).toHaveAttribute('data-hero-photo', 'nfl-dal-att-stadium');
    await identityReadable(hero, /Cowboys home game/i);
    await artSettled(hero);
    // Phones get the 1200 px file, never the 2400 px one.
    const src = await hero.locator('.hart__photo').evaluate((i: HTMLImageElement) => i.src);
    expect(src.startsWith('blob:')).toBe(true);
    await expect(hero.locator('.gh__credit')).toContainText('Michael Barera');
    await shot(page, hero, 'nfl-cowboys-photo', info.project.name);
  });

  test('a shared stadium shows the actual home team: Jets and Giants at MetLife @smoke', async ({ page }, info) => {
    let hero = await openGame(page, 'nfl', 'evt_481eb26944577852e104');
    await expect(hero).toHaveAttribute('data-hero-team', 'NYJ');
    await identityReadable(hero, /Jets home game/i);
    await shot(page, hero, 'nfl-jets-metlife', info.project.name);
    hero = await openGame(page, 'nfl', 'evt_6fbffad89723ee5c2907');
    await expect(hero).toHaveAttribute('data-hero-team', 'NYG');
    await identityReadable(hero, /Giants home game/i);
    await artSettled(hero);
    await shot(page, hero, 'nfl-giants-metlife', info.project.name);
  });

  test('international neutral sites show both teams and nobody at home @smoke', async ({ page }, info) => {
    let hero = await openGame(page, 'nfl', 'evt_2db3c0e312be8071934e'); // Ravens vs Cowboys, Maracanã
    await expect(hero).toHaveAttribute('data-hero-context', 'neutral');
    await expect(hero).toHaveAttribute('data-hero-team', '');
    await expect(hero).toHaveAttribute('data-hero-kind', 'branded');
    await identityReadable(hero, /International game/i);
    await expect(hero.locator('h1')).toHaveText(/ vs /); // the game is final (the separator reads "final"); nobody is "at"
    await artSettled(hero);
    await shot(page, hero, 'nfl-neutral-maracana', info.project.name);
    hero = await openGame(page, 'nfl', 'evt_3b227bf15128bfcc8a91'); // Colts vs Commanders, Tottenham
    await expect(hero).toHaveAttribute('data-hero-context', 'neutral');
    await expect(hero.locator('.gh__venue')).toContainText('Tottenham Hotspur Stadium');
    await shot(page, hero, 'nfl-neutral-london', info.project.name);
  });

  test('an old published name and a missing venue still resolve to the home team’s own stadium @smoke', async ({ page }) => {
    let hero = await openGame(page, 'nfl', 'evt_e124f9c325722883d07f'); // "Reliant Stadium"
    await expect(hero).toHaveAttribute('data-hero-venue', 'nrg-stadium');
    await identityReadable(hero, /Texans home game/i);
    hero = await openGame(page, 'nfl', 'evt_1c75b9acfe4635c9a60a'); // no venue published
    await expect(hero).toHaveAttribute('data-hero-venue', 'huntington-bank-field');
    await identityReadable(hero, /Browns home game/i);
  });

  test('the NFL home: every card and tile carries its home team’s identity and no retired photo @smoke', async ({ page }) => {
    await page.goto('./#/nfl');
    await expect(page.locator('[data-hero-kind]').first()).toBeVisible();
    await expect.poll(async () => page.locator('[data-hero-reason="branded:pending"]').count()).toBe(0);
    for (const el of await page.locator('[data-hero-context="home"]').all()) expect(await el.getAttribute('data-hero-team')).toMatch(/^[A-Z]{2,3}$/);
    await noBlockedPhoto(page);
  });
});

test.describe('NHL heroes', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-06T23:30:00Z'));
    await serve(page, /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/NHL-edge-finder\/data-archive\/app\/latest\/(.+)$/, NHL_FIXTURE);
  });
  test('a shared arena shows the hockey tenant: Kings at Crypto.com Arena, Blackhawks at United Center @smoke', async ({ page }, info) => {
    let hero = await openGame(page, 'nhl', 'evt_5938c3f8a7c1b24c0118');
    await expect(hero).toHaveAttribute('data-hero-team', 'LAK');
    await expect(hero).toHaveAttribute('data-hero-venue', 'cryptocom-arena');
    await identityReadable(hero, /Kings home game/i);
    await artSettled(hero);
    await shot(page, hero, 'nhl-kings-cryptocom', info.project.name);
    hero = await openGame(page, 'nhl', 'evt_c4a2cf978d0824a1493a');
    await expect(hero).toHaveAttribute('data-hero-team', 'CHI');
    await identityReadable(hero, /Blackhawks home game/i);
    await shot(page, hero, 'nhl-blackhawks-united', info.project.name);
  });
});

test.describe('MLB heroes', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-07T16:00:00Z'));
    await serve(page, /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/edge-finder-api\/main\/app\/latest\/(.+)$/, MLB_FIXTURE);
  });
  test('the home club at its own ballpark: Braves at Truist Park @smoke', async ({ page }, info) => {
    const hero = await openGame(page, 'mlb', 'evt_f809f61380cdbb0eb4f0');
    await expect(hero).toHaveAttribute('data-hero-team', 'ATL');
    await expect(hero).toHaveAttribute('data-hero-venue', 'truist-park');
    await identityReadable(hero, /Braves home game/i);
    await artSettled(hero);
    await noHorizontalOverflow(page, 'MLB hero');
    await shot(page, hero, 'mlb-braves-truist', info.project.name);
  });
});

test.describe('CFB heroes', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-08T15:00:00Z'));
    await serve(page, /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/cfb-edge-finder\/main\/app\/latest\/(.+)$/, CFB_FIXTURE);
  });
  test('a stated home team with no published venue: Alabama at Bryant–Denny @smoke', async ({ page }, info) => {
    const hero = await openGame(page, 'cfb', 'evt_93e12676ae9337017c63');
    await expect(hero).toHaveAttribute('data-hero-team', 'ALA');
    await expect(hero).toHaveAttribute('data-hero-venue', 'bryant-denny-stadium');
    await identityReadable(hero, /Alabama home game/i);
    await artSettled(hero);
    await shot(page, hero, 'cfb-alabama', info.project.name);
  });
});

test.describe('CBB heroes', () => {
  test('a home game and a neutral-site event @smoke', async ({ page }, info) => {
    await page.clock.setFixedTime(new Date('2026-11-02T18:00:00Z'));
    let hero = await openGame(page, 'cbb', 'evt_78832a3b5fa9148dba69', 'header.cgh');
    await expect(hero).toHaveAttribute('data-hero-context', 'home');
    await expect(hero).toHaveAttribute('data-hero-team', 'KU');
    await expect(hero.locator('[data-hero-label]')).toHaveText(/Kansas home game/i);
    await artSettled(hero);
    await shot(page, hero, 'cbb-kansas', info.project.name);
    hero = await openGame(page, 'cbb', 'evt_00c2f3089adb6cbdb0ef', 'header.cgh'); // Eternal City Tip-Off, Rome
    await expect(hero).toHaveAttribute('data-hero-context', 'neutral');
    await expect(hero).toHaveAttribute('data-hero-team', '');
    await expect(hero.locator('[data-hero-label]')).toHaveCount(0);
    await expect(hero.locator('.cgh__eyebrow')).toContainText('Neutral site');
    await shot(page, hero, 'cbb-neutral-rome', info.project.name);
  });
});
