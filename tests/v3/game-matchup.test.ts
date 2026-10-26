// Game matchup against REAL published documents (trimmed copies in tests/v3/fixtures, captured 2026-10-26, DAL at PHI week 7).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { EntityProfileDoc, EventDetailDoc, EventResearchDoc } from '../../src/contract/types';
import { deriveProps } from '../../src/v3/data/adapt';
import { scheduledStart, teamTotalFor, weekOf, winContracts } from '../../src/v3/data/research/gameMarkets';
import { keyMatchups, NFL_PROP_UNITS, playersToResearch, type RosterPlayer } from '../../src/v3/data/research/keyMatchups';
import { buildLens, EVEN_BAND, fmtRawValue, fmtUnitValue, gapOf, NFL_UNITS, roundGap, sideOf, tiltCounts, tiltOf, unitRows } from '../../src/v3/data/research/matchup';
import { normalizeTeamProfile } from '../../src/v3/data/research/normalize';
import type { ScheduleEvent } from '../../src/v3/data/research/types';

const load = <T,>(f: string) => JSON.parse(readFileSync(`tests/v3/fixtures/${f}`, 'utf8')) as T;
const dal = normalizeTeamProfile(load<EntityProfileDoc>('nfl-team-dal-units.json'), 'nfl');
const phi = normalizeTeamProfile(load<EntityProfileDoc>('nfl-team-phi-units.json'), 'nfl');
const detail = load<EventDetailDoc>('nfl-event-dal-phi-detail.json');
const research = load<EventResearchDoc>('nfl-event-dal-phi-research.json');

describe('the tilt rule (design system: |gap| <= 15 as displayed is Even)', () => {
  it('a gap of exactly 15 is Even; 16 has a direction; the sign picks the role', () => {
    expect(tiltOf(15)).toBe('even');
    expect(tiltOf(-15)).toBe('even');
    expect(tiltOf(16)).toBe('off');
    expect(tiltOf(-16)).toBe('def');
    expect(tiltOf(0)).toBe('even');
    expect(EVEN_BAND).toBe(15);
  });
  it('compares the gap AS DISPLAYED (each percentile rounded to a whole point, then subtracted): 15 is Even, 16 is not', () => {
    expect(gapOf(14.81, 0)).toBe(15);
    expect(gapOf(22.2222, 66.6667)).toBe(-45); // DAL explosive 22nd vs PHI 10th of 28: the locked design shows 45
    expect(tiltOf(gapOf(14.81, 0))).toBe('even');
    expect(tiltOf(gapOf(15.4, 0))).toBe('even');
    expect(gapOf(15.5, 0)).toBe(16);
    expect(tiltOf(gapOf(15.5, 0))).toBe('off');
    expect(tiltOf(gapOf(0, 15.5))).toBe('def');
    expect(roundGap(-14.5)).toBe(-15);
    expect(roundGap(15.0000001)).toBe(15);
    expect(roundGap(14.49)).toBe(14);
  });
});

