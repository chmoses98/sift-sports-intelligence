// SIFT v4 Board (src/v4/Board.tsx): the personal research workspace over the shared research tray, in real browsers. The tray is
// seeded (e2e/boardSeed.ts) with what a device really holds: an older un-sided SIFT 2.0 save, a v4 NO save, a game, an item with no
// v4 screen, a game that is gone and a game in a sport whose publication cannot be read. Run with V4_SHOTS=<dir> for screenshots.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { expect, noHorizontalOverflow, NOW, test } from './fixtures';
import { GAME, OLAVE, serve } from './projectionDoc';
import { FRESH_AT, OLAVE_TICKER, rec, serveRecommendations } from './propSignals';
import { seedTray, SEEDS, TRAY_KEY } from './boardSeed';

test.use({ timezoneId: 'America/Chicago' });
const SHOTS = process.env.V4_SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize()!.width}x${page.viewportSize()!.height}.png` }); };

type Mock = { set(t: string, bid: number, ask?: number): void; observedAt: string | null };
type Name = keyof typeof SEEDS;
const ALL: Name[] = ['legacyYes', 'v4No', 'game', 'team', 'gone', 'nhlGame', 'noSnapshot'];
const rows = (page: Page) => page.locator('.v4-bd__row');
const row = (page: Page, label: string) => page.locator('.v4-bd__row', { hasText: label });
const stored = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), TRAY_KEY);
/** Reload only once the page has settled: WebKit reports same-origin image fetches cancelled by a reload mid-load (team crests) as page errors. */
async function reload(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.reload();
}
const sheet = (page: Page) => page.getByRole('dialog', { name: /^Saved:|^Clear My Board/ });
/** The tray writes to storage a moment after the screen changes (a passive effect), so a read right after an action must poll, not look once. */
const storedWith = async (page: Page, items: number) => { await expect.poll(async () => (await stored(page)).tray.items.length).toBe(items); return stored(page); };

async function open(page: Page, market: Mock, names: Name[] = ALL, o: { now?: Date; observedAt?: string; query?: string; recs?: unknown[]; nhlDown?: boolean } = {}) {
  await serve(page.context());
  await serveRecommendations(page.context(), o.recs ?? []);
  if (o.nhlDown !== false) await page.context().route(/raw\.githubusercontent\.com\/chmoses98\/NHL-edge-finder\//, (r) => r.fulfill({ status: 500, body: 'x', headers: { 'access-control-allow-origin': '*' } }));
  await seedTray(page, names);
  market.set(OLAVE_TICKER, 0.45, 0.47);
  market.observedAt = o.observedAt ?? FRESH_AT;
  await page.clock.install({ time: o.now ?? NOW });
  await page.goto(`#/v4/board${o.query ?? ''}`);
  await expect(page.getByRole('heading', { name: 'Board', level: 1 })).toBeVisible();
}

