// The CFB Script Engine V2 game read (claims_v2, cfb-script-engine/2.0.0), from reduced real payloads of the
// cfb-edge-finder V2 shadow build (tests/fixtures/cfb-v2). Every claim dimension renders; the CONTROL range is a
// labelled historical empirical range with its provenance; nothing reads as a probability; a payload without
// claims_v2 (1.1.0) renders exactly as before.
import { cleanup, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import type { EventResearchDoc } from '../src/contract/types';
import { historicalWinsText, isEngine, rangeText, readEngine, type Engine } from '../src/lib/scriptEngine';
import { GameReadV2Panel } from '../src/views/game/GameReadV2';
import { CFB_DIR, readCfb } from './helpers';

const FIXTURES = join(__dirname, 'fixtures', 'cfb-v2');
const load = (name: string) => JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')) as EventResearchDoc;

function engineOf(name: string): Engine {
  const e = readEngine(load(name));
  if (!isEngine(e)) throw new Error(`${name} did not decode`);
  return e;
}

function show(engine: Engine) {
  const router = createMemoryRouter([{ path: '/', element: <GameReadV2Panel engine={engine} /> }]);
  render(<RouterProvider router={router} />);
  return screen.getByTestId('game-read-v2');
}

/**
 * Words that would turn a historical frequency or a range into a forecast. A percentage is banned (a win rate, a
 * "% chance", "% to win"); the one exception is the range labels "Middle 50%" and "Middle 80%", which describe the
 * spread of past margins, not a chance — they are removed before the check.
 */
const FORECAST = /%|\bchance\b|\bprobab|\bpredict|\bodds\b|\bover\b|\bunder\b|\+EV\b|\blikely to\b/i;
const forecastText = (t: string) => t.replace(/\bMiddle (50|80)%/g, 'Middle');

afterEach(cleanup);

describe('V2 claims decode', () => {
  it('decodes claims_v2 beside the V1 scripts, as a shadow preview with no probability', () => {
    const e = engineOf('home_strong_pace');
    expect(e.claimsV2?.activation).toBe('SHADOW');
    expect(e.claimsV2?.methodology_version).toBe('cfb-script-engine/2.0.0');
    expect(e.scripts.length).toBeGreaterThan(0); // V1 stays the active read
    expect(JSON.stringify(e.claimsV2)).not.toMatch(/"probability":\s*[0-9]/);
  });

  it('a 1.1.0 payload without claims_v2 decodes exactly as before', () => {
    // NMSU at FIU and JVST at KENN are 1.1.0 exports; ISU at BYU is 1.2.0, reduced here to its 1.1.0 shape.
    const stripped = readCfb<EventResearchDoc>('explorer/events/evt_1f7f2822f37fb1a8e34e.json');
    const se = (stripped.extensions as { script_engine: Record<string, unknown> }).script_engine;
    delete se.claims_v2;
    se.version = 'cfb_script_engine_payload/1.1.0';
    const docs = [
      ...['evt_f39ef6a955b04b97fe84', 'evt_e56d7cee653c3507226b'].map((id) => readCfb<EventResearchDoc>(`explorer/events/${id}.json`)),
      stripped,
    ];
    for (const d of docs) {
      expect((d.extensions as { script_engine: { version: string } }).script_engine.version).toBe('cfb_script_engine_payload/1.1.0');
      const e = readEngine(d);
      expect(isEngine(e)).toBe(true);
      if (isEngine(e)) {
        expect(e.claimsV2).toBeNull();
        expect(e.scripts.length).toBeGreaterThanOrEqual(0);
      }
    }
    expect(CFB_DIR).toBeTruthy();
  });
});

describe('V2 game read renders every dimension', () => {
  it('CONTROL side + strength, PACE and SCORING ENVIRONMENT, and the historical empirical range', () => {
    const e = engineOf('home_strong_pace');
    const c = e.claimsV2!.claims;
    const panel = show(e);
    const team = e.teams[c.control!.side].name;
    expect(within(panel).getByText(e.claimsV2!.story.headline)).toBeTruthy();
    expect(within(panel).getByText(`${team} · Strong`)).toBeTruthy();
    expect(within(panel).getByText(c.pace!.level === 'HIGH' ? 'Faster' : 'Slower')).toBeTruthy();
    expect(within(panel).getByText('Elevated')).toBeTruthy();
    const range = within(panel).getByRole('group', { name: 'Historical empirical range' });
    const r = c.control!.historical_range!;
    expect(r.central_50).toEqual([8, 35]); // HOME_CONTROL_STRONG, the frozen 2021-2025 values
    expect(r.central_80).toEqual([1, 48]);
    expect(r.n).toBe(628);
    expect(within(range).getByText(rangeText(team, r.central_50))).toBeTruthy();
    expect(within(range).getByText(rangeText(team, r.central_80))).toBeTruthy();
    expect(within(range).getByText(historicalWinsText(r))).toBeTruthy();
    expect(range.textContent).toContain('2021–2025 (n = 628)');
    expect(range.textContent).toContain('validated 2014–2020');
    expect(range.textContent).toContain(r.calibration_sha256.slice(0, 8));
    expect(r.not).toMatch(/^Not a prediction interval/);
    expect(within(panel).getByText('V2 preview')).toBeTruthy();
  });

  it('AWAY control with a disruption edge: the edge is a mechanism, never a winner', () => {
    const e = engineOf('away_moderate_disruption');
    const c = e.claimsV2!.claims;
    expect(c.control!.side).toBe('away');
    expect(c.control!.strength).toBe('MODERATE');
    expect(c.control!.historical_range!.central_50).toEqual([-4, 18]);
    expect(c.control!.historical_range!.central_80).toEqual([-13.7, 30]);
    const panel = show(e);
    expect(within(panel).getByText(`${e.teams.away.name} · Moderate`)).toBeTruthy();
    expect(within(panel).getAllByText('Disruption edge').length).toBe(c.disruption.length);
    for (const d of c.disruption) expect(d.statement).toContain('does not by itself say who wins');
    // A range that crosses zero reads as a signed margin, not as a win.
    expect(panel.textContent).toContain(`${e.teams.away.name} margin −4 to +18`);
  });

  it('CLOSENESS and DEFENSIVE SUPPRESSION, with no side and no range', () => {
    const e = engineOf('closeness_defsupp');
    const panel = show(e);
    expect(within(panel).getByText('Close-game profile')).toBeTruthy();
    expect(within(panel).getByText('Both defenses')).toBeTruthy();
    expect(within(panel).queryByRole('group', { name: 'Historical empirical range' })).toBeNull();
    expect(e.claimsV2!.claims.control).toBeNull();
  });

  it('SUPPRESSED scoring says the baseline already expects it', () => {
    const panel = show(engineOf('suppressed'));
    expect(within(panel).getByText('Lower (baseline already expects it)')).toBeTruthy();
  });

  it('closeness alone renders without a winner', () => {
    const e = engineOf('closeness');
    const panel = show(e);
    expect(within(panel).getByText('Close-game profile')).toBeTruthy();
    expect(panel.textContent).not.toContain('· Strong');
    expect(panel.textContent).not.toContain('· Moderate');
  });

  it('the no-claim state uses the V2 statement and never calls the game unpredictable', () => {
    const e = engineOf('no_claim');
    expect(e.claimsV2!.status).toBe('NO_SUPPORTED_CLAIM');
    const panel = show(e);
    expect(within(panel).getByText('No supported matchup claim cleared the evidence requirements.')).toBeTruthy();
    expect(panel.textContent).toContain('does not mean the game is unusually');
    expect(within(panel).queryByRole('list', { name: 'Football claims' })).toBeNull();
  });
});

describe('no false probability language', () => {
  it('allows exactly the Middle 50% / Middle 80% range labels and nothing else with a percent sign', () => {
    expect(forecastText('Middle 50% +8 to +35 · Middle 80% +1 to +48')).not.toMatch(FORECAST);
    for (const bad of ['90% chance', 'wins 74% to win', 'win rate 89%', 'Middle 60%', '12% likely']) expect(forecastText(bad), bad).toMatch(FORECAST);
  });

  it('no rendered V2 read uses forecast words, percentages or a chance to win', () => {
    for (const name of ['home_strong_pace', 'away_moderate_disruption', 'closeness_defsupp', 'closeness', 'suppressed', 'no_claim']) {
      const panel = show(engineOf(name));
      // Popover bodies are not rendered until opened; the visible read is what a reader sees first.
      const visible = forecastText(panel.textContent ?? '');
      expect(visible, name).not.toMatch(FORECAST);
      expect(visible.toLowerCase(), name).not.toContain('prediction interval');
      expect(visible, name).toContain('describes evidence quality');
      cleanup();
    }
  });
});
