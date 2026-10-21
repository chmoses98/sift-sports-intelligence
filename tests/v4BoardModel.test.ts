import { describe, expect, it } from 'vitest';
import { boardGroups, type GameGroup } from '../src/board/model';
import { makeTrayItem, type TrayExtra } from '../src/packet/tray';
import type { BoardItem } from '../src/contract/types';
import type { LiveQuote } from '../src/live/types';
import type { TrayLabel } from '../src/state/tray';
import { entryView, gameState, lookAgain, priceLine, targetOf, type BoardCtx, type EntryView } from '../src/v4/boardModel';
import { iso, MARKET, NOW, opp } from './support/v4Opportunity';

const EVENT = 'evt_639f74e87ff25310c542';
const SAVED = new Date(NOW - 2 * 3600_000).toISOString();
const board = (over: Partial<BoardItem> = {}): BoardItem => ({
  event_id: EVENT, league: 'NFL', competition: 'Week 5', status: 'SCHEDULED', start_time_utc: '2026-10-05T17:00:00Z', home_participant: 'h', away_participant: 'a',
  participants: [{ participant_id: 'h', display_name: 'New Orleans', short_name: 'NO', participant_type: 'TEAM' }, { participant_id: 'a', display_name: 'Atlanta', short_name: 'ATL', participant_type: 'TEAM' }],
  data_freshness: 'FRESH', health_flags: [], detail_path: '', market_captured_at: null, model_generated_at: null, markets_available: 0, markets_priced: 0, recommendations_count: 0, wagers_count: 0, ...over,
} as BoardItem);
const q = (over: Partial<LiveQuote> = {}): LiveQuote => ({ ticker: 'T-7', eventTicker: null, seriesTicker: null, yesBid: 0.45, yesAsk: 0.47, noBid: 0.53, noAsk: 0.55, lastPrice: null, volume: null, openInterest: null, availability: 'OPEN', rawStatus: null, closeTime: null, observedAt: iso(2), source: 'relay', title: null, yesSubTitle: null, strike: null, ...over });
const snap = (yesAsk: number | null, noAsk: number | null) => ({ ticker: 'T-7', yesAsk, yesBid: null, noAsk, noBid: null, observedAt: SAVED, source: 'publication' });

function build(items: { ref_kind: 'MARKET' | 'EVENT' | 'PLAYER' | 'TEAM'; id: string; extra?: Partial<TrayExtra>; label: TrayLabel }[], boards = new Map([[EVENT, board()]])) {
  const trayItems = items.map((i) => makeTrayItem({ ref_kind: i.ref_kind, sport: 'NFL', id: i.id, extra: i.extra ?? null, added_at: SAVED }));
  const labels = Object.fromEntries(trayItems.map((t, i) => [t.item_id, { ...items[i].label, savedAt: SAVED }]));
  return boardGroups(trayItems, labels, boards, NOW);
}
const ctx = (over: Partial<BoardCtx> = {}): BoardCtx => ({ now: NOW, quote: () => q(), opps: [], sportRead: () => true, ...over });
const market = (label: Partial<TrayLabel> = {}) => ({ ref_kind: 'MARKET' as const, id: MARKET, extra: { market_id: MARKET, event_id: EVENT }, label: { label: 'Chris Olave 7+ receptions', href: `/nfl/market/${MARKET}?event=${EVENT}`, kickoff: '2026-10-05T17:00:00Z', market: snap(0.4, 0.5), ...label } });
const viewOf = (g: GameGroup[], c: BoardCtx) => entryView(g[0].entries[0], g[0], new Map([[EVENT, board()]]).get(EVENT), c);

