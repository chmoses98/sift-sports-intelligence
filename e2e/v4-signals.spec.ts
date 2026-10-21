// SIFT v4 Signals (src/v4/Signals.tsx): the research inbox over the app's own opportunity layer, in real browsers.
// The bundled NFL publication carries no recommendations, so each test serves the ones it is about (e2e/propSignals.ts)
// over the bundled ATL at NO contracts; NHL and CFB come from their fixtures. Run with V4_SHOTS=<dir> for screenshots.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, NHL_FIXTURE, noHorizontalOverflow, NOW, test } from './fixtures';
import { GAME, OLAVE, serve } from './projectionDoc';
import { FRESH_AT, OLAVE_TICKER, rec, recActionable, recNo, recOn, serveRecommendations } from './propSignals';
import { installSlates } from './slates';

test.use({ timezoneId: 'America/Chicago' });
const SHOTS = process.env.V4_SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize()!.width}x${page.viewportSize()!.height}.png` }); };

type Mock = { set(t: string, bid: number, ask?: number): void; observedAt: string | null };
const cards = (page: Page) => page.locator('.v4-sg');
/** The closed groups' disclosure buttons (the status filter chips share their names). */
const closed = (page: Page, name: string) => page.locator('.v4-sg__disc').getByRole('button', { name: new RegExp(`^${name}`) });
const group = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const tray = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('sift.researchTray.v1') ?? 'null'));

/** Serve the projection feed, the controlled NFL recommendations and a fresh Olave 7+ quote, then open the feed. */
async function open(page: Page, market: Mock, items: unknown[], o: { query?: string; now?: Date; observedAt?: string } = {}) {
  await serve(page.context());
  await serveRecommendations(page.context(), items);
  market.set(OLAVE_TICKER, 0.45, 0.47);
  market.observedAt = o.observedAt ?? FRESH_AT;
  await page.clock.install({ time: o.now ?? NOW });
  await page.goto(`#/v4/signals${o.query ?? ''}`);
  await expect(page.getByRole('heading', { name: 'Signals', level: 1 })).toBeVisible();
}

// Every status the contract has, over one game: an actionable recommendation, research candidates on both sides of one
// contract, a pass the publication made, and one whose validity window has already closed.
const ALL_STATUSES = () => [
  recActionable(6, { current_price: 0.71, bet_up_to_price: 0.75, fair_probability: 0.8 }),
  rec(),
  recNo(),
  recOn(8, { recommendation_id: 'rec_pass_8', status: 'PASS', reason_not_playable: 'The publication judged this contract not playable at its price.', current_price: 0.42 }),
  recOn(5, { recommendation_id: 'rec_expired_5', expires_at: '2026-10-04T14:30:00Z', current_price: 0.83 }),
];

