// @vitest-environment node
// Matchup Intelligence against the REAL published DAL at PHI research and detail documents (fixtures/real, `game` family): the plain-English
// advantage sentences, the section gating (a section exists only when its data does), the projection surface (model and market kept apart,
// an honest absent state that names why) and the scripts. Nothing is stubbed; documents the publication does not carry are removed
// from a copy of the real one to prove the section disappears.
import { beforeAll, describe, expect, it } from 'vitest';
import type { EventDetailDoc, EventResearchDoc } from '../../src/contract/types';
import { buildGameIntel, hasScriptEngine, SECTION_ORDER } from '../../src/v3/data/intel/build';
import { readEnvironment } from '../../src/v3/data/intel/environment';
import { approvedModel, modelLean, readProjection } from '../../src/v3/data/intel/projection';
import { readScriptIntel } from '../../src/v3/data/intel/scriptIntel';
import { ranksFromResearch, unitsFromResearch } from '../../src/v3/data/intel/units';
import { advantageOf, readRow, strengthOf, topAdvantages, UNIT_COPY } from '../../src/v3/model/intel/advantages';
import { NFL_UNITS, unitRow } from '../../src/v3/data/research/matchup';
import type { V3Game, V3Team } from '../../src/v3/model/types';
import { openBundle } from '../../scripts/v3-fixtures/lib.mjs';

const B = 'https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/handicap-reports/app/latest';
const EVT = 'evt_cd335cc6d5f5b8d8f7b3';
let research: EventResearchDoc, detail: EventDetailDoc;

const team = (id: string, nick: string, name: string): V3Team => ({ id, slug: 'nfl', sport: 'NFL', name, nick, abbr: id, logo: null, colors: ['#000', '#fff'] });
const game = (over: Partial<V3Game> = {}): V3Game => ({
  key: `nfl:${EVT}`, slug: 'nfl', sport: 'NFL', eventId: EVT, league: 'NFL', phase: 'pregame', startMs: Date.parse('2026-10-27T00:15:00Z'),
  away: team('DAL', 'Cowboys', 'Dallas Cowboys'), home: team('PHI', 'Eagles', 'Philadelphia Eagles'), score: null, lines: [], signals: 0, provenance: 'publication', ...over,
});
const NOW = Date.parse('2026-10-26T23:25:00Z');
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

beforeAll(async () => {
  const fam = openBundle().family('game');
  const read = async (p: string) => JSON.parse(Buffer.from((await fam.get(`${B}/${p}`))!.body).toString('utf8'));
  research = await read(`explorer/events/${EVT}.json`);
  detail = await read(`event_detail/${EVT}.json`);
});

