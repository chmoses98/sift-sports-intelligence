// CFB matchup identity: every school is shown by the name fans use, two schools never render the same, and no
// header can collapse to a fragment ("St. at St.", "Miss at Troy"). The root cause was NFL "City Nickname" logic
// (the last word of "Iowa St." is "St."; of "Southern Miss" and "Ole Miss", "Miss") applied to college names, on top
// of the publication's own abbreviated display names. The fix: one name per contract code from the committed
// identity map (lib/cfbTeams.ts cfbName), applied once at the data layer (normalizeCfbNames, SportRepo) and by
// every name helper that used to cut a name to its last word.
import { describe, expect, it } from 'vitest';
import data from '../src/lib/cfb-teams.json';
import { cfbCodeOfEspn, cfbMatchupNames, cfbName, cfbPublishedName, normalizeCfbNames } from '../src/lib/cfbTeams';
import { splitName } from '../src/views/game/Hero';
import { shortName } from '../src/lib/hero/input';
import { decodeSignals } from '../src/lib/cfbSignals';
import { scriptTitle } from '../src/lib/scriptEngine';
import { readFileSync } from 'node:fs';
import { CFB_SIGNALS_FILE, readCfb } from './helpers';

const TEAMS = (data as unknown as { teams: Record<string, { e: string; n: string }> }).teams;
const FRAGMENT = /^(St\.?|State|Miss|U\.?|Tech|University|College|A&M)$/i;

describe('cfbName: the name fans use, from the contract code', () => {
  it.each([
    ['MSST', 'Mississippi St.', 'Mississippi State'],
    ['MSU', 'Michigan St.', 'Michigan State'],
    ['OSU', 'Ohio St.', 'Ohio State'],
    ['PSU', 'Penn St.', 'Penn State'],
    ['FSU', 'Florida St.', 'Florida State'],
    ['ISU', 'Iowa St.', 'Iowa State'],
    ['KSU', 'Kansas St.', 'Kansas State'],
    ['NCST', 'NC St.', 'NC State'],
    ['ASU', 'Arizona St.', 'Arizona State'],
    ['BSU', 'Boise St.', 'Boise State'],
    ['FRES', 'Fresno St.', 'Fresno State'],
    ['USU', 'Utah St.', 'Utah State'],
    ['TROY', 'Troy', 'Troy'],
    ['MISS', 'Ole Miss', 'Ole Miss'],
    ['USM', 'Southern Miss', 'Southern Miss'],
    ['USC', 'USC', 'USC'],
    ['UCLA', 'UCLA', 'UCLA'],
    ['LSU', 'LSU', 'LSU'],
    ['BYU', 'BYU', 'BYU'],
    ['UCF', 'UCF', 'UCF'],
    ['SMU', 'SMU', 'SMU'],
    ['TCU', 'TCU', 'TCU'],
    ['MOH', 'Miami (OH)', 'Miami (OH)'],
    ['MIA', 'Miami (FL)', 'Miami'],
    ['SCAR', 'South Carolina', 'South Carolina'],
    ['MICH', 'Michigan', 'Michigan'],
    ['KU', 'Kansas', 'Kansas'],
    ['MASS', 'UMass', 'UMass'],
    ['PENN', 'Penn', 'Penn'],
    ['APP', 'Appalachian St.', 'App State'],
  ])('%s (%s) → %s', (code, published, want) => {
    expect(cfbName(code, published)).toBe(want);
  });

  it('every name in the identity map is unique and none is a bare fragment', () => {
    const names = Object.keys(TEAMS).map((c) => cfbName(c));
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
    for (const n of names) expect(n, n).not.toMatch(FRAGMENT);
    for (const n of names) expect(n, n).not.toMatch(/\bSt\.$/);
  });

  it('a code outside the map keeps the published name, with "St." spelled out ("St. Thomas" keeps its saint)', () => {
    expect(cfbName('ZZZ', 'Example St.')).toBe('Example State');
    expect(cfbName('ZZZ', 'St. Thomas')).toBe('St. Thomas');
    expect(cfbPublishedName('Mount St. Mary’s')).toBe('Mount St. Mary’s');
  });

  it('a name that cannot identify a school is never shown as one (the live "University" / "Albany at Stony Brook" row)', () => {
    expect(cfbName('ALBY', 'University')).toBe('Albany');
    expect(cfbName('ZZZ', 'St.')).toBe('ZZZ');
    expect(cfbName(null, 'Albany at Stony Brook')).toBe('TBD');
    expect(cfbName(null, 'Miss')).toBe('TBD');
  });
});