describe('unit rows from the two real profiles', () => {
  const phiOff = unitRows(NFL_UNITS, 'PHI', 'DAL', phi, dal);
  const dalOff = unitRows(NFL_UNITS, 'DAL', 'PHI', dal, phi);
  const by = (rows: typeof phiOff, id: string) => rows.find((r) => r.unit.id === id)!;
  it('has every unit for both directions, with the published rank and universe', () => {
    expect(phiOff).toHaveLength(7);
    expect(dalOff).toHaveLength(7);
    const o = by(phiOff, 'pass').o;
    expect(o).toMatchObject({ rank: 20, n: 28 });
  });
  it('uses the design formula for the percentile, not the publication field (rank 28 of 28 is 0, not 3.57)', () => {
    expect(sideOf(dal, 'adj_def_db_epa')!.pct).toBe(0);
    expect(sideOf(dal, 'adj_off_db_epa')!.pct).toBeCloseTo((21 / 27) * 100, 6);
  });
  it('reproduces the locked design numbers for PHI offense against DAL defense', () => {
    expect(by(phiOff, 'epa')).toMatchObject({ gap: 15, tilt: 'even', favours: null });
    expect(by(phiOff, 'pass')).toMatchObject({ gap: 30, tilt: 'off', favours: 'PHI' });
    expect(by(phiOff, 'rush')).toMatchObject({ gap: 26, tilt: 'off' });
    expect(by(phiOff, 'to')).toMatchObject({ gap: 93, tilt: 'off' });
  });
  it('reproduces the locked design numbers for DAL offense against PHI defense', () => {
    expect(by(dalOff, 'rush')).toMatchObject({ gap: 48, tilt: 'off', favours: 'DAL' });
    expect(by(dalOff, 'xp')).toMatchObject({ gap: -45, tilt: 'def', favours: 'PHI' });
    expect(by(dalOff, 'pass')).toMatchObject({ gap: 11, tilt: 'even' });
  });
  it('summary counts use the same rule and add up to the units shown', () => {
    const a = tiltCounts(dalOff), b = tiltCounts(phiOff);
    expect(a).toEqual({ off: 5, even: 1, def: 1, total: 7 });
    expect(b).toEqual({ off: 5, even: 2, def: 0, total: 7 });
    for (const c of [a, b]) expect(c.off + c.even + c.def).toBe(c.total);
  });
  it('a unit with no published rank is not a row (and the counts follow the rows)', () => {
    const thin = normalizeTeamProfile({ ...load<EntityProfileDoc>('nfl-team-phi-units.json'), metrics: load<EntityProfileDoc>('nfl-team-phi-units.json').metrics.filter((m) => m.metric_id !== 'met_nfl.adj_off_to_rate') }, 'nfl');
    const rows = unitRows(NFL_UNITS, 'PHI', 'DAL', thin, dal);
    expect(rows).toHaveLength(6);
    expect(tiltCounts(rows).total).toBe(6);
  });
  it('prints values the way the rows do', () => {
    expect(fmtUnitValue(NFL_UNITS[0], -0.05462)).toBe('−0.055');
    expect(fmtUnitValue(NFL_UNITS[1], 0.17862)).toBe('+0.179');
    expect(fmtUnitValue(NFL_UNITS[4], -0.01319)).toBe('−1.3 pts');
    expect(fmtUnitValue(NFL_UNITS[0], null)).toBe('—');
    expect(fmtRawValue(NFL_UNITS[4], 0.0912)).toBe('9.1%');
  });
});

describe('the SIFT Lens states observed ranks only', () => {
  const lens = buildLens(unitRows(NFL_UNITS, 'DAL', 'PHI', dal, phi), unitRows(NFL_UNITS, 'PHI', 'DAL', phi, dal));
  it('matches the locked design text from the real ranks', () => {
    expect(lens.observation!.text).toBe('PHI’s offense vs DAL’s defense in ball security vs takeaways; DAL is 28th of 28 in takeaway rate.');
    expect(lens.counter!.text).toBe('DAL’s best matchup is pass protection vs pass rush (2nd against 19th).');
    expect(lens.evidence.map((e) => `${e.team} ${e.side} ${Math.abs(e.row.gap)}`)).toEqual(['PHI off 93', 'DAL off 63', 'DAL off 48']);
    expect(lens.evidence[0].detail).toBe('PHI 3rd in turnover rate · DAL 28th of 28 in takeaway rate');
  });
  it('says so when nothing separates beyond Even, instead of inventing a direction', () => {
    const even = unitRows(NFL_UNITS, 'DAL', 'PHI', dal, dal);
    const l = buildLens(even.map((r) => ({ ...r, gap: 3, tilt: 'even' as const, favours: null })), []);
    expect(l.observation).toBeNull();
    expect(l.allEven).toBe(true);
    expect(l.evidence).toEqual([]);
  });
  it('contains no price, probability or pick', () => {
    const text = [lens.observation!.text, lens.counter!.text, ...lens.evidence.map((e) => `${e.phrase} ${e.detail}`)].join(' ');
    expect(text).not.toMatch(/¢|%|probab|edge|value|bet |pick|predict/i);
  });
});

