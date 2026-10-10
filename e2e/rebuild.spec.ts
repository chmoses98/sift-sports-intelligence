// The 2026-10-10 rebuild's acceptance checks, on the bundled NFL snapshot with external hosts blocked:
// the five destinations (header on wide screens, tab bar on phones), Home's sections, every new destination screen,
// the save → My Board → remove loop with the game grouping, breadcrumbs collapsing upward, and the prop explorer
// replacing its analysis when another prop is picked. No sideways scroll anywhere.
import { expect, noHorizontalOverflow, NOW, test } from './fixtures';

const DESTS = ['Home', 'Games', 'Explore', 'Intelligence', 'My Board'];

test('five destinations, one search, and Home’s sections @smoke', async ({ page, isMobile }) => {
  await page.clock.install({ time: NOW });
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: /^Today on SIFT$/ })).toBeVisible();
  const nav = isMobile ? page.getByRole('navigation', { name: 'Destinations' }) : page.getByRole('navigation', { name: 'Primary' });
  for (const d of DESTS) await expect(nav.getByRole('link', { name: isMobile && d === 'Intelligence' ? 'Intel' : d, exact: false }).first()).toBeVisible();
  await expect(page.locator('.searchbtn')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: /Today’s games/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /SIFT Intelligence/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Research Lab/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^My Board$/ })).toBeVisible();
  await noHorizontalOverflow(page, 'home');
});

test('every new destination opens from the navigation and survives back/forward @journey', async ({ page, isMobile }) => {
  await page.clock.install({ time: NOW });
  await page.goto('./#/');
  const nav = isMobile ? page.getByRole('navigation', { name: 'Destinations' }) : page.getByRole('navigation', { name: 'Primary' });
  const go = async (label: string, heading: RegExp) => {
    await nav.getByRole('link', { name: label }).first().click();
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await noHorizontalOverflow(page, label);
  };
  await go('Games', /^Games$/);
  await go('Explore', /^Explore$/);
  await go(isMobile ? 'Intel' : 'Intelligence', /^Terminal$/);
  await go('My Board', /^My Board$/);
  await page.goBack();
  await expect(page.getByRole('heading', { name: /^Terminal$/, level: 1 })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: /^My Board$/, level: 1 })).toBeVisible();
  for (const [path, h] of [['intelligence/pulse', /^Model Pulse$/], ['intelligence/lab', /^Advanced Model Lab$/], ['intelligence/markets', /^Market board$/], ['nfl/season', /^Season navigator$/], ['nfl/props', /^Prop explorer$/]] as const) {
    await page.goto(`./#/${path}`);
    await expect(page.getByRole('heading', { name: h, level: 1 })).toBeVisible();
    await noHorizontalOverflow(page, path);
  }
});

test('save a market, find it on My Board under its game, remove it @journey', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto('./#/nfl');
  await page.getByRole('link', { name: /New England Patriots at Buffalo Bills/ }).first().click();
  await expect(page.getByRole('heading', { name: 'What Matters' })).toBeVisible();
  const save = page.getByRole('button', { name: /^Save .* to My Board$/ }).first();
  await save.scrollIntoViewIfNeeded();
  await save.click();
  await page.goto('./#/board');
  await expect(page.getByRole('heading', { name: /^My Board$/, level: 1 })).toBeVisible();
  const game = page.locator('.bgame').first();
  await expect(game).toBeVisible();
  await expect(game.locator('.bgame__t')).toContainText('NE @ BUF');
  await expect(game.getByRole('link', { name: /Analysis packet/ })).toBeVisible();
  await game.getByRole('button', { name: /from My Board$/ }).first().click();
  await expect(page.getByText('Your board is empty')).toBeVisible();
});

test('the breadcrumb collapses when going back up the path @journey', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto('./#/nfl');
  await page.getByRole('link', { name: /New England Patriots at Buffalo Bills/ }).first().click();
  await expect(page.getByRole('heading', { name: 'What Matters' })).toBeVisible();
  const crumbs = page.getByRole('navigation', { name: 'Research path' });
  await page.getByRole('navigation', { name: 'Game sections' }).getByRole('link', { name: 'Players' }).click();
  await page.locator('a[href*="/nfl/player/"]').first().click();
  await expect(crumbs.locator('li')).toHaveCount(3);
  await crumbs.locator('li').nth(1).getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'What Matters' }).or(page.getByRole('navigation', { name: 'Game sections' }))).toBeVisible();
  await expect(crumbs.locator('li')).toHaveCount(2);
});

test('the prop explorer replaces every panel when another prop is picked @journey', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto('./#/nfl/props');
  await expect(page.getByRole('heading', { name: /^Prop explorer$/, level: 1 })).toBeVisible();
  const rows = page.locator('.pex__row');
  await expect(rows.first()).toBeVisible();
  const second = rows.nth(1);
  const name = (await second.locator('.pex__rb b').innerText()).trim();
  const stat = (await second.locator('.pex__rb small').innerText()).split('·').pop()!.trim();
  await second.click();
  await expect(page.locator('#pexa-t')).toContainText(name);
  await expect(page.locator('#pexa-t')).toContainText(stat);
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await noHorizontalOverflow(page, 'props');
});
