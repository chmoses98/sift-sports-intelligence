// The CFB Script Engine on Sift: the payload decodes faithfully, the game page shows the three questions
// separately, and nothing on it turns script survival into a probability or a price verdict.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EventResearchDoc } from '../src/contract/types';
import { clearAsyncMemo } from '../src/data/hooks';
import { routes } from '../src/lib/routes';
import {
  groupedSurvivors,
  isEngine,
  LABEL_WORD,
  metricAt,
  readEngine,
  survivalText,
  survivorExpressions,
  winsWhenText,
  type Engine,
} from '../src/lib/scriptEngine';
import { GameRoute } from '../src/views/Game';
import { readCfb, useDiskFetch } from './helpers';
import { renderScreen } from './render';

const UGA_ALA = 'evt_93e12676ae9337017c63';
const LSU_UK = 'evt_8c3166866b2bfa530c17';
const ALBY_STON = 'evt_776097ba6eef448fb340';

function engineOf(id: string): Engine {
  const e = readEngine(readCfb<EventResearchDoc>(`explorer/events/${id}.json`));
  if (!isEngine(e)) throw new Error('fixture event has no engine payload');
  return e;
}

beforeAll(() => {
  useDiskFetch();
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
});
beforeEach(() => {
  clearAsyncMemo();
  localStorage.clear();
});

