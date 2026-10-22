// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { GameRowV4 } from '../src/v4/parts';
import { Scoreboard } from '../src/v4/Scoreboard';
import { LiveScoreCard } from '../src/v4/LiveScoreCard';
import { ageChip, observedFor, periodClock, shownState } from '../src/v4/scoreState';
import { applyFilter, defaultGameTab, groupByPhase, isLiveGame, isOver, isUpcoming, pickFeature } from '../src/v4/model';
import { scoreView } from '../src/live/scores/freshness';
import type { ScoreRead } from '../src/live/scores/store';
import type { LiveGame } from '../src/live/scores/types';
import type { GameRow } from '../src/views/broadcast/games';

afterEach(cleanup);

const NOW = Date.parse('2030-01-01T20:30:00Z');
const row = (o: Partial<GameRow> & { id?: string; sport?: string } = {}): GameRow => ({
  sport: o.sport ?? 'NBA', slug: (o.sport ?? 'NBA').toLowerCase(), label: '', phase: 'PREGAME', stale: false, startMs: NOW + 3600_000, candidates: 0, best: null, opps: [],
  away: { participant_id: 'a', display_name: 'Sample Bears', short_name: 'SBR', participant_type: 'TEAM' },
  home: { participant_id: 'h', display_name: 'Example Hawks', short_name: 'EHK', participant_type: 'TEAM' },
  item: { event_id: o.id ?? 'evt_1', start_time_utc: new Date(NOW + 3600_000).toISOString(), home_participant: 'h', away_participant: 'a', participants: [], markets_available: 0 },
  ...o,
} as unknown as GameRow);

const game = (o: Partial<LiveGame> = {}, ageS = 3): LiveGame => ({
  schema: 'sift.live_game/1', sport: 'NBA', league: 'DEMO', startUtc: new Date(NOW).toISOString(),
  home: { key: 'NBA:EHK', name: 'Example Hawks', abbr: 'EHK', providerTeamId: null }, away: { key: 'NBA:SBR', name: 'Sample Bears', abbr: 'SBR', providerTeamId: null },
  phase: 'LIVE', rawStatus: 'in', score: { home: 61, away: 58 },
  clock: { period: 3, periodLabel: '3rd Quarter', display: '4:32', seconds: 272, direction: 'down', running: true }, situation: null,
  provenance: { provider: 'demo', providerGameId: 'demo:evt_1', providerUpdatedAt: new Date(NOW - ageS * 1000).toISOString(), fetchedAt: new Date(NOW - ageS * 1000).toISOString(), attribution: 'DEMO · simulated, not a real game' },
  ...o,
});
const read = (g: LiveGame | null, opts: { down?: boolean; demo?: boolean } = {}): ScoreRead => ({ game: g, match: null, demo: opts.demo ?? true, view: scoreView(g, NOW, { providerDown: opts.down }) });

