// Opportunity lifecycle: the clock and the event's own timing decide whether a pregame opportunity can still be acted
// on; a publisher's stale status word never keeps one alive. Covers before / at / after kickoff, finals, postponements,
// cancellations, suspensions, frozen historical research, stale statuses, missing start times and closed markets,
// across the real soccer, tennis, NHL and MLB fixtures and synthetic board items.
import { describe, expect, it } from 'vitest';
import type { BoardDoc, BoardItem, ItemsDoc, Recommendation, Thesis } from '../src/contract/types';
import { eventPhase, isFrozen, isPregame } from '../src/opportunity/lifecycle';
import { evaluate } from '../src/opportunity/load';
import { featureOpportunities, isLive } from '../src/opportunity/rank';
import { mlbOpportunities, nhlOpportunities, soccerOpportunities, tennisOpportunities } from '../src/opportunity/sources';
import { sportByCode } from '../src/data/sports';
import { readMlb, readNhl, readSoccer, readTennis } from './helpers';

const T0 = Date.parse('2026-10-10T19:00:00Z');
const item = (over: Partial<BoardItem> = {}): BoardItem => ({
  event_id: 'evt_x', league: 'L', competition: 'C', status: 'SCHEDULED', start_time_utc: '2026-10-10T19:00:00Z', home_participant: 'h', away_participant: 'a',
  participants: [{ participant_id: 'h', display_name: 'Home', short_name: 'HOM', participant_type: 'TEAM' }, { participant_id: 'a', display_name: 'Away', short_name: 'AWY', participant_type: 'TEAM' }],
  data_freshness: 'FRESH', health_flags: [], detail_path: '', market_captured_at: null, model_generated_at: null, markets_available: 1, markets_priced: 1, recommendations_count: 1, wagers_count: 0, ...over,
});

describe('eventPhase', () => {
  it('is PREGAME before kickoff and STARTED exactly at and after it, whatever the publisher still says', () => {
    expect(eventPhase(item(), T0 - 1).phase).toBe('PREGAME');
    expect(eventPhase(item(), T0).phase).toBe('STARTED');
    expect(eventPhase(item(), T0 + 3600_000).phase).toBe('STARTED');
    // The publisher stopped refreshing: still SCHEDULED four hours in. The clock wins and the staleness is named.
    const stale = eventPhase(item(), T0 + 4 * 3600_000);
    expect(stale.phase).toBe('STARTED');
    expect(stale.staleStatus).toBe(true);
    expect(stale.reason).toMatch(/still says scheduled/);
  });
  it('trusts a LIVE word, a FINAL word, and the delayed effective start', () => {
    expect(eventPhase(item({ status: 'LIVE' }), T0 - 600_000)).toMatchObject({ phase: 'STARTED', staleStatus: true });
    expect(eventPhase(item({ status: 'LIVE' }), T0 + 600_000)).toMatchObject({ phase: 'STARTED', staleStatus: false });
    expect(eventPhase(item({ status: 'FINAL' }), T0 + 4 * 3600_000).phase).toBe('FINAL');
    expect(eventPhase(item({ status: 'FINAL' }), T0 - 3600_000).phase).toBe('FINAL');
    expect(eventPhase({ status: 'SCHEDULED', start_time_utc: '2026-10-10T19:00:00Z', effective_start_time_utc: '2026-10-10T20:30:00Z' }, T0 + 3600_000).phase).toBe('PREGAME');
  });
  it('postponed, cancelled and suspended games are never pregame; a missing or invalid start is NO_START', () => {
    expect(eventPhase(item({ status: 'POSTPONED' }), T0 - 3600_000).phase).toBe('POSTPONED');
    expect(eventPhase(item({ status: 'CANCELED' }), T0 - 3600_000).phase).toBe('CANCELLED');
    expect(eventPhase(item({ status: 'Cancelled' }), T0 - 3600_000).phase).toBe('CANCELLED');
    expect(eventPhase(item({ status: 'SUSPENDED' }), T0 + 3600_000).phase).toBe('SUSPENDED');
    expect(eventPhase(item({ start_time_utc: '' }), T0).phase).toBe('NO_START');
    expect(eventPhase(item({ start_time_utc: 'not a date' }), T0).phase).toBe('NO_START');
    expect(eventPhase(item({ start_time_utc: 'not a date', status: 'LIVE' }), T0).phase).toBe('STARTED');
    for (const p of ['POSTPONED', 'CANCELLED', 'SUSPENDED', 'NO_START', 'STARTED', 'FINAL'] as const) expect(isPregame(p)).toBe(false);
    expect(isFrozen('STARTED') && isFrozen('FINAL') && !isFrozen('PREGAME')).toBe(true);
  });
  it('a verified-upcoming start keeps a nominal time that has passed pregame for six hours, not forever', () => {
    const r = eventPhase(item(), T0 + 3600_000, { verifiedUpcoming: true });
    expect(r.phase).toBe('PREGAME');
    expect(r.staleStatus).toBe(true);
    expect(eventPhase(item(), T0 + 7 * 3600_000, { verifiedUpcoming: true }).phase).toBe('STARTED');
  });
  it('refuses a zero or invalid clock instead of silently treating every game as pregame', () => {
    expect(() => eventPhase(item(), 0)).toThrow(/now must be the current time/);
    expect(() => eventPhase(item(), Number.NaN)).toThrow();
  });
});

