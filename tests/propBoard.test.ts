// The NFL prop board: every player prop of a game grouped by family, each with the simulation's read against the
// main line, the fee-aware price of both sides, the shadow model next to the market with its own support word,
// risks from publication facts only, and the ladder as alternatives. Nothing is a pick: no bet-up-to, no fair
// price presented as a limit, sidelined players hidden and named.
import { describe, expect, it } from 'vitest';
import type { EventDetailDoc, EventResearchDoc } from '../src/contract/types';
import { filterBoard, propBoard, propScorecardSentence, PROP_FAMILY_ORDER } from '../src/insights/propBoard';
import { readSnapshot } from './helpers';

const ATL_NO = 'evt_639f74e87ff25310c542';
const NE_BUF = 'evt_0cb333291f580a201a70';
const ev = (id: string) => readSnapshot<EventResearchDoc>(`explorer/events/${id}.json`);
const det = (id: string) => readSnapshot<EventDetailDoc>(`event_detail/${id}.json`);

describe('the prop board', () => {
  const board = propBoard(ev(ATL_NO), det(ATL_NO));

  it('covers every family with the game’s real ladders and counts them', () => {
    expect(board.rows.length).toBeGreaterThan(30);
    for (const f of ['passing', 'rushing', 'receiving', 'touchdowns'] as const) expect(board.byFamily[f]).toBeGreaterThan(0);
    expect(PROP_FAMILY_ORDER.reduce((a, f) => a + board.byFamily[f], 0)).toBe(board.rows.length);
    // One row per player and stat, never a duplicate.
    expect(new Set(board.rows.map((r) => r.id)).size).toBe(board.rows.length);
  });

  it('reads a rushing line honestly: projection, range, main line, both asks and their fee-aware break-evens', () => {
    const bijan = board.rows.find((r) => r.name === 'Bijan Robinson' && r.def.stat === 'rushing_yards')!;
    expect(bijan.family).toBe('rushing');
    expect(bijan.line).toBe(89.5);
    expect(bijan.range?.typical).toEqual([55, 121]);
    expect(bijan.ladder.length).toBeGreaterThan(5);
    expect(bijan.ladder.map((x) => x.threshold)).toEqual([...bijan.ladder.map((x) => x.threshold)].sort((a, b) => a - b));
    expect(bijan.main?.yesAsk).not.toBeNull();
    expect(bijan.price?.overBreakEven).toBeGreaterThan(bijan.price!.overAsk!);
    expect(bijan.price?.underBreakEven).toBeGreaterThan(bijan.price!.underAsk!);
    expect(['ABOVE', 'BELOW', 'ON']).toContain(bijan.read);
    expect(bijan.matchup?.label).toBe('Saints run defense');
    expect(bijan.marketTitle).toBe('Bijan Robinson over 89.5 rushing yards');
    // No bet-up-to and no fair price exist on a prop row: the type has no such field and the shadow model is labelled.
    expect(bijan.main?.modelState == null || typeof bijan.main.modelState === 'string').toBe(true);
    if (bijan.main?.modelP != null) expect(bijan.main.modelState).toBe('PROJECTABLE_NOT_YET_VALIDATED');
  });

  it('keeps the shadow model research-only: every priced rung carries the publication’s own support word', () => {
    const priced = board.rows.flatMap((r) => r.ladder).filter((x) => x.modelP != null);
    expect(priced.length).toBeGreaterThan(20);
    expect(new Set(priced.map((x) => x.modelState))).toEqual(new Set(['PROJECTABLE_NOT_YET_VALIDATED']));
  });

  it('touchdown props read on expected touchdowns and say they are high variance', () => {
    const td = board.rows.filter((r) => r.family === 'touchdowns' && r.main);
    expect(td.length).toBeGreaterThan(5);
    for (const r of td) {
      expect(r.projection).not.toBeNull();
      expect(r.risks.some((x) => /high variance/.test(x))).toBe(true);
    }
  });

  it('quarterbacks get passing lines and skill players do not; a quarterback’s rushing line is still read', () => {
    const qb = board.rows.filter((r) => r.role === 'QB');
    expect(qb.some((r) => r.family === 'passing')).toBe(true);
    expect(qb.some((r) => r.def.stat === 'rushing_yards')).toBe(true);
    expect(board.rows.filter((r) => r.role === 'WR' && r.family === 'passing')).toHaveLength(0);
  });

  it('active and probable designations are not risks; real designations are', () => {
    for (const r of board.rows) {
      expect(r.injury).not.toBe('ACTIVE');
      if (r.injury) expect(r.risks.some((x) => /listed/.test(x))).toBe(true);
    }
  });

  it('filters by family, team and priced lines, and the sort is most readable first', () => {
    const rushing = filterBoard(board.rows, { family: 'rushing', team: 'ATL', pricedOnly: true });
    expect(rushing.length).toBeGreaterThan(0);
    for (const r of rushing) { expect(r.family).toBe('rushing'); expect(r.team.abbr).toBe('ATL'); expect(r.main).not.toBeNull(); }
    const all = filterBoard(board.rows, { pricedOnly: false });
    expect(all.length).toBeGreaterThanOrEqual(filterBoard(board.rows, { pricedOnly: true }).length);
    for (let i = 1; i < board.rows.length; i++) expect(board.rows[i - 1].interest).toBeGreaterThanOrEqual(board.rows[i].interest);
  });

  it('another game: a quarterback’s attempts ladder carries market and model probabilities for every rung', () => {
    const b = propBoard(ev(NE_BUF), det(NE_BUF));
    const allen = b.rows.find((r) => r.name === 'Josh Allen' && r.def.stat === 'attempts')!;
    expect(allen.ladder.map((x) => x.threshold)).toEqual([25, 30, 35]);
    expect(allen.ladder.every((x) => x.marketP != null && x.modelP != null)).toBe(true);
    expect(allen.main?.threshold).toBe(30);
  });
});

describe('the confidence sentence', () => {
  it('quotes the publication’s own player-prop scorecard and never promotes it', () => {
    const s = propScorecardSentence([{ family: 'PLAYER_STAT', model: 0.166569, market: 0.145993, leader: 'market', nModel: 15832 }]);
    expect(s).toMatch(/Research only/);
    expect(s).toMatch(/market.*0\.146.*beat.*model.*0\.167/);
    expect(s).toMatch(/15,832/);
    expect(propScorecardSentence(null)).toMatch(/research-only/);
    expect(propScorecardSentence([{ family: 'PLAYER_STAT', model: 0.1, market: 0.2, leader: 'model', nModel: null }])).toMatch(/not a validated edge/);
  });
});
