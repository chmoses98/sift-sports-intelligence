// CFB matchup identity: every school is shown by the name fans use, two schools never render the same, and no
// header can collapse to a fragment ("St. at St.", "Miss at Troy"). The root cause was NFL "City Nickname" logic
// (the last word of "Iowa St." is "St."; of "Southern Miss" and "Ole Miss", "Miss") applied to college names, on top
// of the publication's own abbreviated display names. The fix: one name per contract code from the committed
// identity map (lib/cfbTeams.ts cfbName), applied once at the data layer (normalizeCfbNames, SportRepo) and by
// every name helper that used to cut a name to its last word.
import { describe, expect, it } from 'vitest';
import data from '../src/lib/cfb-teams.json';
import { cfbCodeOfEspn, cfbDisplayText, cfbIdentity, cfbMatchupNames, cfbName, cfbPublishedName, normalizeCfbNames } from '../src/lib/cfbTeams';
import { describeMarket } from '../src/lib/marketLabel';
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
    ['MIA', 'Miami (FL)', 'Miami (FL)'],
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
    // UAlbany is in the identity map now (ESPN 399, scripts/teams/cfb-supplement.json): its code wins over any row text.
    expect(cfbName('ALBY', 'University')).toBe('UAlbany');
    expect(cfbName('ALBY', 'University at Albany')).toBe('UAlbany');
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
    // Market text: the school said by its canonical name, the published text kept beside it.
    expect(doc.markets[0].yes_description).toBe('Utah State');
    expect((doc.markets[0] as { source_text?: Record<string, string> }).source_text).toEqual({ yes_description: 'Utah St.' });
    expect((doc.event.participants[1] as { source_display_name?: string }).source_display_name).toBe('Utah St.');
    // Idempotent: the shared fetch cache can hand the same object out again.
    expect(normalizeCfbNames(doc)).toEqual(doc);
  });

  it('marks a code-less participant whose name is a fragment or a whole matchup as TBD', () => {
    const doc = normalizeCfbNames({ participants: [{ short_name: 'ALBY', display_name: 'University' }, { short_name: null, display_name: 'Albany at Stony Brook' }] });
    expect(doc.participants.map((p) => p.display_name)).toEqual(['UAlbany', 'TBD']);
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
    // Already plain: the engine's own words, in headline style (this pass), schools by their canonical names.
    ['FAVORITE_PULLS_AWAY', 'Memphis pulls away', { margin_environment: 'HOME_BY_THREE_PLUS_SCORES' }, 'Memphis Pulls Away'],
    ['UNDERDOG_HANGS_AROUND', 'Kent State hangs around', { margin_environment: 'ONE_SCORE' }, 'Kent State Hangs Around'],
    ['COMPETITIVE_TOSSUP', 'Even matchup, one-score game', { margin_environment: 'ONE_SCORE' }, 'Even Matchup, One-Score Game'],
    // An environment archetype whose shape states no total keeps its canonical title rather than inventing one.
    ['COMPETITIVE_GRIND', 'Competitive grind', {}, 'Competitive grind'],
  ])('%s "%s" → %s', (archetype, title, o, want) => {
    expect(scriptTitle({ archetype, title, outcome_shape: shape(o as Record<string, string>) } as never)).toBe(want);
  });
});