describe('payload decoding', () => {
  it('decodes every metric row with every field the contract requires', () => {
    const e = engineOf(UGA_ALA);
    for (const side of ['home', 'away'] as const) {
      const rows = Object.values(e.teams[side].metrics);
      expect(rows.length).toBeGreaterThan(40);
      for (const r of rows) {
        expect(r).toHaveProperty('raw');
        expect(r).toHaveProperty('adjusted');
        expect(typeof r.adjusted_available).toBe('boolean');
        expect(r.universe_size).toBeGreaterThan(100);
        expect(['higher_is_better', 'lower_is_better']).toContain(r.direction);
        expect(typeof r.games).toBe('number');
        expect(['OK', 'THIN_SAMPLE', 'PRIOR_HEAVY', 'UNAVAILABLE', 'NOT_ADJUSTED']).toContain(r.quality);
        if (!r.adjusted_available) expect(r.adjusted).toBeNull(); // never a silent substitution
        if (r.games > 0) expect(r.source).toMatch(/espn/);
      }
      expect(e.teams[side].window?.type).toBe('season_to_date');
    }
  });

  it('resolves every finding reference to a published metric', () => {
    const e = engineOf(LSU_UK);
    for (const f of e.findings) for (const ref of f.metric_refs) expect(metricAt(e, ref), ref).not.toBeNull();
  });

  it('keeps scripts ranked, with no probability anywhere', () => {
    for (const id of [UGA_ALA, LSU_UK]) {
      const e = engineOf(id);
      expect(e.scripts.map((s) => s.rank)).toEqual(e.scripts.map((_, i) => i + 1));
      expect(e.scripts[0].role).toBe('PRIMARY');
      for (const s of e.scripts) expect(s.probability).toBeNull();
      expect(e.generation.market_blind).toBe(true);
    }
  });

  it('reads compatibility per script and survival as a count, never a percentage', () => {
    const e = engineOf(LSU_UK);
    const x = survivorExpressions(e)[0];
    expect(x.compat).toHaveLength(e.scripts.length);
    expect(survivalText(x.survival)).toMatch(/^\d+\/\d+/);
    expect(survivalText(x.survival)).not.toContain('%');
  });

  it('collapses ladder rungs that survive exactly the same scripts', () => {
    const e = engineOf(UGA_ALA);
    const grouped = groupedSurvivors(e);
    const keys = grouped.map((g) => `${g.thesis}|${g.compat.join('')}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(grouped.reduce((n, g) => n + 1 + g.similar, 0)).toBe(survivorExpressions(e).length);
  });

  it('states settlement conditions in team names', () => {
    const e = engineOf(LSU_UK);
    const text = winsWhenText(survivorExpressions(e)[0], e)!;
    expect(text).not.toMatch(/full game|home margin|away points/);
    expect(text).toMatch(/Kentucky|LSU|total points/);
  });

  it('an unmatched game explains itself instead of carrying a read', () => {
    const e = readEngine(readCfb<EventResearchDoc>(`explorer/events/${ALBY_STON}.json`));
    expect(e && !isEngine(e) && e.reason).toMatch(/identity/);
  });

  it('keeps every total and team-total contract research only', () => {
    const e = engineOf(UGA_ALA);
    expect(e.scoringResearchOnly).toBe(true);
    const scoring = e.expressions.filter((x) => x.thesis.startsWith('total:') || x.thesis.startsWith('team_scoring:'));
    expect(scoring.length).toBeGreaterThan(10);
    for (const x of scoring) {
      expect(x.authority).toBe('RESEARCH_UNCALIBRATED');
      expect(x.compat.every((c) => c === 'RESEARCH_UNCALIBRATED' || c === 'NEUTRAL')).toBe(true);
      expect(x.labels).not.toContain('BEST_EXPRESSION');
      expect(x.labels).not.toContain('MULTI_SCRIPT');
      expect(x.survival.supported).toBe(0);
    }
    // What the uncalibrated band would have said is kept, as research.
    expect(scoring.some((x) => x.research.includes('SUPPORTED'))).toBe(true);
    const featured = groupedSurvivors(e).map((x) => x.thesis);
    expect(featured.length).toBeGreaterThan(0);
    expect(featured.some((t) => t.startsWith('total:') || t.startsWith('team_scoring:'))).toBe(false);
    // The football conclusion stays: the primary still describes an elevated scoring environment.
    expect(e.scripts[0].outcome_shape.total_environment).toBe('ELEVATED');
    expect(e.scripts[0].outcome_shape.band_authority?.total_points).toBe('UNCALIBRATED_DESCRIPTIVE');
    expect(e.scripts[0].outcome_shape.band_authority?.home_margin).toBe('ARCHETYPE_DEFINITION');
  });

  it('a one-score claim rests on independent closeness evidence, never on the scoring environment', () => {
    const e = engineOf(UGA_ALA);
    for (const sc of e.scripts) {
      for (const st of sc.causal_chain.filter((x) => /one score|separates/.test(x.step))) {
        expect(st.findings.every((f) => f === 'EVEN_MATCHUP' || f === 'NARROW_EFFICIENCY_GAP')).toBe(true);
      }
    }
    expect(e.scripts[0].outcome_shape.bands.home_margin).toEqual([-8, 8]);
    expect(e.findings.map((f) => f.code)).toContain('EVEN_MATCHUP');
  });

  it('every active margin band names non-scoring, non-pace football evidence', () => {
    const forbidden = new Set([
      'HIGH_SCORING_ENVIRONMENT', 'LOW_SCORING_ENVIRONMENT', 'HIGH_POSSESSION_ENVIRONMENT',
      'LOW_POSSESSION_ENVIRONMENT', 'HOME_SCORING_ADVANTAGE', 'AWAY_SCORING_ADVANTAGE',
    ]);
    let checked = 0;
    for (const id of [UGA_ALA, LSU_UK]) {
      const e = engineOf(id);
      const codes = new Set(e.findings.map((f) => f.code));
      for (const sc of e.scripts) {
        const ev = sc.outcome_shape.margin_authority_evidence ?? [];
        if (sc.outcome_shape.bands.home_margin) {
          checked += 1;
          expect(ev.length).toBeGreaterThan(0);
          for (const c of ev) {
            expect(forbidden.has(c)).toBe(false);
            expect(codes.has(c)).toBe(true);
          }
        } else {
          expect(ev).toEqual([]);
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4);
    expect(engineOf(UGA_ALA).scripts[0].outcome_shape.margin_authority_evidence).toEqual(['EVEN_MATCHUP']);
  });

  it('the label vocabulary has no price verdict in it', () => {
    const words = Object.values(LABEL_WORD).join(' ').toLowerCase();
    for (const banned of ['+ev', 'edge', 'value', 'lock', 'probability', 'bet up to']) expect(words).not.toContain(banned);
  });
});

describe('CFB game page', () => {
  it('answers the matchup, the scripts and the bets separately, in that order', async () => {
    renderScreen(routes.game('cfb', UGA_ALA), '/:sport/game/:eventId', <GameRoute />, {}, 'cfb');
    const read = await screen.findByRole('heading', { name: /SIFT Read/ }, { timeout: 4000 });
    const scripts = screen.getByRole('heading', { name: /Likely Game Scripts/ });
    const bets = screen.getByRole('heading', { name: /Bets That Survive Multiple Scripts/ });
    expect(read.compareDocumentPosition(scripts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(scripts.compareDocumentPosition(bets) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Matchup Edges/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Data Confidence/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Players' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Props' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Scripts' })).toBeTruthy();
    const page = document.querySelector('.game--engine')!.textContent!.toLowerCase();
    expect(page).not.toMatch(/\d+% likely|\+ev|fair value|win prob/);
  });

  it('reports a market disagreement beside the read as an observation, not evidence of value', async () => {
    const e = engineOf(UGA_ALA);
    const total = e.disagreement?.flags.find((f) => f.kind === 'TOTAL');
    expect(total?.evidence_of_value).toBe(false);
    renderScreen(routes.game('cfb', UGA_ALA), '/:sport/game/:eventId', <GameRoute />, {}, 'cfb');
    const notes = await screen.findAllByRole('note', {}, { timeout: 4000 });
    const disagreement = notes.find((n) => /Market disagreement\./.test(n.textContent ?? ''))!;
    expect(disagreement.textContent).toMatch(/never obeyed/);
    expect(disagreement.textContent).toMatch(/not evidence of value/);
    expect(e.scripts[0].archetype).toBe('COMPETITIVE_SHOOTOUT');
  });

  it('shows the scoring environment without implying a scoring bet', async () => {
    renderScreen(routes.game('cfb', UGA_ALA), '/:sport/game/:eventId', <GameRoute />, {}, 'cfb');
    const notes = await screen.findAllByRole('note', {}, { timeout: 4000 });
    expect(notes.some((n) => /Total and team-total markets are research only/.test(n.textContent ?? ''))).toBe(true);
    const table = document.querySelector('.eng-survt')!.textContent!;
    expect(table).toMatch(/wins by over \d+\.5 points/); // the margin rows that do survive
    expect(table).not.toMatch(/(?<!by )over \d+\.5 points/i); // no total or team-total row
  });

  it('the script tab marks scoring ranges as descriptive and keeps the environment', async () => {
    renderScreen(`${routes.game('cfb', UGA_ALA)}?tab=script`, '/:sport/game/:eventId', <GameRoute />, {}, 'cfb');
    await waitFor(() => expect(document.querySelector('.eng-shape')).not.toBeNull(), { timeout: 4000 });
    const shape = document.querySelector('.eng-shape')!.textContent!;
    expect(shape).toMatch(/Scoring environment\s*Elevated/);
    expect(shape).toMatch(/Total points · descriptive/);
    expect(shape).not.toMatch(/Margin · descriptive/);
    expect(screen.getByText(/do not support any total or team-total market/)).toBeTruthy();
    // ...and names the finding that gives the script its margin: EVEN_MATCHUP, never the scoring environment.
    const auth = screen.getByRole('heading', { name: 'Margin authority' }).closest('.eng-marginauth')!;
    expect(auth.querySelectorAll('.fchip')).toHaveLength(1);
    expect(auth.textContent!.toLowerCase()).not.toMatch(/scoring environment|possession/);
  });

  it('opens why-this-bet with scripts, conditions and the price', async () => {
    renderScreen(routes.game('cfb', LSU_UK), '/:sport/game/:eventId', <GameRoute />, {}, 'cfb');
    const toggles = await screen.findAllByRole('button', { name: /why this bet/i }, { timeout: 4000 });
    fireEvent.click(toggles[0]);
    const why = await screen.findByRole('region', { name: /^Why / });
    expect(within(why).getByText('Required football conditions')).toBeTruthy();
    expect(within(why).getByText(/Pays when/)).toBeTruthy();
    expect(within(why).getByText(/never created the view/)).toBeTruthy();
  });

  it('the script tab walks the causal chain', async () => {
    renderScreen(`${routes.game('cfb', LSU_UK)}?tab=script`, '/:sport/game/:eventId', <GameRoute />, {}, 'cfb');
    await waitFor(() => expect(document.querySelectorAll('.chain > li').length).toBeGreaterThanOrEqual(3), { timeout: 4000 });
    expect(screen.getByRole('heading', { name: 'Markets this script settles' })).toBeTruthy();
  });

  it('a game without a read keeps its markets and says why', async () => {
    renderScreen(routes.game('cfb', ALBY_STON), '/:sport/game/:eventId', <GameRoute />, {}, 'cfb');
    expect(await screen.findByText('No script engine read for this game', {}, { timeout: 4000 })).toBeTruthy();
  });
});
