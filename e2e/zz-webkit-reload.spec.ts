// TEMPORARY diagnostic (removed before merge): isolate the WebKit reload crash.
import { expect, NEBUF, test } from './fixtures';

const reloadOk = async (page: import('@playwright/test').Page) => {
  try {
    await page.reload();
    return 'ok';
  } catch (e) {
    return String(e).split('\n')[0];
  }
};

test('A big localStorage value then reload @diag', async ({ page }) => {
  await page.goto('./#/');
  await page.evaluate(() => localStorage.setItem('x', 'y'.repeat(700_000)));
  console.log('[diag A]', await reloadOk(page));
});

test('B game page (quotes persisted) then reload @diag', async ({ page }) => {
  await page.goto(`./#/nfl/game/${NEBUF}`);
  await expect(page.getByRole('heading', { name: 'How they match up' })).toBeVisible();
  await page.waitForTimeout(2500);
  console.log('[diag B] persisted bytes', await page.evaluate(() => (localStorage.getItem('sift.liveQuotes.v1') ?? '').length));
  console.log('[diag B]', await reloadOk(page));
});

test('C game page, persisted quotes removed, then reload @diag', async ({ page }) => {
  await page.goto(`./#/nfl/game/${NEBUF}`);
  await expect(page.getByRole('heading', { name: 'How they match up' })).toBeVisible();
  await page.waitForTimeout(2500);
  await page.evaluate(() => localStorage.removeItem('sift.liveQuotes.v1'));
  console.log('[diag C]', await reloadOk(page));
});

test('D game page then goto slate then reload @diag', async ({ page }) => {
  await page.goto(`./#/nfl/game/${NEBUF}`);
  await expect(page.getByRole('heading', { name: 'How they match up' })).toBeVisible();
  await page.goto('./#/nfl');
  await page.waitForTimeout(1500);
  console.log('[diag D]', await reloadOk(page));
});

test('E slate only then reload @diag', async ({ page }) => {
  await page.goto('./#/nfl');
  await expect(page.getByText('RESEARCH SNAPSHOT')).toBeVisible();
  await page.waitForTimeout(1500);
  console.log('[diag E]', await reloadOk(page));
});

test('F game page then location.reload() @diag', async ({ page }) => {
  await page.goto(`./#/nfl/game/${NEBUF}`);
  await expect(page.getByRole('heading', { name: 'How they match up' })).toBeVisible();
  await page.waitForTimeout(1500);
  try {
    await Promise.all([page.waitForEvent('load'), page.evaluate(() => location.reload())]);
    console.log('[diag F] ok');
  } catch (e) {
    console.log('[diag F]', String(e).split('\n')[0]);
  }
});
