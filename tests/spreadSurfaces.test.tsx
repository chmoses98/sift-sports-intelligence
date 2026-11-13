// Regression suite for every SIFT surface that renders a spread or a winning margin.
// Standard: "PHI −6.5" pregame = PHI projected to win by 6.5; final "PHI −3" = PHI won by 3.
// If TOR is projected to beat PHI by 1.7 the label is "TOR −1.7", never "PHI −1.7".
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { EventResearchDoc } from '../src/contract/types';
import {
  homeMarginFromHomeHandicap,
  PICKEM,
  spreadFromFinalScores,
  spreadFromHomeHandicap,
  spreadFromHomeMargin,
  teamFavouriteLine,
} from '../src/lib/spreadNotation';
import { atsOf, type LeagueGame } from '../src/history/league';
import { lineText } from '../src/views/broadcast/cardFacts';
import { spreadText, type HeroNumbers } from '../src/views/broadcast/numbers';
import { modelLine } from '../src/views/home/cards';
import { ModelReadPanel } from '../src/views/game/panels';
import { marginWords } from '../src/views/cbb/data';
import { modelSpread } from '../src/v3/model/spread';

// TOR (away) at PHI (home). Raw home-minus-away model margin −1.7 => TOR projected winner.
const doc = (modelSpreadHomeHandicap: number | null, marketHomeHandicap: number | null): EventResearchDoc => ({
  participants: [
    { participant_id: 'p_tor', home_away: 'AWAY' },
    { participant_id: 'p_phi', home_away: 'HOME' },
  ],
  event: { participants: [{ participant_id: 'p_tor', short_name: 'TOR' }, { participant_id: 'p_phi', short_name: 'PHI' }] },
  extensions: {
    model_view: modelSpreadHomeHandicap == null ? undefined : { model_spread: modelSpreadHomeHandicap, model_total: 221.5, model_win_probability: { TOR: 0.56, PHI: 0.44 } },
    market_implied: marketHomeHandicap == null ? undefined : { implied_spread: marketHomeHandicap, implied_total_median: 223.5, win_probability: { TOR: 0.4, PHI: 0.6 } },
  },
} as unknown as EventResearchDoc);

describe('two native conventions, one display', () => {
  it('home-minus-away margins: positive = home winning', () => {
    expect(spreadFromHomeMargin(6.5, 'PHI', 'TOR')?.label).toBe('PHI −6.5');
    expect(spreadFromHomeMargin(-1.7, 'PHI', 'TOR')?.label).toBe('TOR −1.7');
    expect(spreadFromHomeMargin(-1.7, 'PHI', 'TOR')?.label).not.toBe('PHI −1.7');
    expect(spreadFromHomeMargin(0, 'PHI', 'TOR')?.label).toBe(PICKEM);
  });
  it('sportsbook HOME handicaps: negative = home favoured (opposite sign to margins)', () => {
    expect(spreadFromHomeHandicap(-6.5, 'PHI', 'TOR')?.label).toBe('PHI −6.5');
    expect(spreadFromHomeHandicap(1.7, 'PHI', 'TOR')?.label).toBe('TOR −1.7');
    expect(homeMarginFromHomeHandicap(-6.5)).toBe(6.5);
    expect(homeMarginFromHomeHandicap(1.7)).toBe(-1.7);
    expect(homeMarginFromHomeHandicap(null)).toBeNull();
    // Round trip: the same game expressed both ways renders identically.
    for (const m of [-12.5, -1.7, 0, 3, 7.5]) {
      expect(spreadFromHomeHandicap(-m, 'PHI', 'TOR')?.label).toBe(spreadFromHomeMargin(m, 'PHI', 'TOR')?.label);
    }
  });
  it('team-named contract lines (Kalshi "wins by more than X")', () => {
    expect(teamFavouriteLine('ATL', 2.5)).toBe('ATL −2.5');
    expect(teamFavouriteLine('ATL', -2.5)).toBe('ATL −2.5');
    expect(teamFavouriteLine('ATL', 3)).toBe('ATL −3');
    expect(teamFavouriteLine(null, 3)).toBeNull();
    expect(teamFavouriteLine('ATL', null)).toBeNull();
  });
  it('final results: away win, home win, one-goal win, tie', () => {
    expect(spreadFromFinalScores(103, 100, 'PHI', 'TOR')?.label).toBe('PHI −3');
    expect(spreadFromFinalScores(98, 109, 'PHI', 'TOR')?.label).toBe('TOR −11');
    expect(spreadFromFinalScores(2, 3, 'BOS', 'MTL')?.label).toBe('MTL −1');
    expect(spreadFromFinalScores(1, 1, 'ARS', 'CHE')?.label).toBe(PICKEM);
  });
});

