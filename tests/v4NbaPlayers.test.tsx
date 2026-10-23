// @vitest-environment jsdom
// v4 Game → Players and Props → NBA render the seven promoted NBA families through SIFT's approved authority: one projection per player and stat,
// the labelled established-model fallback only where it is approved, and a withheld count everywhere else. Never the raw Foundation rows as a
// "research preview", and never a claim that accuracy is betting value.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { makeAuthority } from '../src/lib/projectionAuthority';
import type { PlayerProjection, ProjectionDoc } from '../src/lib/projections';

const NOW = Date.parse('2026-10-23T18:00:00Z');
const GAME = 'espn:401900001';
const AS_OF = '2026-10-23T16:03:13Z';
const STALE = '2026-10-20T16:00:00Z';

const state: { doc: ProjectionDoc | null; loading: boolean; ready: boolean } = { doc: null, loading: false, ready: true };
vi.mock('../src/data/projections', () => ({
  useProjections: () => ({ doc: state.doc, loading: state.loading }),
  useAuthority: () => ({ authority: state.ready ? makeAuthority('NBA', state.doc, NOW) : null, ready: state.ready }),
}));

const { NbaPlayerProjections } = await import('../src/v4/ProjectionPanels');
type Established = NonNullable<Parameters<typeof NbaPlayerProjections>[0]['established']>[number];

