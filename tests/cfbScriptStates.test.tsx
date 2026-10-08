// The CFB Script Engine publication, rendered faithfully in each of its states (real cfb-edge-finder documents in
// tests/fixtures/cfb). A positive status must reach the reader as its actual scripts; only a real
// NO_SCRIPT_CLEARED_EVIDENCE may show the empty state, and it must never be filled with an invented script.
import { cleanup, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EventResearchDoc } from '../src/contract/types';
import { clearAsyncMemo } from '../src/data/hooks';
import { routes } from '../src/lib/routes';
import { isEngine, readEngine } from '../src/lib/scriptEngine';
import { teamLogo } from '../src/lib/teams';
import { GameRoute } from '../src/views/Game';
import { agreement, payloadOf } from '../scripts/cfb/select.mjs';
import { CFB_DIR, readCfb, useDiskFetch } from './helpers';
import { renderScreen } from './render';

/** Iowa St. at BYU, 2026-10-10: SCRIPTS_GENERATED, two scripts. */
const ISU_BYU = 'evt_1f7f2822f37fb1a8e34e';
/** New Mexico St. at Florida International, 2026-10-07: SINGLE_SCRIPT. */
const NMSU_FIU = 'evt_f39ef6a955b04b97fe84';
/** Jacksonville St. at Kennesaw St., 2026-10-07: NO_SCRIPT_CLEARED_EVIDENCE. */
const JVST_KENN = 'evt_e56d7cee653c3507226b';
/** LSU at Kentucky: a V2 game whose trimmed payload keeps its full matchup profile and featured market map. */
const LSU_UK = 'evt_8c3166866b2bfa530c17';
const EMPTY = 'No script cleared its evidence requirement';

const doc = (id: string) => readCfb<EventResearchDoc>(`explorer/events/${id}.json`);
const raw = (id: string) => (doc(id).extensions as { script_engine: { status: string; game_scripts: { script_id: string; title: string; role: string }[] } }).script_engine;
const cardTitles = () => [...document.querySelectorAll('.eng-scard .scard__name')].map((e) => e.textContent);

beforeAll(() => {
  useDiskFetch();
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
});
beforeEach(() => {
  clearAsyncMemo();
  localStorage.clear();
});
afterEach(cleanup);

