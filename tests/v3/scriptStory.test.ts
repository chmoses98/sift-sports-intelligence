// The CFB Script Engine story model (src/v3/model/scriptStory.ts, havoc.ts) over a REAL published game: Nebraska at Illinois (evt_8c93e4a2cb16646e4ec2), trimmed from the
// cfb-edge-finder publication of 2026-11-02 (tests/v3/fixtures/cfb-neb-ill-*.json), plus the repo's older CFB fixture for the cases this game does not have.
// What is pinned: the hero is the payload's own words (no invented probability; the V2 claim's historical frequency is a count with its caveat), scenarios carry why / what
// breaks / evidence, scoring lines are research only, totals and halves come from the market list, and "havoc" is never displayed as evidence.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EventDetailDoc, EventResearchDoc, Market } from '../../src/contract/types';
import { isEngine, readEngine, type Engine } from '../../src/lib/scriptEngine';
import { isHavoc, usableFinding } from '../../src/v3/model/havoc';
import { topAdvantages } from '../../src/v3/model/scriptRead';
import {
  headStat, heroExpression, heroOf, likelihoodOf, marketGroups, paceStrip, paysWhenPlain, personnel, scenarioMarkets, scenarios, supportLines, tugDims, whatBreaks,
} from '../../src/v3/model/scriptStory';
import { readCfb } from '../helpers';

const fx = <T,>(n: string): T => JSON.parse(readFileSync(join(__dirname, 'fixtures', n), 'utf-8')) as T;
const research = fx<EventResearchDoc>('cfb-neb-ill-research.json');
const detail = fx<EventDetailDoc>('cfb-neb-ill-detail.json');
const engine = ((): Engine => { const e = readEngine(research); if (!isEngine(e)) throw new Error('no engine'); return e; })();
const markets = new Map<string, Market>(detail.markets.map((m) => [m.kalshi_ticker, m]));
const LSU_UK = 'evt_8c3166866b2bfa530c17';
const lsu = ((): Engine => { const e = readEngine(readCfb<EventResearchDoc>(`explorer/events/${LSU_UK}.json`)); if (!isEngine(e)) throw new Error('no engine'); return e; })();

describe('the hero', () => {
  it('is the payload\'s headline and the primary script, ranked (the engine publishes no probability)', () => {
    const h = heroOf(engine);
    expect(h.headline).toBe(engine.read.headline);
    expect(h.script?.card.role).toBe('Primary');
    expect(engine.scripts.every((s) => s.probability === null)).toBe(true);
    expect(h.script?.likelihood.rank).toBe('Ranked 1 of 2 by matchup evidence');
    expect(h.script?.likelihood.statement).toMatch(/no probability/);
    expect(h.reasons.length).toBeGreaterThanOrEqual(1);
    expect(h.reasons.length).toBeLessThanOrEqual(3);
    expect(new Set(h.reasons).size).toBe(h.reasons.length);
  });

  it('states the V2 control claim\'s history as a count of past games with its caveat, never a percentage or a chance', () => {
    const l = likelihoodOf(engine, engine.scripts[0]);
    expect(l.historical?.text).toBe('Past games with the same claim: Nebraska won 269 of 404 (2021–2025).');
    expect(l.historical?.caveat).toMatch(/not this game’s chance/);
    expect(JSON.stringify(l)).not.toMatch(/\d+%/);
    // the danger script is the other side's path: the control claim's history is not its history
    expect(likelihoodOf(engine, engine.scripts[1]).historical).toBeNull();
  });

  it('picks the engine\'s Best expression among the calibrated contracts that support the primary script', () => {
    const x = heroExpression(engine, markets);
    expect(x).not.toBeNull();
    expect(x!.researchOnly).toBe(false);
    expect(x!.compat).toBe('SUPPORTED');
    expect(x!.labels).toContain('BEST_EXPRESSION');
    expect(x!.e.ticker).toMatch(/^KXNCAAF(GAME|SPREAD)-/);
  });
});