describe('the saved price is compared on the saved side, and only against a current quote', () => {
  it('a YES save compares the YES ask; a NO save compares the NO ask', () => {
    const yes = viewOf(build([market()]), ctx());
    expect(yes.side).toBe('YES');
    expect(yes.price).toMatchObject({ state: 'compared', savedAsk: 0.4, nowAsk: 0.47, moveCents: 7 });
    const no = viewOf(build([market({ side: 'NO' })]), ctx());
    expect(no.side).toBe('NO');
    expect(no.price).toMatchObject({ state: 'compared', savedAsk: 0.5, nowAsk: 0.55, moveCents: 5 });
  });
  it('a save made before sides were recorded reads as YES, and says the side was not recorded', () => {
    const v = viewOf(build([market()]), ctx());
    expect(v.side).toBe('YES');
    expect(v.sideRecorded).toBe(false);
    expect(viewOf(build([market({ side: 'NO' })]), ctx()).sideRecorded).toBe(true);
  });
  it('a stale or undated quote is context: shown, never compared', () => {
    const g = build([market()]);
    const stale = viewOf(g, ctx({ quote: () => q({ observedAt: iso(90) }) })).price;
    expect(stale).toMatchObject({ state: 'stale', nowAsk: 0.47, moveCents: null, freshness: 'STALE' });
    const undated = viewOf(g, ctx({ quote: () => q({ observedAt: '' }) })).price;
    expect(undated.state).toBe('stale');
    expect(undated.moveCents).toBeNull();
  });
  it('an aging quote (15-30 minutes) is still current', () => {
    expect(viewOf(build([market()]), ctx({ quote: () => q({ observedAt: iso(20) }) })).price.state).toBe('compared');
  });
  it('a closed contract, a missing quote and a missing saved price are said, never zero', () => {
    const g = build([market()]);
    expect(viewOf(g, ctx({ quote: () => q({ availability: 'CLOSED' }) })).price).toMatchObject({ state: 'closed', nowAsk: null, moveCents: null });
    expect(viewOf(g, ctx({ quote: () => undefined })).price).toMatchObject({ state: 'noQuote', nowAsk: null });
    expect(viewOf(g, ctx({ quote: () => q({ yesAsk: null }) })).price.state).toBe('noQuote');
    const none = viewOf(build([market({ market: null })]), ctx()).price;
    expect(none.state).toBe('noSaved');
    expect(none.savedAsk).toBeNull();
    const noSavedSide = viewOf(build([market({ side: 'NO', market: snap(0.4, null) })]), ctx()).price;
    expect(noSavedSide.state).toBe('noSaved');
  });
  it('only a market has a price line', () => {
    const g = build([{ ref_kind: 'EVENT', id: EVENT, label: { label: 'ATL @ NO', href: `/nfl/game/${EVENT}` } }]);
    expect(viewOf(g, ctx()).price.state).toBe('none');
  });
  it('priceLine stands alone on an entry', () => {
    const g = build([market()]);
    expect(priceLine(g[0].entries[0], 'YES', () => q(), NOW).moveCents).toBe(7);
  });
});

describe('pregame research is frozen once the game is', () => {
  it('after kickoff, or when the publication says started or final', () => {
    const g = build([market()]);
    expect(viewOf(g, ctx()).frozen).toBe(false);
    expect(viewOf(g, ctx({ now: Date.parse('2026-10-05T18:00:00Z') })).frozen).toBe(true);
    const started = entryView(g[0].entries[0], g[0], board({ status: 'IN_PROGRESS' }), ctx());
    expect(started.frozen).toBe(true);
  });
});

describe('where a saved item opens in v4, with sport, game, market and side kept', () => {
  const entry = (item: Parameters<typeof build>[0][number]) => build([item])[0].entries[0];
  it('a v4 prop save opens the player on the saved side', () => {
    const e = entry(market({ side: 'NO', href: `/nfl/props?game=${EVENT}&prop=${encodeURIComponent('prt_9b2e|receptions')}` }));
    expect(targetOf(e, 'NO', false)).toEqual({ kind: 'prop', label: 'Open prop', to: `/v4/props/nfl/${EVENT}/prt_9b2e?stat=receptions&side=under` });
    expect(targetOf(e, 'YES', false)).toMatchObject({ to: `/v4/props/nfl/${EVENT}/prt_9b2e?stat=receptions` });
  });
  it('a market with a published signal opens Signals on the same contract and side', () => {
    const e = entry(market());
    expect(targetOf(e, 'YES', true)).toEqual({ kind: 'signals', label: 'Open signals', to: `/v4/signals?sport=nfl&game=${EVENT}&market=${MARKET}&side=YES` });
  });
  it('a market without one opens the game’s markets; a game opens the game; a player opens the game’s players', () => {
    expect(targetOf(entry(market()), 'YES', false)).toMatchObject({ kind: 'markets', to: `/v4/game/nfl/${EVENT}?tab=markets` });
    expect(targetOf(entry({ ref_kind: 'EVENT', id: EVENT, label: { label: 'ATL @ NO', href: '' } }), 'YES', false)).toMatchObject({ kind: 'game', to: `/v4/game/nfl/${EVENT}` });
    expect(targetOf(entry({ ref_kind: 'PLAYER', id: 'prt_1', extra: { event_id: EVENT }, label: { label: 'Chris Olave', href: '/nfl/player/prt_1' } }), 'YES', false)).toMatchObject({ kind: 'players', to: `/v4/game/nfl/${EVENT}?tab=players` });
  });
  it('an item with no v4 screen opens the SIFT 2.0 page it was saved from, or nothing', () => {
    expect(targetOf(entry({ ref_kind: 'TEAM', id: 'prt_s', label: { label: 'Saints', href: '/nfl/team/prt_s' } }), 'YES', false)).toEqual({ kind: 'classic', label: 'Open in SIFT 2.0', to: '/nfl/team/prt_s' });
    expect(targetOf(entry({ ref_kind: 'TEAM', id: 'prt_s', label: { label: 'Saints', href: '' } }), 'YES', false)).toEqual({ kind: 'none' });
  });
});

