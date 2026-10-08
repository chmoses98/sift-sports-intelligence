// The CFB research-signals contract (cfb_research_signals/1.0.0) as Sift reads it: the schema guard, the CONTROL side's
// own price (never 1 − the other side), the Market Disagreement rule exactly as published, SIFT priority, every
// filter and both sorts — all over the real fixture for the ten games of tests/fixtures/cfb/app/latest.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BoardDoc } from '../src/contract/types';
import {
  captureLine,
  cardHistorical,
  contractPriceView,
  controlPrice,
  decodeSignals,
  FILTERS,
  isDisagreement,
  matchesFilter,
  parseFilter,
  parseSort,
  pastGamesText,
  priceText,
  priorityTier,
  slateGame,
  slateOf,
  sortSlate,
  SignalsSchemaError,
  viewOfAsk,
  type ContractPrice,
  type FilterId,
  type SignalGame,
  type SignalsDoc,
} from '../src/lib/cfbSignals';
import { CFB_SIGNALS_FILE, readCfb } from './helpers';

const raw = () => JSON.parse(readFileSync(CFB_SIGNALS_FILE, 'utf-8')) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const doc = (mut?: (d: Record<string, any>) => void): SignalsDoc => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const d = raw();
  mut?.(d);
  return decodeSignals(d);
};
const board = () => readCfb<BoardDoc>('board.json');
const NOW = Date.parse('2026-10-08T12:00:00Z');

const ISU_BYU = 'evt_1f7f2822f37fb1a8e34e';
const ARIZ_WVU = 'evt_16c15c04ce50a5cb83f5';
const SAC_BGSU = 'evt_f32aa654d1e5ccd474f9';
const STAN_ND = 'evt_7ca164d80f042f650a5c';
const TENN_ARK = 'evt_f121611ae29ec3e9d56e';
const LSU_UK = 'evt_8c3166866b2bfa530c17';
const UGA_ALA = 'evt_93e12676ae9337017c63';
const JVST_KENN = 'evt_e56d7cee653c3507226b';
const NMSU_FIU = 'evt_f39ef6a955b04b97fe84';

function slate(d: SignalsDoc | null = doc()) {
  const s = slateOf(board().items, d, NOW);
  return s.items.map((i) => slateGame(i, d));
}
const ids = (xs: { item: { event_id: string } }[]) => xs.map((x) => x.item.event_id);

/** A Strong CONTROL game with a given contract price, built from the fixture's own Strong game. */
function strongWith(price: ContractPrice | null, d = doc()): SignalGame {
  const g = structuredClone(d.byEvent.get(ARIZ_WVU)!);
  g.market!.price = price;
  return g;
}

describe('the contract', () => {
  it('decodes the fixture: ten games, every signal, the disagreement rule', () => {
    const d = doc();
    expect(d.schema).toBe('cfb_research_signals/1.0.0');
    expect(d.games).toHaveLength(10);
    expect(d.byEvent.get(ISU_BYU)?.title).toBe('Iowa St. at BYU');
    expect(d.signals.moderate_control.status).toBe('VALUE_WATCH');
    expect(d.signals.market_disagreement.rule).toMatchObject({ applies_to: 'STRONG_CONTROL', below_cents: 85 });
    expect(d.research_only).toBe(true);
  });

  it('rejects anything that is not cfb_research_signals/1.x, or lacks a signal or the rule', () => {
    expect(() => decodeSignals(null)).toThrow(SignalsSchemaError);
    expect(() => doc((x) => { x.schema = 'cfb_research_signals/2.0.0'; })).toThrow(SignalsSchemaError);
    expect(() => doc((x) => { delete x.schema; })).toThrow(SignalsSchemaError);
    expect(() => doc((x) => { delete x.games; })).toThrow(SignalsSchemaError);
    expect(() => doc((x) => { delete x.signals.moderate_control; })).toThrow(/moderate_control/);
    expect(() => doc((x) => { delete x.signals.market_disagreement.rule.below_cents; })).toThrow(/below_cents/);
    expect(() => doc((x) => { x.schema = 'cfb_research_signals/1.1.0'; })).not.toThrow();
  });
});