test.describe('v4 Board: what is saved', () => {
  test('saved items are organised by game and category with the exact contract and side @smoke', async ({ page, market }) => {
    await open(page, market);
    const nfl = page.locator('.v4-bd', { hasText: 'ATL @ NO' }).first();
    await expect(nfl.locator('.v4-bd__cat h3')).toHaveText([/Game thesis/, /Props/]);
    await expect(row(page, 'Chris Olave 7+ receptions').locator('.v4-sg__side')).toHaveText('YES');
    await expect(row(page, 'Chris Olave under 6.5 receptions').locator('.v4-sg__side')).toHaveText('NO');
    await expect(page.locator('.v4-sg__sum')).toContainText('7 saved items');
    await expect(page.getByRole('group', { name: 'Item type' })).toBeVisible();
    await shot(page, 'board');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/board-full-${page.viewportSize()!.width}.png`, fullPage: true });
    await noHorizontalOverflow(page, 'v4 board');
  });

  test('an empty Board says so and points to where research is saved @smoke', async ({ page, market }) => {
    await open(page, market, []);
    await expect(page.getByText('Nothing saved yet')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse signals' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse props' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Open in SIFT 2.0/ })).toHaveAttribute('href', '#/design/sift2/board');
  });

  test('sport and type filters live in the address and survive a reload @smoke', async ({ page, market }) => {
    await open(page, market);
    await page.getByRole('group', { name: 'Sport' }).getByRole('button', { name: /NHL/ }).click();
    await expect(page).toHaveURL(/sport=NHL/);
    await expect(page.locator('.v4-bd')).toHaveCount(1);
    await reload(page);
    await expect(page.getByRole('group', { name: 'Sport' }).getByRole('button', { name: /NHL/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('group', { name: 'Sport' }).getByRole('button', { name: 'All sports' }).click();
    await page.getByRole('group', { name: 'Item type' }).getByRole('button', { name: /^Props/ }).click();
    await expect(page).toHaveURL(/type=props/);
    await expect(rows(page)).toHaveCount(3);
  });
});

test.describe('v4 Board: what changed, on the saved side', () => {
  test('each side is compared with its own ask, with the age of the latest quote, and a move is only a move @smoke', async ({ page, market }) => {
    await open(page, market);
    await expect(row(page, 'Chris Olave 7+ receptions').locator('.v4-bd__px')).toContainText('YES ask 40¢ when saved → 47¢ now (+7¢)');
    await expect(row(page, 'Chris Olave under 6.5 receptions').locator('.v4-bd__px')).toContainText('NO ask 50¢ when saved → 55¢ now (+5¢)');
    await expect(row(page, 'Chris Olave under 6.5 receptions').locator('.v4-bd__px em')).toContainText(/just now|\dm ago/);
    await expect(page.locator('main')).not.toContainText(/best bet|guaranteed|\block\b|you won|winning|gain of/i);
    // the lookup is by saved side: the YES row never shows the NO ask and the other way round
    await expect(row(page, 'Chris Olave 7+ receptions')).not.toContainText('NO ask');
    await expect(row(page, 'Chris Olave under 6.5 receptions')).not.toContainText('YES ask');
  });

  test('worth another look lists only evidence, each with the sentence that a move is not a profit @smoke', async ({ page, market }) => {
    await open(page, market);
    const look = page.getByRole('region', { name: 'Worth another look' });
    await expect(look).toBeVisible();
    await expect(look).toContainText('YES ask up 7¢ since saved (40¢ → 47¢)');
    await expect(look).toContainText('NO ask up 5¢ since saved (50¢ → 55¢)');
    await expect(look).toContainText('A price move is not a profit or a loss.');
    await expect(look).toContainText('Nothing here says to act');
    await look.getByRole('button', { name: /under 6\.5/ }).click();
    await expect(sheet(page)).toContainText('Chris Olave under 6.5 receptions');
  });

  test('a stale quote is context: shown, not compared, and not a reason to look again @smoke', async ({ page, market }) => {
    await open(page, market, ALL, { observedAt: '2026-10-04T11:00:00Z' });
    await expect(row(page, 'Chris Olave 7+ receptions').locator('.v4-bd__px')).toContainText('Latest quote 47¢ is');
    await expect(row(page, 'Chris Olave 7+ receptions').locator('.v4-bd__px')).toContainText('context only, not compared');
    await expect(row(page, 'Chris Olave 7+ receptions').locator('.v4-bd__px')).not.toContainText('→');
    await expect(page.getByRole('region', { name: 'Worth another look' }).getByText(/ask (up|down)/)).toHaveCount(0);
  });

  test('a quote that ages out while the Board is open stops being compared @smoke', async ({ page, market }) => {
    await open(page, market);
    await expect(row(page, 'Chris Olave 7+ receptions').locator('.v4-bd__px')).toContainText('→ 47¢ now');
    await page.clock.fastForward('20:00');
    await expect(row(page, 'Chris Olave 7+ receptions').locator('.v4-bd__px')).toContainText('→ 47¢ now'); // aging is still current
    await page.clock.fastForward('25:00');
    await expect(row(page, 'Chris Olave 7+ receptions').locator('.v4-bd__px')).toContainText('context only, not compared');
    await expect(row(page, 'Chris Olave 7+ receptions').locator('.v4-bd__px')).not.toContainText('→');
  });

  test('a contract with no saved price and one with no quote say so, never zero @smoke', async ({ page, market }) => {
    await open(page, market);
    await expect(row(page, 'Chris Olave 8+ receptions').locator('.v4-bd__px')).toHaveText(/No quote was on screen when this was saved: there is no saved price to compare\./);
    await expect(page.locator('main')).not.toContainText(/\b0¢/);
    // the live provider has no quote at all for the saved contract
    await page.context().route(/relay\.sift\.invalid/, (r) => r.abort());
    await reload(page);
    await expect(row(page, 'Chris Olave 7+ receptions').locator('.v4-bd__px')).toContainText(/No current quote for this contract|context only, not compared/);
    await expect(row(page, 'Chris Olave 7+ receptions').locator('.v4-bd__px')).not.toContainText('→ 0');
  });

  test('a published signal on the saved contract and side is named; the opposite side is not mistaken for it @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes', 'v4No'], { recs: [rec()] });
    await expect(row(page, 'Chris Olave 7+ receptions').locator('.v4-badge', { hasText: 'Current signal' })).toBeVisible();
    await expect(row(page, 'Chris Olave under 6.5 receptions').locator('.v4-badge', { hasText: 'Current signal' })).toHaveCount(0);
    await row(page, 'Chris Olave under 6.5 receptions').locator('.v4-bd__main').click();
    await expect(sheet(page)).toContainText('The publication’s signal on this market is for the YES side, not the NO side you saved.');
  });
});

test.describe('v4 Board: game lifecycle', () => {
  test('after kickoff the game and its items say pregame research is frozen; saved items stay and can be removed @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes', 'game'], { now: new Date('2026-10-06T03:00:00Z'), observedAt: '2026-10-06T02:58:00Z' });
    const card = page.locator('.v4-bd', { hasText: 'ATL @ NO' }).first();
    await expect(card).toContainText('Pregame frozen');
    await expect(card).toContainText('The game has started: pregame research is frozen.');
    await expect(row(page, 'Chris Olave 7+ receptions').locator('.v4-badge', { hasText: 'Frozen' })).toBeVisible();
    await rows(page).first().getByRole('button', { name: /^Remove / }).click();
    await expect(rows(page)).toHaveCount(1);
  });

  test('kickoff passing while the Board is open freezes it @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes', 'game'], { now: new Date('2026-10-06T00:10:00Z'), observedAt: '2026-10-06T00:08:00Z' });
    await expect(page.locator('.v4-bd', { hasText: 'ATL @ NO' }).first().locator('.v4-badge', { hasText: 'Pregame frozen' })).toHaveCount(0);
    await page.clock.fastForward('06:00');
    await expect(page.locator('.v4-bd', { hasText: 'ATL @ NO' }).first().locator('.v4-badge', { hasText: 'Pregame frozen' })).toBeVisible();
    await expect(row(page, 'Chris Olave 7+ receptions').locator('.v4-badge', { hasText: 'Frozen' })).toBeVisible();
  });
});

test.describe('v4 Board: missing information is said, not invented', () => {
  test('a game that is gone and a game whose publication cannot be read each say so @smoke', async ({ page, market }) => {
    await open(page, market);
    await expect(page.locator('.v4-bd', { hasText: 'Old game' }).getByRole('status')).toContainText('no longer on the publication’s board');
    await expect(page.locator('.v4-bd', { hasText: 'FLA @ LAK' }).getByRole('status')).toContainText('The NHL publication could not be read');
    await expect(page.locator('.v4-bd', { hasText: 'FLA @ LAK' })).not.toContainText(/Pregame frozen|newer research run/);
  });

  test('when no publication can be read the Board still lists what was saved and says nothing changed is unknown @smoke', async ({ page, errors }) => {
    errors.allow(/status of 500/);
    await page.context().route(/relay\.sift\.invalid/, (r) => r.abort());
    await serve(page.context());
    await page.context().route(/raw\.githubusercontent\.com\//, (r) => r.fulfill({ status: 500, body: 'x', headers: { 'access-control-allow-origin': '*' } }));
    await page.context().route(/\/data\/nfl\/app\/latest\//, (r) => r.fulfill({ status: 500, body: 'x' }));
    await seedTray(page, ['legacyYes', 'v4No']);
    await page.clock.install({ time: NOW });
    await page.goto('#/v4/board');
    await expect(page.getByRole('alert')).toContainText('Publications are unavailable');
    await expect(page.getByRole('alert')).toContainText('nothing here says anything changed');
    await expect(rows(page)).toHaveCount(2);
    await expect(page.getByRole('region', { name: 'Worth another look' })).toHaveCount(0);
  });
});

test.describe('v4 Board: opening a saved item keeps its context', () => {
  test('a saved NO prop opens the player on the under; Back returns to the Board @smoke', async ({ page, market }) => {
    await open(page, market, ['v4No']);
    await page.getByRole('link', { name: 'Open prop: Chris Olave under 6.5 receptions' }).click();
    await expect(page).toHaveURL(new RegExp(`#/v4/props/nfl/${GAME}/${OLAVE}\\?stat=receptions&side=under`));
    await expect(page.getByRole('heading', { name: 'Chris Olave', level: 1 })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Side' }).getByRole('button', { name: 'Under' })).toHaveAttribute('aria-pressed', 'true');
    await page.goBack();
    await expect(page).toHaveURL(/#\/v4\/board/);
    await expect(rows(page)).toHaveCount(1);
  });

  test('a saved game opens the game; a saved market opens its game markets @smoke', async ({ page, market }) => {
    await open(page, market, ['game', 'legacyYes']);
    await page.getByRole('link', { name: 'Open game: ATL @ NO' }).click();
    await expect(page).toHaveURL(new RegExp(`#/v4/game/nfl/${GAME}`));
    await page.goBack();
    await expect(page.getByRole('link', { name: 'Open game markets: Chris Olave 7+ receptions' })).toHaveAttribute('href', new RegExp(`/v4/game/nfl/${GAME}\\?tab=markets`));
  });

  test('with a published signal on the exact contract and side, the saved item opens Signals on it @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes'], { recs: [rec()] });
    await page.getByRole('link', { name: 'Open signals: Chris Olave 7+ receptions' }).click();
    await expect(page).toHaveURL(/#\/v4\/signals\?sport=nfl&game=evt_[^&]+&market=mkt_kalshi_KXNFLREC-26OCT05ATLNO-NOCOLAVE12-7&side=YES/);
    await expect(page.locator('.v4-sg.is-focus')).toHaveCount(1);
  });

  test('an item with no v4 screen opens the SIFT 2.0 page it was saved from, as a real exit @smoke', async ({ page, market }) => {
    await open(page, market, ['team']);
    const link = page.getByRole('link', { name: 'Open in SIFT 2.0: New Orleans Saints' });
    await expect(link).toHaveAttribute('href', '#/nfl/team/prt_saints');
    await link.click();
    await expect(page).toHaveURL(/#\/nfl\/team\/prt_saints/);
    await expect(page.locator('[data-v4-shell]')).toHaveCount(0);
  });

  test('a sheet opened from inside the item sheet returns focus to the Board row, not to the top of the page @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes'], { recs: [rec()] });
    const main = row(page, 'Chris Olave 7+ receptions').locator('.v4-bd__main');
    await main.click();
    await expect(sheet(page)).toBeVisible();
    // "Research" opens the research sheet from inside the item sheet: the control that opened it is unmounted with the first sheet
    await sheet(page).getByRole('button', { name: 'Research', exact: true }).click();
    const research = page.getByRole('dialog', { name: /^Research:/ });
    await expect(research).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(research).toHaveCount(0);
    await expect(main).toBeFocused();
  });

  test('the item sheet states the side, what was saved, the original context and the way on @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes', 'v4No']);
    await row(page, 'Chris Olave 7+ receptions').locator('.v4-bd__main').click();
    const dlg = sheet(page);
    await expect(dlg).toContainText('Saved before sides were recorded: read as YES');
    await expect(dlg).toContainText('ATL @ NO · 2026 REG week 4');
    await expect(dlg).toContainText('YES ask when saved');
    await expect(dlg).toContainText('Latest YES ask');
    await expect(dlg).toContainText('A price move is not a profit or a loss on the position.');
    await page.waitForTimeout(450);
    await shot(page, 'board-item');
    await page.keyboard.press('Escape');
    await row(page, 'Chris Olave under 6.5 receptions').locator('.v4-bd__main').click();
    await expect(dlg).toContainText('Saved the under (No)');
    await expect(dlg).not.toContainText('read as YES');
    await expect(dlg.getByRole('link', { name: 'Open prop' })).toHaveAttribute('href', /side=under/);
  });
});