describe('CFB publication contract (data level)', () => {
  it('the fixture carries every engine state the slate publishes', () => {
    expect(raw(ISU_BYU).status).toBe('SCRIPTS_GENERATED');
    expect(raw(NMSU_FIU).status).toBe('SINGLE_SCRIPT');
    expect(raw(JVST_KENN).status).toBe('NO_SCRIPT_CLEARED_EVIDENCE');
  });

  it('decodes every published script, in rank order, for every state (none dropped, none added)', () => {
    for (const id of [ISU_BYU, NMSU_FIU, JVST_KENN]) {
      const e = readEngine(doc(id));
      expect(isEngine(e)).toBe(true);
      if (!isEngine(e)) continue;
      expect(e.status).toBe(raw(id).status);
      expect(e.scripts.map((s) => s.script_id).sort()).toEqual(raw(id).game_scripts.map((s) => s.script_id).sort());
      expect(e.scripts.map((s) => s.rank)).toEqual([...e.scripts.map((s) => s.rank)].sort((a, b) => a - b));
      for (const s of e.scripts) expect(s.probability).toBeNull();
    }
    expect(readEngine(doc(ISU_BYU)) && (readEngine(doc(ISU_BYU)) as { scripts: unknown[] }).scripts).toHaveLength(2);
    expect((readEngine(doc(NMSU_FIU)) as { scripts: unknown[] }).scripts).toHaveLength(1);
    expect((readEngine(doc(JVST_KENN)) as { scripts: unknown[] }).scripts).toHaveLength(0);
  });

  it('a multi-script game publishes the contracts that survive several scripts, as theses', () => {
    const e = readEngine(doc(LSU_UK));
    if (!isEngine(e)) throw new Error('did not decode');
    expect(e.survivors.length).toBeGreaterThan(0);
    expect(e.theses.length).toBeGreaterThan(0);
  });

  it('a positive payload keeps every section Sift renders: matchup, findings, market map, survivors, theses, confidence, generation', () => {
    for (const id of [LSU_UK, NMSU_FIU]) {
      const e = readEngine(doc(id));
      if (!isEngine(e)) throw new Error(`${id} did not decode`);
      expect(Object.keys(e.teams.home.metrics).length).toBeGreaterThan(20);
      expect(e.findings.length).toBeGreaterThan(0);
      expect(e.expressions.length).toBeGreaterThan(0);
      const se = raw(id) as unknown as Record<string, unknown>;
      for (const k of ['matchup_profile', 'matchup_findings', 'script_market_map', 'script_survivors', 'theses', 'data_confidence', 'script_generation', 'sift_read']) expect(se[k], `${id} ${k}`).toBeDefined();
      expect(['HIGH', 'MEDIUM', 'LOW']).toContain(e.confidence.level);
      expect(e.generation.market_blind).toBe(true);
      expect(e.generation.methodology_version).toMatch(/^cfb-script-engine\//);
      expect(e.read.headline.length).toBeGreaterThan(0);
    }
  });

  it('the production check agrees with these exports, and rejects an export that drops or empties a positive payload', () => {
    expect(agreement('SCRIPTS_GENERATED', payloadOf(doc(ISU_BYU)))).toEqual([]);
    expect(agreement('SINGLE_SCRIPT', payloadOf(doc(NMSU_FIU)))).toEqual([]);
    expect(agreement('NO_SCRIPT_CLEARED_EVIDENCE', payloadOf(doc(JVST_KENN)))).toEqual([]);
    const dropped = { ...doc(ISU_BYU), extensions: {} };
    expect(agreement('SCRIPTS_GENERATED', payloadOf(dropped)).join()).toMatch(/no extensions.script_engine/);
    const se = raw(ISU_BYU);
    const emptied = { ...doc(ISU_BYU), extensions: { script_engine: { ...se, game_scripts: [] } } };
    expect(agreement('SCRIPTS_GENERATED', payloadOf(emptied)).join()).toMatch(/exported with 0 scripts/);
    const invented = { ...doc(JVST_KENN), extensions: { script_engine: { ...raw(JVST_KENN), game_scripts: se.game_scripts } } };
    expect(agreement('NO_SCRIPT_CLEARED_EVIDENCE', payloadOf(invented)).join()).toMatch(/exported with 2 scripts/);
  });
});

describe('CFB game page renders the publication it was given (UI level)', () => {
  it('SCRIPTS_GENERATED: the CFB engine page with every published script card and no empty state', async () => {
    renderScreen(routes.game('cfb', ISU_BYU), '/:sport/game/:eventId', <GameRoute />, {}, 'cfb');
    await screen.findByRole('heading', { name: /Likely Game Scripts/ }, { timeout: 4000 });
    expect(document.querySelector('.game--engine')).not.toBeNull();
    expect(cardTitles()).toEqual(raw(ISU_BYU).game_scripts.map((s) => s.title));
    expect(document.body.textContent).not.toContain(EMPTY);
    // never the generic/NFL simulation fallback
    expect(screen.queryByRole('heading', { name: /How It Could Play Out/ })).toBeNull();
  });

  it('SCRIPTS_GENERATED: the Scripts tab shows the script picker and the causal chain', async () => {
    renderScreen(`${routes.game('cfb', ISU_BYU)}?tab=script`, '/:sport/game/:eventId', <GameRoute />, {}, 'cfb');
    await waitFor(() => expect(document.querySelectorAll('.chain > li').length).toBeGreaterThan(0), { timeout: 4000 });
    expect(document.querySelectorAll('.stab__pick .eng-scard')).toHaveLength(2);
    expect(document.body.textContent).not.toContain(EMPTY);
  });

  it('SINGLE_SCRIPT: its one actual script, on the overview and the Scripts tab (one is not "unavailable")', async () => {
    const only = raw(NMSU_FIU).game_scripts[0];
    const { unmount } = renderScreen(routes.game('cfb', NMSU_FIU), '/:sport/game/:eventId', <GameRoute />, {}, 'cfb');
    await screen.findByRole('heading', { name: /Likely Game Scripts/ }, { timeout: 4000 });
    expect(cardTitles()).toEqual([only.title]);
    expect(document.body.textContent).not.toContain(EMPTY);
    expect(screen.queryByText('No script engine read for this game')).toBeNull();
    unmount();
    clearAsyncMemo();
    renderScreen(`${routes.game('cfb', NMSU_FIU)}?tab=script`, '/:sport/game/:eventId', <GameRoute />, {}, 'cfb');
    await waitFor(() => expect(document.querySelectorAll('.chain > li').length).toBeGreaterThan(0), { timeout: 4000 });
    expect(document.querySelectorAll('.stab__pick .eng-scard')).toHaveLength(1);
    expect(document.body.textContent).not.toContain(EMPTY);
  });

  it('NO_SCRIPT_CLEARED_EVIDENCE: the honest empty state and no script card, on the overview and the Scripts tab', async () => {
    const { unmount } = renderScreen(routes.game('cfb', JVST_KENN), '/:sport/game/:eventId', <GameRoute />, {}, 'cfb');
    await screen.findByRole('heading', { name: /Likely Game Scripts/ }, { timeout: 4000 });
    expect(document.querySelector('.game--engine')).not.toBeNull();
    expect(document.querySelectorAll('.eng-scard')).toHaveLength(0);
    expect(document.body.textContent).toContain(EMPTY);
    unmount();
    clearAsyncMemo();
    renderScreen(`${routes.game('cfb', JVST_KENN)}?tab=script`, '/:sport/game/:eventId', <GameRoute />, {}, 'cfb');
    expect(await screen.findByText(EMPTY, {}, { timeout: 4000 })).toBeTruthy();
    expect(document.querySelectorAll('.eng-scard, .chain > li')).toHaveLength(0);
  });
});

describe('CFB team marks in the game hero', () => {
  it('both teams resolve committed logos and render as logo marks (never text initials)', async () => {
    for (const [id, away, home] of [[ISU_BYU, 'ISU', 'BYU'], [NMSU_FIU, 'NMSU', 'FIU']] as const) {
      const a = teamLogo('CFB', away);
      const h = teamLogo('CFB', home);
      expect(a).toMatch(/\/teams\/cfb\/\d+\.webp$/);
      expect(h).toMatch(/\/teams\/cfb\/\d+\.webp$/);
      for (const u of [a!, h!]) expect(() => readFileSync(join(CFB_DIR, '..', '..', '..', '..', '..', 'public', u.replace(/^.*?\/teams\//, 'teams/')))).not.toThrow();
      clearAsyncMemo();
      const { unmount } = renderScreen(routes.game('cfb', id), '/:sport/game/:eventId', <GameRoute />, {}, 'cfb');
      await screen.findByRole('heading', { name: /Likely Game Scripts/ }, { timeout: 4000 });
      expect(document.querySelectorAll('.gh .teammark--logo')).toHaveLength(2);
      expect(document.querySelectorAll('.gh .teammark--text')).toHaveLength(0);
      unmount();
    }
  });

  it('shows the whole college name in the hero ("Iowa St.", not "St.")', async () => {
    renderScreen(routes.game('cfb', ISU_BYU), '/:sport/game/:eventId', <GameRoute />, {}, 'cfb');
    await screen.findByRole('heading', { name: /Likely Game Scripts/ }, { timeout: 4000 });
    expect([...document.querySelectorAll('.gh__name')].map((e) => e.textContent)).toEqual(['Iowa St.', 'BYU']);
  });
});
