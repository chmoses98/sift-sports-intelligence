import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script shared with the production check, no types
import { findProviderGame, judgeGamePage, judgeRow, providerNba, providerSupports } from '../scripts/live-score-expect.mjs';

// shapes are the real SportScore ones (tests/fixtures/live-scores/real/sportscore-*.json)
const body = (m: Record<string, unknown>[]) => ({ sport: 'basketball', updated: '2026-10-22T23:40:00Z', matches: m });
const LIVE = { home: 'Philadelphia 76ers', away: 'Cleveland Cavaliers', home_score: '55', away_score: '61', status: 'live', status_text: '2nd quarter', time: '2026-10-22T23:00:00+00:00', competition: 'National Basketball Association' };
const FINAL = { ...LIVE, status: 'finished', status_text: 'Finished', home_score: '104', away_score: '99' };
const NOSCORE = { ...LIVE, home_score: null, away_score: null };
const OTHER_LEAGUE = { ...LIVE, competition: 'EuroLeague' };

const card = (over: Record<string, unknown> = {}) => ({
  mode: 'live', heading: 'In play', score: 'Cleveland Cavaliers 61 · Philadelphia 76ers 55', period: '2nd quarter', status: 'LIVE · 12s',
  source: 'SportScore (free tier, attribution)', credit: true, unavailableTitle: false, ...over,
});
const prov = (m: Record<string, unknown>) => providerNba(body([m]))[0];

describe('provider parsing and matching', () => {
  it('keeps only NBA games and reads scores as integers', () => {
    const g = providerNba(body([LIVE, OTHER_LEAGUE, { ...LIVE, home: '' }]));
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ homeScore: 55, awayScore: 61, status: 'live', statusText: '2nd quarter' });
  });
  it('matches by both team names and a start within three hours, never a rematch on another night', () => {
    const games = providerNba(body([LIVE]));
    const q = { home: 'Philadelphia 76ers', away: 'Cleveland Cavaliers', startMs: Date.parse('2026-10-22T23:00:00Z') };
    expect(findProviderGame(games, q)).not.toBeNull();
    expect(findProviderGame(games, { ...q, startMs: q.startMs + 24 * 3600_000 })).toBeNull();
    expect(findProviderGame(games, { ...q, away: 'Boston Celtics' })).toBeNull();
  });
  it('a score is supported only for a live or final game with both numbers', () => {
    expect(providerSupports(prov(LIVE))).toMatchObject({ score: true, live: true });
    expect(providerSupports(prov(FINAL))).toMatchObject({ score: true, final: true });
    expect(providerSupports(prov(NOSCORE)).score).toBe(false);
    expect(providerSupports(null).score).toBe(false);
  });
});

describe('in-play rows (Home and Games)', () => {
  it('NBA with a score: the score must carry its freshness', () => {
    expect(judgeRow({ slug: 'nba', mid: 'Q2 4:32 · LIVE · 12s', score: '61–55' }).ok).toBe(true);
    expect(judgeRow({ slug: 'nba', mid: 'Q2 · stale 6m', score: '61–55' }).ok).toBe(true);
    expect(judgeRow({ slug: 'nba', mid: '', score: '61–55' }).ok).toBe(false);
  });
  it('an unsupported sport in play must say the score is unavailable and may never show one', () => {
    for (const slug of ['nfl', 'cfb', 'nhl', 'mlb']) {
      expect(judgeRow({ slug, mid: 'In play Score n/a', score: null })).toMatchObject({ ok: true, state: 'unavailable' });
      expect(judgeRow({ slug, mid: 'Q2 LIVE', score: '14–7' }).ok).toBe(false);
    }
  });
  it('a missing score says so; silence is a failure', () => {
    expect(judgeRow({ slug: 'nba', mid: 'Live No score reported', score: null })).toMatchObject({ ok: true, state: 'no-score' });
    expect(judgeRow({ slug: 'nba', mid: 'In play', score: null }).ok).toBe(false);
  });
});