describe('prices', () => {
  it('reads the CONTROL side\'s own executable YES ask, as whole cents', () => {
    const d = doc();
    expect(controlPrice(d.byEvent.get(ISU_BYU))).toMatchObject({ kind: 'EXECUTABLE', cents: 79, source: 'contract' });
    expect(controlPrice(d.byEvent.get(SAC_BGSU))).toMatchObject({ kind: 'EXECUTABLE', cents: 28 });
    expect(priceText('BYU', controlPrice(d.byEvent.get(ISU_BYU)))).toBe('BYU win · 79¢');
  });

  it('PRICE_1_00 is "No offer below $1"; anything else without an executable ask is "Price unavailable"', () => {
    const d = doc();
    const nd = controlPrice(d.byEvent.get(STAN_ND));
    expect(nd.kind).toBe('NO_OFFER');
    expect(priceText('Notre Dame', nd)).toBe('No offer below $1');
    for (const status of ['QUOTE_NOT_EXECUTABLE', 'PRICE_UNAVAILABLE', 'MARKET_NOT_OFFERED', 'ORIENTATION_FAILURE']) {
      expect(priceText('X', contractPriceView({ status, yes_ask: 0.5, captured_at: null, market_ticker: null }))).toBe('Price unavailable');
    }
    expect(priceText('X', contractPriceView(null))).toBe('Price unavailable');
    expect(priceText('X', viewOfAsk(null, null, 'live'))).toBe('Price unavailable');
    expect(priceText('X', viewOfAsk(1, null, 'live'))).toBe('No offer below $1');
  });

  it('never prices a side as 1 − the other: a game without a CONTROL-side market has no price', () => {
    const d = doc();
    const ua = d.byEvent.get(UGA_ALA)!;
    expect(ua.market?.is_control_side).toBe(false); // the contract carries the home side's market, not a CONTROL side
    expect(controlPrice(ua).kind).toBe('UNAVAILABLE');
    const flipped = structuredClone(d.byEvent.get(ISU_BYU)!);
    flipped.market!.is_control_side = false;
    expect(controlPrice(flipped).kind).toBe('UNAVAILABLE');
    // A live quote with only a NO side is not turned into a YES price.
    expect(controlPrice(d.byEvent.get(ISU_BYU), { yesAsk: null, observedAt: '2026-10-08T00:00:00Z' }).kind).toBe('UNAVAILABLE');
  });

  it('a live quote replaces the contract only when it is at least as new as the capture', () => {
    const g = doc().byEvent.get(ISU_BYU)!;
    expect(controlPrice(g, { yesAsk: 0.81, observedAt: '2026-10-08T00:00:00Z' })).toMatchObject({ cents: 81, source: 'live' });
    expect(controlPrice(g, { yesAsk: 0.81, observedAt: '2026-10-07T00:00:00Z' })).toMatchObject({ cents: 79, source: 'contract' });
    expect(controlPrice(g, { yesAsk: 0.81, observedAt: null })).toMatchObject({ cents: 79, source: 'contract' });
  });
});

