// The release build (SIFT 2.0 is the default interface) with v4 present: v4 stays opt-in, leaving it is a real exit, and the
// remembered SIFT 2.0 / classic choices are not disturbed. (The classic-build twin is in e2e/v4.spec.ts.)
import { expect, NOW, test } from '../e2e/fixtures';
import { installSlates } from '../e2e/slates';

const pref = (page: import('@playwright/test').Page) => page.evaluate(() => localStorage.getItem('sift.ui'));

test.beforeEach(async ({ page }) => {
  await installSlates(page.context(), { NBA: 3 }, { now: NOW });
  await page.clock.install({ time: NOW });
});

test('without a flag the root is SIFT 2.0 and v4 is not shown', async ({ page }) => {
  await page.goto('#/');
  await expect(page).toHaveURL(/#\/design\/sift2\/home/);
  await expect(page.locator('[data-v4-shell]')).toHaveCount(0);
  expect(await pref(page)).toBeNull();
});

test('?ui=v4 opens v4; Open in SIFT 2.0 exits cleanly, and the root answers with SIFT 2.0 again; #/v4 re-enters', async ({ page }) => {
  await page.goto('#/?ui=v4');
  await expect(page.locator('[data-v4-shell]')).toBeVisible();
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Board' }).click();
  await page.getByRole('link', { name: /Open in SIFT 2.0/ }).click();
  await expect(page).toHaveURL(/#\/design\/sift2\/board/);
  expect(await pref(page)).toBeNull();
  await page.goto('#/');
  await expect(page).toHaveURL(/#\/design\/sift2\/home/);
  await expect(page.locator('[data-v4-shell]')).toHaveCount(0);
  await page.goto('#/v4');
  await expect(page.locator('[data-v4-shell]')).toBeVisible();
});

test('a remembered classic choice survives a round trip through v4', async ({ page }) => {
  await page.goto('#/?ui=classic');
  await expect(page.locator('[data-v4-shell]')).toHaveCount(0);
  await page.goto('#/?ui=v4');
  await expect(page.locator('[data-v4-shell]')).toBeVisible();
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Board' }).click();
  await page.getByRole('link', { name: /Open in SIFT 2.0/ }).click();
  expect(await pref(page)).toBe('classic');
  await page.goto('#/');
  await expect(page).not.toHaveURL(/design\/sift2/);
  await expect(page.locator('[data-v4-shell]')).toHaveCount(0);
});

// ---- early access: choosing, remembering, installing on the Home Screen, returning ----
const manifestHref = (page: import('@playwright/test').Page) => page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null);
const appTitle = (page: import('@playwright/test').Page) => page.evaluate(() => document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content') ?? null);

test.describe('v4 early access', () => {
  test('reaching #/v4 chooses nothing: the card offers to keep v4, and the device still opens SIFT 2.0 afterwards', async ({ page }) => {
    await page.goto('#/v4');
    await expect(page.locator('[data-v4-shell]')).toBeVisible();
    await expect(page.getByRole('region', { name: 'SIFT v4 early access' })).toContainText('SIFT 2.0 is still the default for everyone');
    expect(await pref(page)).toBeNull();
    await page.getByRole('button', { name: 'Not now' }).click();
    expect(await pref(page)).toBeNull();
    await page.goto('#/');
    await expect(page).toHaveURL(/#\/design\/sift2\/home/);
    await expect(page.locator('[data-v4-shell]')).toHaveCount(0);
  });

  test('"Keep v4 on this device" is remembered: the root address and the old Home Screen launch address open v4; Return to SIFT 2.0 undoes it', async ({ page, context }) => {
    await page.goto('#/v4');
    await page.getByRole('button', { name: 'Keep v4 on this device' }).click();
    await expect(page.getByRole('region', { name: 'SIFT v4 early access' })).toHaveCount(0);
    expect(await pref(page)).toBe('v4');
    // the next visit, as a Home Screen shortcut or a bookmark of the root address would make it: a new page, SIFT's own launch address
    const next = await context.newPage();
    await next.goto('#/');
    await expect(next.locator('[data-v4-shell]')).toBeVisible();
    await expect(next).toHaveURL(/#\/v4$/);
    await next.goto('#/games');
    await expect(next.locator('[data-v4-shell]')).toBeVisible();
    await next.close();
    // the way back is always one tap: it forgets the kept choice, and the root is SIFT 2.0 again
    await page.locator('.v4-eafoot').getByRole('link', { name: 'Return to SIFT 2.0' }).click();
    await expect(page).toHaveURL(/#\/design\/sift2\/home/);
    expect(await pref(page)).toBeNull();
    await page.goto('#/');
    await expect(page).toHaveURL(/#\/design\/sift2\/home/);
    await expect(page.locator('[data-v4-shell]')).toHaveCount(0);
    await page.goto('#/v4');
    await expect(page.locator('[data-v4-shell]')).toBeVisible();
  });

  test('the early-access sheet keeps and releases v4 and returns to SIFT 2.0 from every screen', async ({ page }) => {
    await page.goto('#/v4/board');
    await expect(page.locator('.v4-eafoot')).toBeVisible();
    await page.locator('.v4-eafoot').getByRole('button', { name: 'SIFT v4 early access' }).click();
    const dlg = page.getByRole('dialog', { name: 'SIFT v4 early access' });
    await expect(dlg).toContainText('SIFT 2.0 is still the default for everyone');
    await dlg.getByRole('button', { name: 'Keep v4 on this device' }).click();
    await expect(dlg.getByRole('status')).toContainText('v4 is now kept on this device.');
    expect(await pref(page)).toBe('v4');
    await dlg.getByRole('button', { name: 'Stop keeping v4' }).click();
    expect(await pref(page)).toBeNull();
    await dlg.getByRole('button', { name: 'Keep v4 on this device' }).click();
    await dlg.getByRole('link', { name: 'Return to SIFT 2.0' }).click();
    await expect(page).toHaveURL(/#\/design\/sift2\/home/);
    expect(await pref(page)).toBeNull();
  });

  test('a v4 address installs as "SIFT v4" before any script runs; any other address installs SIFT as before', async ({ page }) => {
    // the app's own script never runs: only index.html's own selection can have chosen this
    await page.route(/\/assets\/index-[^/]+\.js$/, (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto('#/v4', { waitUntil: 'domcontentloaded' });
    expect(await manifestHref(page)).toMatch(/\/manifest-v4\.webmanifest$/);
    expect(await appTitle(page)).toBe('SIFT v4');
    await expect(page).toHaveTitle(/SIFT v4/);
    const v4 = await (await page.request.get(new URL((await manifestHref(page))!, page.url()).toString())).json();
    expect(v4).toMatchObject({ short_name: 'SIFT v4', display: 'standalone' });
    expect(v4.start_url).toMatch(/\/sift-sports-intelligence\/#\/v4$/);
    await page.goto('#/', { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await manifestHref(page)).toMatch(/\/manifest\.webmanifest$/);
    expect(await appTitle(page)).toBe('Sift');
    const own = await (await page.request.get(new URL((await manifestHref(page))!, page.url()).toString())).json();
    expect(own.short_name).toBe('Sift');
    expect(own.start_url).toMatch(/\/sift-sports-intelligence\/#\/$/);
    expect(own.id).not.toBe(v4.id); // two different apps: adding v4 never replaces SIFT 2.0's icon
  });

  test('moving between v4 and SIFT 2.0 inside the app keeps the install identity right', async ({ page }) => {
    await page.goto('#/v4');
    await expect(page.locator('[data-v4-shell]')).toBeVisible();
    expect(await manifestHref(page)).toMatch(/\/manifest-v4\.webmanifest$/);
    expect(await appTitle(page)).toBe('SIFT v4');
    await page.locator('.v4-eafoot').getByRole('link', { name: 'Return to SIFT 2.0' }).click();
    await expect(page).toHaveURL(/#\/design\/sift2\/home/);
    expect(await manifestHref(page)).toMatch(/\/manifest\.webmanifest$/);
    expect(await appTitle(page)).toBe('Sift');
    await expect(page).toHaveTitle(/Sift/);
    await page.evaluate(() => { location.hash = '#/v4'; });
    await expect(page.locator('[data-v4-shell]')).toBeVisible();
    expect(await manifestHref(page)).toMatch(/\/manifest-v4\.webmanifest$/);
  });

  test('the Home Screen steps read as a numbered list and the sheet fits the phone', async ({ page }) => {
    await page.goto('#/v4');
    await page.getByRole('button', { name: /^SIFT v4 early access: about/ }).click();
    const dlg = page.getByRole('dialog', { name: 'SIFT v4 early access' });
    const steps = dlg.locator('.v4-ea__steps');
    await expect(steps.locator('li')).toHaveCount(3);
    // markers must actually render (a list reset once hid them): the list shows decimal numbering
    expect(await steps.evaluate((el) => getComputedStyle(el).listStyleType)).toBe('decimal');
    expect(await steps.locator('li').first().evaluate((el) => getComputedStyle(el).display)).toBe('list-item');
    await dlg.getByRole('button', { name: 'Keep v4 on this device' }).waitFor();
    for (const b of await dlg.getByRole('button').all()) {
      const box = (await b.boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(43.5);
    }
  });

  test('in the Home Screen app the icon is the choice: no prompt, and the sheet says which app this is', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }); });
    await page.goto('#/v4');
    await expect(page.locator('[data-v4-shell]')).toBeVisible();
    await expect(page.getByRole('region', { name: 'SIFT v4 early access' })).toHaveCount(0);
    expect(await pref(page)).toBeNull();
    await page.getByRole('button', { name: /^SIFT v4 early access: about/ }).click();
    const dlg = page.getByRole('dialog', { name: 'SIFT v4 early access' });
    await expect(dlg.getByRole('heading', { name: 'You are in the Home Screen app' })).toBeVisible();
    await expect(dlg.getByRole('link', { name: 'Return to SIFT 2.0' })).toBeVisible();
  });

  test('games in play say live scores are unavailable, and nothing shows an invented score @smoke', async ({ page }) => {
    await page.goto('#/v4');
    await expect(page.locator('[data-featured]')).toBeVisible();
    const live = page.getByRole('region', { name: 'Also live' });
    await expect(live).toContainText('Live scores are not available yet');
    await expect(live).toContainText('no score, clock or play is shown or estimated');
    await expect(live).toContainText('Score n/a');
    await expect(live).not.toContainText(/\b\d+\s*[–-]\s*\d+\b/);
    // and the Games screen says the same wherever a game is in play
    await page.goto('#/v4/games');
    await expect(page.getByRole('group', { name: 'Status' })).toBeVisible();
    await expect(page.locator('main')).toContainText('Live scores are not available yet');
  });
});
