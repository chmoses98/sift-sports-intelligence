import { test, expect, NOW, NEBUF } from '../e2e/fixtures';

// SIFT 2.0 as the default interface. Fixtures and the fixed clock are the shared acceptance ones (external feeds are
// stand-ins), so this proves routing and compatibility, not live data.
test.beforeEach(async ({ page }) => page.clock.install({ time: NOW }));

// WebKit reports a same-origin static fetch (bundled data, hero photographs, logos) that is still in flight when the page
// navigates or reloads as a pageerror. Playwright splits its text at the first colon, so the error's name is "Fetch API
// cannot load http" and its message is only "/localhost:<port>/<base>/…<file> due to access control checks.". Aborting a
// request on purpose is not an application error; this allows exactly that (a file under the site's own base path), and
// the shared `errors` fixture still fails these tests on any other page or console error.
const ABORTED_FETCH = /\/sift-sports-intelligence\/\S+ due to access control checks/;

test('the root address opens SIFT 2.0 Home', async ({ page }) => {
  await page.goto('#/');
  await expect(page).toHaveURL(/#\/design\/sift2\/home$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
});

const CLASSIC: [string, RegExp, (p: import('@playwright/test').Page) => Promise<void>][] = [
  ['#/games', /#\/design\/sift2\/games$/, async (p) => { await expect(p.getByRole('heading', { level: 1, name: 'Games', exact: true })).toBeVisible(); }],
  ['#/props', /#\/design\/sift2\/props$/, async (p) => { await expect(p.getByRole('heading', { level: 1, name: 'Player prop explorer', exact: true })).toBeVisible(); }],
  ['#/explore', /#\/design\/sift2\/lab$/, async (p) => { await expect(p.getByRole('heading', { level: 1, name: 'Research Lab', exact: true })).toBeVisible(); }],
  ['#/intelligence', /#\/design\/sift2\/intelligence$/, async (p) => { await expect(p.getByRole('heading', { level: 1, name: 'Terminal', exact: true })).toBeVisible(); }],
  ['#/board', /#\/design\/sift2\/board$/, async (p) => { await expect(p.locator('.sift2-workspace')).toBeVisible(); }],
  ['#/status', /#\/design\/sift2\/status$/, async (p) => { await expect(p.getByRole('heading', { name: 'Live market quotes' })).toBeVisible(); }],
  [`#/nfl/game/${NEBUF}`, new RegExp(`#/design/sift2/nfl/game/${NEBUF}$`), async (p) => { await expect(p.locator('.sift2-command')).toBeVisible(); }],
  ['#/nfl/props', /#\/design\/sift2\/nfl\/props$/, async (p) => { await expect(p.locator('.sift2-workspace, .app--sift2').first()).toBeVisible(); }],
  ['#/nfl', /#\/design\/sift2\/nfl$/, async (p) => { await expect(p.locator('.app--sift2')).toBeVisible(); }],
  ['#/mlb', /#\/design\/sift2\/mlb$/, async (p) => { await expect(p.locator('.app--sift2')).toBeVisible(); }],
];
for (const [from, to, shows] of CLASSIC) {
  test(`classic address ${from.replace(NEBUF, '<event>')} lands on SIFT 2.0 and survives a refresh`, async ({ page, errors }) => {
    errors.allow(ABORTED_FETCH);
    await page.goto(from);
    await expect(page).toHaveURL(to);
    await shows(page);
    // Let the route's own chunks and data finish before reloading: a reload mid-download aborts them on purpose, and
    // WebKit reports that as errors (a failed CSS preload, a cut-off data fetch). That is the test's doing, not the app's.
    await page.waitForLoadState('networkidle');
    await page.reload();
    await expect(page).toHaveURL(to);
    await shows(page);
  });
}

test('query strings survive the redirect', async ({ page }) => {
  await page.goto('#/props?sport=mlb');
  await expect(page).toHaveURL(/#\/design\/sift2\/props\?sport=mlb$/);
});

test('?ui=classic keeps the classic interface reachable, remembered in this browser, and ?ui=default restores SIFT 2.0', async ({ page }) => {
  await page.goto('#/?ui=classic');
  await expect(page.getByRole('heading', { level: 1, name: 'Today on SIFT' })).toBeVisible();
  expect(page.url()).not.toContain('design/sift2');
  await page.goto('#/games');
  await expect(page).toHaveURL(/#\/games$/);
  await page.goto('#/?ui=default');
  await expect(page).toHaveURL(/#\/design\/sift2\/home$/);
});

test('an unknown address renders a page, never a crash or a blank screen', async ({ page, errors }) => {
  errors.allow(ABORTED_FETCH);
  await page.goto('#/zz-not-a-sport/x/y');
  await expect(page.locator('.app--sift2')).toBeVisible();
  await expect(page.locator('body')).not.toBeEmpty();
});

test('a classic Games address with day=tomorrow opens tomorrow on the SIFT 2.0 date strip', async ({ page, isMobile }) => {
  await page.goto('#/games?day=tomorrow&sport=nfl');
  await expect(page).toHaveURL(/#\/design\/sift2\/games\?day=tomorrow&sport=nfl$/);
  const tomorrow = new Date(NOW); tomorrow.setDate(tomorrow.getDate() + 1);
  const label = tomorrow.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  // Desktop shows the seven-day strip with tomorrow pressed; phones show the day stepper, labelled "Tomorrow" with the date.
  const stepper = page.locator('.s2-daybar');
  if (isMobile) {
    await expect(stepper).toContainText('Tomorrow');
    await expect(stepper).toContainText(label);
  } else {
    await expect(page.getByRole('group', { name: 'Game date' }).getByRole('button', { pressed: true })).toContainText(label);
  }
});

test('phone: Research Lab, Settings and Sources are reachable from the header Sports sheet', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the Sports sheet is the phone navigation');
  await page.goto('#/');
  // '#/' redirects to the default interface after the first render: a tap before that lands on a topbar that is then replaced, and the sheet it opened
  // goes with it (the dialog never appeared on a slow WebKit runner, 2026-10-22). Wait for the redirect, then use the topbar.
  await expect(page).toHaveURL(/#\/design\/sift2\/home/);
  await expect(page.locator('.topbar__sport')).toBeVisible();
  await page.locator('.topbar__sport').click();
  const sheet = page.getByRole('dialog', { name: 'Sports and sections' });
  await sheet.getByRole('link', { name: 'Research Lab' }).click();
  await expect(page).toHaveURL(/#\/design\/sift2\/lab$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Research Lab', exact: true })).toBeVisible();
  await page.locator('.topbar__sport').click();
  await expect(page.getByRole('dialog', { name: 'Sports and sections' }).getByRole('link', { name: 'Data & provenance' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Sports and sections' }).getByRole('link', { name: 'Settings' })).toBeVisible();
});
