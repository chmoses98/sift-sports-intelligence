// The unified favorites picker (src/v3/ui/FavoritesPicker.tsx) and following a group (model/groups.ts): one sheet, reachable from My SIFT and from Home's
// empty Following state, with sport/league chips, a search box, "All college sports", a whole-league row, conference chips and single teams. Sample data
// (?demo=1): deterministic and offline. The sample slate: NCAAF has live games (UGA-FLA, LSU-AUB, TEX-OKLA, ALA-TENN: all SEC; ND-USC: not), NBA has BOS-NYK live.
import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await page.addInitScript(() => { try { if (!localStorage.getItem('sift3.prefs')) localStorage.setItem('sift3.prefs', JSON.stringify({ priceFormat: 'cents', reduceMotion: false, textScale: 'default', onboarded: true })); } catch { /* */ } });
});

type Seed = Record<string, unknown> | null;
async function go(page: Page, path: string, seed?: Seed) {
  if (seed !== undefined) await page.addInitScript((s) => { try { if (s && !sessionStorage.getItem('seeded')) { localStorage.setItem('sift3.follows', JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } } catch { /* */ } }, seed);
  await page.goto(`./#${path}${path.includes('?') ? '&' : '?'}demo=1`);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]demo=/);
}
const follows = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('sift3.follows') ?? 'null') as { teams: string[]; players: string[]; games: string[]; groups: string[] } | null);
const picker = (page: Page) => page.getByRole('dialog', { name: 'Choose favorites' });
const leagueChip = (page: Page, name: string) => picker(page).getByRole('group', { name: 'Sport or league' }).getByRole('button', { name, exact: true });
const cards = (page: Page) => page.locator('.v3-gc');

async function openFromMySift(page: Page) {
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'My SIFT' }).click();
  await expect(page).toHaveURL(/#\/v3\/following/);
}