const soccer = () => ({ sport: { code: 'SOCCER' as const, slug: 'soccer', label: 'Soccer' }, board: readSoccer<BoardDoc>('board.json').items, recommendations: readSoccer<ItemsDoc<Recommendation>>('recommendations.json').items as never, theses: readSoccer<ItemsDoc<Thesis>>('theses.json').items });
const ARS = 'KXEPLGAME-26OCT10ARSLEE-ARS';
const ARS_KICKOFF = Date.parse('2026-10-10T11:30:00Z');

describe('soccer candidates through the lifecycle', () => {
  it('before kickoff and inside the validity window: a research candidate; at kickoff: PASS, frozen for review', () => {
    const before = soccerOpportunities({ ...soccer(), now: Date.parse('2026-10-09T06:10:00Z') }).find((o) => o.ticker === ARS)!;
    expect(before.status).toBe('RESEARCH_CANDIDATE');
    expect(before.phase).toBe('PREGAME');
    const at = soccerOpportunities({ ...soccer(), now: ARS_KICKOFF }).find((o) => o.ticker === ARS)!;
    expect(at.status).toBe('PASS');
    expect(at.phase).toBe('STARTED');
    const after = soccerOpportunities({ ...soccer(), now: ARS_KICKOFF + 50 * 60_000 }).find((o) => o.ticker === ARS)!;
    expect(after.status).toBe('PASS');
    // The frozen row keeps its research (price, fair, evidence) for review; it is just never featured.
    expect(after.price.ask).toBeCloseTo(0.29, 6);
    expect(after.evidence.length).toBeGreaterThan(0);
    expect(featureOpportunities(soccerOpportunities({ ...soccer(), now: ARS_KICKOFF + 50 * 60_000 }).filter(isLive)).some((f) => f.lead.ticker === ARS)).toBe(false);
  });
  it('a stale SCHEDULED board past kickoff is frozen by the clock, with the staleness in the reason', () => {
    const late = soccerOpportunities({ ...soccer(), now: Date.parse('2026-10-11T12:00:00Z') });
    expect(late.length).toBeGreaterThan(0);
    expect(late.every((o) => o.status === 'PASS')).toBe(true);
    expect(late.find((o) => o.ticker === ARS)!.statusReason).toMatch(/start time has passed.*still says scheduled/);
  });
  it('postponed and cancelled fixtures pass with the publisher’s word; a missing start time downgrades to research only', () => {
    const base = soccer();
    const flip = (status: string, start?: string) => ({ ...base, board: base.board.map((i) => (i.event_id === 'evt_0a69396895a311cb26b2' ? { ...i, status, ...(start !== undefined ? { start_time_utc: start } : {}) } : i)) });
    const now = Date.parse('2026-10-09T06:10:00Z');
    expect(soccerOpportunities({ ...flip('POSTPONED'), now }).find((o) => o.ticker === ARS)!).toMatchObject({ status: 'PASS', phase: 'POSTPONED' });
    expect(soccerOpportunities({ ...flip('CANCELLED'), now }).find((o) => o.ticker === ARS)!).toMatchObject({ status: 'PASS', phase: 'CANCELLED' });
    const noStart = soccerOpportunities({ ...flip('SCHEDULED', ''), now }).find((o) => o.ticker === ARS)!;
    expect(noStart.phase).toBe('NO_START');
    expect(noStart.status).toBe('RESEARCH_CANDIDATE');
    expect(noStart.statusReason).toMatch(/No usable start time/);
    // An ACTIONABLE row on a game with no start time can only be research: Sift cannot verify it has not started.
    const actionable = { ...flip('SCHEDULED', ''), recommendations: (base.recommendations as Recommendation[]).map((r) => ({ ...r, research_only: false, authority: 'ACTIONABLE', extensions: { ...(r as { extensions?: Record<string, unknown> }).extensions, action: 'ACTIONABLE' } })) as never };
    const a = soccerOpportunities({ ...actionable, now: Date.parse('2026-10-09T06:10:00Z') }).find((o) => o.ticker === ARS)!;
    expect(a.status).toBe('RESEARCH_CANDIDATE');
    expect(a.statusReason).toMatch(/cannot verify the game has not started/);
  });
});