const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('what a score read lets v4 SHOW', () => {
  it('maps a read to live / upcoming / over, and says nothing when there is no game', () => {
    expect(shownState(read(game()))).toBe('live');
    expect(shownState(read(game({ phase: 'BREAK' })))).toBe('live');
    expect(shownState(read(game({ phase: 'FINAL' })))).toBe('over');
    expect(shownState(read(game({ phase: 'SCHEDULED', score: null })))).toBe('upcoming');
    expect(shownState(read(null))).toBeNull();
    expect(shownState(null)).toBeNull();
  });

  it('groups and filters by what is shown, and never touches the publication\'s own phase', () => {
    const g = row({ phase: 'PREGAME' });
    const live = read(game());
    expect(isLiveGame(g, live)).toBe(true);
    expect(isUpcoming(g, live)).toBe(false);
    expect(g.phase).toBe('PREGAME'); // the research layer's view of the game is untouched
    expect(isOver(g, read(game({ phase: 'FINAL' })))).toBe(true);
    // No read: exactly the old behaviour.
    expect(isLiveGame(row({ phase: 'STARTED' }))).toBe(true);
    expect(isLiveGame(row({ phase: 'STARTED', stale: true }))).toBe(false);
    expect(isUpcoming(row({ phase: 'PREGAME' }))).toBe(true);
    const rows = [row({ id: 'a', phase: 'PREGAME' }), row({ id: 'b', phase: 'PREGAME' }), row({ id: 'c', phase: 'STARTED' })];
    const reads: Record<string, ScoreRead> = { a: live, b: read(game({ phase: 'FINAL' })) };
    const scores = (x: GameRow) => reads[x.item.event_id] ?? null;
    const gr = groupByPhase(rows, scores);
    expect(gr.live.map((x) => x.item.event_id).sort()).toEqual(['a', 'c']);
    expect(gr.over.map((x) => x.item.event_id)).toEqual(['b']);
    expect(applyFilter(rows, 'live', [], scores).map((x) => x.item.event_id).sort()).toEqual(['a', 'c']);
    expect(rows.map((x) => x.phase)).toEqual(['PREGAME', 'PREGAME', 'STARTED']);
  });

  it('opens on Live for a game the demo shows in play, Matchups when it shows pregame, and as before with no read', () => {
    expect(defaultGameTab(row({ phase: 'PREGAME' }), read(game()))).toBe('live');
    expect(defaultGameTab(row({ phase: 'STARTED' }), read(game({ phase: 'SCHEDULED', score: null })))).toBe('matchups');
    expect(defaultGameTab(row({ phase: 'PREGAME' }))).toBe('matchups');
    expect(defaultGameTab(row({ phase: 'STARTED' }))).toBe('live');
  });

  it('features a demo-live game first, and the app\'s own rule otherwise', () => {
    const a = row({ id: 'a' }); const b = row({ id: 'b', candidates: 2 });
    expect(pickFeature([a, b], a)).toBe(a);
    expect(pickFeature([a, b], a, (g) => (g === a ? read(game()) : null))).toBe(a);
    expect(pickFeature([a, b], a, (g) => (g === b ? read(game()) : null))).toBe(b);
  });

  it('words the period and clock in each sport\'s terms, and ages in whole minutes', () => {
    expect(periodClock(read(game()))).toBe('Q3 4:32');
    expect(periodClock(read(game({ clock: { period: 2, periodLabel: '2nd Period', display: '11:59', seconds: 719, direction: 'down', running: true } })))).toBe('P2 11:59');
    expect(periodClock(read(game({ clock: { period: 1, periodLabel: '1st Half', display: "34'", seconds: 2040, direction: 'up', running: true } })))).toBe("34'");
    expect(periodClock(read(game({ clock: { period: 2, periodLabel: 'Halftime', display: null, seconds: null, direction: null, running: false } })))).toBe('Halftime');
    expect(periodClock(read(game({ clock: { period: 5, periodLabel: 'Overtime', display: '3:10', seconds: 190, direction: 'down', running: true } })))).toBe('OT 3:10');
    expect(ageChip(read(game()))).toBe('');
    expect(ageChip(read(game({}, 130)))).toBe('2m ago');
    expect(ageChip(read(game({}, 540)))).toBe('stale 9m');
  });
});

