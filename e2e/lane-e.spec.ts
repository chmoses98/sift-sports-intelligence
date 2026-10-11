// Lane E (2026-10-11 repair sprint) acceptance, on the bundled NFL snapshot with external hosts blocked and the
// committed league schedule (public/data/league/nfl/schedule.json):
//   Home reads hero → today's games → intelligence → Research Lab → My Board, and game cards carry records and ranks;
//   a discovery opens in place to its conclusion and the research it leads to;
//   the Research Lab names seven tools (Props on the top-level explorer) and ?tool= reaches a section;
//   the Season navigator shows a whole week of matchups with finals against the closing spread.
import { expect, noHorizontalOverflow, NOW, test } from './fixtures';

test('Home reads hero, games, intelligence, lab, board; cards carry records and ranks @journey', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: /^Today on SIFT$/ })).toBeVisible();
  const order = await page.locator('.bhome > section').evaluateAll((els) => els.map((e) => e.className));
  const idx = (k: string) => order.findIndex((c) => c.includes(k));
  expect(idx('bhome__feat')).toBeLessThan(idx('bhome__games'));
  expect(idx('bhome__games')).toBeLessThan(idx('bhome__intel'));
  expect(idx('bhome__intel')).toBeLessThan(idx('bhome__lab'));
  expect(idx('bhome__lab')).toBeLessThan(idx('bhome__boardsec'));
  const rail = page.locator('.bhome__games');
  await expect(rail.getByRole('link', { name: /NFL: \d+ games today/ })).toBeVisible();
  const card = rail.locator('.rtile.gc').first();
  await expect(card).toBeVisible();
  // Records come from published finals; ranks from the game's research once the card is on screen.
  await expect(card.locator('.gc-team__rec').first()).toHaveText(/^\d+–\d+(–\d+)?$/);
  await expect(card.locator('.gc-rk').first()).toBeVisible();
  await noHorizontalOverflow(page, 'home');
});

test('a discovery opens in place and leads to research @journey', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto('./#/');
  const card = page.locator('.bhome__intel .dcard--x').first();
  await card.scrollIntoViewIfNeeded();
  const more = card.getByRole('button', { name: /What it means/ });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(card.getByRole('button', { name: /Hide summary/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(card.locator('.dcard__mean')).not.toBeEmpty();
  await expect(card.getByRole('list', { name: 'Research this leads to' }).getByRole('link').first()).toBeVisible();
  await noHorizontalOverflow(page, 'home-discovery');
});

test('the Research Lab names seven tools and reaches a section by ?tool= @journey', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto('./#/explore?sport=nfl&tool=players');
  await expect(page.getByRole('heading', { name: /^Research Lab$/, level: 1 })).toBeVisible();
  const tools = page.locator('.ex-toolgrid > li');
  await expect(tools).toHaveCount(7);
  await expect(tools.filter({ hasText: 'Props' }).getByRole('link')).toHaveAttribute('href', /#\/props$/);
  await expect(page.locator('#players')).toBeInViewport({ ratio: 0.1 });
  await noHorizontalOverflow(page, 'research-lab');
});

test('the Season navigator shows a whole week, finals against the closing spread @journey', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto('./#/nfl/season?week=1&team=BUF');
  await expect(page.getByRole('heading', { name: /^Season navigator$/, level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Week 1 matchups' })).toBeVisible();
  const tiles = page.locator('.swk-grid > .swk');
  await expect(tiles).toHaveCount(16);
  await expect(tiles.first().locator('.gc-team__sc')).toHaveCount(2);
  await expect(page.locator('.swk-grid .gc-ats').first()).toHaveText(/covered|did not cover|push|Pick’em|Over|Under/);
  await expect(page.locator('.sn-week__sum')).toContainText('16 of 16 final');
  // The team's weeks: 17 games and one bye from the complete schedule.
  await expect(page.locator('.sn-grid .wcell[data-cell="bye"]')).toHaveCount(1);
  await noHorizontalOverflow(page, 'season');
});
