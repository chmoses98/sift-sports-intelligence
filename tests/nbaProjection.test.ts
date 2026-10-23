// What the v4 NBA surfaces show for a game: one projection per player and stat from SIFT's approved authority, the owner-approved established-model
// fallback only where it is allowed (and then alone, labelled), and a withheld reason everywhere else.
import { describe, expect, it } from 'vitest';
import { ESTABLISHED_LABEL, ESTABLISHED_TEXT, nbaGameProjections, withheldSentence, type EstablishedNbaRow } from '../src/lib/nbaProjection';
import { makeAuthority } from '../src/lib/projectionAuthority';
import type { PlayerProjection, ProjectionDoc } from '../src/lib/projections';

const NOW = Date.parse('2026-10-23T18:00:00Z');
const GAME = 'espn:401900001';
const AS_OF = '2026-10-23T16:03:13Z';                       // 1.9 h old: current (NBA limit 48 h)
const STALE = '2026-10-20T16:00:00Z';                       // 74 h old: past the limit

function row(changes: Partial<PlayerProjection> = {}): PlayerProjection {
  return {
    playerId: 'espn:1', name: 'Test Player', team: 'CLE', opponent: 'PHI', gameId: GAME, family: 'points',
    mean: 21, median: 20, p10: 12, p90: 32, quantiles: null, quantileBasis: null, thresholds: [{ k: 20, p: 0.55 }],
    opportunity: null, opponentAdjustment: null, adjustments: [], readiness: 'READY', gate: { status: 'PASS', findings: [] }, dataAsOf: AS_OF,
    participation: { status: 'LIKELY_ACTIVE', certainty: 'PROJECTED', source: 'nba_official_injury_report', capturedUtc: AS_OF, reasons: [] },
    segments: null, role: 'shadow', ...changes,
  };
}
const READY = (extra: string[] = []) => Object.fromEntries(['minutes', 'points', 'rebounds', 'assists', 'threes', 'pra', 'fga', ...extra].map((f) => [f, { readiness: 'READY' }]));
const docOf = (players: PlayerProjection[], families: Record<string, { readiness: string }> = READY()) =>
  ({ sport: 'NBA', generatedAt: AS_OF, dataAsOf: AS_OF, modelVersion: 'pf-1.3.0', families, players, teams: [] }) as unknown as ProjectionDoc;
const game = (doc: ProjectionDoc | null, established: EstablishedNbaRow[] = [], gameId = GAME) => nbaGameProjections(makeAuthority('NBA', doc, NOW), doc, gameId, established);
const kinds = (r: ReturnType<typeof nbaGameProjections>, playerId = 'espn:1') => Object.fromEntries((r.players.find((p) => p.playerId === playerId)?.stats ?? []).map((s) => [s.family, s.kind]));

function est(changes: Partial<EstablishedNbaRow> = {}): EstablishedNbaRow {
  return { playerId: 'espn:1', name: 'Test Player', team: 'CLE', opponent: 'PHI', family: 'points', mean: 19.5, p10: 10, p90: 30, generatedAt: '2026-10-23T15:00:00Z', designation: null, ...changes };
}

describe('the approved projection', () => {
  it('shows the SIFT projection for a current, ready, available player — one per player and stat', () => {
    const r = game(docOf([row(), row({ family: 'rebounds', mean: 6, p10: 2, p90: 11, thresholds: [{ k: 6, p: 0.5 }] })]));
    expect(kinds(r)).toEqual({ points: 'projection', rebounds: 'projection' });
    const p = r.listed[0];
    expect(p.shown).toHaveLength(2);
    const pts = p.shown.find((s) => s.family === 'points')!;
    expect(pts.kind === 'projection' && pts.value.mean).toBe(21);
    expect(r.withheldTotal).toBe(0);
  });
  it('never shows two numbers for one player and stat: a duplicated feed row is withheld, not guessed between', () => {
    const r = game(docOf([row(), row({ mean: 25, p10: 15, p90: 35 })]));
    expect(r.players).toHaveLength(1);
    expect(r.players[0].stats).toHaveLength(1);
    const s = r.players[0].stats[0];
    expect(s.kind === 'withheld' && s.code).toBe('NOT_PROJECTED');
    expect(r.listed).toHaveLength(0);
  });
  it('shows an uncertain or unverified player at Low reliability with the reason, never as High', () => {
    const r = game(docOf([row({ participation: { status: 'UNCERTAIN', certainty: 'PROJECTED', source: 'espn_injuries', capturedUtc: AS_OF, reasons: [] } })]));
    const s = r.listed[0].shown[0];
    expect(s.kind === 'projection' && s.value.reliability).toBe('LOW');
    expect(s.kind === 'projection' && s.value.reliabilityWhy.length).toBeGreaterThan(0);
  });
  it('leaves out other games and stats the approvals do not cover', () => {
    const r = game(docOf([row({ gameId: 'espn:other' }), row({ family: 'blocks' })]));
    expect(r.players).toHaveLength(0);
  });
});

