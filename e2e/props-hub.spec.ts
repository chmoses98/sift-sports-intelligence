// /props — the Player Prop Explorer's front door: sport choice, the slate's top-props board ranked by a stated
// criterion with its authority word, multi-select into My Board, and MLB/NHL as labelled game-page entry points.
import { expect, noHorizontalOverflow, NOW, test } from './fixtures';

test('the props hub ranks the slate by a stated criterion and saves several props to My Board at once @journey', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto('./#/props');
  await expect(page.getByRole('heading', { name: /^Player prop explorer$/, level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /NFL/, pressed: true })).toBeVisible();
  const board = page.locator('.tprops');
  await expect(board.getByRole('heading', { name: 'Top props on the slate' })).toBeVisible();
  const rows = board.locator('.tprow');
  await expect(rows.first()).toBeVisible();
  // The criterion and its authority word are on the page and on every row; nothing reads as a chance or an edge.
  await expect(board.locator('.tprops__sub')).toContainText('published projection');
  await expect(rows.first().locator('.tprops__auth')).toHaveText(/Research/i);
  await expect(board).not.toContainText(/% chance|best bet|lock/i);
  await noHorizontalOverflow(page, 'props hub');

  // Tick two, add both.
  await rows.nth(0).locator('input[type=checkbox]').check();
  await rows.nth(1).locator('input[type=checkbox]').check();
  const add = board.getByRole('button', { name: 'Add 2 to My Board' });
  await expect(add).toBeVisible();
  await add.click();
  await expect(board.locator('.tprops__bar')).toContainText('Added 2 props to My Board');
  await expect(rows.nth(0).locator('input[type=checkbox]')).toBeDisabled();
  await page.goto('./#/board');
  await expect(page.getByRole('heading', { name: /^My Board$/, level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /from My Board$/ })).toHaveCount(2);
});

test('the history ranking says history, never probability @journey', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto('./#/props');
  const board = page.locator('.tprops');
  await board.getByRole('button', { name: 'Last 10 history' }).click();
  await expect(board.locator('.tprops__sub')).toContainText('not a probability');
  const first = board.locator('.tprow').first();
  await expect(first).toBeVisible();
  await expect(first.locator('.tprow__crit')).toContainText(/\d+ of \d+ (over|under)/);
  await expect(first.locator('.tprops__auth')).toHaveText(/History/i);
});

test('a row opens that prop in the explorer @journey', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto('./#/props');
  const first = page.locator('.tprops .tprow').first();
  const name = (await first.locator('.tprow__who b').textContent())!.trim();
  await first.locator('.tprow__go').click();
  await expect(page.getByRole('heading', { name: /^Prop explorer$/, level: 1 })).toBeVisible();
  await expect(page.locator('#pexa-t')).toContainText(name);
});

test('MLB and NHL are labelled entry points to their game pages @smoke', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto('./#/props');
  await page.getByRole('button', { name: /^MLB/ }).click();
  await expect(page.getByText('MLB props live on each game page')).toBeVisible();
  await page.getByRole('button', { name: /^NHL/ }).click();
  await expect(page.getByText('NHL props live on each game page')).toBeVisible();
  await noHorizontalOverflow(page, 'props hub nhl');
});