describe('collision safety: two schools never render the same', () => {
  const pairs: [string, string][] = [
    ['MISS', 'MSST'], ['MIA', 'MOH'], ['USC', 'SCAR'], ['NCST', 'ISU'], ['MICH', 'MSU'], ['KU', 'KSU'],
    ['ISU', 'BYU'], ['WSU', 'USU'], ['USM', 'TROY'], ['MISS', 'USM'], ['OSU', 'PSU'], ['BSU', 'FRES'], ['ASU', 'KSU'],
  ];
  it.each(pairs)('%s vs %s', (a, b) => {
    const n = cfbMatchupNames({ code: a, name: TEAMS[a]?.n }, { code: b, name: TEAMS[b]?.n });
    expect(n.away).not.toBe(n.home);
    expect(`${n.away} at ${n.home}`).not.toMatch(/^(St\.|State|Miss|Tech|U\.?) at (St\.|State|Miss|Tech|U\.?)$/);
    for (const x of [n.away, n.home]) expect(x).not.toMatch(FRAGMENT);
  });

  it('two unknown schools with the same fallback name still read differently', () => {
    expect(cfbMatchupNames({ code: 'AAA', name: 'Central St.' }, { code: 'BBB', name: 'Central St.' })).toEqual({ away: 'Central State (AAA)', home: 'Central State (BBB)' });
  });

  it('no name helper cuts a college name to its last word', () => {
    // Before: splitName("Iowa St.").nick === "St." and splitName("Southern Miss").nick === "Miss".
    expect(splitName('Iowa St.', 'ISU', 'CFB').nick).toBe('Iowa State');
    expect(splitName('Southern Miss', 'USM', 'CFB').nick).toBe('Southern Miss');
    expect(splitName('Troy', 'TROY', 'CFB').nick).toBe('Troy');
    expect(shortName('CFB', 'MSU', 'Michigan St.')).toBe('Michigan State');
    // NFL keeps its nickname split.
    expect(splitName('Dallas Cowboys', 'DAL', 'NFL').nick).toBe('Cowboys');
  });
});

describe('normalizeCfbNames: once, at the data layer', () => {
  it('rewrites participant names by code, learns them for code-less rows, and leaves market text alone', () => {
    const doc = normalizeCfbNames({
      event: { title: 'Washington St. at Utah St.', participants: [{ participant_id: 'a', short_name: 'WSU', display_name: 'Washington St.' }, { participant_id: 'h', short_name: 'USU', display_name: 'Utah St.' }] },
      participants: [{ participant_id: 'a', display_name: 'Washington St.', home_away: 'AWAY' }],
      games: [{ opponent_name: 'Southern Miss' }],
      markets: [{ yes_description: 'Utah St.' }],
    });
    expect(doc.event.participants.map((p) => p.display_name)).toEqual(['Washington State', 'Utah State']);
    expect(doc.participants[0].display_name).toBe('Washington State');
    expect(doc.event.title).toBe('Washington State at Utah State');
    expect(doc.games[0].opponent_name).toBe('Southern Miss');
    expect(doc.markets[0].yes_description).toBe('Utah St.');
    // Idempotent: the shared fetch cache can hand the same object out again.
    expect(normalizeCfbNames(doc)).toEqual(doc);
  });

  it('marks a code-less participant whose name is a fragment or a whole matchup as TBD', () => {
    const doc = normalizeCfbNames({ participants: [{ short_name: 'ALBY', display_name: 'University' }, { short_name: null, display_name: 'Albany at Stony Brook' }] });
    expect(doc.participants.map((p) => p.display_name)).toEqual(['Albany', 'TBD']);
  });

  it('the real fixture board comes back with no abbreviated or fragment school name', () => {
    const board = normalizeCfbNames(readCfb<{ items: { participants: { short_name: string | null; display_name: string }[] }[] }>('board.json'));
    const names = board.items.flatMap((i) => i.participants.map((p) => p.display_name));
    expect(names.length).toBeGreaterThan(10);
    for (const n of names) {
      expect(n, n).not.toMatch(/\sSt\.$/);
      expect(n, n).not.toMatch(FRAGMENT);
    }
  });
});

