// Slate Priorities on the REAL NFL week-5 publication (nfl-edge-finder handicap-reports, generated
// 2026-10-08T00:43Z; tests/fixtures/nfl-week5 keeps each upcoming game's full-game lines, model prices, game
// script inputs, model view and market-implied view, trimmed of players and props). Every section must be chosen
// by its documented rule from that evidence, and fail closed when the evidence is not there.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BoardDoc, EventResearchDoc, Market, Recommendation } from '../src/contract/types';
import { quoteView, type QuoteView } from '../src/live/overlay';
import { HOLDS_MIN_COVERAGE, HOLDS_MIN_GAP, LOOK_MIN_Z, slatePriorities, WATCH_MIN_Z, type PriorityInput } from '../src/lib/priorities';
import { gameScripts } from '../src/lib/scripts';

const DIR = join(__dirname, 'fixtures', 'nfl-week5');
const board = JSON.parse(readFileSync(join(DIR, 'board.json'), 'utf-8')) as BoardDoc;
const research = new Map<string, EventResearchDoc>(
  readdirSync(DIR).filter((f) => f.startsWith('evt_')).map((f) => [f.replace('.json', ''), JSON.parse(readFileSync(join(DIR, f), 'utf-8'))]),
);
/** Five minutes after the publication's market capture: its prices are FRESH. */
const NOW = Date.parse('2026-10-08T00:45:00Z');
const base = (over: Partial<PriorityInput> = {}): PriorityInput => ({ items: board.items, research, recommendations: [], quote: (m) => quoteView(m), now: NOW, sport: 'NFL', ...over });