describe('markets and schedule', () => {
  const awayId = detail.event.away_participant, homeId = detail.event.home_participant;
  it('finds both win contracts from the published game_winner rows', () => {
    const w = winContracts(detail.markets, awayId, homeId);
    expect(w.map((x) => x.team)).toEqual(['away', 'home']);
    expect(w[0].ticker).toBe('KXNFLGAME-26OCT26DALPHI-DAL');
    expect(w[0].price.ask).toBe(68);
    expect(w[1].price.ask).toBe(34);
  });
  it('picks the team total nearest to even money and prints its half-point line', () => {
    const t = teamTotalFor(detail.markets, awayId)!;
    expect(t.ticker).toMatch(/^KXNFLTEAMTOTAL-26OCT26DALPHI-DAL/);
    expect(t.line % 1).toBe(0.5);
    expect(teamTotalFor(detail.markets, null)).toBeNull();
  });
  it('takes the start from the schedule authority (same event id), never from a contract', () => {
    const sched: ScheduleEvent[] = [{ eventId: 'evt_cd335cc6d5f5b8d8f7b3', startUtc: '2026-10-27T00:15:00Z', status: 'SCHEDULED', homeCode: 'PHI', awayCode: 'DAL', homeId, awayId }];
    expect(scheduledStart(sched, { eventId: 'evt_cd335cc6d5f5b8d8f7b3', away: 'DAL', home: 'PHI', startMs: 0 })).toBe(Date.parse('2026-10-27T00:15:00Z'));
    // a rematch weeks away is a different game
    expect(scheduledStart(sched, { eventId: 'other', away: 'DAL', home: 'PHI', startMs: Date.parse('2026-12-20T00:00:00Z') })).toBeNull();
    expect(scheduledStart(sched, { eventId: 'other', away: 'DAL', home: 'PHI', startMs: Date.parse('2026-10-26T20:00:00Z') })).toBe(Date.parse('2026-10-27T00:15:00Z'));
    expect(scheduledStart([], { eventId: 'x', away: 'A', home: 'B', startMs: 1 })).toBeNull();
  });
  it('reads the week from the competition label', () => {
    expect(weekOf('2026 REG week 7')).toBe('Week 7');
    expect(weekOf(null)).toBeNull();
  });
});

describe('key matchups and players to research', () => {
  const props = deriveProps(detail.markets);
  const codeOf = new Map(research.participants.map((p) => [p.participant_id, p.home_away === 'AWAY' ? 'DAL' : 'PHI']));
  const roster: RosterPlayer[] = research.players.flatMap((p) => (p.team_id && codeOf.get(p.team_id) ? [{ id: p.participant_id, name: p.display_name, role: p.role ?? null, team: codeOf.get(p.team_id)! }] : []));
  const key = keyMatchups({
    props, roster, units: NFL_UNITS, statUnits: NFL_PROP_UNITS, max: 3,
    defSide: (team, u) => sideOf(team === 'DAL' ? dal : phi, u.def),
    opponent: (t) => (t === 'DAL' ? 'PHI' : t === 'PHI' ? 'DAL' : null),
  });
  it('names a player, his opposing unit and its published rank, for both teams', () => {
    expect(key.length).toBeGreaterThan(0);
    expect(new Set(key.map((k) => k.team)).size).toBe(2);
    for (const k of key) {
      expect(k.oppTeam).not.toBe(k.team);
      expect(k.oppSide.n).toBe(28);
      expect(k.price.ticker).toMatch(/^KXNFL/);
      expect(k.label).toMatch(/\d+\+$/);
    }
  });
  it('labels a listed line by the rung a buyer needs ("Rec 7+" for a 6.5 line)', () => {
    const all = keyMatchups({ props, roster, units: NFL_UNITS, statUnits: NFL_PROP_UNITS, max: 99, defSide: (team, u) => sideOf(team === 'DAL' ? dal : phi, u.def), opponent: (t) => (t === 'DAL' ? 'PHI' : 'DAL') });
    const lamb = all.find((k) => k.name === 'CeeDee Lamb')!;
    expect(lamb).toMatchObject({ team: 'DAL', oppTeam: 'PHI', stat: 'receptions', label: 'Rec 7+', phrase: 'receptions 7+' });
    expect(lamb.oppSide.rank).toBe(10);
  });
  it('a player whose stat meets no unit, or whose team is unknown, is not a key matchup', () => {
    expect(keyMatchups({ props, roster: [], units: NFL_UNITS, statUnits: NFL_PROP_UNITS, defSide: () => null, opponent: () => null })).toEqual([]);
    expect(keyMatchups({ props, roster, units: NFL_UNITS, statUnits: NFL_PROP_UNITS, defSide: () => null, opponent: (t) => t })).toEqual([]);
  });
  it('players to research need no profile and stay within the unit-mapped stats for a sport with units', () => {
    const p = playersToResearch({ props, roster, statUnits: NFL_PROP_UNITS, max: 3 });
    expect(p).toHaveLength(3);
    expect(p.every((x) => NFL_PROP_UNITS[x.stat])).toBe(true);
  });
});
