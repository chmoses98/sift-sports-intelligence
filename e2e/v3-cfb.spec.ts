// SIFT 3.0: the CFB Script Engine restored in Game Detail. REAL published documents (the committed `props` fixture family in fixtures/real, offline: it holds 114 real CFB event
// research documents and their Kalshi contract lists, every one carrying a Script Engine payload). The clock is pinned one minute after the contract list's own capture, so the
// quote gate (the app's own) shows the published prices; nothing is stubbed. Two controlled modifications of a real document are named where used (an engine that could not
// read the game; a trimmed event whose research file is missing).
//   NIU at UNLV (2026-10-31): two scripts, a published market map, an untrimmed payload.
//   ARMY at MEM (2026-11-01): four scripts (Primary, Secondary, Alternate, Danger), trimmed by the publisher; its research file is not in the fixture, so the page keeps the event's own read.
import { test, expect, type Page } from '@playwright/test';
import { feedDocument, useRealFeeds as serveRealFeeds } from './support/realFeeds';

const FAMILY = 'props' as const;
const RAW = 'https://raw.githubusercontent.com/chmoses98/cfb-edge-finder/main/app/latest/';
const NIU_UNLV = 'evt_217f91e8eb4a20fabb27';
const ARMY_MEM = 'evt_3a88c1a86e7635c9f0d0';
const WIU_CHSO = 'evt_0f8933907378d58f1062';

interface Mkt { kalshi_ticker: string; yes_ask: number | null; no_ask: number | null; captured_at: string }
interface Research { extensions: { script_engine: { sift_read: { headline: string; points: { text: string }[] }; game_scripts: { role: string; title: string; rank: number }[]; script_survivors: string[]; script_market_map: { expressions: { ticker: string; side: 'YES' | 'NO'; authority: string | null }[] } } } }

const read = async <T>(rel: string): Promise<T> => JSON.parse((await feedDocument(FAMILY, RAW + rel))!.toString()) as T;
const detailOf = async (id: string) => (await read<{ markets: Mkt[] }>(`event_detail/${id}.json`)).markets;

async function setup(page: Page, id: string, edit?: (doc: Record<string, unknown>) => Record<string, unknown>) {
  await serveRealFeeds(page, { family: FAMILY });
  if (edit) {
    // a controlled modification of the REAL research document (route.fetch would reach the network, so the stored copy is read and the edited copy served)
    const doc = await read<Record<string, unknown>>(`explorer/events/${id}.json`);
    await page.route(`${RAW}explorer/events/${id}.json`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(edit(doc)), headers: { 'access-control-allow-origin': '*' } }));
  }
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  const captured = Date.parse((await detailOf(id))[0].captured_at);
  await page.clock.setFixedTime(new Date(captured + 60_000));
}
async function open(page: Page, id: string, query = '') {
  await page.goto(`./#/v3/game/cfb/${id}${query}`);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
  await expect(page.locator('.v3-gh')).toBeVisible({ timeout: 30_000 });
}
const noSideways = async (page: Page) => {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw, `the page is ${sw}px wide in a ${iw}px window`).toBeLessThanOrEqual(iw);
};
const BANNED = /\+EV|\bfair price\b|\bfair value\b|win probab|\d+% likely|\block\b/i;

