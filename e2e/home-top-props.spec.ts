// Home's Top Props: the Player Prop Explorer's slate ranking previewed on Home — at most ten qualifying props, one
// card per player, each labelled with its authority (research only today), multi-select into My Board, and one click
// into the explorer.
import { expect, noHorizontalOverflow, NOW, test } from './fixtures';

test('Home shows the top props, grouped by player, each with its line, projection, freshness and authority @journey', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto('./#/');
  const sec = page.locator('section.htp');
  await expect(sec.getByRole('heading', { name: /Top props/i, level: 2 })).toBeVisible();
  const picks = sec.locator('.htp-pick');
  await expect(picks).toHaveCount(10);
  const cards = sec.locator('.htp-card');
  expect(await cards.count()).toBeGreaterThan(1);
  expect(await cards.count()).toBeLessThanOrEqual(10);
  // Team identity, the line, the projection and the line's age on every prop; never a validated word on research.
  await expect(cards.first().locator('.htp-card__team .teammark')).toBeVisible();
  for (let i = 0; i < 10; i++) {
    const p = picks.nth(i);
    await expect(p.locator('.htp-num--line b')).toHaveText(/^\d+(\.\d)?$/);
    await expect(p.locator('.htp-num--proj')).toBeVisible();
    await expect(p.locator('.frfresh')).toContainText(/^Line .*ago/);
    await expect(p.locator('.htp-auth')).toHaveText('Research only');
  }
  await expect(sec.locator('.htp__meta')).toContainText('0 validated');
  await expect(sec.locator('.htp__sub')).toContainText('No prop is validated today');
  await expect(sec).not.toContainText(/% chance|best bet|\block\b/i);
  await noHorizontalOverflow(page, 'home top props');
});

test('select two props on Home and add them to My Board @journey', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto('./#/');
  const sec = page.locator('section.htp');
  const boxes = sec.locator('.htp-pick input[type=checkbox]');
  await expect(boxes).toHaveCount(10);
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await expect(sec.locator('.htp__bar')).toContainText('2 selected');
  await sec.getByRole('button', { name: 'Add selected to My Board' }).click();
  await expect(sec.locator('.htp__bar')).toContainText('Added 2 props to My Board');
  await expect(boxes.nth(0)).toBeDisabled();
  await expect(sec.locator('.htp-pick').first()).toContainText('On My Board');
  await sec.locator('.htp__bar').getByRole('link', { name: 'Open My Board' }).click();
  await expect(page.getByRole('heading', { name: /^My Board$/, level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /from My Board$/ })).toHaveCount(2);
});

test('a Home prop opens in the Player Prop Explorer, and the section links to the props hub @journey', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto('./#/');
  const sec = page.locator('section.htp');
  const card = sec.locator('.htp-card').first();
  const name = (await card.locator('.htp-card__name').textContent())!.trim();
  await card.locator('.htp-pick__go').first().click();
  await expect(page).toHaveURL(/#\/nfl\/props\?game=evt_[0-9a-f]+&prop=/);
  await expect(page.getByRole('heading', { name: /^Prop explorer$/, level: 1 })).toBeVisible();
  await expect(page.locator('#pexa-t')).toContainText(name);
  await page.goBack();
  await page.locator('section.htp').getByRole('link', { name: /Open the Player Prop Explorer/ }).click();
  await expect(page.getByRole('heading', { name: /^Player prop explorer$/, level: 1 })).toBeVisible();
});