test.describe('v4 Board: removing and clearing', () => {
  test('removing an item removes only that item and leaves every other save, its identity and its timestamp untouched @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes', 'v4No', 'game']);
    const before = await stored(page);
    expect(before.tray.items).toHaveLength(3);
    await page.getByRole('button', { name: 'Remove Chris Olave under 6.5 receptions from My Board' }).click();
    await expect(row(page, 'Chris Olave under 6.5 receptions')).toHaveCount(0);
    const after = await stored(page);
    expect(after.tray.items).toHaveLength(2);
    const key = (i: { item_id: string; added_at: string }) => `${i.item_id}|${i.added_at}`;
    const kept = before.tray.items.filter((i: { item_id: string }) => after.tray.items.some((j: { item_id: string }) => j.item_id === i.item_id));
    expect(after.tray.items.map(key).sort()).toEqual(kept.map(key).sort());
    // the legacy label was never rewritten: it still carries no side
    const legacy = after.tray.items.find((i: { id: string; extra: { x: string | null } }) => i.id.includes('NOCOLAVE12-7') && !i.extra.x);
    expect(after.labels[legacy.item_id].side).toBeUndefined();
  });

  test('removing from the item sheet works too @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes', 'v4No']);
    await row(page, 'Chris Olave 7+ receptions').locator('.v4-bd__main').click();
    await sheet(page).getByRole('button', { name: 'Remove' }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(rows(page)).toHaveCount(1);
  });

  test('clearing the whole Board asks first, says it is shared with SIFT 2.0, and Keep leaves everything @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes', 'v4No', 'game']);
    await page.getByRole('button', { name: 'Clear Board' }).click();
    const dlg = sheet(page);
    await expect(dlg).toContainText('Clear My Board?');
    await expect(dlg).toContainText('all 3 saved items');
    await expect(dlg).toContainText('clearing it here clears it in SIFT 2.0 too');
    await dlg.getByRole('button', { name: 'Keep my Board' }).click();
    expect((await stored(page)).tray.items).toHaveLength(3);
    await page.getByRole('button', { name: 'Clear Board' }).click();
    await sheet(page).getByRole('button', { name: 'Remove all 3' }).click();
    await expect(page.getByText('Nothing saved yet')).toBeVisible();
    expect((await stored(page)).tray.items).toHaveLength(0);
  });
});