test.describe('CFB Script Engine in Game Detail @v3', () => {
  test('the Overview shows the real script research directly: SIFT Read, three advantages, ranked scripts, surviving bets with their side prices, why this bet, data confidence', async ({ page }) => {
    await setup(page, NIU_UNLV);
    const r = await read<Research>(`explorer/events/${NIU_UNLV}.json`);
    const se = r.extensions.script_engine;
    await open(page, NIU_UNLV);
    await expect(page.getByRole('tab')).toHaveText(['Overview', 'Game Script', 'Matchup', 'Props']);

    const readCard = page.getByTestId('cfb-read');
    await expect(readCard).toBeVisible();
    await expect(readCard).toContainText(se.sift_read.headline);
    await expect(readCard).toContainText('Research only');
    await expect(readCard).toContainText(se.sift_read.points[0].text);

    await expect(page.getByTestId('cfb-advantage')).toHaveCount(3);
    await expect(page.getByTestId('cfb-advantages')).toContainText('What it measures');
    await expect(page.getByTestId('cfb-advantages')).toContainText('Why it matters');
    await expect(page.getByTestId('cfb-advantages')).toContainText(/#\d+ of \d+/);

    const scripts = page.getByTestId('cfb-script');
    await expect(scripts).toHaveCount(se.game_scripts.length);
    await expect(scripts.first()).toContainText('Primary');
    await expect(scripts.first().locator('.cs-chain li').first()).toBeVisible();
    await scripts.first().getByText(/Full causal chain/).click();
    await expect(scripts.first().locator('.cs-fn').first()).toBeVisible();

    const surv = page.getByTestId('cfb-survivors');
    await expect(surv).toContainText('Bets That Survive Multiple Scripts');
    await expect(surv).toContainText('Scoring: research only');
    await expect(surv.getByTestId('cfb-survivor').first()).toContainText(/Supported by/);
    await expect(surv.getByRole('region', { name: 'Why this bet' }).first()).toContainText('Supporting evidence');
    await expect(surv.getByRole('region', { name: 'Why this bet' }).first()).toContainText('Counterarguments');
    await expect(page.getByTestId('cfb-confidence')).toContainText(/data confidence/i);
    await expect(page.getByTestId('cfb-confidence')).toContainText('Opponent-adjusted inputs exist');

    const text = await page.locator('[data-v3-shell]').innerText();
    expect(text).not.toMatch(BANNED);
    await noSideways(page);
  });

  test('every price is that side\'s own Kalshi ask (YES by the YES ask, NO by the NO ask) and opens the addressed contract sheet', async ({ page }) => {
    await setup(page, NIU_UNLV);
    const mk = new Map((await detailOf(NIU_UNLV)).map((m) => [m.kalshi_ticker, m]));
    await open(page, NIU_UNLV);
    const rows = page.getByTestId('cfb-survivor');
    await expect(rows.first()).toBeVisible();
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    const sides = new Set<string>();
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      const side = (await row.getAttribute('data-side')) as 'YES' | 'NO';
      const tk = (await row.getAttribute('data-ticker'))!;
      sides.add(side);
      const m = mk.get(tk)!;
      const cents = Math.round((side === 'YES' ? m.yes_ask! : m.no_ask!) * 100);
      await expect(row.locator('a.cs-px')).toHaveText(new RegExp(`${side}\\s*${cents}¢`));
    }
    expect(sides.size).toBeGreaterThan(0);
    // tap the first row's price: the addressed sheet opens on this ticker, says which side the numbers are, and Back closes it
    const first = rows.first();
    const tk = (await first.getAttribute('data-ticker'))!;
    const before = page.url();
    await first.locator('a.cs-px').click();
    await expect(page).toHaveURL(new RegExp(`sheet=contract&tk=${tk}`));
    const dlg = page.getByRole('dialog');
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText(tk);
    if ((await first.getAttribute('data-side')) === 'NO') await expect(dlg).toContainText('YES side of this contract');
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(page.url()).toBe(before);
  });

  test('Game Script and Matchup tabs hold the detail, and nothing runs off the edge of a phone', async ({ page }) => {
    await setup(page, NIU_UNLV);
    await open(page, NIU_UNLV);
    await page.getByRole('tab', { name: 'Game Script' }).click();
    const tab = page.getByTestId('cfb-script-tab');
    await expect(tab).toBeVisible();
    await expect(tab).toContainText('Causal chain');
    await expect(tab).toContainText('Outcome shape');
    await expect(tab).toContainText('Markets this script settles');
    await expect(tab).toContainText('No probability is published');
    const pick = page.getByRole('group', { name: 'Script' }).getByRole('button');
    expect(await pick.count()).toBeGreaterThanOrEqual(2);
    await pick.nth(1).click();
    await expect(pick.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await noSideways(page);
    await page.getByRole('tab', { name: 'Matchup' }).click();
    const mx = page.getByTestId('cfb-matchup-tab');
    await expect(mx).toBeVisible();
    await expect(mx).toContainText('Unit by unit');
    await expect(mx).toContainText('Matchup findings');
    await mx.getByText('Sustained efficiency', { exact: true }).last().click();
    await expect(mx).toContainText(/#\d+ of \d+/);
    await noSideways(page);
    await page.getByRole('tab', { name: 'Props' }).click();
    await expect(page.locator('.v3-gd__body')).toBeVisible();
    await noSideways(page);
  });

  test('a shared link to the Game Script tab opens it once the research has loaded', async ({ page }) => {
    await setup(page, NIU_UNLV);
    await open(page, NIU_UNLV, '?v=1&tab=script');
    await expect(page.getByTestId('cfb-script-tab')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('tab', { selected: true })).toHaveText('Game Script');
  });

  test('four scripts: Primary, Secondary, Alternate and Danger; a trimmed event keeps its own read and its advantages', async ({ page }) => {
    await setup(page, ARMY_MEM);
    const r = await read<Research>(`explorer/events/${ARMY_MEM}.json`);
    await open(page, ARMY_MEM);
    const scripts = page.getByTestId('cfb-script');
    await expect(scripts).toHaveCount(r.extensions.script_engine.game_scripts.length);
    for (const role of ['Primary', 'Secondary', 'Alternate', 'Danger']) await expect(page.getByTestId('cfb-scripts')).toContainText(role);
    await expect(page.getByTestId('cfb-read')).toContainText(r.extensions.script_engine.sift_read.headline);
    // this publication trimmed only correlations and metric descriptions: the matchup tables are whole, so no "unavailable" notice, and the advantages still say what each metric measures
    await expect(page.getByTestId('cs-detail-unavailable')).toHaveCount(0);
    await expect(page.getByTestId('cfb-advantage')).toHaveCount(3);
    await expect(page.getByTestId('cfb-advantages')).toContainText('What it measures');
    await noSideways(page);
  });

  test('a game the engine could not read keeps the generic view with the engine\'s own reason, and has no script tabs', async ({ page }) => {
    // CONTROLLED MODIFICATION of a real document: the payload is replaced by the shape the engine publishes when it cannot match the game.
    await setup(page, WIU_CHSO, (d) => ({ ...d, extensions: { ...(d.extensions as object), script_engine: { status: 'UNAVAILABLE', reason: 'identity: no football-schedule event matched both teams near kickoff' } } }));
    await open(page, WIU_CHSO);
    await expect(page.getByRole('tab')).toHaveText(['Overview', 'Props']);
    const none = page.getByTestId('cfb-no-script');
    await expect(none).toBeVisible();
    await expect(none).toContainText('identity: no football-schedule event matched both teams near kickoff'.replace(/^i/, 'I'));
    await expect(page.getByTestId('win-price')).toBeVisible();
    await page.goto(`./#/v3/game/cfb/${WIU_CHSO}?v=1&tab=script`);
    await expect(page.getByRole('tab', { selected: true })).toHaveText('Overview');
    await noSideways(page);
  });
});