test.describe('Favorites picker @v3', () => {
  test('My SIFT empty state opens the picker; All college sports is one toggle, shown at once, with an obvious Done', async ({ page }) => {
    await go(page, '/v3/following', null);
    const start = page.getByRole('region', { name: 'Start following' });
    await start.getByRole('button', { name: 'Choose favorites' }).click();
    await expect(picker(page)).toBeVisible();
    await expect(picker(page).getByRole('searchbox', { name: /Search teams, leagues and conferences/ })).toBeVisible();
    await expect(picker(page).getByRole('group', { name: 'Sport or league' }).getByRole('button')).toHaveText(['All', 'NFL', 'NCAAF', 'NCAAB', 'NBA', 'MLB', 'NHL']);
    await expect(leagueChip(page, 'All')).toHaveAttribute('aria-pressed', 'true');

    const college = picker(page).getByRole('button', { name: /^All college sports/ });
    await expect(college).toHaveAttribute('aria-pressed', 'false');
    await college.click();
    await expect(college).toHaveAttribute('aria-pressed', 'true'); // immediately, in the sheet
    expect((await follows(page))?.groups).toEqual(['college:all']);
    await expect(picker(page).getByRole('status').first()).toContainText('Following 1 item');
    // one more tap removes it
    await college.click();
    await expect(college).toHaveAttribute('aria-pressed', 'false');
    expect((await follows(page))?.groups).toEqual([]);
    await college.click();

    await picker(page).getByRole('button', { name: 'Done', exact: true }).click();
    await expect(picker(page)).toHaveCount(0);
    // My SIFT now lists the college games and says why; no alert was turned on and no team or game was starred for the user
    await expect(page.getByRole('region', { name: 'Live now' }).locator('article.v3-gc').first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Live now' })).toContainText('All college sports');
    const f = await follows(page);
    expect(f?.teams).toEqual([]);
    expect(f?.games).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('sift3.alerts'))).toBeNull();
    await expect(page.getByRole('region', { name: 'What you follow' })).toContainText('All college sports');
  });

  test('a league row follows the whole league; the sport chips narrow to a league and its teams; a team is one tap', async ({ page }) => {
    await go(page, '/v3/following', null);
    await openFromMySift(page);
    await page.getByRole('button', { name: 'Choose favorites' }).first().click();

    // All: group rows only, a hint instead of 700 team rows
    await expect(picker(page).getByRole('button', { name: /^All NFL/ })).toBeVisible();
    await expect(picker(page).getByText('Pick a league above to follow single teams')).toBeVisible();
    await expect(picker(page).getByRole('list', { name: /teams$/ })).toHaveCount(0);

    await leagueChip(page, 'NFL').click();
    await expect(leagueChip(page, 'NFL')).toHaveAttribute('aria-pressed', 'true');
    await expect(picker(page).getByRole('list', { name: 'NFL teams' }).getByRole('button')).toHaveCount(32);
    const cowboys = picker(page).getByRole('button', { name: /^Dallas Cowboys/ });
    await expect(cowboys).toHaveAttribute('aria-pressed', 'false');
    await cowboys.click();
    await expect(cowboys).toHaveAttribute('aria-pressed', 'true');
    expect((await follows(page))?.teams).toEqual(['nfl:DAL']);
    await picker(page).getByRole('button', { name: /^All NFL/ }).click();
    await expect(picker(page).getByRole('button', { name: /^All NFL/ })).toHaveAttribute('aria-pressed', 'true');
    expect((await follows(page))?.groups).toEqual(['league:nfl']);
    await cowboys.click();
    await expect(cowboys).toHaveAttribute('aria-pressed', 'false');
    expect((await follows(page))?.teams).toEqual([]);
    expect((await follows(page))?.groups).toEqual(['league:nfl']); // removing the team never touches the league
  });

  test('search finds a team across leagues; a conference chip follows the conference, shown at once; the NCAAB list is honest', async ({ page }) => {
    await go(page, '/v3/following', null);
    await openFromMySift(page);
    await page.getByRole('button', { name: 'Choose favorites' }).first().click();

    const box = picker(page).getByRole('searchbox');
    await box.fill('georgia');
    const uga = picker(page).getByRole('button', { name: /^Georgia, NCAAF, SEC/ });
    await expect(uga).toBeVisible();
    await uga.click();
    await expect(uga).toHaveAttribute('aria-pressed', 'true');
    expect((await follows(page))?.teams).toEqual(['cfb:UGA']);
    await box.fill('zzzz');
    await expect(picker(page).getByText('Nothing matches')).toBeVisible();
    await picker(page).getByRole('button', { name: 'Clear search', exact: true }).first().click();

    await leagueChip(page, 'NCAAF').click();
    const sec = picker(page).getByRole('button', { name: /^NCAAF SEC conference/ });
    await expect(sec).toBeVisible();
    await sec.click();
    await expect(sec).toHaveAttribute('aria-pressed', 'true');
    expect((await follows(page))?.groups).toEqual(['conf:cfb:SEC']);
    // the whole league now covers the conference chip: it reads included and is not separately switchable
    await picker(page).getByRole('button', { name: /^All NCAAF/ }).click();
    await expect(sec).toHaveAttribute('aria-pressed', 'true'); // still its own follow: removing the league later keeps it
    const bigTen = picker(page).getByRole('button', { name: /^NCAAF Big Ten conference/ });
    await expect(bigTen).toHaveAttribute('aria-pressed', 'true');
    await expect(bigTen).toHaveAttribute('aria-disabled', 'true');
    await bigTen.click({ force: true }); // a no-op: the league already includes it
    expect((await follows(page))?.groups).toEqual(['league:cfb', 'conf:cfb:SEC']);

    await leagueChip(page, 'NCAAB').click();
    await expect(picker(page).getByRole('group', { name: 'NCAAB conferences to follow' })).toBeVisible();
    // every supported NCAAB team is listed, with or without a published game, and a single team can be followed
    await box.fill('duke');
    const duke = picker(page).getByRole('button', { name: /^Duke, NCAAB/ });
    await expect(duke).toBeVisible();
    await duke.click();
    await expect(duke).toHaveAttribute('aria-pressed', 'true');
    expect((await follows(page))?.teams).toContain('cbb:DUKE');
    await expect(picker(page).getByText(/NCAAB teams are listed once they have a published game/)).toHaveCount(0);
  });

  test('Home: the empty Following state opens the picker; a followed conference fills the feed with its games only, and the badge counts it once', async ({ page }) => {
    await go(page, '/v3?view=following', null);
    await expect(page.getByText('Follow teams to build your feed')).toBeVisible();
    await page.getByRole('button', { name: 'Choose favorites' }).click();
    await expect(picker(page)).toBeVisible();
    await leagueChip(page, 'NCAAF').click();
    await picker(page).getByRole('button', { name: /^NCAAF SEC conference/ }).click();
    await picker(page).getByRole('button', { name: 'Done', exact: true }).click();

    await expect(page.getByRole('tab', { name: /^Following/ })).toContainText('1');
    await expect(cards(page).first()).toBeVisible();
    const text = await page.locator('main, [data-v3-shell]').first().innerText();
    expect(text).toMatch(/UGA|Georgia/);
    expect(text).not.toMatch(/\bUSC\b/); // Notre Dame at USC: neither is in the SEC
    expect(await cards(page).count()).toBeGreaterThan(4);
    // a game followed only through the conference has a hollow star: the viewer starred nothing
    await expect(page.getByRole('button', { name: /^Unfollow / })).toHaveCount(0);
    expect((await follows(page))?.games).toEqual([]);
    // the star is still one tap: it follows that game itself
    await page.getByRole('button', { name: /^Follow / }).first().click();
    expect((await follows(page))?.games).toHaveLength(1);
    expect((await follows(page))?.groups).toEqual(['conf:cfb:SEC']);
  });

  test('a follow saved before groups existed loads whole and is kept when a group is added', async ({ page }) => {
    await go(page, '/v3/following', { teams: ['cfb:UGA', 'nba:NYK'], players: ['nba:sample-guard'], games: [] });
    await expect(page.getByRole('tab', { name: /^Following/ })).toContainText('3');
    await page.getByRole('button', { name: 'Choose favorites' }).first().click();
    await leagueChip(page, 'NFL').click();
    await picker(page).getByRole('button', { name: /^All NFL/ }).click();
    await picker(page).getByRole('button', { name: 'Done', exact: true }).click();
    const f = await follows(page);
    expect(f?.teams).toEqual(['cfb:UGA', 'nba:NYK']);
    expect(f?.players).toEqual(['nba:sample-guard']);
    expect(f?.groups).toEqual(['league:nfl']);
    // the group is listed beside them, with its own unfollow
    const mine = page.getByRole('region', { name: 'What you follow' });
    await expect(mine).toContainText('Leagues and conferences');
    await mine.getByRole('button', { name: 'Unfollow NFL' }).click();
    expect((await follows(page))?.groups).toEqual([]);
    expect((await follows(page))?.teams).toEqual(['cfb:UGA', 'nba:NYK']);
  });

  test('keyboard and Back: Escape closes the sheet; Back returns to the screen as it was; every row is a pressed-state button', async ({ page }) => {
    await go(page, '/v3/following', null);
    const url = page.url();
    await page.getByRole('button', { name: 'Choose favorites' }).first().click();
    await expect(picker(page)).toBeVisible();
    await picker(page).getByRole('button', { name: /^All college sports/ }).focus();
    await page.keyboard.press('Space');
    await expect(picker(page).getByRole('button', { name: /^All college sports/ })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(picker(page)).toHaveCount(0);
    expect(page.url()).toBe(url);
    expect((await follows(page))?.groups).toEqual(['college:all']);

    await page.getByRole('button', { name: 'Choose favorites' }).first().click();
    await expect(picker(page)).toBeVisible();
    await page.goBack();
    await expect(picker(page)).toHaveCount(0);
    expect(page.url()).toBe(url);
  });

  test.describe('review image', () => {
    test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    test('the picker at phone width (V3_PICKER_SHOT=<path> writes it)', async ({ page }) => {
    test.skip(!process.env.V3_PICKER_SHOT, 'set V3_PICKER_SHOT=<path> to write the review image');
    await go(page, '/v3/following', { teams: ['cfb:ALA'], players: [], games: [], groups: ['conf:cfb:SEC'] });
    await page.getByRole('button', { name: 'Choose favorites' }).first().click();
    // a real pointer tap (a locator click may scroll the sheet to bring the chip into view, which a thumb does not)
    { const b = (await leagueChip(page, 'NCAAF').boundingBox())!; await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
    await expect(picker(page).getByRole('button', { name: /^NCAAF SEC conference/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(picker(page).getByRole('button', { name: /^Show \d+ more NCAAF teams/ })).toBeAttached();
    await page.screenshot({ path: process.env.V3_PICKER_SHOT });
    });
  });
});