describe('model accuracy arithmetic stays in margin units (no reversed signs)', () => {
  it('TOR −1.7 projected vs PHI −11 final = 12.7 absolute margin error; winner call wrong', () => {
    const projectedHomeMargin = -1.7; // raw model margin, home minus away
    const finalHomeMargin = 112 - 101;
    expect(Math.abs(projectedHomeMargin - finalHomeMargin)).toBeCloseTo(12.7, 9);
    expect(Math.sign(projectedHomeMargin) === Math.sign(finalHomeMargin)).toBe(false);
    expect(spreadFromHomeMargin(projectedHomeMargin, 'PHI', 'TOR')?.label).toBe('TOR −1.7');
    expect(spreadFromFinalScores(112, 101, 'PHI', 'TOR')?.label).toBe('PHI −11');
  });
  it('market handicap vs final: cover evaluated after converting the handicap to margin units', () => {
    const homeHandicap = -6.5; // PHI −6.5
    const covers = (finalHome: number, finalAway: number) => finalHome - finalAway + homeHandicap > 0;
    expect(covers(110, 100)).toBe(true); // PHI won by 10, covered 6.5
    expect(covers(103, 100)).toBe(false); // PHI won by 3, did not cover
    expect(covers(100, 101)).toBe(false);
  });
});

describe('closing spread vs result (nflverse spread_line: POSITIVE = home favoured)', () => {
  const lg = (o: Partial<LeagueGame>): LeagueGame => ({ id: 'g', away: 'TOR', home: 'PHI', away_score: null, home_score: null, spread_line: null, total_line: null, ...o } as LeagueGame);
  it('home favourite covered, away favourite failed, push, pick em', () => {
    expect(atsOf(lg({ home_score: 110, away_score: 100, spread_line: 6.5 }))).toMatchObject({ favourite: 'PHI', cover: 'covered', text: 'PHI −6.5 · covered' });
    expect(atsOf(lg({ home_score: 103, away_score: 100, spread_line: -1.5 }))).toMatchObject({ favourite: 'TOR', cover: 'not_covered', text: 'TOR −1.5 · did not cover' });
    expect(atsOf(lg({ home_score: 100, away_score: 103, spread_line: -3 }))).toMatchObject({ favourite: 'TOR', cover: 'push', text: 'TOR −3 · push' });
    expect(atsOf(lg({ home_score: 100, away_score: 103, spread_line: 0 }))?.favourite).toBeNull();
  });
});

describe('broadcast + home cards (home handicaps)', () => {
  const n = { home: { abbr: 'PHI' }, away: { abbr: 'TOR' } } as unknown as HeroNumbers;
  it('spreadText / lineText name the favourite from the HOME handicap sign', () => {
    expect(spreadText(-6.5, n)).toBe('PHI −6.5');
    expect(spreadText(1.7, n)).toBe('TOR −1.5');
    expect(spreadText(0.2, n)).toBe(PICKEM);
    expect(spreadText(null, n)).toBeNull();
    expect(lineText(-3, 'TOR', 'PHI')).toBe('PHI −3');
    expect(lineText(2.5, 'TOR', 'PHI')).toBe('TOR −2.5');
  });
  it('home model line: away favourite, win probability of the favourite', () => {
    expect(modelLine(doc(1.7, null))).toBe('TOR −1.5 · 56% · O/U 221.5');
    expect(modelLine(doc(-6.5, null))).toMatch(/^PHI −6\.5 · 44%/);
  });
});

describe('game overview Model Read panel', () => {
  it('labels the market line with the MARKET favourite even when the model disagrees', () => {
    render(<MemoryRouter><ModelReadPanel r={doc(1.7, -3.5)} read="x" homeAbbr="PHI" awayAbbr="TOR" to="/x" /></MemoryRouter>);
    expect(screen.getByText('TOR −1.5')).toBeTruthy(); // model: TOR by 1.7 (half-point)
    expect(screen.getByText('Market PHI −3.5')).toBeTruthy(); // market: PHI favoured by 3.5
    expect(screen.queryByText('Market TOR −3.5')).toBeNull();
  });
});

describe('CBB + v3 projections', () => {
  it('CBB margins are home-minus-away', () => {
    expect(marginWords(-1.7, 'Philadelphia', 'Toronto')).toBe('Toronto −1.7');
    expect(marginWords(6.5, 'Philadelphia', 'Toronto')).toBe('Philadelphia −6.5');
  });
  it('v3 projected scores (away, home) name the projected winner', () => {
    expect(modelSpread(110.2, 103.7, 'TOR', 'PHI')?.label).toBe('TOR −6.5');
    expect(modelSpread(100, 106.6, 'TOR', 'PHI')?.label).toBe('PHI −6.5');
  });
});