test.describe('v4 Board: your notes', () => {
  const NOTE = '  Falcons pass rush vs the Saints line. Recheck Friday.  ';
  const openSheet = async (page: Page, label: string) => { await row(page, label).locator('.v4-bd__main').click(); await expect(sheet(page)).toBeVisible(); return sheet(page); };
  const noteOf = async (page: Page, label: string) => {
    const s = await stored(page);
    const it = s.tray.items.find((i: { item_id: string }) => s.labels[i.item_id]?.label === label);
    return it.note as string | null;
  };

  test('a note can be added, edited and cleared; ids, timestamps, side and the price snapshot do not change @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes', 'v4No', 'game']);
    const before = await stored(page);
    let dlg = await openSheet(page, 'Chris Olave under 6.5 receptions');
    await expect(dlg).toContainText('No note yet');
    await dlg.getByRole('button', { name: 'Add a note' }).click();
    await expect(dlg.getByRole('textbox', { name: /^Note for Chris Olave under 6\.5 receptions/ })).toBeFocused();
    await dlg.getByRole('textbox').fill('Under hinges on the slot role. Recheck Friday.');
    await dlg.getByRole('button', { name: 'Save note' }).click();
    await expect(dlg.getByRole('status').filter({ hasText: 'Note saved.' })).toBeVisible();
    await expect(dlg).toContainText('Under hinges on the slot role. Recheck Friday.');
    await expect.poll(() => noteOf(page, 'Chris Olave under 6.5 receptions')).toBe('Under hinges on the slot role. Recheck Friday.');
    // nothing but that one note changed: same items, ids, timestamps, and every label (side, saved time, price snapshot)
    const after = await stored(page);
    expect(after.labels).toEqual(before.labels);
    expect(after.tray.items.map((i: { note: unknown }) => ({ ...i, note: null }))).toEqual(before.tray.items.map((i: { note: unknown }) => ({ ...i, note: null })));
    expect(after.tray.items.filter((i: { note: unknown }) => i.note !== null)).toHaveLength(1);
    await page.keyboard.press('Escape');
    // the row shows it, and it survives a reload
    await expect(row(page, 'Chris Olave under 6.5 receptions').locator('.v4-bd__nt')).toContainText('Under hinges on the slot role');
    await reload(page);
    await expect(row(page, 'Chris Olave under 6.5 receptions').locator('.v4-bd__nt')).toContainText('Recheck Friday');
    // edit it
    dlg = await openSheet(page, 'Chris Olave under 6.5 receptions');
    await dlg.getByRole('button', { name: 'Edit note' }).click();
    await dlg.getByRole('textbox').fill('Changed my mind: pass.');
    await dlg.getByRole('button', { name: 'Save note' }).click();
    await expect.poll(() => noteOf(page, 'Chris Olave under 6.5 receptions')).toBe('Changed my mind: pass.');
    // clear it: blank is no note
    await dlg.getByRole('button', { name: 'Edit note' }).click();
    await dlg.getByRole('textbox').fill('   ');
    await dlg.getByRole('button', { name: 'Save note' }).click();
    await expect(dlg.getByRole('status').filter({ hasText: 'Note removed.' })).toBeVisible();
    await expect.poll(() => noteOf(page, 'Chris Olave under 6.5 receptions')).toBeNull();
    expect((await stored(page)).labels).toEqual(before.labels);
  });

  test('opening the editor never rewrites an existing note: Cancel, Save unchanged and Escape leave it byte for byte @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes', 'noted']);
    await expect.poll(() => noteOf(page, 'Atlanta Falcons')).toBe(NOTE);
    const dlg = await openSheet(page, 'Atlanta Falcons');
    await dlg.getByRole('button', { name: 'Edit note' }).click();
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect.poll(() => noteOf(page, 'Atlanta Falcons')).toBe(NOTE);
    await dlg.getByRole('button', { name: 'Edit note' }).click();
    await dlg.getByRole('button', { name: 'Save note' }).click();
    await expect(dlg.getByRole('status').filter({ hasText: 'No changes to the note.' })).toBeVisible();
    await expect.poll(() => noteOf(page, 'Atlanta Falcons')).toBe(NOTE);
    await dlg.getByRole('button', { name: 'Edit note' }).click();
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await expect.poll(() => noteOf(page, 'Atlanta Falcons')).toBe(NOTE);
    // opening and closing the sheet alone is no write either
    await openSheet(page, 'Atlanta Falcons');
    await page.keyboard.press('Escape');
    await expect.poll(() => noteOf(page, 'Atlanta Falcons')).toBe(NOTE);
  });

  test('closing the sheet with unsaved edits keeps them; Cancel is the way to discard @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes', 'noted']);
    let dlg = await openSheet(page, 'Atlanta Falcons');
    await dlg.getByRole('button', { name: 'Edit note' }).click();
    await dlg.getByRole('textbox').fill('Moved to Sunday; secondary is the story.');
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await expect.poll(() => noteOf(page, 'Atlanta Falcons')).toBe('Moved to Sunday; secondary is the story.');
    dlg = await openSheet(page, 'Atlanta Falcons');
    await dlg.getByRole('button', { name: 'Edit note' }).click();
    await dlg.getByRole('textbox').fill('typed by mistake');
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await page.keyboard.press('Escape');
    await expect.poll(() => noteOf(page, 'Atlanta Falcons')).toBe('Moved to Sunday; secondary is the story.');
  });

  test('leaving the app or a reload saves a note being typed instead of losing it, in the same moment @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes', 'noted']);
    const dlg = await openSheet(page, 'Atlanta Falcons');
    await dlg.getByRole('button', { name: 'Edit note' }).click();
    await dlg.getByRole('textbox').fill('Typed, then the phone went to the background.');
    expect(await noteOf(page, 'Atlanta Falcons')).toBe(NOTE); // still only a draft
    // the page is hidden (another app, the lock button, a new deploy reloading it). Storage is read in the SAME task as the event: the
    // note must already be there, not "soon" (a frozen or unloading page never gets a later turn to write it).
    const written = await page.evaluate(([key]) => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      const s = JSON.parse(localStorage.getItem(key)!);
      return s.tray.items.map((i: { id: string; note: string | null }) => [i.id, i.note]);
    }, [TRAY_KEY] as const);
    expect(written).toContainEqual(['prt_falcons', 'Typed, then the phone went to the background.']);
    await page.evaluate(() => { Reflect.deleteProperty(document, 'visibilityState'); });
    // and on the way out of the page
    await dlg.getByRole('textbox').fill('Second thought, written just before a reload.');
    const unloaded = await page.evaluate(([key]) => {
      window.dispatchEvent(new Event('pagehide'));
      return JSON.parse(localStorage.getItem(key)!).tray.items.map((i: { id: string; note: string | null }) => [i.id, i.note]);
    }, [TRAY_KEY] as const);
    expect(unloaded).toContainEqual(['prt_falcons', 'Second thought, written just before a reload.']);
    // identities and times are untouched by either write
    const s = await stored(page);
    expect(s.tray.items.find((i: { id: string }) => i.id === 'prt_falcons').added_at).toBe('2026-10-04T13:00:00Z');
  });

  test('a note written in v4 is the note in SIFT 2.0, and the other way round @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes', 'noted']);
    const dlg = await openSheet(page, 'Chris Olave 7+ receptions');
    await dlg.getByRole('button', { name: 'Add a note' }).click();
    await dlg.getByRole('textbox').fill('Written in v4');
    await dlg.getByRole('button', { name: 'Save note' }).click();
    await page.keyboard.press('Escape');
    await page.evaluate(() => { location.hash = '#/board'; });
    await expect(page.locator('.bentry')).toHaveCount(2);
    await expect(page.getByLabel('Note for Chris Olave 7+ receptions')).toHaveValue('Written in v4');
    await expect(page.getByLabel('Note for Atlanta Falcons')).toHaveValue(NOTE);
    const box = page.getByLabel('Note for Atlanta Falcons');
    await box.fill('Edited in SIFT 2.0');
    await box.blur();
    await page.evaluate(() => { location.hash = '#/v4/board'; });
    await expect(row(page, 'Atlanta Falcons').locator('.v4-bd__nt')).toContainText('Edited in SIFT 2.0');
  });
});