describe('settlement in plain words', () => {
  const e = (w: string) => ({ wins_when: w }) as never;
  it('turns margin thresholds into who wins and by how much', () => {
    expect(paysWhenPlain(e('full game home margin >= -24'), engine)).toBe('Illinois wins, or loses by 24 or fewer');
    expect(paysWhenPlain(e('full game home margin >= 10'), engine)).toBe('Illinois wins by 10 or more');
    expect(paysWhenPlain(e('full game home margin <= -8'), engine)).toBe('Nebraska wins by 8 or more');
    expect(paysWhenPlain(e('full game home margin <= 5'), engine)).toBe('Nebraska wins, or loses by 5 or fewer');
    expect(paysWhenPlain(e('full game home margin between -24 and -8'), engine)).toBe('Nebraska wins by 8 to 24');
  });
  it('falls back to the engine\'s own text for anything else', () => {
    expect(paysWhenPlain(e('full game home points >= 24'), engine)).toBe('Illinois points ≥ 24');
    expect(paysWhenPlain({ wins_when: null } as never, engine)).toBeNull();
  });
});

describe('scenarios', () => {
  const list = scenarios(engine);
  it('are the engine\'s scripts in its order with why, evidence and what breaks them', () => {
    expect(list.map((s) => s.card.role)).toEqual(['Primary', 'Danger']);
    for (const s of list) {
      expect(s.why.length).toBeGreaterThanOrEqual(1);
      expect(s.why.length).toBeLessThanOrEqual(3);
      expect(s.breaks.length).toBeGreaterThanOrEqual(1);
      expect(s.support.length).toBeGreaterThan(0);
    }
  });
  it('name the other path as what breaks the primary, and the primary as what breaks the danger', () => {
    expect(list[0].breaks.some((b) => /^The danger path:/.test(b))).toBe(true);
    expect(list[1].breaks.some((b) => /^The primary script holds instead:/.test(b))).toBe(true);
    expect(whatBreaks(engine, list[0].card).every((b) => b.charAt(0) === b.charAt(0).toUpperCase())).toBe(true);
  });
  it('put the leading offense and the defense it faces side by side, labelled adjusted or raw', () => {
    const lines = supportLines(engine, engine.scripts[0], 4);
    expect(lines[0].team).toBe('Nebraska');
    expect(lines[0].unit).toBe('offense');
    expect(lines[1].team).toBe('Illinois');
    expect(lines[1].unit).toBe('defense');
    expect(lines[0].name).toBe(lines[1].name);
    expect(lines.every((l) => l.basis === 'adjusted' || l.basis === 'raw')).toBe(true);
    expect(headStat(lines)).toMatch(/^Nebraska offense .* adj\. \(#\d+ of 138\) against Illinois defense .* adj\. \(#\d+ of 138\)$/);
  });
});

describe('markets for a scenario', () => {
  const primary = engine.scripts[0];
  const m = scenarioMarkets(engine, primary, markets);
  it('calibrated winner and margin contracts first, each one the script supports', () => {
    expect(m.core.length).toBeGreaterThan(0);
    for (const c of m.core) { expect(c.researchOnly).toBe(false); expect(['SUPPORTED', 'PARTIAL']).toContain(c.compat); expect(c.e.ticker).toMatch(/^KXNCAAF(GAME|SPREAD)-/); }
  });
  it('scoring lines are team totals the descriptive band relates to, research only, one boundary rung per thesis, never a game total the script does not state', () => {
    expect(m.scoring.length).toBeGreaterThan(0);
    for (const p of m.scoring) {
      expect(p.e.authority).toBe('RESEARCH_UNCALIBRATED');
      expect(p.e.ticker).toMatch(/^KXNCAAFTEAMTOTAL-/);
      expect(['covers', 'partly']).toContain(p.relation);
    }
    const theses = m.scoring.map((p) => p.e.thesis);
    expect(new Set(theses).size).toBe(theses.length);
    expect(m.statesTotal).toBe(false);
    expect(m.scoring[0].relation).toBe('covers');
  });
});

describe('totals, team totals and halves', () => {
  const groups = marketGroups(detail.markets);
  it('lists the game total and each team total at the market\'s central line, and the first-half winner; Over is YES and Under is NO of the same contract', () => {
    expect(groups.map((g) => g.key)).toEqual(['game_total', 'tt:Illinois', 'tt:Nebraska', 'h1'].filter((k) => groups.some((g) => g.key === k)));
    const total = groups.find((g) => g.key === 'game_total')!;
    expect(total.title).toMatch(/^Game total \d+(\.\d+)?$/);
    expect(total.options.map((o) => o.side)).toEqual(['YES', 'NO']);
    expect(total.options[0].ticker).toBe(total.options[1].ticker);
    expect(total.note).toMatch(/Research only/);
    const h1 = groups.find((g) => g.key === 'h1')!;
    expect(h1.options.map((o) => o.label).sort()).toEqual(['Illinois', 'Nebraska', 'Tie']);
    expect(h1.note).toMatch(/no first-half script/);
  });
  it('is empty without a market list and lists no quarter market this game does not have', () => {
    expect(marketGroups(undefined)).toEqual([]);
    expect(groups.some((g) => /quarter/i.test(g.title))).toBe(false);
  });
});

describe('pace and efficiency', () => {
  it('shows both teams, every cell labelled adjusted or raw with its rank, for offense and defense', () => {
    for (const unit of ['offense', 'defense'] as const) {
      const rows = paceStrip(engine, unit);
      expect(rows.length).toBeGreaterThanOrEqual(4);
      for (const r of rows) for (const c of [r.away, r.home]) { if (c) { expect(['adjusted', 'raw']).toContain(c.basis); expect(c.rank).toBeGreaterThan(0); } }
    }
    expect(paceStrip(engine).map((r) => r.id)).toContain('plays_per_game');
  });
  it('is empty when the metric tables are not on the page, never guessed', () => {
    const bare = { ...engine, registry: {} } as Engine;
    expect(paceStrip(bare)).toEqual([]);
  });
  it('carries the personnel the engine published: quarterback and record, and availability only when it is not simply observed', () => {
    const p = personnel(engine);
    expect(p.map((x) => x.team)).toEqual(['Nebraska', 'Illinois']);
    expect(p[0].line).toMatch(/^QB .* · \d+-\d+ in the window$/);
    const flagged = personnel({ ...engine, confidence: { ...engine.confidence, availability_status: { home: 'UNCERTAIN', away: 'OBSERVED' } } } as Engine);
    expect(flagged[1].line).toMatch(/availability uncertain/);
    expect(flagged[0].line).not.toMatch(/availability/);
  });
});

describe('havoc is never evidence', () => {
  it('the payload carries it (registry, tables, a disruption finding), and none of it reaches a displayed advantage, finding, evidence line or strip cell', () => {
    expect(JSON.stringify(engine.registry)).toMatch(/havoc/);
    expect(lsu.findings.some((f) => !usableFinding(f))).toBe(true);
    for (const e of [engine, lsu]) {
      const top = topAdvantages(e, 6);
      expect(JSON.stringify(top)).not.toMatch(/havoc/i);
      for (const s of scenarios(e)) expect(JSON.stringify([s.why, s.breaks, s.support, s.head])).not.toMatch(/havoc/i);
      expect(JSON.stringify(paceStrip(e))).not.toMatch(/havoc/i);
      expect(JSON.stringify(tugDims(e, ['sustained_efficiency', 'rushing', 'passing', 'explosiveness', 'disruption', 'finishing', 'scoring']))).not.toMatch(/havoc/i);
    }
    expect(isHavoc('havoc_allowed')).toBe(true);
    expect(isHavoc('sack_rate_allowed')).toBe(false);
  });
  it('a dimension that blends havoc into its aggregate is shown through its other components only', () => {
    const d = tugDims(engine, ['disruption']);
    expect(d).toHaveLength(1);
    expect(d[0].components?.length).toBeGreaterThan(0);
    expect(d[0].away).toBeNull();
    expect(d[0].components!.map((c) => c.name).join(' ')).not.toMatch(/havoc/i);
  });
});