test.describe('v4 Signals feed', () => {
  test('every status lands in its own group, ordered by the app’s own ranking, with the publication’s reasons @smoke', async ({ page, market }) => {
    await open(page, market, ALL_STATUSES());
    const current = group(page, 'Current signals');
    await expect(current).toBeVisible();
    // the app's own grouping and ranking: the NFL publication's recommendations on one game are one thesis group, led by the
    // best (an actionable recommendation, tier 1, ahead of the research candidates, tier 3); the others are related expressions
    await expect(current.locator('.v4-sg')).toHaveCount(1);
    await expect(current.locator('.v4-sg').first().locator('.v4-badge')).toHaveText('Actionable');
    await expect(current.locator('.v4-sg__t b').first()).toHaveText('Chris Olave 6+ receptions');
    await current.getByRole('button', { name: '2 related expressions' }).click();
    await expect(current.locator('.v4-sg__relbtn')).toHaveCount(2);
    await expect(current.locator('.v4-sg__relist')).toContainText('Same thesis, another way in');
    // the pass and the lapsed window are closed groups that keep their counts and reasons
    const passed = closed(page, 'Passed');
    const stale = closed(page, 'No longer current');
    await expect(passed).toHaveAttribute('aria-expanded', 'false');
    await expect(stale).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText('The publication judged this contract not playable at its price.')).toHaveCount(0);
    await passed.click();
    await expect(passed).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('The publication judged this contract not playable at its price.')).toBeVisible();
    await expect(page.locator('.v4-sg--passed')).toContainText('Why it passed');
    await expect(page.locator('.v4-sg--passed .v4-badge')).toHaveText('Passed');
    await stale.click();
    await expect(page.locator('.v4-sg--stale')).toContainText('Why it is no longer current');
    await expect(page.locator('.v4-sg--stale')).toContainText(/validity window/);
    // a pass is never drawn as active: no save control, no price line
    await expect(page.locator('.v4-sg--passed .v4-save, .v4-sg--stale .v4-save')).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'signals-feed');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/signals-feed-full-${page.viewportSize()!.width}.png`, fullPage: true });
    await noHorizontalOverflow(page, 'v4 signals');
  });

  test('a card names the exact contract and side, the thesis, the authority and the Kalshi ask with its age @smoke', async ({ page, market }) => {
    await open(page, market, [rec()]);
    const card = cards(page).first();
    await expect(card.locator('.v4-sg__t b')).toHaveText('Chris Olave 7+ receptions');
    await expect(card.locator('.v4-sg__side')).toHaveText('YES');
    await expect(card.locator('.v4-sg__why')).toContainText('the NFL publication recommends YES on this contract');
    await expect(card.locator('.v4-badge')).toHaveText('Research candidate');
    await expect(card.locator('.v4-sg__auth')).toHaveText('Research only');
    await expect(card.locator('.v4-sg__ask')).toContainText(/Kalshi YES ask 47¢/);
    await expect(card.locator('.v4-sg__ask')).toContainText(/just now|\dm ago/);
    // nothing a card should leave to the sheet
    await expect(card).not.toContainText(/break-even|fee|calibration|simulation|distribution/i);
    await expect(page.locator('main')).not.toContainText(/best bet|guaranteed|\block\b|sure thing/i);
  });

  test('the NO side keeps its own identity: contract words, the NO pill, the NO ask and a separate save @smoke', async ({ page, market }) => {
    await open(page, market, [recNo()]);
    const card = cards(page).first();
    await expect(card.locator('.v4-sg__t b')).toHaveText('Chris Olave under 6.5 receptions');
    await expect(card.locator('.v4-sg__side')).toHaveText('NO');
    await expect(card.locator('.v4-sg__ask')).toContainText(/Kalshi NO ask 55¢/);
    await card.getByRole('button', { name: /^Save to My Board/ }).click();
    const t = await tray(page);
    expect(t.tray.items).toHaveLength(1);
    expect(t.tray.items[0].extra.x).toBe('side=NO');
    expect(Object.values(t.labels)[0]).toMatchObject({ side: 'NO' });
  });

  test('both sides of one contract save and remove independently; the sheet saves the related expression @smoke', async ({ page, market }) => {
    await open(page, market, [rec(), recNo()]);
    await expect(cards(page)).toHaveCount(1); // one thesis group: the lead, with the other side as a related expression
    const lead = cards(page).first();
    await expect(lead.getByRole('button', { name: /^\d+ related expression/ })).toBeVisible();
    await lead.getByRole('button', { name: /^Save to My Board/ }).click();
    await lead.getByRole('button', { name: /related expression/ }).click();
    await expect(lead.locator('.v4-sg__relist')).toContainText('Opposite outcome to the lead: they cannot both win');
    await lead.locator('.v4-sg__relbtn').click();
    const dlg = page.getByRole('dialog', { name: /^Research:/ });
    await dlg.getByRole('button', { name: /^Save to My Board/ }).click();
    const t = await tray(page);
    expect(t.tray.items).toHaveLength(2);
    expect(t.tray.items.map((i: { extra: { x: string | null } }) => i.extra.x).sort()).toEqual([null, 'side=NO']);
    expect(Object.values(t.labels).map((l) => (l as { side: string }).side).sort()).toEqual(['NO', 'YES']);
    // removing one side leaves the other saved
    await dlg.getByRole('button', { name: /^Remove from My Board/ }).click();
    const after = await tray(page);
    expect(after.tray.items).toHaveLength(1);
  });

  test('the sheet states where a signal stands: passed and no-longer-current are not shown as current @smoke', async ({ page, market }) => {
    await open(page, market, ALL_STATUSES(), { query: '?status=passed' });
    await page.locator('.v4-sg--passed .v4-sg__main').click();
    const dlg = page.getByRole('dialog', { name: /^Research:/ });
    await expect(dlg).toContainText('Passed by the publication');
    await expect(dlg).toContainText('The publication judged this contract not playable at its price.');
    await expect(dlg).not.toContainText(/Research · /);
    await expect(dlg).toContainText('What the publication said');
  });
});

test.describe('v4 Signals feed: time moves while it is open', () => {
  test('a validity window that closes moves the signal to No longer current, with the reason @smoke', async ({ page, market }) => {
    await open(page, market, [rec({ expires_at: '2026-10-04T15:20:00Z' })]);
    await expect(group(page, 'Current signals').locator('.v4-sg')).toHaveCount(1);
    await page.clock.fastForward('25:00');
    await expect(group(page, 'Current signals')).toHaveCount(0);
    const stale = closed(page, 'No longer current');
    await expect(stale).toBeVisible();
    await stale.click();
    await expect(page.locator('.v4-sg--stale')).toContainText(/validity window/);
    await expect(page.locator('.v4-sg--stale .v4-save')).toHaveCount(0);
  });

  test('a quote that ages out is first aging, then stale, and the signal stops being current @smoke', async ({ page, market }) => {
    await open(page, market, [rec()]);
    await expect(cards(page).first().locator('.v4-sg__ask')).toContainText(/just now|\dm ago/);
    await page.clock.fastForward('20:00');
    await expect(group(page, 'Current signals').locator('.v4-sg')).toHaveCount(1); // aging (20 minutes) is still executable
    await expect(cards(page).first().locator('.v4-sg__ask')).toContainText(/2\dm ago/);
    await page.clock.fastForward('20:00');
    await expect(group(page, 'Current signals')).toHaveCount(0);
    await closed(page, 'No longer current').click();
    await expect(page.locator('.v4-sg--stale')).toContainText(/stale/i);
  });

  test('the pregame freeze: kickoff passes while the feed is open and the signal is frozen, not current @smoke', async ({ page, market }) => {
    // ATL at NO kicks off 2026-10-06T00:15Z
    await open(page, market, [rec({ created_at: '2026-10-05T23:55:00Z', expires_at: '2026-10-06T06:00:00Z' })], { now: new Date('2026-10-05T23:56:00Z'), observedAt: '2026-10-05T23:55:00Z' });
    await expect(group(page, 'Current signals').locator('.v4-sg')).toHaveCount(1);
    await page.clock.fastForward('21:00');
    await expect(group(page, 'Current signals')).toHaveCount(0);
    await closed(page, 'No longer current').click();
    await expect(page.locator('.v4-sg--stale')).toContainText(/started|frozen|kickoff/i);
    await expect(page.locator('.v4-sg--stale .v4-save')).toHaveCount(0);
    // the sheet agrees
    await page.locator('.v4-sg--stale .v4-sg__main').click();
    const dlg = page.getByRole('dialog', { name: /^Research:/ });
    await expect(dlg).toContainText(/frozen at kickoff/);
    await expect(dlg).not.toContainText(/Research · /);
  });

  test('a sheet left open stops calling a signal current once its window closes @smoke', async ({ page, market }) => {
    await open(page, market, [rec({ expires_at: '2026-10-04T15:20:00Z' })]);
    await cards(page).first().locator('.v4-sg__main').click();
    const dlg = page.getByRole('dialog', { name: /^Research:/ });
    await expect(dlg).toContainText('Research · Research only');
    await page.clock.fastForward('25:00');
    await expect(dlg).toContainText('No longer current');
    await expect(dlg).toContainText(/validity window/);
    await expect(dlg).not.toContainText('Research · Research only');
  });
});

test.describe('v4 Signals feed: what was read', () => {
  test('sports with no published opportunity show their publication’s verdict, not a made-up signal @smoke', async ({ page, market }) => {
    await installSlates(page.context(), { NBA: 3, MLB: 2 }, { now: NOW });
    await serve(page.context());
    await serveRecommendations(page.context(), []);
    market.observedAt = FRESH_AT;
    await page.clock.install({ time: NOW });
    await page.goto('#/v4/signals');
    await expect(page.getByText('No current signals').first()).toBeVisible();
    const nfl = page.locator('.v4-sg__covrow', { hasText: 'NFL' });
    await expect(nfl).toHaveAttribute('data-state', 'verdict');
    await expect(nfl).toContainText(/recommends nothing this week|No upcoming game|passed their published start|Every game/);
    await expect(page.locator('.v4-sg__covrow', { hasText: 'NBA' })).toContainText(/prices no contract|No upcoming game|Every game/);
    await expect(cards(page)).toHaveCount(0);
    await shot(page, 'signals-verdicts');
  });

  test('an unreadable publication is unavailable, never "no signals"; the others still show @smoke', async ({ page, market }) => {
    await open(page, market, [rec()]);
    await page.context().route(/raw\.githubusercontent\.com\/chmoses98\/NHL-edge-finder\//, (r) => r.fulfill({ status: 500, body: 'x', headers: { 'access-control-allow-origin': '*' } }));
    await page.reload();
    await expect(cards(page).first()).toBeVisible();
    const nhl = page.locator('.v4-sg__covrow', { hasText: 'NHL' });
    await expect(nhl).toHaveAttribute('data-state', 'unavailable');
    await expect(nhl).toContainText('not a verdict that nothing qualifies');
    await expect(page.getByRole('status').filter({ hasText: /publications? unavailable/ })).toContainText('missing data, not zero signals');
  });

  test('when no publication can be read the screen says so, not "no signals" @smoke', async ({ page, errors }) => {
    errors.allow(/status of 500/);
    await page.context().route(/raw\.githubusercontent\.com\//, (r) => r.fulfill({ status: 500, body: 'x', headers: { 'access-control-allow-origin': '*' } }));
    await page.context().route(/\/data\/nfl\/app\/latest\//, (r) => r.fulfill({ status: 500, body: 'x' }));
    await page.goto('#/v4/signals');
    await expect(page.getByRole('alert')).toContainText('Published signals are unavailable');
    await expect(page.getByRole('alert')).toContainText('not a verdict that none qualify');
    await expect(page.getByText('No current signals')).toHaveCount(0);
  });
});

test.describe('v4 Signals feed: filters live in the address', () => {
  test('sport, game and status filters narrow the feed, survive a reload and clear @smoke', async ({ page, market }) => {
    await open(page, market, ALL_STATUSES());
    await page.getByRole('group', { name: 'Sport' }).getByRole('button', { name: /NFL/ }).click();
    await expect(page).toHaveURL(/sport=nfl/);
    const games = page.getByRole('group', { name: 'Game' });
    await expect(games).toBeVisible();
    await games.getByRole('button', { name: /@/ }).first().click();
    await expect(page).toHaveURL(/game=evt_/);
    await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: /^Passed/ }).click();
    await expect(page).toHaveURL(/status=passed/);
    await expect(page.locator('.v4-sg--passed')).toBeVisible(); // a chosen group opens
    await expect(group(page, 'Current signals')).toHaveCount(0);
    await page.reload();
    await expect(page).toHaveURL(/sport=nfl.*status=passed|status=passed.*sport=nfl/);
    await expect(page.getByRole('group', { name: 'Status' }).getByRole('button', { name: /^Passed/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.v4-sg--passed')).toBeVisible();
    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(page).not.toHaveURL(/sport=|status=|game=/);
    await expect(group(page, 'Current signals')).toBeVisible();
  });
});

test.describe('v4 Signals feed: from a game or a prop and back', () => {
  const OLAVE_URL = `/props/nfl/${GAME}/${OLAVE}?stat=receptions`;

  test('prop research -> Signals for that contract and side -> back keeps the prop and its side @smoke', async ({ page, market }) => {
    await serve(page.context());
    await serveRecommendations(page.context(), [recNo()]);
    market.set(OLAVE_TICKER, 0.45, 0.47);
    market.observedAt = FRESH_AT;
    await page.clock.install({ time: NOW });
    await page.goto(`#/v4${OLAVE_URL}&side=under`);
    await expect(page.locator('.v4-tile--model')).toBeVisible();
    await page.getByRole('button', { name: 'Research details', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: /^Research:/ });
    await expect(dlg).toContainText('Why it is flagged');
    await dlg.getByRole('link', { name: 'All signals on this game' }).click();
    await expect(page).toHaveURL(/#\/v4\/signals\?.*sport=nfl.*game=evt_/);
    await expect(page).toHaveURL(/market=mkt_kalshi_KXNFLREC-26OCT05ATLNO-NOCOLAVE12-7/);
    await expect(page).toHaveURL(/side=NO/);
    await expect(page.locator('.v4-sg.is-focus')).toHaveCount(1);
    await expect(page.locator('.v4-sg.is-focus .v4-sg__side')).toHaveText('NO');
    await page.goBack();
    await expect(page).toHaveURL(/#\/v4\/props\/nfl\/.*side=under/);
    await expect(page.getByRole('heading', { name: 'Chris Olave', level: 1 })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Side' }).getByRole('button', { name: 'Under' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('a prop with no published signal on its side is told so on the way in, not shown someone else’s @smoke', async ({ page, market }) => {
    await open(page, market, [rec()], { query: '?sport=nfl&game=' + GAME + '&market=mkt_kalshi_KXNFLREC-26OCT05ATLNO-NOCOLAVE12-7&side=NO' });
    await expect(page.getByText('Only the YES side is published')).toBeVisible();
    await expect(page.locator('.v4-sg.is-focus')).toHaveCount(0); // the other side's signal is not presented as the contract being read
    await expect(cards(page).first().locator('.v4-sg__side')).toHaveText('YES');
    await open(page, market, [], { query: '?sport=nfl&game=' + GAME + '&market=mkt_kalshi_KXNFLREC-26OCT05ATLNO-NOCOLAVE12-9&side=YES' });
    await expect(page.getByText(/No published signal for that contract on the YES side/)).toBeVisible();
    await expect(page.locator('.v4-sg.is-focus')).toHaveCount(0);
  });

  test('the Signals card opens the shared research sheet and Save shows on the same tray @smoke', async ({ page, market }) => {
    await open(page, market, [rec()]);
    await cards(page).first().getByRole('button', { name: /^Save to My Board/ }).click();
    await cards(page).first().locator('.v4-sg__main').click();
    const dlg = page.getByRole('dialog', { name: /^Research:/ });
    await expect(dlg.getByRole('button', { name: /^Remove from My Board/ })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(cards(page).first().locator('.v4-sg__main')).toBeFocused();
  });

  test('a saved under reaches the existing SIFT 2.0 My Board as the NO side, with the NO ask @smoke', async ({ page, market }) => {
    await open(page, market, [recNo()]);
    await cards(page).first().getByRole('button', { name: /^Save to My Board/ }).click();
    await page.goto('#/board');
    await expect(page.getByText('Chris Olave under 6.5 receptions')).toBeVisible();
    await expect(page.locator('[title="NO ask when you saved it"]')).toBeVisible();
    await expect(page.locator('[title="YES ask when you saved it"]')).toHaveCount(0);
  });
});

test.describe('v4 Signals feed: published research from the fixtures', () => {
  const NHL_RAW = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/NHL-edge-finder\/data-archive\/app\/latest\/(.+)$/;
  const NHL_NOW = new Date('2026-10-06T23:30:00Z');
  async function serveNhl(page: Page) {
    await page.context().route(NHL_RAW, async (route) => {
      const file = join(NHL_FIXTURE, NHL_RAW.exec(route.request().url())![1].split('?')[0]);
      if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } });
      return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(file, 'utf-8'), headers: { 'access-control-allow-origin': '*' } });
    });
  }

  test('NHL research candidates are listed with their games, and the game page links back to the feed @smoke', async ({ page, market }) => {
    await page.clock.setFixedTime(NHL_NOW);
    market.observedAt = NHL_NOW.toISOString();
    await serveNhl(page);
    await page.goto('#/v4/signals?sport=nhl');
    await expect(cards(page).first()).toBeVisible();
    await expect(cards(page).first().locator('.v4-sg__game')).toContainText(/@/);
    await shot(page, 'signals-nhl');
    await cards(page).first().locator('.v4-sg__main').click();
    const dlg = page.getByRole('dialog', { name: /^Research:/ });
    await expect(dlg.getByText('Why it is flagged')).toBeVisible();
    await expect(dlg.getByRole('link', { name: 'All signals on this game' })).toHaveCount(0); // already in the feed
    await expect(dlg).toContainText(/Research · /);
  });

  test('Home chip -> sheet -> Signals for that game -> back keeps the league on Home @smoke', async ({ page, market }) => {
    await page.clock.setFixedTime(NHL_NOW);
    market.observedAt = NHL_NOW.toISOString();
    await serveNhl(page);
    await page.goto('#/v4?sport=nhl');
    const chip = page.getByRole('button', { name: /published research signals? on .*Open$/ }).first();
    await expect(chip).toBeVisible();
    await chip.click();
    const dlg = page.getByRole('dialog', { name: /^Research:/ });
    await dlg.getByRole('link', { name: 'All signals on this game' }).click();
    await expect(page).toHaveURL(/#\/v4\/signals\?sport=nhl&game=evt_[^&]+&market=[^&]+&side=(YES|NO)/);
    await expect(page.locator('.v4-sg.is-focus')).toHaveCount(1);
    const label = (await page.locator('.v4-sg.is-focus .v4-sg__game').textContent())!;
    for (const t of await page.locator('.v4-sg .v4-sg__game').allTextContents()) expect(t).toBe(label); // the game's signals only
    await shot(page, 'signals-from-home');
    await page.goBack();
    await expect(page).toHaveURL(/#\/v4\?sport=nhl/);
    await expect(page.getByRole('button', { name: /published research signals? on .*Open$/ }).first()).toBeVisible();
  });

  test('Game research -> All signals for the game -> back returns to the same game tab @smoke', async ({ page, market }) => {
    await page.clock.setFixedTime(NHL_NOW);
    market.observedAt = NHL_NOW.toISOString();
    await serveNhl(page);
    await page.goto('#/v4/game/nhl/evt_5938c3f8a7c1b24c0118?tab=markets');
    const research = page.getByRole('region', { name: 'Published research' });
    await expect(research).toBeVisible();
    await research.getByRole('link', { name: 'All signals' }).click();
    await expect(page).toHaveURL(/#\/v4\/signals\?sport=nhl&game=evt_5938c3f8a7c1b24c0118/);
    await expect(cards(page).first()).toBeVisible();
    for (const t of await page.locator('.v4-sg .v4-sg__game').allTextContents()) expect(t).toBe('FLA @ LAK');
    await page.getByRole('link', { name: 'Open the game' }).click();
    await expect(page).toHaveURL(/#\/v4\/game\/nhl\/evt_5938c3f8a7c1b24c0118/);
  });
});

test.describe('v4 Signals feed: a published watch', () => {
  const CFB_FIXTURE = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'tests', 'fixtures', 'cfb', 'app', 'latest');
  const CFB_RAW = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/cfb-edge-finder\/main\/app\/latest\/(.+)$/;
  const CFB_SIGNALS = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/cfb-edge-finder\/research-signals\/signals\/cfb_research_signals\.json(\?.*)?$/;
  const CFB_NOW = new Date('2026-10-07T12:05:00Z'); // five minutes after the fixture's capture: its Value Watch price is current

  test('a CFB Value Watch is a Watch: no price claim, never a priced contract signal @smoke', async ({ page, market }) => {
    await page.clock.setFixedTime(CFB_NOW);
    market.observedAt = CFB_NOW.toISOString();
    await page.context().route(CFB_SIGNALS, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(join(CFB_FIXTURE, '..', '..', 'signals', 'cfb_research_signals.json'), 'utf-8'), headers: { 'access-control-allow-origin': '*' } }));
    await page.context().route(CFB_RAW, async (route) => {
      const file = join(CFB_FIXTURE, CFB_RAW.exec(route.request().url())![1].split('?')[0]);
      if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } });
      return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(file, 'utf-8'), headers: { 'access-control-allow-origin': '*' } });
    });
    await page.goto('#/v4/signals?sport=cfb');
    const watch = group(page, 'Watch');
    await expect(watch).toBeVisible();
    await expect(watch).toContainText('not a priced contract signal');
    const card = watch.locator('.v4-sg').first();
    await expect(card.locator('.v4-badge')).toHaveText('Watch');
    await expect(card.locator('.v4-sg__ask')).toHaveText('Game-level watch · no priced contract signal');
    await expect(card).not.toContainText(/Kalshi (YES|NO) ask/);
    await expect(group(page, 'Current signals')).toHaveCount(0);
    await shot(page, 'signals-watch');
    await card.locator('.v4-sg__main').click();
    const dlg = page.getByRole('dialog', { name: /^Research:/ });
    await expect(dlg).toContainText('Watch · a published game-level watch, not a priced contract signal');
    await expect(dlg).not.toContainText(/Research · /);
  });
});