describe('the Live card on a game page against the provider', () => {
  const before = prov(LIVE);
  it('NBA with a valid score shows the real score, period, freshness and the SportScore credit', () => {
    expect(judgeGamePage({ slug: 'nba', page: card(), providers: [before] })).toMatchObject({ ok: true, state: 'live' });
  });
  it('the score may move between the two provider reads; either may match', () => {
    const after = prov({ ...LIVE, home_score: '57', away_score: '61' });
    expect(judgeGamePage({ slug: 'nba', page: card({ score: 'Cleveland Cavaliers 61 · Philadelphia 76ers 57' }), providers: [before, after] }).ok).toBe(true);
  });
  it('a score the provider does not have is invented: fail', () => {
    const r = judgeGamePage({ slug: 'nba', page: card({ score: 'Cleveland Cavaliers 70 · Philadelphia 76ers 66' }), providers: [before] });
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toMatch(/provider says 61-55/);
  });
  it('a card without its source or credit fails', () => {
    expect(judgeGamePage({ slug: 'nba', page: card({ credit: false }), providers: [before] }).ok).toBe(false);
    expect(judgeGamePage({ slug: 'nba', page: card({ source: 'Somewhere' }), providers: [before] }).ok).toBe(false);
  });
  it('the period is the provider\'s own words, or "Not reported" when it gave none; never invented', () => {
    expect(judgeGamePage({ slug: 'nba', page: card({ period: 'Not reported' }), providers: [before] }).ok).toBe(true);   // short forms and "Not reported" are shown, not made up
    const none = prov({ ...LIVE, status_text: null });
    expect(judgeGamePage({ slug: 'nba', page: card({ period: 'Not reported' }), providers: [none] }).ok).toBe(true);
    expect(judgeGamePage({ slug: 'nba', page: card({ period: '3rd quarter' }), providers: [none] }).ok).toBe(false);
    expect(judgeGamePage({ slug: 'nba', page: card({ period: '' }), providers: [before] }).ok).toBe(false);
  });
  it('a final needs no period but still the source and credit', () => {
    expect(judgeGamePage({ slug: 'nba', page: card({ mode: 'final', heading: 'Final', score: 'Cleveland Cavaliers 99 · Philadelphia 76ers 104', period: '', status: 'Final' }), providers: [prov(FINAL)] }).ok).toBe(true);
  });
  it('a delayed score carries its age', () => {
    expect(judgeGamePage({ slug: 'nba', page: card({ mode: 'delayed', heading: 'In play · delayed', status: 'Updated 2m ago' }), providers: [before] }).ok).toBe(true);
    expect(judgeGamePage({ slug: 'nba', page: card({ mode: 'delayed', heading: 'In play · delayed', status: 'Updated' }), providers: [before] }).ok).toBe(false);
  });
  it('a stale provider response keeps the last verified score with its age and is never called live', () => {
    const stale = { mode: 'last_known', heading: 'Last known score', status: 'Stale · 6m' };
    expect(judgeGamePage({ slug: 'nba', page: card(stale), providers: [before] }).ok).toBe(true);
    expect(judgeGamePage({ slug: 'nba', page: card({ ...stale, heading: 'In play' }), providers: [before] }).ok).toBe(false);
    expect(judgeGamePage({ slug: 'nba', page: card({ ...stale, status: 'LIVE' }), providers: [before] }).ok).toBe(false);
    expect(judgeGamePage({ slug: 'nba', page: card({ ...stale, status: 'Stale' }), providers: [before] }).ok).toBe(false);
  });
  it('NBA with no verified match says the score is unavailable (and notes a scored provider game it could not match)', () => {
    const ok = judgeGamePage({ slug: 'nba', page: { mode: null, unavailableTitle: true }, providers: [before] });
    expect(ok).toMatchObject({ ok: true, state: 'unavailable' });
    expect(ok.note).toMatch(/identity rules/);
    expect(judgeGamePage({ slug: 'nba', page: { mode: null, unavailableTitle: false }, providers: [] }).ok).toBe(false);
  });
  it('a score card with no scored provider game is a failure', () => {
    expect(judgeGamePage({ slug: 'nba', page: card(), providers: [prov(NOSCORE)] }).ok).toBe(false);
    expect(judgeGamePage({ slug: 'nba', page: card(), providers: [] }).ok).toBe(false);
  });
  it('when the provider cannot be read from the runner the card is judged on its own statements and the run says so', () => {
    const r = judgeGamePage({ slug: 'nba', page: card(), providers: [], providerOk: false });
    expect(r.ok).toBe(true);
    expect(r.note).toMatch(/could not be read/);
    expect(judgeGamePage({ slug: 'nba', page: card({ credit: false }), providers: [], providerOk: false }).ok).toBe(false);   // still needs its credit
  });
  it('an unsupported sport shows no card and says its live score is unavailable', () => {
    for (const slug of ['nfl', 'cfb', 'nhl', 'mlb']) {
      expect(judgeGamePage({ slug, page: { mode: null, unavailableTitle: true } })).toMatchObject({ ok: true, state: 'unavailable' });
      expect(judgeGamePage({ slug, page: card() }).ok).toBe(false);
      expect(judgeGamePage({ slug, page: { mode: null, unavailableTitle: false } }).ok).toBe(false);
    }
  });
});