describe('the other sports', () => {
  it('tennis: a verified-upcoming match stays a candidate after its nominal time; an unverified one freezes', () => {
    const inputs = { sport: { code: 'TENNIS' as const, slug: 'tennis', label: 'Tennis' }, board: readTennis<BoardDoc>('board.json').items, recommendations: readTennis<ItemsDoc<Recommendation>>('recommendations.json').items as never };
    // Khachanov v Fery is listed 07:00Z with every row VERIFIED_UPCOMING: an hour past the nominal time it is still a
    // candidate; thirteen hours past it is frozen whatever the publication's word, because the grace is six hours.
    const kha = (now: number) => tennisOpportunities({ ...inputs, now }).filter((o) => o.eventId === 'evt_626bc16043b56b7b1921');
    expect(kha(Date.parse('2026-10-09T08:00:00Z')).length).toBeGreaterThan(0);
    for (const o of kha(Date.parse('2026-10-09T08:00:00Z'))) expect(o.status).toBe('RESEARCH_CANDIDATE');
    for (const o of kha(Date.parse('2026-10-09T20:00:00Z'))) expect(o).toMatchObject({ status: 'PASS', phase: 'STARTED' });
    // Without the verification word the nominal time alone decides.
    const unverified = { ...inputs, recommendations: (inputs.recommendations as Recommendation[]).map((r) => ({ ...r, extensions: { ...(r as { extensions?: Record<string, unknown> }).extensions, start_status: 'START_UNKNOWN' } })) as never };
    for (const o of tennisOpportunities({ ...unverified, now: Date.parse('2026-10-09T08:00:00Z') }).filter((o) => o.eventId === 'evt_626bc16043b56b7b1921')) expect(o.status).toBe('PASS');
  });
  it('NHL: candidates are live before the first puck drop and every row of a started game is PASS; expiry still applies', () => {
    const inputs = { sport: { code: 'NHL' as const, slug: 'nhl', label: 'NHL' }, board: readNhl<BoardDoc>('board.json').items, recommendations: readNhl<ItemsDoc<Recommendation>>('recommendations.json').items as never };
    const early = nhlOpportunities({ ...inputs, now: Date.parse('2026-10-06T22:50:00Z') });
    expect(early.some(isLive)).toBe(true);
    const mid = nhlOpportunities({ ...inputs, now: Date.parse('2026-10-07T00:30:00Z') });
    for (const o of mid.filter((o) => o.eventId === 'evt_c4a2cf978d0824a1493a')) expect(o.status).toBe('PASS');
    const after = nhlOpportunities({ ...inputs, now: Date.parse('2026-10-07T06:00:00Z') });
    expect(after.every((o) => o.status === 'PASS')).toBe(true);
  });
  it('MLB: the stale-LIVE game of 2026-10-08 is frozen; a ledger PASS stays a PASS; the one candidate dies at first pitch', () => {
    const inputs = { sport: { code: 'MLB' as const, slug: 'mlb', label: 'MLB' }, board: readMlb<BoardDoc>('board.json').items, recommendations: readMlb<ItemsDoc<Recommendation>>('recommendations.json').items as never };
    const pre = mlbOpportunities({ ...inputs, now: Date.parse('2026-10-07T18:00:00Z') });
    expect(pre.filter(isLive)).toHaveLength(1);
    const cand = pre.find(isLive)!;
    const stale = { ...inputs, board: inputs.board.map((i) => (i.event_id === cand.eventId ? { ...i, status: 'LIVE' } : i)) };
    const nextDay = mlbOpportunities({ ...stale, now: Date.parse('2026-10-09T08:00:00Z') });
    expect(nextDay.every((o) => o.status === 'PASS')).toBe(true);
    expect(nextDay.find((o) => o.id === cand.id)!.phase).toBe('STARTED');
  });
  it('a sport verdict counts games by phase and names a board whose every start has passed', () => {
    const b = { sport: sportByCode('SOCCER')!, board: readSoccer<BoardDoc>('board.json').items, recommendations: readSoccer<ItemsDoc<Recommendation>>('recommendations.json').items, theses: readSoccer<ItemsDoc<Thesis>>('theses.json').items, signals: null, modelState: 'RESEARCH_ONLY', error: null };
    const v = evaluate(b, Date.parse('2026-10-11T12:00:00Z')).verdict;
    expect(v.opportunities).toBe(0);
    expect(v.passReason).toMatch(/passed its published start/);
    expect(evaluate(b, Date.parse('2026-10-09T06:10:00Z')).verdict.opportunities).toBeGreaterThan(0);
  });
  it('a closed market: an expired validity window is PASS even before kickoff', () => {
    const opps = soccerOpportunities({ ...soccer(), now: Date.parse('2026-10-09T07:00:00Z') });
    expect(opps.every((o) => o.status === 'PASS' && o.phase === 'PREGAME')).toBe(true);
    expect(opps[0].statusReason).toMatch(/validity window/);
  });
});