describe('top advantages in plain English', () => {
  it('reads opponent-adjusted unit ranks from the research document alone, and the ranks are the published ones', () => {
    const u = unitsFromResearch(game(), research)!;
    expect(u).not.toBeNull();
    const pass = u.rowsAway.find((r) => r.unit.id === 'pass')!;
    // DAL pass offense 7th of 28 against PHI pass defense 10th of 28 (published matchup rows)
    expect([pass.o.rank, pass.o.n, pass.d.rank, pass.d.n]).toEqual([7, 28, 10, 28]);
    const back = u.rowsHome.find((r) => r.unit.id === 'pass')!;
    expect([back.o.rank, back.d.rank]).toEqual([20, 28]);
  });

  it('writes the sentence from the published ranks (template: strength, unit, both ranks of N)', () => {
    const u = unitsFromResearch(game(), research)!;
    const names = { nick: (c: string) => (c === 'DAL' ? 'Cowboys' : 'Eagles') };
    const a = advantageOf(u.rowsHome.find((r) => r.unit.id === 'pass')!, names)!;
    expect(a.team).toBe('PHI');
    expect(a.headline).toBe('The Eagles have a modest passing advantage.');
    expect(a.detail).toBe('Their offense ranks 20th of 28 in EPA per dropback, while the Cowboys’ defense ranks 28th of 28 in EPA allowed per dropback.');
    expect(a.implies).toMatch(/^If it holds, the Eagles should be able to/);
    expect(a.meaning).toMatch(/EPA/);
    expect(a.why.length).toBeGreaterThan(20);
    expect(a.bars.map((b) => b.rankText)).toEqual(['20th of 28', '28th of 28']);
    // the advantaged side's bar comes first
    expect(a.bars[0].role).toBe('off');
  });

  it('names a defense advantage as a defense unit and orders its bars defense first', () => {
    const u = unitsFromResearch(game(), research)!;
    const def = [...u.rowsAway, ...u.rowsHome].find((r) => r.tilt === 'def');
    if (!def) return; // this slate has none; the synthetic case below covers it
    const a = advantageOf(def, { nick: (c) => c })!;
    expect(a.bars[0].role).toBe('def');
    expect(a.headline).not.toMatch(/ on defense\.$/);
  });

  it('a synthetic defense-leads row reads as that defense’s advantage', () => {
    const mk = (rank: number) => ({ metrics: new Map([[ 'adj_def_db_epa', { metricId: 'met_nfl.adj_def_db_epa', id: 'adj_def_db_epa', unit: null, windows: { ADJ_RIDGE: { value: -0.1, adjusted: null, rank, n: 28, percentile: null, rankingId: null, higherIsBetter: false, sample: null, asOf: null, display: null, universe: null } } } ], [ 'adj_off_db_epa', { metricId: 'met_nfl.adj_off_db_epa', id: 'adj_off_db_epa', unit: null, windows: { ADJ_RIDGE: { value: 0.1, adjusted: null, rank: 25, n: 28, percentile: null, rankingId: null, higherIsBetter: true, sample: null, asOf: null, display: null, universe: null } } } ]]) });
    const row = unitRow(NFL_UNITS.find((u) => u.id === 'pass')!, 'AAA', 'BBB', mk(1), mk(12))!;
    expect(row.tilt).toBe('def');
    const a = advantageOf(row, { nick: (c) => (c === 'AAA' ? 'Alphas' : 'Betas') })!;
    expect(a.headline).toBe('The Betas have a strong pass-defense advantage.');
    expect(a.detail).toBe('Their defense ranks 12th of 28 in EPA allowed per dropback, while the Alphas’ offense ranks 25th of 28 in EPA per dropback.');
    expect(a.bars[0]).toMatchObject({ role: 'def', rankText: '12th of 28' });
  });

  it('picks at most three, widest first, only directional gaps, never a unit with no copy', () => {
    const u = unitsFromResearch(game(), research)!;
    const top = topAdvantages(u.rowsAway, u.rowsHome, { nick: (c) => c }, 3);
    expect(top.length).toBeGreaterThan(0);
    expect(top.length).toBeLessThanOrEqual(3);
    const gaps = top.map((a) => Math.abs(a.row.gap));
    expect([...gaps].sort((x, y) => y - x)).toEqual(gaps);
    expect(top.every((a) => a.row.tilt !== 'even')).toBe(true);
    expect(NFL_UNITS.every((un) => UNIT_COPY[un.id])).toBe(true);
  });

  it('strength words follow the displayed percentile gap bands', () => {
    expect([16, 30, 31, 55, 56, -80].map(strengthOf)).toEqual(['modest', 'modest', 'strong', 'strong', 'major', 'major']);
  });

  it('an Even unit reads as "about even" with both ranks, and is never promoted to an advantage', () => {
    const u = unitsFromResearch(game(), research)!;
    const even = [...u.rowsAway, ...u.rowsHome].find((r) => r.tilt === 'even')!;
    expect(advantageOf(even, { nick: (c) => c })).toBeNull();
    const rr = readRow(even, { nick: (c) => c })!;
    expect(rr.headline).toMatch(/about even in/);
    expect(rr.detail).toMatch(/ranks \d+(st|nd|rd|th) of 28 in/);
  });

  it('the readable view contains no unexplained signed gap number', () => {
    const u = unitsFromResearch(game(), research)!;
    const text = [...u.rowsAway, ...u.rowsHome].map((r) => { const x = readRow(r, { nick: (c) => c })!; return `${x.headline} ${x.detail} ${x.bars.map((b) => `${b.label} ${b.rankText}`).join(' ')}`; }).join(' ');
    expect(text).not.toMatch(/[+−-]\d{2}\b/);
  });
});