test.describe('v4 Board: Undo', () => {
  const undoBar = (page: Page) => page.getByRole('group', { name: 'Undo remove' });

  test('removing a row offers Undo, and Undo puts the item back exactly as it was, in the same place @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes', 'noted', 'v4No', 'game']);
    const before = await stored(page);
    await page.getByRole('button', { name: 'Remove Atlanta Falcons from My Board' }).click();
    await expect(row(page, 'Atlanta Falcons')).toHaveCount(0);
    await expect(undoBar(page)).toContainText('Removed Atlanta Falcons');
    await expect(page.locator('[data-v4-undo-status]')).toContainText('Removed Atlanta Falcons from My Board. Undo is available.');
    // focus moves to Undo: the row it was on no longer exists
    await expect(undoBar(page).getByRole('button', { name: /^Undo/ })).toBeFocused();
    await storedWith(page, 3);
    await undoBar(page).getByRole('button', { name: /^Undo/ }).click();
    await expect(undoBar(page)).toHaveCount(0);
    await expect(page.locator('[data-v4-undo-status]')).toContainText('Restored Atlanta Falcons to My Board.');
    await expect(row(page, 'Atlanta Falcons').locator('.v4-bd__main')).toBeFocused();
    const after = await storedWith(page, 4);
    // verbatim: the same items in the same order (ids, timestamps, notes) and the same labels (sides, saved times, price snapshots)
    expect(after.tray.items).toEqual(before.tray.items);
    expect(after.labels).toEqual(before.labels);
    expect(after.tray.items.find((i: { id: string }) => i.id === 'prt_falcons').note).toBe('  Falcons pass rush vs the Saints line. Recheck Friday.  ');
    // and it is still there after a reload
    await reload(page);
    await expect(row(page, 'Atlanta Falcons')).toHaveCount(1);
    await expect.poll(async () => (await stored(page)).tray.items).toEqual(before.tray.items);
  });

  test('removing from the item sheet offers Undo too; a market keeps its side and saved price @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes', 'v4No']);
    const before = await stored(page);
    await row(page, 'Chris Olave under 6.5 receptions').locator('.v4-bd__main').click();
    await sheet(page).getByRole('button', { name: 'Remove' }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(rows(page)).toHaveCount(1);
    await undoBar(page).getByRole('button', { name: /^Undo/ }).click();
    await expect(rows(page)).toHaveCount(2);
    await expect(row(page, 'Chris Olave under 6.5 receptions').locator('.v4-sg__side')).toHaveText('NO');
    await expect(row(page, 'Chris Olave under 6.5 receptions').locator('.v4-bd__px')).toContainText('NO ask 50¢ when saved');
    const after = await storedWith(page, 2);
    expect(after.tray.items).toEqual(before.tray.items);
    expect(after.labels).toEqual(before.labels);
  });

  test('only the last removal can be undone, and it can be dismissed @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes', 'v4No', 'game']);
    const before = await stored(page);
    await page.getByRole('button', { name: 'Remove ATL @ NO from My Board' }).click();
    await page.getByRole('button', { name: 'Remove Chris Olave under 6.5 receptions from My Board' }).click();
    await expect(undoBar(page)).toContainText('Removed Chris Olave under 6.5 receptions');
    await undoBar(page).getByRole('button', { name: /^Undo/ }).click();
    await expect(rows(page)).toHaveCount(2);
    await expect(row(page, 'ATL @ NO')).toHaveCount(0);
    const mid = await storedWith(page, 2);
    expect(mid.tray.items.map((i: { item_id: string }) => i.item_id)).toEqual(before.tray.items.map((i: { item_id: string }) => i.item_id).filter((_: string, k: number) => k !== 2));
    await page.getByRole('button', { name: 'Remove Chris Olave 7+ receptions from My Board' }).click();
    await undoBar(page).getByRole('button', { name: 'Dismiss' }).click();
    await expect(undoBar(page)).toHaveCount(0);
    await expect(row(page, 'Chris Olave 7+ receptions')).toHaveCount(0);
  });

  test('leaving the Board ends the offer, and clearing the whole Board has no Undo @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes', 'v4No', 'game']);
    await page.getByRole('button', { name: 'Remove ATL @ NO from My Board' }).click();
    await expect(undoBar(page)).toBeVisible();
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Games' }).click();
    await expect(undoBar(page)).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Board' }).click();
    await expect(undoBar(page)).toHaveCount(0);
    await expect(rows(page)).toHaveCount(2);
    await page.getByRole('button', { name: 'Clear Board' }).click();
    await sheet(page).getByRole('button', { name: 'Remove all 2' }).click();
    await expect(page.getByText('Nothing saved yet')).toBeVisible();
    await expect(undoBar(page)).toHaveCount(0);
  });

  test('if the same item was saved again meanwhile, Undo leaves the newer save alone and says so @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes', 'game']);
    const before = await stored(page);
    const gameItem = before.tray.items.find((i: { ref_kind: string }) => i.ref_kind === 'EVENT');
    await page.getByRole('button', { name: 'Remove ATL @ NO from My Board' }).click();
    await expect(row(page, 'ATL @ NO')).toHaveCount(0);
    // the tray persists a moment AFTER the screen changes (a passive effect): reading storage before that read the old tray, so the "second save"
    // below was built on it and the page's own later write replaced it (the row stayed gone on a slow WebKit runner, 2026-10-22). Wait for the removal.
    await storedWith(page, before.tray.items.length - 1);
    // the same game saved again from SIFT 2.0 in this page while the offer is open: same identity, a newer time
    const RESAVED = '2026-10-04T14:59:00Z';
    await page.evaluate(([key, item, label, at]) => {
      const s = JSON.parse(localStorage.getItem(key)!);
      s.tray.items.push({ ...item, added_at: at });
      s.labels[item.item_id] = { ...label, savedAt: at };
      localStorage.setItem(key, JSON.stringify(s));
      window.dispatchEvent(new Event('sift:tray-changed'));
    }, [TRAY_KEY, gameItem, before.labels[gameItem.item_id], RESAVED] as const);
    await expect(row(page, 'ATL @ NO')).toHaveCount(1);
    await undoBar(page).getByRole('button', { name: /^Undo/ }).click();
    await expect(page.locator('[data-v4-undo-status]')).toContainText('already saved again; nothing was changed');
    const after = await storedWith(page, 2);
    const same = after.tray.items.filter((i: { item_id: string }) => i.item_id === gameItem.item_id);
    expect(same).toHaveLength(1);
    expect(same[0].added_at).toBe(RESAVED);
  });
});