test.describe('v4 Signals feed: phone, accessibility and motion', () => {
  test('every control is at least 44px, nothing clips or overflows at the three phone sizes @smoke', async ({ page, market }) => {
    for (const size of [{ width: 390, height: 844 }, { width: 375, height: 812 }, { width: 375, height: 667 }]) {
      await page.setViewportSize(size);
      await open(page, market, ALL_STATUSES());
      await expect(cards(page).first()).toBeVisible();
      await closed(page, 'Passed').click();
      await closed(page, 'No longer current').click();
      const bad = await page.evaluate(() => {
        const vis = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
        const small = [...document.querySelectorAll('.v4 button, .v4 a[href], .v4 input')].filter(vis).filter((el) => Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height) < 43.5).map((el) => `${el.tagName}.${el.className} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
        const tiny = [...document.querySelectorAll('.v4 *')].filter((el) => el.children.length === 0 && (el.textContent ?? '').trim() && vis(el) && parseFloat(getComputedStyle(el).fontSize) < 11 && !el.closest('.v4-tab, svg')).map((el) => `${el.className}:${(el.textContent ?? '').trim().slice(0, 20)}`);
        return { small, tiny };
      });
      expect(bad.small, `${size.width}x${size.height}: controls under 44px`).toEqual([]);
      expect(bad.tiny, `${size.width}x${size.height}: text under 11px`).toEqual([]);
      await noHorizontalOverflow(page, `signals ${size.width}x${size.height}`);
      await shot(page, 'signals-feed-open');
    }
  });

  test('has no accessibility violations, with the closed groups open @smoke', async ({ page, market }) => {
    await open(page, market, ALL_STATUSES());
    await expect(cards(page).first()).toBeVisible();
    await closed(page, 'Passed').click();
    await closed(page, 'No longer current').click();
    await page.waitForLoadState('networkidle');
    const res = await new AxeBuilder({ page }).include('.v4').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(res.violations).toEqual([]);
  });

  test('with reduced motion nothing on the screen animates or transitions @smoke', async ({ page, market }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, market, ALL_STATUSES());
    await expect(cards(page).first()).toBeVisible();
    const moving = await page.evaluate(() => [...document.querySelectorAll('.v4 *')].filter((el) => {
      const s = getComputedStyle(el);
      return (s.animationName !== 'none' && parseFloat(s.animationDuration) > 0) || [...s.transitionDuration.split(',')].some((d) => parseFloat(d) > 0);
    }).map((el) => `${el.tagName}.${el.className}`));
    expect(moving).toEqual([]);
  });
});