describe('the projection surface', () => {
  it('shows the SIFT model view as the publication states it, labelled research, with version, as-of and its own caveat', () => {
    const p = readProjection(research, game());
    expect(p.model).toMatchObject({ origin: 'research', version: 'shadow-0.4.0', kind: 'research simulation' });
    expect(p.model!.awayScore).toBeCloseTo(24.6, 5);
    expect(p.model!.homeScore).toBeCloseTo(19.7, 5);
    expect(p.model!.awayWin).toBeCloseTo(0.67125, 5);
    expect(p.model!.asOf).toBe('2026-10-26T18:23:01.451135+00:00');
    expect(p.model!.caveat).toMatch(/redundant to the closing market/);
    expect(p.absent).toBeNull();
    expect(modelLean(p.model!)).toBe('away');
  });

  it('keeps the market view separate (Kalshi midpoints, labelled not executable) and never copies one into the other', () => {
    const p = readProjection(research, game());
    expect(p.market).toMatchObject({ awayWin: 0.675, homeWin: 0.335, total: 44.625 });
    expect(p.market!.label).toMatch(/not executable/);
    expect(p.model!.awayWin).not.toBe(p.market!.awayWin);
  });

  it('with no model view it shows none, names why, and still reads the market', () => {
    const r = clone(research);
    delete (r.extensions as Record<string, unknown>).model_view;
    const p = readProjection(r, game());
    expect(p.model).toBeNull();
    expect(p.absent).toMatch(/no SIFT model view/i);
    expect(p.market).not.toBeNull();
  });

  it('with no research document there is no model, no market and a reason', () => {
    const p = readProjection(null, game());
    expect(p).toMatchObject({ model: null, market: null });
    expect(p.absent).toMatch(/not available/);
  });

  it('a team code the publication does not use yields no number rather than a wrong one', () => {
    const p = readProjection(research, game({ away: team('XXX', 'X', 'X'), home: team('YYY', 'Y', 'Y') }));
    expect(p.model).toBeNull();
    expect(p.market).toBeNull();
  });

  it('an approved projection (the authority’s answer) is labelled approved, carries its 80% range, and publishes no win probability', () => {
    const m = approvedModel({ away: { mean: 27.1, p10: 17, p90: 38 }, home: { mean: 20.2, p10: 10, p90: 31 }, asOf: '2026-10-26T12:00:00Z', version: 'foundation-1' });
    expect(m).toMatchObject({ origin: 'approved', awayWin: null, homeWin: null, version: 'foundation-1' });
    expect(m.range!.away).toEqual([17, 38]);
    expect(readProjection(research, game(), { away: { mean: 27.1, p10: null, p90: null }, home: { mean: 20.2, p10: null, p90: null }, asOf: null, version: null }).model!.origin).toBe('approved');
  });
});

describe('section gating: a section exists only when its data does', () => {
  it('the real DAL at PHI game has every section, in the pregame order', () => {
    const i = buildGameIntel({ g: game(), research, detail, now: NOW });
    expect(i.present).toEqual(SECTION_ORDER.filter((s) => i.present.includes(s)));
    for (const s of ['projection', 'advantages', 'comparison', 'notes', 'environment', 'script'] as const) expect(i.present, s).toContain(s);
    expect(i.advantages.length).toBeGreaterThan(0);
    expect(i.comparison?.kind).toBe('units');
  });

  it('no research document: only the projection card (with its reason) and nothing else', () => {
    const i = buildGameIntel({ g: game(), research: null, detail, now: NOW });
    expect(i.present).toEqual(['projection']);
    expect(i.projection.absent).toBeTruthy();
    expect(i.gaps).toEqual([]);
  });

  it('removing the injury list removes the notes section and records why', () => {
    const r = clone(research);
    r.context.injuries = [];
    const i = buildGameIntel({ g: game(), research: r, detail, now: NOW });
    expect(i.present).not.toContain('notes');
    expect(i.gaps.find((x) => x.section === 'notes')?.reason).toMatch(/no injuries/);
  });

  it('removing the matchup rows removes advantages and the comparison', () => {
    const r = clone(research);
    r.matchup = [];
    const i = buildGameIntel({ g: game(), research: r, detail, now: NOW });
    expect(i.present).not.toContain('advantages');
    expect(i.present).not.toContain('comparison');
    expect(i.present).not.toContain('mismatches');
  });

  it('removing the simulation inputs removes the simulated scoring lines and (with no thesis) the script', () => {
    const r = clone(research);
    delete (r.extensions as Record<string, unknown>).game_script_inputs;
    const i = buildGameIntel({ g: game(), research: r, detail, now: NOW });
    // the season scoring ranks in the matchup rows remain; the simulated lines are gone
    expect(i.environment!.lines.every((l) => l.source === 'season')).toBe(true);
    expect(i.present).not.toContain('script');
  });

  it('a published thesis alone is enough for a script section', () => {
    const r = clone(research);
    delete (r.extensions as Record<string, unknown>).game_script_inputs;
    const d = clone(detail);
    d.theses = [{ ...d.theses[0], primary_game_script: 'Dallas leans on the pass; Philadelphia answers on the ground.', supporting_factors: ['Dallas pass offense ranks 7th'], opposing_factors: ['Philadelphia rush offense ranks 20th'] }];
    const s = readScriptIntel(r, d)!;
    expect(s.cards[0]).toMatchObject({ role: 'expected', source: 'thesis', evidence: ['Dallas pass offense ranks 7th'], counter: ['Philadelphia rush offense ranks 20th'] });
  });

  it('a sport with no unit declaration gets the publication’s own rank rows or nothing, never the NFL units', () => {
    const g = game({ slug: 'nba', sport: 'NBA', away: { ...team('DAL', 'Mavs', 'Dallas Mavericks'), slug: 'nba', sport: 'NBA' }, home: { ...team('PHI', 'Sixers', 'Philadelphia 76ers'), slug: 'nba', sport: 'NBA' } });
    const i = buildGameIntel({ g, research, detail, now: NOW });
    expect(i.advantages).toEqual([]);
    expect(i.mismatches).toEqual([]);
    expect(i.comparison?.kind).toBe('ranks');
  });

  it('a CFB game that carries the Script Engine is left to that view (no projection, no script from here)', () => {
    const r = clone(research);
    (r.extensions as Record<string, unknown>).script_engine = { status: 'OK' };
    expect(hasScriptEngine(r)).toBe(true);
    const i = buildGameIntel({ g: game(), research: r, detail, now: NOW });
    expect(i.present).not.toContain('projection');
    expect(i.present).not.toContain('script');
    expect(i.present).toContain('advantages');
  });
});

