// @vitest-environment jsdom
// The Script Engine Overview, Game Script and Matchup views in SIFT 3.0, rendered over the REAL CFB fixture. The Overview shows the six sections directly, a NO side
// is priced by its NO ask through the quote gate and opens the addressed contract sheet, the language rules hold (scripts ranked, never a percentage; no +EV, edge,
// value or lock; scoring contracts are "Scoring: research only" and never listed), and a game the engine could not read keeps a visible reason.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { EventDetailDoc, EventResearchDoc } from '../../src/contract/types';
import { setLiveStore } from '../../src/live/hooks';
import { QuoteStore } from '../../src/live/store';
import { isEngine, readEngine } from '../../src/lib/scriptEngine';
import { scriptStateOf } from '../../src/v3/data/research/scriptEngine';
import type { V3Game, V3Team } from '../../src/v3/model/types';
import { CfbMatchupTab } from '../../src/v3/screens/cfb/MatchupTab';
import { CfbScriptTab } from '../../src/v3/screens/cfb/ScriptTab';
import { ScriptOverview } from '../../src/v3/screens/cfb/ScriptOverview';
import type { GameCtx } from '../../src/v3/screens/GameShared';
import { readCfb } from '../helpers';

const UGA_ALA = 'evt_93e12676ae9337017c63';
const LSU_UK = 'evt_8c3166866b2bfa530c17';
const ALBY_STON = 'evt_776097ba6eef448fb340';
const JVST_KENN = 'evt_e56d7cee653c3507226b';
const SAC_BGSU = 'evt_f32aa654d1e5ccd474f9';

const T = (id: string, name: string): V3Team => ({ id, slug: 'cfb', sport: 'CFB', name, nick: name, abbr: id, logo: null, colors: ['#000', '#fff'] });

function ctxOf(id: string, over: Partial<GameCtx> = {}): GameCtx {
  const research = readCfb<EventResearchDoc>(`explorer/events/${id}.json`);
  const detail = readCfb<EventDetailDoc>(`event_detail/${id}.json`);
  const [a, h] = [research.event.away_participant, research.event.home_participant].map((pid) => research.event.participants.find((p) => p.participant_id === pid));
  const g: V3Game = {
    key: `cfb:${id}`, slug: 'cfb', sport: 'CFB', eventId: id, league: 'CFB', phase: 'pregame', startMs: Date.parse(research.event.start_time_utc), away: T(a?.short_name ?? 'AWAY', a?.display_name ?? 'Away'), home: T(h?.short_name ?? 'HOME', h?.display_name ?? 'Home'),
    score: null, lines: [], signals: 0, provenance: 'publication',
  };
  return { g, startMs: g.startMs, detail, research, researchLoading: false, script: scriptStateOf(research), ...over };
}

const engineIn = (ctx: GameCtx) => { if (ctx.script?.kind !== 'ready') throw new Error('not ready'); return ctx.script.engine; };
const mount = (ui: React.ReactNode) => {
  const router = createMemoryRouter([{ path: '/v3/game/cfb/:id', element: ui }], { initialEntries: ['/v3/game/cfb/x'] });
  return render(<RouterProvider router={router} />);
};