describe('the research-signals contract speaks the same names', () => {
  it('re-names each side through its ESPN id (CONTROL team, market team and teams agree with the board)', () => {
    expect(cfbCodeOfEspn('66')).toBe('ISU');
    expect(cfbCodeOfEspn('113')).toBe('MASS');
    const raw = JSON.parse(readFileSync(CFB_SIGNALS_FILE, 'utf-8'));
    const doc = decodeSignals(raw);
    for (const g of doc.games) {
      const teams = (g as unknown as { teams?: Record<string, { name: string }> }).teams;
      if (!teams) continue;
      for (const t of Object.values(teams)) expect(t.name).not.toMatch(/\sSt\.$/);
      if (g.claims?.control) expect(g.claims.control.team).toBe(teams[g.claims.control.side].name);
    }
  });
});

describe('CFB script titles in plain words (Part 8)', () => {
  const shape = (o: Record<string, string>) => ({ margin_environment: 'NOT_STATED', total_environment: 'NOT_STATED', pace: 'NOT_STATED', winner_lean: 'NONE', bands: { home_margin: null, total_points: null }, ...o });
  it.each([
    ['COMPETITIVE_GRIND', 'Competitive grind', { margin_environment: 'ONE_SCORE', total_environment: 'SUPPRESSED' }, 'Close, Low-Scoring Game'],
    ['COMPETITIVE_GRIND', 'Competitive grind', { total_environment: 'SUPPRESSED', pace: 'FEWER_POSSESSIONS' }, 'Low-Scoring Game'],
    ['COMPETITIVE_SHOOTOUT', 'Competitive shootout', { margin_environment: 'ONE_SCORE', total_environment: 'ELEVATED' }, 'Close, High-Scoring Game'],
    ['COMPETITIVE_SHOOTOUT', 'Competitive shootout', { total_environment: 'ELEVATED' }, 'High-Scoring Game'],
    ['PACE_DRIVEN_OVER', 'Pace-driven scoring', { total_environment: 'ELEVATED', pace: 'MORE_POSSESSIONS' }, 'Fast-Paced, High-Scoring Game'],
    // Already plain: the engine's own title stands.
    ['FAVORITE_PULLS_AWAY', 'Memphis pulls away', { margin_environment: 'HOME_BY_THREE_PLUS_SCORES' }, 'Memphis pulls away'],
    ['UNDERDOG_HANGS_AROUND', 'Kent State hangs around', { margin_environment: 'ONE_SCORE' }, 'Kent State hangs around'],
    ['COMPETITIVE_TOSSUP', 'Even matchup, one-score game', { margin_environment: 'ONE_SCORE' }, 'Even matchup, one-score game'],
    // An environment archetype whose shape states no total keeps its canonical title rather than inventing one.
    ['COMPETITIVE_GRIND', 'Competitive grind', {}, 'Competitive grind'],
  ])('%s "%s" → %s', (archetype, title, o, want) => {
    expect(scriptTitle({ archetype, title, outcome_shape: shape(o as Record<string, string>) } as never)).toBe(want);
  });
});