describe('slate priorities (real week 5)', () => {
  const p = slatePriorities(base());

  it('only draws from upcoming games that have not kicked off', () => {
    expect(board.items.some((i) => i.status === 'FINAL')).toBe(true);
    expect(p.eligible).toBe(15);
    expect(p.scriptsMissing).toBe(0);
  });

  it('Top SIFT Edge fails closed: the publication recommends nothing this week', () => {
    expect(board.items.every((i) => i.recommendations_count === 0)).toBe(true);
    expect(p.edge.kind).toBe('none');
    expect(p.edge.kind !== 'edge' && p.edge.title).toBe('No strong SIFT edge yet');
    // "Prices are close" is said only when every game-line gap is under 5 points. This week one reaches 5.5,
    // so the reason given is the model's research-only status instead.
    expect(p.maxGap!).toBeCloseTo(0.055, 3);
    expect(p.edge.kind !== 'edge' && p.edge.text).toMatch(/research-only/);
    expect(p.edge.kind !== 'edge' && p.edge.text).not.toMatch(/close to/);
  });

  it('Works in Multiple Scripts is the documented survivor rule, verified against the source', () => {
    expect(p.holds.kind).toBe('pick');
    if (p.holds.kind !== 'pick') return;
    const h = p.holds.item;
    expect(h.coverage).toBeGreaterThanOrEqual(HOLDS_MIN_COVERAGE);
    expect(h.full).toBeGreaterThanOrEqual(2);
    // The scripts are final-margin buckets: a moneyline or spread wins in at most two of the four, which is why the
    // section says "multiple", never "most".
    expect(h.full).toBeLessThanOrEqual(2);
    expect(h.of).toBe(4);
    expect(h.gap).toBeGreaterThanOrEqual(HOLDS_MIN_GAP);
    expect(h.ask).toBeGreaterThanOrEqual(0.1);
    expect(h.ask).toBeLessThanOrEqual(0.9);
    // Model price and quote come straight from the publication's rows for that market.
    const r = research.get(h.game.eventId)!;
    const proj = r.projections.find((x) => x.market_id === h.market.market_id)!;
    expect(h.model).toBe(proj.fair_probability);
    expect(h.mid).toBeCloseTo(((h.market.yes_bid ?? 0) + (h.market.yes_ask ?? 0)) / 2, 6);
    expect({ game: `${h.game.away}@${h.game.home}`, label: h.label, cov: Math.round(h.coverage * 100), wins: h.wins.map((w) => w.name), team: h.team }).toMatchSnapshot();
  });

  it('Game to Watch and Worth a Look are slate standouts, on different games, with plain reasons', () => {
    expect(p.watch).not.toBeNull();
    expect(p.watch!.z).toBeGreaterThanOrEqual(WATCH_MIN_Z);
    for (const l of p.look) expect(l.z).toBeGreaterThanOrEqual(LOOK_MIN_Z);
    const ids = [p.holds.kind === 'pick' ? p.holds.item.game.eventId : null, p.watch!.game.eventId, ...p.look.map((l) => l.game.eventId)].filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    const all = [p.watch!, ...p.look];
    for (const w of all) expect(w.reason).not.toMatch(/z-score|EPA|EV\b|implied|survivab|game script/i);
    // The lopsided-game signal reads the publication's own blowout share.
    const tbdal = research.get(p.watch!.game.eventId)!;
    if (p.watch!.signal === 'blowout') expect(p.watch!.reason).toContain(`${Math.round((tbdal.extensions as { game_script_inputs: { game_environment: { p_blowout_17plus: number } } }).game_script_inputs.game_environment.p_blowout_17plus * 100)}%`);
    expect(p.watch!.lead?.name).toBe(gameScripts(tbdal)!.scripts[0].name);
    expect(all.map((w) => ({ game: `${w.game.away}@${w.game.home}`, signal: w.signal, tag: w.tag, reason: w.reason }))).toMatchSnapshot();
  });

  it('stale quotes fail closed: no survivor is shown on a stale price', () => {
    const later = slatePriorities(base({ now: NOW + 3 * 3600e3 }));
    expect(later.holds.kind).toBe('stale');
    // Research-only sections still stand: they describe the simulation, not a price.
    expect(later.watch).not.toBeNull();
  });

  it('kicked-off and finished games never surface', () => {
    const tnf = board.items.find((i) => i.status === 'SCHEDULED')!;
    const after = slatePriorities(base({ now: Date.parse(tnf.start_time_utc) + 60_000, quote: (m) => ({ ...quoteView(m), observedAt: new Date(Date.parse(tnf.start_time_utc)).toISOString() }) }));
    const shown = [after.holds.kind === 'pick' ? after.holds.item.game.eventId : null, after.watch?.game.eventId, ...after.look.map((l) => l.game.eventId)];
    expect(shown).not.toContain(tnf.event_id);
    expect(after.eligible).toBe(14);
  });

  it('a missing recommendations file is said, not hidden', () => {
    const p2 = slatePriorities(base({ recommendations: null }));
    expect(p2.edge.kind).toBe('unavailable');
  });

  it('a real recommendation with a fresh price under its limit becomes the Top SIFT Edge; a stale one waits', () => {
    const h = p.holds.kind === 'pick' ? p.holds.item : null;
    const m = h!.market as Market;
    const rec: Recommendation = { recommendation_id: 'rec_test', market_id: m.market_id, event_id: h!.game.eventId, selection: 'YES', status: 'ACTIVE', authority: 'MANUAL', research_only: false, fair_probability: 0.7, bet_up_to_price: 0.66, created_at: '2026-10-08T00:40:00Z' };
    const e = slatePriorities(base({ recommendations: [rec] }));
    expect(e.edge.kind).toBe('edge');
    const stale = slatePriorities(base({ recommendations: [rec], quote: (mm) => ({ ...quoteView(mm), observedAt: '2026-10-07T12:00:00Z' }) as QuoteView }));
    expect(stale.edge.kind).toBe('stale');
    const research = slatePriorities(base({ recommendations: [{ ...rec, research_only: true }] }));
    expect(research.edge.kind).toBe('none');
  });

  it('a slate with no scripts shows no standouts rather than inventing them', () => {
    const bare = new Map([...research].map(([k, r]) => [k, { ...r, extensions: {} } as EventResearchDoc]));
    const p3 = slatePriorities(base({ research: bare }));
    expect(p3.scriptsMissing).toBe(15);
    expect(p3.holds.kind).toBe('none');
    expect(p3.watch).toBeNull();
    expect(p3.look).toEqual([]);
  });
});
