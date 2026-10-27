// Prop Discovery: availability is read for the rows that need it (a row says "Checking availability" and never shows a player the publication
// lists out as plainly available), and History's order and thresholds tell evaluated rows from unevaluated ones. Real cached documents,
// fixed clock (e2e/support/realFeeds.ts). Nothing here is a fixture: the player below is listed OUT in the captured NBA research document.
import { test, expect, type Page } from '@playwright/test';
import { feedNow, freshQuotes, useRealFeeds } from './support/realFeeds';

test.setTimeout(150_000);

/** A player the captured NBA research document lists OUT and who has prop contracts (Chet Holmgren, OKC). */
const OUT_PLAYER = 'Holmgren';

async function useSetup(page: Page, o: { holdAvailability?: boolean } = {}) {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ priceFormat: 'cents', reduceMotion: false, textScale: 'default', onboarded: true })); } catch { /* storage may be blocked */ } });
  await page.clock.setFixedTime(feedNow());
  // eslint-disable-next-line react-hooks/rules-of-hooks -- a Playwright helper, not a React hook
  await useRealFeeds(page);
  await freshQuotes(page);
  let release: () => void = () => undefined;
  if (o.holdAvailability) {
    const gate = new Promise<void>((r) => { release = r; });
    await page.route(/\/explorer\/events\/evt_/, async (route) => { await gate; await route.fallback(); });
  }
  return { release: () => release() };
}

test.describe('availability', () => {
  test('while the injury report is not read the row says so; when it arrives the listed-out player leaves "Hide out"', async ({ page }) => {
    const gate = await useSetup(page, { holdAvailability: true });
    await page.goto(`./#/v3/props?view=list&q=${OUT_PLAYER}`);
    const row = page.locator('.pd-row').first();
    await expect(row).toBeVisible({ timeout: 90_000 });
    await expect(row.locator('.pd-tag[data-avail="pending"]')).toHaveText('Checking availability');
    await expect(row.locator('.pd-row__hit')).toHaveAttribute('aria-label', /checking availability/);
    gate.release();
    await expect(page.locator('.pd-row')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('.pd-empty')).toContainText('No props match');
  });

  test('with Hide out off the listed-out player is shown, labelled with the publication\'s word', async ({ page }) => {
    await useSetup(page);
    await page.goto(`./#/v3/props?view=list&hide=0&q=${OUT_PLAYER}`);
    const row = page.locator('.pd-row').first();
    await expect(row.locator('.pd-tag.is-out')).toHaveText('OUT', { timeout: 90_000 });
    await expect(row.locator('.pd-row__hit')).toHaveAttribute('aria-label', /listed OUT/);
  });

  test('the default list never settles with a listed-out player available among the rows it has checked', async ({ page }) => {
    await useSetup(page);
    await page.goto('./#/v3/props?view=list&sport=nba');
    await page.waitForSelector('.pd-row', { timeout: 90_000 });
    await page.waitForTimeout(4000);
    // every visible row is either checked (no tag) or labelled; none is an OUT row
    const tags = await page.locator('.pd-row .pd-tag').evaluateAll((els) => els.map((e) => ({ t: e.textContent, out: e.classList.contains('is-out') })));
    expect(tags.filter((t) => t.out)).toEqual([]);
    expect(tags.filter((t) => t.t !== 'Checking availability')).toEqual([]);
  });
});

test.describe('History is never a fake ranking', () => {
  test('sorting by History says how many rows were evaluated, groups the rest, and loads more only on request', async ({ page }) => {
    await useSetup(page);
    await page.goto('./#/v3/props?view=list&sort=hist');
    const bar = page.locator('.pd-hbar');
    await expect(bar).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('.pd-hz__st')).toContainText('starting within 48 hours', { timeout: 90_000 });
    const nums = async () => { const t = (await bar.locator('.pd-hbar__t').textContent()) ?? ''; const m = /Evaluated (\d+) of (\d+)/.exec(t); return { n: Number(m?.[1]), of: Number(m?.[2]) }; };
    await expect.poll(async () => (await nums()).of, { timeout: 90_000 }).toBeGreaterThan(0);
    const first = await nums();
    expect(first.of).toBeGreaterThan(first.n);
    await expect(bar).toContainText('ranks evaluated props only');
    // the unevaluated rows are labelled and kept apart from the ranked ones
    await expect(page.locator('.pd-grp[data-group="pending"] h2')).toHaveText('History not loaded');
    await expect(page.locator('.pd-grp[data-group="pending"] p')).toContainText('not ranked');
    // no log is read behind the viewer's back while History orders the list (beyond the automatic few)
    const load = bar.getByRole('button', { name: /Load history for \d+ more players? \(about [\d.]+ (KB|MB)\)/ });
    if (await load.count()) {
      await load.click();
      await expect.poll(async () => (await nums()).n, { timeout: 90_000 }).toBeGreaterThan(first.n);
    }
  });

  test('a History threshold says it applies to evaluated rows only and shows nothing for the others', async ({ page }) => {
    await useSetup(page);
    await page.goto('./#/v3/props?view=list&hmin=7&sport=nfl');
    const bar = page.locator('.pd-hbar');
    await expect(bar).toBeVisible({ timeout: 90_000 });
    await expect(bar).toContainText('applies to evaluated props only');
    await expect(bar).toContainText(/Evaluated \d+ of \d+ props/);
    await expect(page.locator('.pd-grp')).toHaveCount(0);
  });
});