beforeAll(() => { window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
beforeEach(() => {
  setLiveStore(new QuoteStore({ provider: null, persistence: null }));
  // prices are current one minute after the publication's capture (the quote gate is the app's own)
  vi.useFakeTimers({ toFake: ['Date'] });
  const d = readCfb<EventDetailDoc>(`event_detail/${UGA_ALA}.json`);
  vi.setSystemTime(Date.parse(d.markets[0].captured_at!) + 60_000);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const text = () => document.body.textContent ?? '';

describe('Overview of a Script Engine game', () => {
  it('shows the six sections directly: SIFT Read, three advantages, scripts, surviving bets, why this bet, data confidence', () => {
    mount(<ScriptOverview ctx={ctxOf(LSU_UK)} onTab={() => {}} />);
    const e = readEngine(readCfb<EventResearchDoc>(`explorer/events/${LSU_UK}.json`));
    if (!isEngine(e)) throw new Error('no engine');
    const read = screen.getByRole('region', { name: 'SIFT Read' });
    expect(read.textContent).toContain(e.read.headline);
    expect(read.textContent).toContain('Research only');
    expect(within(screen.getByTestId('cfb-advantages')).getAllByTestId('cfb-advantage')).toHaveLength(3);
    const scripts = screen.getAllByTestId('cfb-script');
    expect(scripts).toHaveLength(e.scripts.length);
    expect(scripts[0].textContent).toMatch(/^Primary/);
    expect(scripts.some((s) => /^Danger/.test(s.textContent ?? ''))).toBe(true);
    const surv = within(screen.getByTestId('cfb-survivors'));
    expect(surv.getAllByTestId('cfb-survivor').length).toBeGreaterThan(0);
    expect(surv.getAllByRole('region', { name: 'Why this bet' }).length).toBeGreaterThan(0);
    expect(screen.getByTestId('cfb-confidence').textContent).toMatch(/data confidence/i);
    // the first two causal-chain steps cite the findings behind them, the rest is one tap away
    const first = scripts[0];
    expect(within(first).getAllByRole('listitem').length).toBeGreaterThanOrEqual(2);
    expect(within(first).getByText(/Full causal chain \(\d+ steps\)/)).toBeTruthy();
  });

  it('prices each side by its own ask: YES by the YES ask, NO by the NO ask, each a tap on the addressed contract sheet', () => {
    const sides = new Set<string>();
    let checked = 0;
    for (const id of [LSU_UK, UGA_ALA, SAC_BGSU]) {
      const ctx = ctxOf(id);
      mount(<ScriptOverview ctx={ctx} onTab={() => {}} />);
      for (const row of screen.getAllByTestId('cfb-survivor')) {
        const side = row.getAttribute('data-side') as 'YES' | 'NO';
        const tk = row.getAttribute('data-ticker')!;
        sides.add(side);
        const m = ctx.detail!.markets.find((x) => x.kalshi_ticker === tk)!;
        const want = Math.round((side === 'YES' ? m.yes_ask! : m.no_ask!) * 100);
        const tap = row.querySelector('a.cs-px')!;
        expect(tap.textContent).toBe(`${side}${want}\u00a2`);
        expect(tap.getAttribute('data-tap')).toBe('price');
        expect(tap.getAttribute('data-dest')).toContain(`sheet=contract&tk=${tk}`);
        expect(tap.getAttribute('aria-label')).toMatch(new RegExp(`${side} ask ${want} cents`));
        checked++;
      }
      cleanup();
    }
    expect(checked).toBeGreaterThan(4);
    expect(sides.has('NO')).toBe(true);
  });

  it('withholds a price the quote gate does not allow, printing a dash and never an estimate', () => {
    vi.setSystemTime(Date.parse(readCfb<EventDetailDoc>(`event_detail/${LSU_UK}.json`).markets[0].captured_at!) + 6 * 3600_000);
    mount(<ScriptOverview ctx={ctxOf(LSU_UK)} onTab={() => {}} />);
    for (const row of screen.getAllByTestId('cfb-survivor')) expect(row.querySelector('a.cs-px')!.textContent).toMatch(/^(YES|NO)—$/);
  });

  it('keeps the language rules: ranked not percentages, no +EV / edge / value / lock / fair price, scoring research only and never listed', () => {
    mount(<ScriptOverview ctx={ctxOf(LSU_UK)} onTab={() => {}} />);
    const own = Array.from(document.querySelectorAll('.cs-sh h2, .cs-sub, .cs-foot, .cs-notice, summary, .cs-role, .cs-lbl, .cs-bet__fit, .cs-bet__s')).map((n) => n.textContent).join(' ');
    expect(own).not.toMatch(/\+ev|\bedge\b|\bvalue\b|\block\b|fair price|fair value|win prob|\d+% likely/i);
    expect(text()).not.toMatch(/\d+% likely|\+ev\b|fair value|win prob/i);
    expect(screen.getByTestId('cfb-survivors').textContent).toContain('Scoring: research only');
    for (const row of screen.getAllByTestId('cfb-survivor')) expect(row.textContent).not.toMatch(/total points|team total/i);
    expect(screen.getByTestId('cfb-survivors').textContent).toMatch(/Survives \d+ of \d+ scripts/);
  });

  it('says why when the engine could not read the game, and for a game with no script it keeps the SIFT Read and the reason', () => {
    mount(<ScriptOverview ctx={ctxOf(ALBY_STON)} onTab={() => {}} />);
    const none = screen.getByTestId('cfb-no-script');
    expect(none.textContent).toMatch(/No script research for this game/);
    expect(none.textContent).toMatch(/identity: no football-schedule event matched/i);
    expect(none.textContent).toMatch(/generic/);
    cleanup();
    mount(<ScriptOverview ctx={ctxOf(JVST_KENN)} onTab={() => {}} />);
    expect(screen.getByTestId('cfb-read').textContent).toMatch(/no script is published|clears its evidence threshold/i);
    expect(screen.getByTestId('cfb-scripts').textContent).toMatch(/No script cleared its evidence requirement/);
    expect(screen.queryAllByTestId('cfb-script')).toHaveLength(0);
  });

  it('renders nothing for a sport without a payload, a loading state for CFB while the research is read, and a reason when it could not be', () => {
    const nfl = ctxOf(LSU_UK);
    mount(<ScriptOverview ctx={{ ...nfl, g: { ...nfl.g, slug: 'nfl', sport: 'NFL' }, script: { kind: 'none', reason: null } }} onTab={() => {}} />);
    expect(document.querySelector('.cs, .cs-none')).toBeNull();
    cleanup();
    mount(<ScriptOverview ctx={{ ...nfl, script: { kind: 'loading' } }} onTab={() => {}} />);
    expect(screen.getByRole('status', { name: 'Loading script research' })).toBeTruthy();
    cleanup();
    mount(<ScriptOverview ctx={{ ...nfl, script: { kind: 'none', reason: 'The research document for this game could not be read.' } }} onTab={() => {}} />);
    expect(screen.getByTestId('cfb-no-script').textContent).toMatch(/could not be read/);
  });
});

describe('a trimmed event whose detail cannot be restored', () => {
  it('says the matchup detail is unavailable and why, keeps the engine\'s own sentences, and loses nothing else', () => {
    const base = ctxOf(LSU_UK);
    const r = JSON.parse(JSON.stringify(base.research)) as EventResearchDoc;
    const se = (r.extensions as { script_engine: Record<string, any> }).script_engine; // eslint-disable-line @typescript-eslint/no-explicit-any
    se.metric_registry = {};
    se.matchup_profile.dimensions = {};
    for (const side of ['home', 'away']) se.matchup_profile.teams[side].metrics = {};
    se.payload_trim = { steps: ['metric tables'], omitted: true };
    const state = scriptStateOf(r, { state: 'unavailable', reason: 'the detailed research file this game links is not published yet' });
    mount(<ScriptOverview ctx={{ ...base, research: r, script: state }} onTab={() => {}} />);
    expect(screen.getByTestId('cs-detail-unavailable').textContent).toMatch(/not published yet/);
    const adv = screen.getAllByTestId('cfb-advantage');
    expect(adv).toHaveLength(3);
    for (const a of adv) { expect(a.textContent).toContain('The engine’s finding'); expect(a.querySelector('.cs-ranks')).toBeNull(); }
    expect(screen.getAllByTestId('cfb-script').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('cfb-survivor').length).toBeGreaterThan(0);
  });
});

describe('Game Script and Matchup tabs', () => {
  it('Game Script: one script at a time with the full causal chain, outcome shape and the markets it settles, priced by side', () => {
    const ctx = ctxOf(LSU_UK);
    const e = engineIn(ctx);
    mount(<CfbScriptTab ctx={ctx} engine={e} />);
    const pick = screen.getByRole('group', { name: 'Script' });
    expect(within(pick).getAllByRole('button')).toHaveLength(e.scripts.length);
    expect(within(pick).getAllByRole('button')[0].getAttribute('aria-pressed')).toBe('true');
    const d = screen.getByTestId('cfb-script-detail');
    expect(d.getAttribute('data-script')).toBe(e.scripts[0].script_id);
    expect(d.textContent).toContain('No probability is published');
    expect(within(d).getByText('Causal chain')).toBeTruthy();
    expect(within(d).getByText('Outcome shape')).toBeTruthy();
    expect(within(d).getByText('Markets this script settles')).toBeTruthy();
    for (const tap of d.querySelectorAll('a.cs-px')) expect(tap.getAttribute('data-dest')).toContain('sheet=contract&tk=');
  });

  it('Matchup: the unit-by-unit gaps, every finding with its metrics and every published metric, with ranks and quality', () => {
    const ctx = ctxOf(LSU_UK);
    const e = engineIn(ctx);
    mount(<CfbMatchupTab ctx={ctx} engine={e} />);
    const tab = screen.getByTestId('cfb-matchup-tab');
    expect(within(tab).getByText('Unit by unit')).toBeTruthy();
    expect(within(tab).getByText('Matchup findings')).toBeTruthy();
    expect(within(tab).getByText('Every metric')).toBeTruthy();
    expect(tab.textContent).toMatch(/#\d+ of \d+/);
    expect(tab.textContent).toMatch(/adjusted/);
  });
});
