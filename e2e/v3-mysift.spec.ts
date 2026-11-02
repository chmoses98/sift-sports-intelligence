// My SIFT (src/v3/screens/Following.tsx + MySiftPanels.tsx, route /v3/following): the viewer's own workspace. Four sections kept in the address
// (?tab=): Following, Saved research, Recently viewed, Watchlist. Sample data (?demo=1): deterministic and offline. The watchlist prints a
// price only through the quote gate, so with no live quote it prints the reason instead of a bare dash; nothing here promises alerts.
import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await page.addInitScript(() => { try { if (!localStorage.getItem('sift3.prefs')) localStorage.setItem('sift3.prefs', JSON.stringify({ priceFormat: 'cents', reduceMotion: false, textScale: 'default', onboarded: true })); } catch { /* */ } });
});

async function go(page: Page, path: string) {
  await page.goto(`./#${path}${path.includes('?') ? '&' : '?'}demo=1`);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]demo=/);
}
/** Open My SIFT from the tab bar (a client-side move: nothing is reloaded, so the demo mode and the stores stay). */
async function mySift(page: Page, tab?: string) {
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'My SIFT' }).click();
  await expect(page).toHaveURL(/#\/v3\/following/);
  if (tab) await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
}
const tab = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
const store = (page: Page, key: string) => page.evaluate((k) => JSON.parse(localStorage.getItem(`sift3.${k}`) ?? 'null'), key);