describe('the rows and scoreboard print a read, always under a DEMO label', () => {
  it('a live row shows both scores, the period and clock, and DEMO', () => {
    inRouter(<ul><GameRowV4 g={row()} read={read(game())} /></ul>);
    const link = screen.getByRole('link');
    expect(link.getAttribute('aria-label')).toMatch(/demo score 58 to 61/);
    expect(link.textContent).toContain('58'); expect(link.textContent).toContain('61');
    expect(link.textContent).toContain('Q3 4:32');
    expect(link.textContent).toContain('DEMO');
    expect(link.textContent).not.toMatch(/Score n\/a/);
  });

  it('a delayed or stale row carries its age and still says DEMO, never live', () => {
    inRouter(<ul><GameRowV4 g={row()} read={read(game({}, 130))} /></ul>);
    expect(screen.getByRole('link').textContent).toContain('2m ago');
    cleanup();
    inRouter(<ul><GameRowV4 g={row()} read={read(game({}, 700), { down: true })} /></ul>);
    expect(screen.getByRole('link').textContent).toContain('stale 11m');
    expect(screen.getByRole('link').textContent).toContain('DEMO');
  });

  it('a final row shows F and the winner\'s side, with DEMO', () => {
    inRouter(<ul><GameRowV4 g={row()} read={read(game({ phase: 'FINAL', clock: null, score: { home: 104, away: 99 } }))} /></ul>);
    const t = screen.getByRole('link').textContent!;
    expect(t).toContain('99'); expect(t).toContain('104'); expect(t).toContain('F'); expect(t).toContain('DEMO');
  });

  it('with no read the row is exactly what it was: start time pregame, "Score n/a" in play', () => {
    inRouter(<ul><GameRowV4 g={row()} /><GameRowV4 g={row({ phase: 'STARTED', item: { event_id: 'x', markets_available: 0 } as never })} /></ul>);
    const links = screen.getAllByRole('link');
    expect(links[0].textContent).not.toContain('DEMO');
    expect(links[1].textContent).toContain('Score n/a');
  });

  it('an unavailable read falls back to what the publication says, with no score and no DEMO score', () => {
    inRouter(<ul><GameRowV4 g={row({ phase: 'STARTED' })} read={read(null)} /></ul>);
    expect(screen.getByRole('link').textContent).toContain('Score n/a');
  });

  it('the scoreboard shows the live score, a DEMO tag and the chip sentence; a stale one says last update', () => {
    inRouter(<Scoreboard g={row()} away="Bears" home="Hawks" final={null} hosted read={read(game())} />);
    expect(screen.getByText('Q3 4:32')).toBeTruthy();
    expect(screen.getByText('DEMO')).toBeTruthy();
    expect(screen.getByText(/^LIVE · /)).toBeTruthy();
    cleanup();
    inRouter(<Scoreboard g={row()} away="Bears" home="Hawks" final={null} hosted read={read(game({}, 700), { down: true })} />);
    expect(screen.getByText(/Last update 11m ago · provider unavailable/)).toBeTruthy();
    expect(screen.queryByText(/^LIVE/)).toBeNull();
  });

  it('the Live tab card names the source, the as-of time and the scoring plays, and says the real game is unaffected', () => {
    const g = game({ recentPlays: [{ periodLabel: '3rd Quarter', clock: '5:10', text: 'Example Hawks: Basket', home: 61, away: 58 }] });
    inRouter(<LiveScoreCard g={row()} read={read(g)} awayN="Bears" homeN="Hawks" />);
    expect(screen.getByText('In play · DEMO')).toBeTruthy();
    expect(screen.getByText('SIFT Live Score Demo')).toBeTruthy();
    expect(screen.getByText('Simulated game')).toBeTruthy();
    expect(screen.getByText(/The real game has not started/)).toBeTruthy();
    expect(screen.getByText('Example Hawks: Basket')).toBeTruthy();
    expect(screen.getByText(/Recent scoring · DEMO/)).toBeTruthy();
  });
});

describe('observed events come from the publication\'s own participants', () => {
  it('skips games the publication already calls over, and builds a tennis match without home/away ids', () => {
    const t = row({ sport: 'TENNIS', id: 't1', away: { participant_id: 'p2', display_name: 'Carlos Alcaraz', short_name: 'ALC', participant_type: 'PLAYER' } as never, home: { participant_id: 'p1', display_name: 'Jannik Sinner', short_name: 'SIN', participant_type: 'PLAYER' } as never });
    const over = row({ id: 'f1', phase: 'FINAL' });
    const evs = observedFor([row({ id: 'n1' }), over, t]);
    expect(evs.map((e) => e.ref.eventId).sort()).toEqual(['n1', 't1']);
    const tennis = evs.find((e) => e.ref.eventId === 't1')!;
    expect(tennis.ref.home.name).toBe('Jannik Sinner'); expect(tennis.ref.away.name).toBe('Carlos Alcaraz');
    expect(tennis.ref.home.key).not.toBe(tennis.ref.away.key);
  });
});