describe('withheld: no number from either model, whatever the established model holds', () => {
  const perfect = [est(), est({ family: 'rebounds', mean: 6, p10: 2, p90: 11 })];
  const out = (status: 'CONFIRMED_OUT' | 'LIKELY_OUT') => row({ participation: { status, certainty: 'REPORTED', source: 'nba_official_injury_report', capturedUtc: AS_OF, reasons: [] } });
  it.each([
    ['a confirmed-out player', out('CONFIRMED_OUT'), 'OUT'],
    ['a likely-out player', out('LIKELY_OUT'), 'OUT'],
    ['a row the quality gate blocked', row({ gate: { status: 'BLOCK', findings: [{ check: 'x', severity: 'BLOCK', what: 'blocked by the gate', category: 'x', action: '' }] } }), 'GATE_BLOCK'],
    ['an incoherent range', row({ p10: 40, p90: 20 }), 'INCOHERENT'],
  ] as const)('%s is withheld and never replaced by an established number', (_name, bad, code) => {
    for (const established of [[], perfect]) {
      const r = game(docOf([bad]), established);
      const s = r.players[0].stats.find((x) => x.family === 'points')!;
      expect(s.kind).toBe('withheld');
      expect(s.kind === 'withheld' && s.code).toBe(code);
      expect(r.players[0].stats.find((x) => x.family === 'points')!.kind).not.toBe('established');
    }
    expect(game(docOf([bad])).listed).toHaveLength(0);
  });
  it('a family that is not READY is withheld, with no fallback', () => {
    const d = docOf([row()], { ...READY(), points: { readiness: 'SHADOW VALIDATION' } });
    const s = game(d, perfect).players[0].stats[0];
    expect(s.kind === 'withheld' && s.code).toBe('FAMILY_NOT_READY');
  });
  it('says how many were withheld and why', () => {
    const r = game(docOf([out('CONFIRMED_OUT'), row({ playerId: 'espn:2', name: 'B', p10: 40, p90: 20 }), row({ playerId: 'espn:3', name: 'C' })]));
    expect(r.withheldTotal).toBe(2);
    expect(withheldSentence(r)).toBe('2 stat forecasts withheld: 1 player ruled out, 1 range failed a coherence check.');
    expect(withheldSentence(game(docOf([row()])))).toBeNull();
  });
});

describe('the approved fallback: only for a missing, stale or unpublished feed, and only if the established projection passes its own checks', () => {
  it('stale feed: the established projection is shown ALONE, labelled, with the trigger', () => {
    const r = game(docOf([row({ dataAsOf: STALE })]), [est()]);
    const s = r.players[0].stats[0];
    expect(s.kind).toBe('established');
    expect(s.kind === 'established' && s.trigger).toBe('STALE');
    expect(s.kind === 'established' && s.mean).toBe(19.5);
    expect(r.players[0].shown).toHaveLength(1);                                   // exactly one projection for the stat
    expect(JSON.stringify(r)).not.toContain('"mean":21');                         // the stale SIFT number is not in the result
  });
  it('feed unavailable: the established projection is shown, and the player list comes from it', () => {
    const r = game(null, [est(), est({ family: 'minutes', mean: 33, p10: 25, p90: 40 })]);
    expect(kinds(r)).toEqual({ points: 'established', minutes: 'established' });
    expect(r.listed[0].name).toBe('Test Player');
  });
  it('game not published: the established projection is shown for a team the feed does not cover', () => {
    const d = docOf([row({ team: 'LAL', opponent: 'DEN', gameId: 'espn:other', playerId: 'espn:9' })]);
    const r = nbaGameProjections(makeAuthority('NBA', d, NOW), d, '', [est()]);
    expect(kinds(r)).toEqual({ points: 'established' });
    expect(r.players[0].shown[0].kind === 'established' && r.players[0].shown[0].trigger).toBe('NOT_PUBLISHED');
  });
  it.each([
    ['listed out', est({ designation: 'OUT' })],
    ['listed questionable', est({ designation: 'QUESTIONABLE' })],
    ['older than the freshness limit', est({ generatedAt: '2026-10-20T00:00:00Z' })],
    ['undated', est({ generatedAt: null })],
    ['with no number', est({ mean: null })],
    ['with a negative number', est({ mean: -2 })],
    ['with no range', est({ p10: null, p90: null })],
    ['with an inverted range', est({ p10: 30, p90: 10 })],
    ['outside its own range', est({ mean: 80 })],
  ])('an established projection %s is not used: no number at all', (_name, e) => {
    const r = game(docOf([row({ dataAsOf: STALE })]), [e]);
    const s = r.players[0].stats[0];
    expect(s.kind).toBe('withheld');
    expect(s.kind === 'withheld' && s.reason).toMatch(/established projection could not be used/);
    expect(r.listed).toHaveLength(0);
  });
  it('a stale feed with no established row at all shows nothing and says so', () => {
    const r = game(docOf([row({ dataAsOf: STALE })]));
    const s = r.players[0].stats[0];
    expect(s.kind === 'withheld' && s.code).toBe('STALE');
    expect(s.kind === 'withheld' && s.reason).toMatch(/no established projection exists/);
  });
  it('no authority, no number: a missing authority withholds rather than guessing', () => {
    const r = nbaGameProjections(null, docOf([row()]), GAME, [est()]);
    expect(r.listed).toHaveLength(0);
    expect(r.withheldTotal).toBe(1);                                              // the one row in the feed
  });
  it('uses the approved wording', () => {
    expect(ESTABLISHED_LABEL).toBe('Established projection');
    expect(ESTABLISHED_TEXT).toBe('The current SIFT forecast is unavailable or not yet published. Showing the established model’s projection instead.');
  });
});