describe('scripts, environment and notes', () => {
  it('expected, alternate and danger are distinct simulated scripts, most likely first, with evidence and a counterargument', () => {
    const s = readScriptIntel(research, detail)!;
    expect(s.cards[0].role).toBe('expected');
    expect(new Set(s.cards.map((c) => c.title)).size).toBe(s.cards.length);
    expect(s.cards.map((c) => c.role)).toEqual(['expected', 'alternate', 'danger'].filter((r) => s.cards.some((c) => c.role === r)));
    for (const c of s.cards) { expect(c.share).toBeGreaterThan(0); expect(c.evidence.length).toBeGreaterThan(0); expect(c.counter.length).toBeGreaterThan(0); }
    expect(s.cards[0].share!).toBeGreaterThanOrEqual(s.cards[1].share!);
    expect(s.basis).toMatch(/not calibrated/);
  });

  it('the close-game split stays pooled while the publication’s gate says SUPPRESS', () => {
    const s = readScriptIntel(research, detail)!;
    expect(s.cards.some((c) => /Close One/.test(c.title))).toBe(false);
  });

  it('the scoring environment is the published simulation and season ranks, each tagged by source', () => {
    const e = readEnvironment(research, game())!;
    expect(e.lines.find((l) => l.id === 'total')).toMatchObject({ source: 'simulation', text: expect.stringContaining('45.6') });
    expect(e.lines.find((l) => l.id === 'pace')!.text).toMatch(/Cowboys 65, Eagles 61\.5/);
    expect(e.lines.find((l) => l.id === 'pf')).toMatchObject({ source: 'season' });
    expect(e.notSimulated.length).toBeGreaterThan(0);
  });

  it('the notes are the publication’s injury news with its source, age and caveat', () => {
    const i = buildGameIntel({ g: game(), research, detail, now: NOW });
    expect(i.notes!.items.length).toBeGreaterThan(0);
    expect(i.notes!.items.length).toBeLessThanOrEqual(5);
    expect(i.notes!.source).toMatchObject({ name: expect.stringMatching(/ESPN/i) });
    expect(i.notes!.items.every((n) => n.level === 'critical' || n.level === 'high' || n.level === 'medium')).toBe(true);
  });

  it('player matchups map listed props to a unit with a published defense rank', () => {
    const i = buildGameIntel({ g: game(), research, detail, now: NOW });
    expect(i.mismatches.length).toBeGreaterThan(0);
    for (const k of i.mismatches) { expect(k.oppSide.n).toBe(28); expect(['DAL', 'PHI']).toContain(k.oppTeam); expect(k.team).not.toBe(k.oppTeam); }
  });

  it('research ranks equal the ranks a team profile would give (same source rule)', () => {
    const r = ranksFromResearch(research)!;
    expect(r.away.metrics.get('adj_def_db_epa')!.windows.ADJ_RIDGE).toMatchObject({ rank: 28, n: 28, higherIsBetter: false });
  });
});