describe('one identity record, and names inside text (this pass)', () => {
  it('UAlbany: canonical name, ESPN id and a committed logo, through the same identity map as every school', () => {
    expect(cfbIdentity('ALBY')).toEqual({ code: 'ALBY', name: 'UAlbany', espnId: '399', logo: true, scheduleName: null });
    expect(cfbIdentity('MASS')).toMatchObject({ name: 'UMass', scheduleName: 'Massachusetts' });
    expect(cfbIdentity('ZZZ')).toBeNull();
  });

  it.each([
    ['Utah St. wins 1st Half', 'Utah State wins 1st Half'],
    ['Iowa St. wins by over 3.5 points', 'Iowa State wins by over 3.5 points'],
    ['Miss St. wins', 'Mississippi State wins'],
    ['App St. +3.5', 'App State +3.5'],
    ['Appalachian St. wins by over 6.5 points', 'App State wins by over 6.5 points'],
    ['Miami controls', 'Miami (FL) controls'],
    ['Miami (FL) wins', 'Miami (FL) wins'],
    ['Massachusetts controls', 'UMass controls'],
    ["Massachusetts's sustained-efficiency edge", "UMass's sustained-efficiency edge"],
    ['Pennsylvania at Penn State', 'Penn at Penn State'],
    // Untouched: already canonical, a longer school, or not a school at all.
    ['Miami (OH) wins', 'Miami (OH) wins'],
    ['Ohio State wins by over 13.5 points', 'Ohio State wins by over 13.5 points'],
    ['St. Thomas wins', 'St. Thomas wins'],
    ['Over 47.5 points', 'Over 47.5 points'],
    ['Tie', 'Tie'],
  ])('cfbDisplayText(%j) → %j', (raw, want) => {
    expect(cfbDisplayText(raw)).toBe(want);
  });

  it('a raw Kalshi label learned from its coded participant is rewritten in that game\'s market text ("University at Albany")', () => {
    const doc = normalizeCfbNames({
      event: { participants: [{ participant_id: 'a', short_name: 'ALBY', display_name: 'University at Albany' }, { participant_id: 'h', short_name: 'STON', display_name: 'Stony Brook' }], extensions: { title: 'University at Albany at Stony Brook' } },
      markets: [{ kalshi_ticker: 'KXNCAAFGAME-26OCT17ALBYSTON-ALBY', yes_description: 'University at Albany' }, { kalshi_ticker: 'KXNCAAFGAME-26OCT17ALBYSTON-STON', yes_description: 'Stony Brook' }],
    });
    expect(doc.event.participants.map((p) => p.display_name)).toEqual(['UAlbany', 'Stony Brook']);
    expect(doc.event.extensions.title).toBe('UAlbany at Stony Brook');
    expect(doc.markets.map((m) => m.yes_description)).toEqual(['UAlbany', 'Stony Brook']);
    // Tickers are never touched; the published text stays beside the display text.
    expect(doc.markets[0].kalshi_ticker).toBe('KXNCAAFGAME-26OCT17ALBYSTON-ALBY');
    expect((doc.markets[0] as { source_text?: Record<string, string> }).source_text).toEqual({ yes_description: 'University at Albany' });
  });

  it('CFB market labels built from a team code say the school, never the code', () => {
    expect(describeMarket({ kalshi_ticker: 'KXNCAAFGAME-26OCT10WSUUSU-USU', market_family: 'game_winner', period: 'FULL', participant_id: 'h', yes_description: 'Utah State' } as never, { abbrOf: () => 'USU', sport: 'CFB' }).title).not.toMatch(/\bUSU\b/);
  });

  it('script titles: canonical school names and headline style; the published title is kept', () => {
    const shape = { margin_environment: 'NOT_STATED', total_environment: 'NOT_STATED', pace: 'NOT_STATED', winner_lean: 'HOME', bands: { home_margin: null, total_points: null } };
    expect(scriptTitle({ archetype: 'HOME_CONTROL', title: 'Utah State controls', outcome_shape: shape } as never)).toBe('Utah State Controls the Matchup');
    expect(scriptTitle({ archetype: 'AWAY_CONTROL', title: 'Massachusetts controls', outcome_shape: shape } as never)).toBe('UMass Controls the Matchup');
    expect(scriptTitle({ archetype: 'FAVORITE_PULLS_AWAY', title: 'Memphis pulls away', outcome_shape: shape } as never)).toBe('Memphis Pulls Away');
    expect(scriptTitle({ archetype: 'UNDERDOG_HANGS_AROUND', title: 'Kent State hangs around', outcome_shape: shape } as never)).toBe('Kent State Hangs Around');
    expect(scriptTitle({ archetype: 'TURNOVER_DISRUPTION', title: 'App State wins on disruption', outcome_shape: shape } as never)).toBe('App State Wins on Disruption');
    expect(scriptTitle({ archetype: 'COMPETITIVE_TOSSUP', title: 'Even matchup, one-score game', outcome_shape: shape } as never)).toBe('Even Matchup, One-Score Game');
  });
});
