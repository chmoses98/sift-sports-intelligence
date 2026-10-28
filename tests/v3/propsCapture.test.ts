// @vitest-environment node
// What the committed `props` fixture family must hold for the Prop Discovery specs (e2e/v3-props*, v3-scores, v3-starts, v3-nontradable, v3-saved-reopen)
// to run, not skip, whatever the day it was captured: priced and unpriced games in every horizon, every game of the horizon readable, and the
// few facts the specs derive their expectations from. Read from the family's own documents (e2e/support/propsFixture.ts), so a refreshed capture is
// checked by the same rules and a capture that lacks one fails here with the reason instead of making a spec skip.
import { beforeAll, describe, expect, it } from 'vitest';
import { feedSource } from '../../e2e/support/feedSource';
import { fixtureGames, isPriced, outPlayerWithContracts, scheduleStartMs, within, type FxGame } from '../../e2e/support/propsFixture';
import { openBundle } from '../../scripts/v3-fixtures/lib.mjs';

const FAMILY = 'props' as const;
let games: FxGame[] = [];
beforeAll(async () => { games = await fixtureGames(FAMILY); }, 60_000);

describe('the props family capture', () => {
  it('has one clock pin, and every game Prop Discovery reads starts after it', () => {
    const clock = Date.parse(openBundle().family(FAMILY).clock.captured_at);
    expect(Number.isFinite(clock)).toBe(true);
    expect(games.length).toBeGreaterThan(0);
    for (const g of games) expect(g.startMs).toBeGreaterThan(clock);
  });

  for (const h of ['48h', '7d', 'all'] as const) {
    it(`${h}: holds priced games and unpriced games, and every game in it has its contract document`, async () => {
      const set = within(games, FAMILY, h);
      expect(set.filter(isPriced).length, 'games with a live-quote file that carries asks').toBeGreaterThan(0);
      expect(set.filter((g) => !isPriced(g)).length, 'games with no live-quote file (rows print "—")').toBeGreaterThan(0);
      const src = feedSource(FAMILY);
      const missing: string[] = [];
      for (const g of set) if (!(await src.get(`${g.base}event_detail/${g.eventId}.json`))) missing.push(`${g.slug} ${g.away.code} at ${g.home.code}`);
      expect(missing, 'games whose contract document is not in the family (the list would show them unreadable)').toEqual([]);
    }, 60_000);
  }

  it('spans several sports, priced and unpriced', () => {
    const sports = new Set(within(games, FAMILY, '7d').map((g) => g.slug));
    expect(sports.size).toBeGreaterThanOrEqual(3);
    expect(within(games, FAMILY, '48h').some((g) => g.slug === 'nba')).toBe(true);
    expect(within(games, FAMILY, '48h').some((g) => (g.slug === 'nfl' || g.slug === 'nhl') && isPriced(g))).toBe(true);
  });

  it('holds the facts the specs derive from: an NBA game with two other clubs, a game whose board and schedule start agree, an NBA player listed OUT with contracts', async () => {
    const nba = games.filter((g) => g.slug === 'nba');
    expect(nba.length).toBeGreaterThan(0);
    expect(nba.some((x) => ![x.home.code, x.away.code].some((c) => [nba[0].home.code, nba[0].away.code].includes(c)))).toBe(true);
    let agree = false;
    for (const g of within(games, FAMILY, '48h')) if ((await scheduleStartMs(FAMILY, g)) === g.startMs) { agree = true; break; }
    expect(agree).toBe(true);
    expect(await outPlayerWithContracts(FAMILY, 'nba')).not.toBeNull();
  }, 60_000);
});