describe('the Market Disagreement rule', () => {
  const exec = (ask: number) => ({ status: 'EXECUTABLE', yes_ask: ask, captured_at: '2026-10-07T23:19:34Z', market_ticker: 'T' });
  it('Strong CONTROL with an executable CONTROL-side ask below 85¢ is flagged', () => {
    const d = doc();
    for (const id of [ARIZ_WVU, SAC_BGSU]) expect(isDisagreement(d.byEvent.get(id), d, controlPrice(d.byEvent.get(id)))).toBe(true);
    const g = strongWith(exec(0.84));
    expect(isDisagreement(g, d, controlPrice(g))).toBe(true);
  });

  it('Strong CONTROL at or above 85¢ is not', () => {
    const d = doc();
    for (const ask of [0.85, 0.849 + 0.005, 0.91]) {
      const g = strongWith(exec(ask));
      expect(isDisagreement(g, d, controlPrice(g)), String(ask)).toBe(false);
    }
  });

  it('Moderate CONTROL never is, whatever its price', () => {
    const d = doc();
    const g = structuredClone(d.byEvent.get(ISU_BYU)!);
    g.market!.price = exec(0.3);
    expect(isDisagreement(g, d, controlPrice(g))).toBe(false);
  });

  it('no price, no flag: PRICE_1_00, missing, or not executable', () => {
    const d = doc();
    expect(isDisagreement(d.byEvent.get(STAN_ND), d, controlPrice(d.byEvent.get(STAN_ND)))).toBe(false);
    for (const p of [null, { status: 'PRICE_UNAVAILABLE', yes_ask: null, captured_at: null, market_ticker: null }, { status: 'QUOTE_NOT_EXECUTABLE', yes_ask: 0.5, captured_at: null, market_ticker: null }]) {
      const g = strongWith(p);
      expect(isDisagreement(g, d, controlPrice(g))).toBe(false);
    }
    expect(isDisagreement(d.byEvent.get(ARIZ_WVU), null, controlPrice(d.byEvent.get(ARIZ_WVU)))).toBe(false);
  });

  it('a live quote can lift a game out of disagreement (and the threshold comes from the contract)', () => {
    const d = doc();
    const g = d.byEvent.get(ARIZ_WVU)!;
    expect(isDisagreement(g, d, controlPrice(g, { yesAsk: 0.9, observedAt: '2026-10-08T00:00:00Z' }))).toBe(false);
    const d50 = doc((x) => { x.signals.market_disagreement.rule.below_cents = 50; });
    expect(isDisagreement(d50.byEvent.get(ARIZ_WVU), d50, controlPrice(d50.byEvent.get(ARIZ_WVU)))).toBe(false);
    expect(isDisagreement(d50.byEvent.get(SAC_BGSU), d50, controlPrice(d50.byEvent.get(SAC_BGSU)))).toBe(true);
  });
});