test.describe('v4 Board: one tray, every interface', () => {
  test('the Board persists across a reload, with the same items and the same timestamps @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes', 'v4No']);
    const before = (await stored(page)).tray.items.map((i: { item_id: string; added_at: string }) => `${i.item_id}|${i.added_at}`);
    await reload(page);
    await expect(rows(page)).toHaveCount(2);
    expect((await stored(page)).tray.items.map((i: { item_id: string; added_at: string }) => `${i.item_id}|${i.added_at}`)).toEqual(before);
  });

  test('a save made in v4 is on the SIFT 2.0 Board in the same session, with the saved side; a removal there shows here @smoke', async ({ page, market }) => {
    await serve(page.context());
    await serveRecommendations(page.context(), [rec()]);
    market.set(OLAVE_TICKER, 0.45, 0.47);
    market.observedAt = FRESH_AT;
    await page.clock.install({ time: NOW });
    await page.goto('#/v4/signals');
    await page.locator('.v4-sg').first().getByRole('button', { name: /^Save to My Board/ }).click();
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Board' }).click();
    await expect(page.locator('.v4-bd__row')).toHaveCount(1);
    // the SIFT 2.0 Board (same page, no reload) holds it, on the YES side
    await page.evaluate(() => { location.hash = '#/board'; });
    await expect(page.locator('.bentry')).toHaveCount(1);
    await expect(page.locator('[title="YES ask when you saved it"]')).toBeVisible();
    // removed there, gone here
    await page.getByRole('button', { name: /^Remove .* from My Board/ }).click();
    await page.evaluate(() => { location.hash = '#/v4/board'; });
    await expect(page.getByText('Nothing saved yet')).toBeVisible();
  });

  test('the SIFT 2.0 Board still shows the seeded saves, each on its own side @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes', 'v4No']);
    await page.evaluate(() => { location.hash = '#/board'; });
    await expect(page.locator('.bentry')).toHaveCount(2);
    await expect(page.locator('[title="YES ask when you saved it"]')).toHaveCount(1);
    await expect(page.locator('[title="NO ask when you saved it"]')).toHaveCount(1);
  });
});

