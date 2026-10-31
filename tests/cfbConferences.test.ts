// CFB conference membership: derived only from what the CFB publication states (a conference game names its conference), committed once,
// keyed like the CFB identity map, and never taken from basketball.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import data from '../src/lib/cfb-conferences.json';
import teams from '../src/lib/cfb-teams.json';
import { cfbConferenceLabel } from '../src/v3/model/conference';
import { conferencePairs, mergeConferences } from '../scripts/teams/cfb-conferences.mjs';
import type { EventResearchDoc } from '../src/contract/types';
import { CFB_DIR, readCfb } from './helpers';

const MAP = (data as unknown as { teams: Record<string, string> }).teams;
const IDENTITY = (teams as unknown as { teams: Record<string, unknown> }).teams;
const events = readdirSync(join(CFB_DIR, 'explorer', 'events')).map((f) => readCfb<EventResearchDoc>(`explorer/events/${f}`));
const doc = (conference: unknown, codes: (string | null)[]) => ({ event: { event_id: 'evt_x', extensions: { conference }, participants: codes.map((c) => ({ short_name: c })) } });

describe('conferencePairs', () => {
  it('a conference game places both participants in its conference', () => {
    expect(conferencePairs(doc('BIG-TEN', ['ILL', 'MD']))).toEqual([{ code: 'ILL', conference: 'BIG-TEN', event: 'evt_x' }, { code: 'MD', conference: 'BIG-TEN', event: 'evt_x' }]);
  });
  it('says nothing for a non-conference game, a missing label, or participants it cannot identify', () => {
    expect(conferencePairs(doc(false, ['ALA', 'MERC']))).toEqual([]);
    expect(conferencePairs(doc(undefined, ['ALA', 'MERC']))).toEqual([]);
    expect(conferencePairs(doc('', ['ALA', 'MERC']))).toEqual([]);
    expect(conferencePairs(doc('SEC', ['ALA', null]))).toEqual([]);
    expect(conferencePairs(doc('SEC', ['ALA', 'ALA']))).toEqual([]);
    expect(conferencePairs(doc('SEC', ['ALA']))).toEqual([]);
    expect(conferencePairs(null)).toEqual([]);
  });
});

describe('mergeConferences', () => {
  it('adds new teams, keeps agreeing ones, and refuses a team placed in two conferences', () => {
    const ok = mergeConferences({ ALA: 'SEC' }, conferencePairs(doc('SEC', ['ALA', 'AUB'])));
    expect(ok.teams).toEqual({ ALA: 'SEC', AUB: 'SEC' });
    expect(ok.conflicts).toEqual([]);
    const bad = mergeConferences({ ALA: 'SEC' }, conferencePairs(doc('ACC', ['ALA', 'CLEM'])));
    expect(bad.conflicts).toHaveLength(1);
    expect(bad.conflicts[0]).toMatch(/ALA.*SEC.*ACC/);
  });
});

describe('the committed CFB conference map', () => {
  it('only names teams the CFB identity map knows, with a label the app can read', () => {
    expect(Object.keys(MAP).length).toBeGreaterThan(200);
    for (const [code, conf] of Object.entries(MAP)) {
      expect(IDENTITY[code], code).toBeDefined();
      expect(cfbConferenceLabel(conf).length, code).toBeGreaterThan(1);
    }
  });
  it('covers the major conferences', () => {
    const labels = new Set(Object.values(MAP).map(cfbConferenceLabel));
    for (const c of ['SEC', 'Big Ten', 'ACC', 'Big 12', 'Pac-12', 'AAC', 'Mountain West', 'Sun Belt', 'MAC', 'C-USA']) expect(labels.has(c), c).toBe(true);
  });
  it('agrees with every conference game in the fixture publication', () => {
    let checked = 0;
    for (const e of events) for (const p of conferencePairs(e)) { expect(MAP[p.code], p.code).toBe(p.conference); checked++; }
    expect(checked).toBeGreaterThan(0);
  });
});