function row(changes: Partial<PlayerProjection> = {}): PlayerProjection {
  return {
    playerId: 'espn:1', name: 'Test Player', team: 'CLE', opponent: 'PHI', gameId: GAME, family: 'points',
    mean: 21, median: 20, p10: 12, p90: 32, quantiles: null, quantileBasis: null, thresholds: [{ k: 20, p: 0.55 }],
    opportunity: null, opponentAdjustment: null, adjustments: [], readiness: 'READY', gate: { status: 'PASS', findings: [] }, dataAsOf: AS_OF,
    participation: { status: 'LIKELY_ACTIVE', certainty: 'PROJECTED', source: 'nba_official_injury_report', capturedUtc: AS_OF, reasons: [] },
    segments: null, role: 'shadow', ...changes,
  };
}
const FAMILIES = Object.fromEntries(['minutes', 'points', 'rebounds', 'assists', 'threes', 'pra', 'fga'].map((f) => [f, { readiness: 'READY' }]));
const TEAMS = ['CLE', 'PHI'].map((t) => ({ gameId: GAME, team: t, teamId: null, family: 'team_points', mean: 110, p10: 100, p90: 120, startUtc: '2026-10-23T23:00:00Z', home: 'CLE', away: 'PHI', homeId: null, awayId: null }));
const doc = (players: PlayerProjection[]) => ({ sport: 'NBA', generatedAt: AS_OF, dataAsOf: AS_OF, modelVersion: 'pf-1.3.0', families: FAMILIES, players, teams: TEAMS }) as unknown as ProjectionDoc;
const g = { sport: 'NBA', slug: 'nba', phase: 'PREGAME', startMs: Date.parse('2026-10-23T23:00:00Z'), away: { short_name: 'PHI', display_name: 'Philadelphia 76ers' }, home: { short_name: 'CLE', display_name: 'Cleveland Cavaliers' }, item: { event_id: 'evt_1', start_time_utc: '2026-10-23T23:00:00Z' } } as unknown as Parameters<typeof NbaPlayerProjections>[0]['g'];
const est = (changes: Partial<Established> = {}): Established => ({ playerId: 'espn:1', name: 'Test Player', team: 'CLE', opponent: 'PHI', family: 'points', mean: 19.5, p10: 10, p90: 30, generatedAt: '2026-10-23T15:00:00Z', designation: null, ...changes });
const out = row({ playerId: 'espn:2', name: 'Out Player', participation: { status: 'CONFIRMED_OUT', certainty: 'REPORTED', source: 'nba_official_injury_report', capturedUtc: AS_OF, reasons: [] } });

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); state.loading = false; state.ready = true; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Game → Players and Props → NBA, after promotion', () => {
  it('shows the approved SIFT projection, labelled as production, not a research preview', () => {
    state.doc = doc([row(), row({ family: 'rebounds', mean: 6, p10: 2, p90: 11, thresholds: [{ k: 6, p: 0.5 }] })]);
    render(<NbaPlayerProjections g={g} />);
    const section = screen.getByRole('region', { name: 'NBA player projections' });
    expect(section).toHaveTextContent('SIFT projection · approved for production');
    expect(section).toHaveTextContent('Test Player');
    expect(section).toHaveTextContent('21.0');                                       // PTS
    expect(section).toHaveTextContent('80% range 12–32');
    expect(section).toHaveTextContent('Expected to play (not yet confirmed)');
    expect(section.textContent).not.toMatch(/research preview|pending production approval|activation/i);
    expect(screen.queryByTestId('nba-established-note')).toBeNull();
  });
  it('does not present accuracy as betting value', () => {
    state.doc = doc([row()]);
    render(<NbaPlayerProjections g={g} />);
    const t = screen.getByRole('region', { name: 'NBA player projections' }).textContent!;
    expect(t).toMatch(/not betting value/);
    expect(t).toMatch(/not a bet recommendation/);
    expect(t).not.toMatch(/profitab|guarantee|best bet|sure thing|beat the market|winning/i);
  });
  it('a ruled-out player has no projection and the screen says how many were withheld', () => {
    state.doc = doc([row(), out]);
    render(<NbaPlayerProjections g={g} />);
    const section = screen.getByRole('region', { name: 'NBA player projections' });
    expect(within(section).queryByText('Out Player')).toBeNull();
    expect(screen.getByTestId('nba-withheld')).toHaveTextContent('1 stat forecast withheld: 1 player ruled out.');
  });
  it('shows an uncertain player at Low reliability, with the reason', () => {
    state.doc = doc([row({ participation: { status: 'UNCERTAIN', certainty: 'PROJECTED', source: 'espn_injuries', capturedUtc: AS_OF, reasons: [] } })]);
    render(<NbaPlayerProjections g={g} />);
    const section = screen.getByRole('region', { name: 'NBA player projections' });
    expect(section).toHaveTextContent('SIFT projection · Low reliability');
    expect(section).toHaveTextContent('Participation uncertain');
  });
  it('a stale feed with no established projection shows no number and the reason; it does not invent a fallback', () => {
    state.doc = doc([row({ dataAsOf: STALE })]);
    render(<NbaPlayerProjections g={g} />);
    const section = screen.getByRole('region', { name: 'NBA player projections' });
    expect(section).toHaveTextContent('No usable NBA player projections');
    expect(section).toHaveTextContent('1 stat forecast withheld: 1 inputs too old.');
    expect(screen.queryByTestId('nba-established-note')).toBeNull();
    expect(section.textContent).not.toMatch(/21\.0/);
  });
  it('a stale feed with a usable established projection shows ONLY that, with the approved label and wording', () => {
    state.doc = doc([row({ dataAsOf: STALE })]);
    render(<NbaPlayerProjections g={g} established={[est()]} />);
    const section = screen.getByRole('region', { name: 'NBA player projections' });
    expect(screen.getByTestId('nba-established-note')).toHaveTextContent('Established projectionThe current SIFT forecast is unavailable or not yet published. Showing the established model’s projection instead.');
    expect(section).toHaveTextContent('Established projection — The current SIFT forecast is unavailable or not yet published. Showing the established model’s projection instead.');
    expect(section).toHaveTextContent('19.5');                                       // the established number
    expect(section.textContent).not.toMatch(/21\.0/);                                // never beside the (stale) SIFT number
  });
  it('an established projection never replaces a ruled-out player', () => {
    state.doc = doc([out]);
    render(<NbaPlayerProjections g={g} established={[est({ playerId: 'espn:2', name: 'Out Player' })]} />);
    const section = screen.getByRole('region', { name: 'NBA player projections' });
    expect(section).toHaveTextContent('No usable NBA player projections');
    expect(within(section).queryByText('Out Player')).toBeNull();
    expect(screen.queryByTestId('nba-established-note')).toBeNull();
  });
  it('feed unavailable and nothing established: says so, no number', () => {
    state.doc = null;
    render(<NbaPlayerProjections g={g} />);
    expect(screen.getByRole('region', { name: 'NBA player projections' })).toHaveTextContent('NBA projections unavailable');
  });
  it('feed unavailable with an established projection: that projection, labelled', () => {
    state.doc = null;
    render(<NbaPlayerProjections g={g} established={[est()]} />);
    const section = screen.getByRole('region', { name: 'NBA player projections' });
    expect(section).toHaveTextContent('Established projection');
    expect(section).toHaveTextContent('19.5');
  });
  it('waits for the authority instead of flashing a number', () => {
    state.doc = doc([row()]);
    state.ready = false;
    render(<NbaPlayerProjections g={g} />);
    expect(screen.getByRole('status', { name: 'Loading NBA projections' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'NBA player projections' }).textContent).not.toMatch(/21\.0/);
  });
});