test.describe('v4 Board: phone, accessibility and motion', () => {
  test('every control is at least 44px and nothing clips or overflows at the three phone sizes @smoke', async ({ page, market }) => {
    for (const size of [{ width: 390, height: 844 }, { width: 375, height: 812 }, { width: 375, height: 667 }]) {
      await page.setViewportSize(size);
      await open(page, market);
      await expect(rows(page).first()).toBeVisible();
      const bad = await page.evaluate(() => {
        const vis = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
        const small = [...document.querySelectorAll('.v4 button, .v4 a[href], .v4 input')].filter(vis).filter((el) => Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height) < 43.5).map((el) => `${el.tagName}.${el.className} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
        const tiny = [...document.querySelectorAll('.v4 *')].filter((el) => el.children.length === 0 && (el.textContent ?? '').trim() && vis(el) && parseFloat(getComputedStyle(el).fontSize) < 11 && !el.closest('.v4-tab, svg')).map((el) => `${el.className}:${(el.textContent ?? '').trim().slice(0, 20)}`);
        return { small, tiny };
      });
      expect(bad.small, `${size.width}x${size.height}: controls under 44px`).toEqual([]);
      expect(bad.tiny, `${size.width}x${size.height}: text under 11px`).toEqual([]);
      await noHorizontalOverflow(page, `board ${size.width}x${size.height}`);
      await shot(page, 'board');
    }
  });

  test('has no accessibility violations, with an item sheet open and with the clear confirmation open @smoke', async ({ page, market }) => {
    await open(page, market);
    await expect(rows(page).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    let res = await new AxeBuilder({ page }).include('.v4').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(res.violations).toEqual([]);
    await row(page, 'Chris Olave 7+ receptions').locator('.v4-bd__main').click();
    await expect(sheet(page)).toBeVisible();
    await page.waitForTimeout(450);
    res = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(res.violations).toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Clear Board' }).click();
    await page.waitForTimeout(450);
    res = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(res.violations).toEqual([]);
  });

  test('the note editor and the Undo bar have no accessibility violations and keep their controls at 44px @smoke', async ({ page, market }) => {
    await open(page, market, ['legacyYes', 'noted']);
    await expect(rows(page).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await row(page, 'Atlanta Falcons').locator('.v4-bd__main').click();
    await sheet(page).getByRole('button', { name: 'Edit note' }).click();
    await expect(sheet(page).getByRole('textbox')).toBeFocused();
    await page.waitForTimeout(450);
    let res = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(res.violations).toEqual([]);
    // the field is 16px or more (iOS Safari zooms the page on focus into anything smaller)
    expect(await sheet(page).getByRole('textbox').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await sheet(page).getByRole('button', { name: 'Cancel' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Remove Atlanta Falcons from My Board' }).click();
    const bar = page.getByRole('group', { name: 'Undo remove' });
    await expect(bar).toBeVisible();
    res = await new AxeBuilder({ page }).include('.v4').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(res.violations).toEqual([]);
    for (const b of await bar.getByRole('button').all()) {
      const box = (await b.boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(43.5);
    }
    // the bar never sits on top of the tab bar or runs off the screen
    const vp = page.viewportSize()!;
    const bb = (await bar.boundingBox())!;
    const tb = (await page.getByRole('navigation', { name: 'Primary' }).boundingBox())!;
    expect(bb.y + bb.height).toBeLessThanOrEqual(tb.y);
    expect(bb.x).toBeGreaterThanOrEqual(0);
    expect(bb.x + bb.width).toBeLessThanOrEqual(vp.width);
  });

  test('with reduced motion nothing on the screen animates or transitions @smoke', async ({ page, market }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, market);
    await expect(rows(page).first()).toBeVisible();
    const moving = await page.evaluate(() => [...document.querySelectorAll('.v4 *')].filter((el) => {
      const s = getComputedStyle(el);
      return (s.animationName !== 'none' && parseFloat(s.animationDuration) > 0) || [...s.transitionDuration.split(',')].some((d) => parseFloat(d) > 0);
    }).map((el) => `${el.tagName}.${el.className}`));
    expect(moving).toEqual([]);
  });
});