describe('the slate', () => {
  it('is the earliest season week with a game still to play (week 6: nine games, not week 7)', () => {
    const s = slateOf(board().items, doc(), NOW);
    expect(s.week).toBe(6);
    expect(s.items.map((i) => i.event_id).sort()).toEqual([ISU_BYU, ARIZ_WVU, SAC_BGSU, STAN_ND, TENN_ARK, LSU_UK, UGA_ALA, JVST_KENN, NMSU_FIU].sort());
  });

  it('without the signals document, the seven days from the first game still to play', () => {
    const s = slateOf(board().items, null, NOW);
    expect(s.week).toBeNull();
    expect(s.items).toHaveLength(9);
  });

  it('SIFT priority: Value Watch, Strong CONTROL, Market Disagreement, close/environment, then no read — kickoff within a tier', () => {
    expect(ids(sortSlate(slate(), 'priority'))).toEqual([ISU_BYU, TENN_ARK, LSU_UK, STAN_ND, ARIZ_WVU, SAC_BGSU, UGA_ALA, JVST_KENN, NMSU_FIU]);
    const tiers = Object.fromEntries(slate().map((x) => [x.item.event_id, x.tier]));
    expect(tiers).toMatchObject({ [ISU_BYU]: 1, [TENN_ARK]: 1, [LSU_UK]: 1, [STAN_ND]: 2, [ARIZ_WVU]: 3, [SAC_BGSU]: 3, [UGA_ALA]: 5, [JVST_KENN]: 7, [NMSU_FIU]: 7 });
  });

  it('time sort is kickoff order', () => {
    expect(ids(sortSlate(slate(), 'time'))).toEqual([JVST_KENN, NMSU_FIU, ISU_BYU, ARIZ_WVU, SAC_BGSU, STAN_ND, TENN_ARK, LSU_UK, UGA_ALA]);
  });

  it('when Moderate CONTROL stops being a Value Watch, those games drop to the other-CONTROL tier and the filter is empty', () => {
    const d = doc((x) => { x.signals.moderate_control.status = 'NO_EDGE'; });
    const xs = slate(d);
    expect(xs.find((x) => x.item.event_id === ISU_BYU)?.tier).toBe(4);
    expect(xs.filter((x) => matchesFilter(x, 'value-watch'))).toHaveLength(0);
    expect(xs.filter((x) => matchesFilter(x, 'moderate'))).toHaveLength(3);
  });

  it('a game with two environment claims and no closeness sits in tier 5; a single claim in tier 6', () => {
    const d = doc();
    const g = structuredClone(d.byEvent.get(UGA_ALA)!);
    g.claims!.closeness = false;
    expect(priorityTier(g, d, false)).toBe(5); // slow pace + elevated scoring
    g.claims!.scoring = null;
    expect(priorityTier(g, d, false)).toBe(6);
    expect(priorityTier(null, d, false)).toBe(7);
  });

  it('every filter selects exactly its games', () => {
    const want: Record<FilterId, string[]> = {
      all: [ISU_BYU, ARIZ_WVU, SAC_BGSU, STAN_ND, TENN_ARK, LSU_UK, UGA_ALA, JVST_KENN, NMSU_FIU],
      'value-watch': [ISU_BYU, TENN_ARK, LSU_UK],
      moderate: [ISU_BYU, TENN_ARK, LSU_UK],
      strong: [ARIZ_WVU, SAC_BGSU, STAN_ND],
      close: [UGA_ALA],
      fast: [ARIZ_WVU, LSU_UK],
      defensive: [],
      disagreement: [ARIZ_WVU, SAC_BGSU],
      environment: [ISU_BYU, ARIZ_WVU, SAC_BGSU, LSU_UK, UGA_ALA],
    };
    const xs = slate();
    for (const f of FILTERS) expect(ids(xs.filter((x) => matchesFilter(x, f))).sort(), f).toEqual([...want[f]].sort());
  });

  it('DEFENSIVE covers defensive suppression and suppressed scoring', () => {
    const d = doc((x) => {
      const ua = x.games.find((g: { event_id: string }) => g.event_id === UGA_ALA);
      ua.claims.scoring = { level: 'SUPPRESSED', incremental: false };
      const nd = x.games.find((g: { event_id: string }) => g.event_id === STAN_ND);
      nd.claims.defensive_suppression = true;
    });
    expect(ids(slate(d).filter((x) => matchesFilter(x, 'defensive'))).sort()).toEqual([STAN_ND, UGA_ALA].sort());
  });

  it('reads filter and sort from the URL, defaulting to everything by SIFT priority', () => {
    expect(parseFilter('value-watch')).toBe('value-watch');
    expect(parseFilter('nonsense')).toBe('all');
    expect(parseFilter(null)).toBe('all');
    expect(parseSort('time')).toBe('time');
    expect(parseSort(null)).toBe('priority');
  });
});

describe('words', () => {
  it('the card historical stat is a signed margin range of past games; wins are counts, never a percentage', () => {
    const d = doc();
    expect(cardHistorical(d.byEvent.get(STAN_ND)?.historical)).toBe('Historical margin: +8 to +35 (middle half)');
    expect(cardHistorical(d.byEvent.get(LSU_UK)?.historical)).toBe('Historical margin: −4 to +18 (middle half)');
    expect(pastGamesText(d.byEvent.get(STAN_ND)!.historical!)).toBe('566 of 628 past games');
    expect(cardHistorical(null)).toBeNull();
  });

  it('capture health: games awaiting their window until one closes, then primary-window coverage', () => {
    expect(captureLine(doc())).toEqual({ title: 'Capture health', value: '4 games awaiting their 3-hour pre-kickoff window' });
    const closed = doc((x) => Object.assign(x.capture_health, { windows_closed: 3, valid_primary_captures: 5, orientation_failures: 1, system_failures: 0 }));
    expect(captureLine(closed)!.value).toBe('Primary-window prices: 5/6 eligible games');
  });
});