describe('what the publication now says about a saved contract and side', () => {
  const sided = (side: 'YES' | 'NO') => market(side === 'NO' ? { side } : {});
  it('exact-side: valid, passed and opposite-side are told apart', () => {
    const g = build([sided('YES')]);
    expect(viewOf(g, ctx({ opps: [opp()] })).signal?.kind).toBe('valid');
    expect(viewOf(g, ctx({ opps: [opp({ status: 'PASS', statusReason: 'x' })] })).signal?.kind).toBe('passed');
    expect(viewOf(g, ctx({ opps: [opp({ what: { side: 'NO' }, price: { side: 'NO' } })] })).signal?.kind).toBe('oppositeSide');
    expect(viewOf(g, ctx()).signal?.kind).toBe('none');
  });
  it('a saved NO is matched against the NO signal, not the YES one', () => {
    const g = build([sided('NO')]);
    expect(viewOf(g, ctx({ opps: [opp()] })).signal?.kind).toBe('oppositeSide');
    expect(viewOf(g, ctx({ opps: [opp({ what: { side: 'NO' }, price: { side: 'NO' } })] })).signal?.kind).toBe('valid');
  });
});

describe('a game that cannot be compared says why', () => {
  const g = build([{ ref_kind: 'EVENT', id: 'evt_gone', label: { label: 'Old', href: '' } }], new Map())[0];
  it('unreadable publication is missing data; read publication without the game is "gone"; loading says nothing', () => {
    expect(gameState(g, undefined, ctx({ sportRead: () => false })).kind).toBe('unreadable');
    expect(gameState(g, undefined, ctx({ sportRead: () => true })).kind).toBe('gone');
    expect(gameState(g, undefined, ctx({ sportRead: () => null })).kind).toBe('ok');
    expect(gameState(g, board(), ctx()).kind).toBe('ok');
  });
});

describe('what deserves another look: only evidence, never advice', () => {
  const reasons = (g: GameGroup[], c: BoardCtx, b = new Map([[EVENT, board()]])) => {
    const views = new Map<string, EntryView>();
    for (const x of g) for (const e of x.entries) views.set(e.item.item_id, entryView(e, x, x.eventId ? b.get(x.eventId) : undefined, c));
    return lookAgain(g, views, b);
  };
  it('a move of 5 cents or more on the saved side, with the sentence that it is not a profit', () => {
    const r = reasons(build([market()]), ctx());
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: 'price' });
    expect(r[0].text).toMatch(/YES ask up 7¢ since saved \(40¢ → 47¢\)\. A price move is not a profit or a loss\./);
  });
  it('a smaller move, a stale quote or a missing quote is not a reason', () => {
    expect(reasons(build([market({ market: snap(0.45, 0.5) })]), ctx())).toHaveLength(0);
    expect(reasons(build([market()]), ctx({ quote: () => q({ observedAt: iso(90) }) }))).toHaveLength(0);
    expect(reasons(build([market()]), ctx({ quote: () => undefined }))).toHaveLength(0);
  });
  it('a NO save is judged on its own ask, and a downward move is worded as a move', () => {
    const r = reasons(build([market({ side: 'NO', market: snap(0.4, 0.62) })]), ctx());
    expect(r[0].text).toMatch(/NO ask down 7¢ since saved \(62¢ → 55¢\)/);
  });
  it('a published signal or a pass on the exact contract and side is a reason; an opposite-side one is not', () => {
    expect(reasons(build([market({ market: snap(0.45, 0.5) })]), ctx({ opps: [opp()] })).map((x) => x.kind)).toEqual(['signal']);
    expect(reasons(build([market({ market: snap(0.45, 0.5) })]), ctx({ opps: [opp({ status: 'PASS', statusReason: 'Above the bet-up-to price.' })] }))[0].text).toMatch(/passed: Above the bet-up-to price/);
    expect(reasons(build([market({ market: snap(0.45, 0.5) })]), ctx({ opps: [opp({ what: { side: 'NO' }, price: { side: 'NO' } })] }))).toHaveLength(0);
  });
  it('a postponed game and a newer research run are reasons; an ordinary start is not', () => {
    const g = build([market({ market: snap(0.45, 0.5) })]);
    const post = new Map([[EVENT, board({ status: 'POSTPONED' })]]);
    expect(reasons(build([market({ market: snap(0.45, 0.5) })], post), ctx(), post).some((r) => r.kind === 'game' && /postponed/.test(r.text))).toBe(true);
    const newer = new Map([[EVENT, board({ model_generated_at: new Date(NOW - 3600_000).toISOString() })]]);
    expect(reasons(g, ctx(), newer).some((r) => r.kind === 'game' && /newer research run/.test(r.text))).toBe(true);
    expect(reasons(g, ctx({ now: Date.parse('2026-10-05T18:00:00Z') })).filter((r) => r.kind === 'game')).toHaveLength(0);
  });
});