test.describe('My SIFT @v3', () => {
  test('four sections with counts; the section is kept in the address; the page is titled My SIFT', async ({ page }) => {
    await go(page, '/v3/following');
    await expect(page.getByRole('heading', { name: 'My SIFT', level: 1 })).toBeVisible();
    await expect(page).toHaveTitle(/My SIFT/);
    await expect(page.getByRole('tab')).toHaveText([/^Following\s*0$/, /^Saved\s*0$/, /^Recent\s*0$/, /^Watchlist\s*0$/]);
    await expect(tab(page, 'Following')).toHaveAttribute('aria-selected', 'true');
    await tab(page, 'Watchlist').click();
    await expect(page).toHaveURL(/tab=watchlist/);
    await expect(page.getByRole('region', { name: 'Watchlist' })).toContainText('No contracts watched');
    await expect(page.getByRole('region', { name: 'Watchlist' })).toContainText(/does not send notifications/);
    await page.reload();
    await expect(tab(page, 'Watchlist')).toHaveAttribute('aria-selected', 'true');
  });

  test('follow a team: it appears under Following and the count moves; unfollowing removes it', async ({ page }) => {
    await go(page, '/v3/following');
    const start = page.getByRole('region', { name: 'Start following' });
    const first = start.locator('.v3-tm').first();
    const name = (await first.locator('.v3-tm__l b').innerText()).trim();
    await first.getByRole('button', { name: /^Follow/ }).click();
    await expect(tab(page, 'Following')).toHaveText(/1$/);
    const mine = page.getByRole('region', { name: 'What you follow' });
    await expect(mine.locator('.v3-hit--team')).toHaveCount(1);
    await expect(mine.locator('.v3-hit--team')).toContainText(name);
    await mine.getByRole('button', { name: /^Unfollow/ }).first().click();
    await expect(tab(page, 'Following')).toHaveText(/0$/);
    await expect(page.getByRole('region', { name: 'Start following' })).toBeVisible();
  });

  test('save research from Discover: it is listed under Saved, one tap reopens the exact route with the selected line, Remove has Undo', async ({ page }) => {
    await go(page, '/v3/props?view=list');
    const row = page.locator('.pd-row').first();
    await expect(row).toBeVisible();
    await row.locator('.pd-row__hit').click();
    const peek = page.locator('.pd-peek');
    await expect(peek).toBeVisible();
    // choose a line other than the featured one when the ladder offers it, so the saved route proves the selected rung
    const rungs = peek.getByRole('group', { name: 'Rungs' }).locator('.pd-rs');
    if ((await rungs.count()) > 1) await rungs.nth(1).click();
    await peek.getByRole('button', { name: /to saved research$/ }).click();
    const rec = (await store(page, 'saved'))[0] as { route: string; title: string };
    expect(rec.route).toMatch(/^\/v3\/(player|props)\//);
    await mySift(page, 'Saved');
    await expect(tab(page, 'Saved')).toHaveText(/1$/);
    const list = page.getByRole('region', { name: 'Saved research' });
    await expect(list.locator('.v3-hit--saved')).toHaveCount(1);
    await expect(list.locator('.v3-hit--saved')).toContainText(rec.title);
    await list.getByRole('link', { name: /^Reopen/ }).click();
    const want = rec.route.split('?')[1] ?? '';
    for (const part of want.split('&').filter((x) => /^(line|stat|exp)=/.test(x))) expect(decodeURIComponent(await page.evaluate(() => location.hash))).toContain(decodeURIComponent(part));
    await page.goBack();
    await expect(tab(page, 'Saved')).toHaveAttribute('aria-selected', 'true');
    // remove, then undo
    await page.getByRole('button', { name: /^Remove saved/ }).click();
    await expect(page.getByRole('region', { name: 'Saved research' })).toContainText('Nothing saved yet');
    await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('region', { name: 'Saved research' }).locator('.v3-hit--saved')).toHaveCount(1);
  });

  test('viewing a game and opening a Discover prop add to Recent, newest first; Remove and Clear all work with Undo', async ({ page }) => {
    await go(page, '/v3/game/cfb/demo_uga_fla');
    await expect(page.locator('[data-v3-shell]')).toContainText(/Georgia|Bulldogs/);
    await mySift(page, 'Recent');
    const list = page.getByRole('region', { name: 'Recently viewed' });
    await expect(list.locator('.v3-hit--recent')).toHaveCount(1);
    await expect(list.locator('.v3-hit--recent').first().locator('.v3-kind')).toContainText('Game');
    const visits = await store(page, 'visits');
    expect(visits[0].route).toMatch(/^\/v3\/game\/cfb\/demo_uga_fla/);

    // a Discover prop opened in the list is research
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Discover' }).click();
    await page.goto('./#/v3/props?view=list');
    await page.locator('.pd-row').first().locator('.pd-row__hit').click();
    await expect(page.locator('.pd-peek')).toBeVisible();
    await mySift(page, 'Recent');
    const items = list.locator('.v3-hit--recent');
    await expect(items).toHaveCount(2);
    await expect(items.first().locator('.v3-kind')).toContainText('Research');
    await expect(items.nth(1).locator('.v3-kind')).toContainText('Game');

    await items.first().getByRole('button', { name: /^Remove/ }).click();
    await expect(items).toHaveCount(1);
    await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
    await expect(items).toHaveCount(2);
    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(list).toContainText('Nothing viewed yet');
    await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
    await expect(items).toHaveCount(2);
    await items.nth(1).getByRole('link').click();
    await expect(page).toHaveURL(/#\/v3\/game\/cfb\/demo_uga_fla/);
  });

  test('watch a contract from the Discover peek and from the contract sheet: it is listed with its price or the reason; Unwatch removes it; no alert is promised', async ({ page }) => {
    await go(page, '/v3/props?view=list');
    await page.locator('.pd-row').first().locator('.pd-row__hit').click();
    const peek = page.locator('.pd-peek');
    await expect(peek).toBeVisible();
    await peek.getByRole('button', { name: /^Watch / }).click();
    await expect(peek.getByRole('button', { name: /^Stop watching / })).toHaveAttribute('aria-pressed', 'true');
    const w = (await store(page, 'watch')) as { ticker: string; route: string }[];
    expect(w).toHaveLength(1);
    expect(w[0].route).toContain(`tk=${w[0].ticker}`);
    expect(JSON.stringify(w)).not.toMatch(/ask|price|¢/i);

    // the same contract in its sheet shows the toggle already on; it is not added twice
    await peek.getByLabel(/^Exact contract/).first().click();
    const sheet = page.locator('.v3c');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^Stop watching / })).toBeVisible();
    await page.keyboard.press('Escape');

    await mySift(page, 'Watchlist');
    await expect(tab(page, 'Watchlist')).toHaveText(/1$/);
    const row = page.locator('.v3-hit--watch');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(w[0].ticker);
    // the sample slate has no live quote: the gate withholds the price and the row says why (never a bare dash)
    const px = row.locator('.v3-wpx');
    await expect(px).not.toHaveText(/^\s*[—–-]\s*$/);
    await expect(px).toHaveText(/\S{4,}/);
    expect(await page.locator('[data-v3-shell]').innerText()).not.toMatch(/you will be (notified|alerted)|we.ll (notify|alert)|notifications? (are|is) on/i);
    // tapping the row returns to the contract in its context
    await row.getByRole('link', { name: /^Open contract/ }).click();
    await expect(page).toHaveURL(new RegExp(`sheet=contract&tk=${w[0].ticker}`));
    await expect(page.locator('.v3c')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/#\/v3\/following/);
    await tab(page, 'Watchlist').click();
    await page.locator('.v3-hit--watch').getByRole('button', { name: /^Stop watching/ }).click();
    await expect(page.getByRole('region', { name: 'Watchlist' })).toContainText('No contracts watched');
    expect(await store(page, 'watch')).toEqual([]);
  });

  test('a corrupt store degrades to an empty list, never a broken row', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('sift3.watch', JSON.stringify([{ ticker: 'bad ticker', route: '/v3/x' }, { ticker: 'GOOD-1', route: 'https://evil.example', title: 'x' }, 5])); localStorage.setItem('sift3.visits', '{not json'); } catch { /* */ } });
    await go(page, '/v3/following');
    await expect(tab(page, 'Watchlist')).toHaveText(/0$/);
    await expect(tab(page, 'Recent')).toHaveText(/0$/);
  });
});
