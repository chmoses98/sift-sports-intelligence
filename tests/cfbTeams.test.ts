// CFB team identity: one committed, deterministic map from the CFB contract team code to the ESPN team id, built
// from the publication's identity-verified games; CFB logos through the shared resolver; NFL and NHL unchanged.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import data from '../src/lib/cfb-teams.json';
import { cfbTeam } from '../src/lib/cfbTeams';
import { teamColors, teamLogo } from '../src/lib/teams';
import { mergePairs, pairsOf } from '../scripts/teams/cfb-identity.mjs';
import type { EventResearchDoc } from '../src/contract/types';
import { CFB_DIR, readCfb } from './helpers';

const PUBLIC = join(__dirname, '..', 'public');
const TEAMS = (data as unknown as { teams: Record<string, { e: string; n: string; l: 0 | 1 }> }).teams;
const fixtureEvents = readdirSync(join(CFB_DIR, 'explorer', 'events')).map((f) => readCfb<EventResearchDoc>(`explorer/events/${f}`));

describe('the committed CFB identity map', () => {
  it('is one-to-one: one code per ESPN id and one ESPN id per code', () => {
    const ids = Object.values(TEAMS).map((t) => t.e);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((e) => /^\d+$/.test(e))).toBe(true);
    expect(Object.keys(TEAMS).length).toBeGreaterThan(200);
  });

  it('agrees with every identity-verified game in the fixture publication (home/away as the engine oriented them)', () => {
    let checked = 0;
    for (const d of fixtureEvents) {
      for (const p of pairsOf(d)) {
        expect(cfbTeam(p.code)?.e, `${p.code} in ${p.event}`).toBe(p.espn);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(14);
  });

  it('pairs a game only when its identity check passed; a failed match yields nothing (no guessing)', () => {
    const unmatched = fixtureEvents.find((d) => (d.extensions as { script_engine?: { status?: string } }).script_engine?.status === 'UNAVAILABLE')!;
    expect(pairsOf(unmatched)).toEqual([]);
    const byu = pairsOf(fixtureEvents.find((d) => d.event.event_id === 'evt_1f7f2822f37fb1a8e34e')!);
    expect(byu.map((p) => [p.code, p.espn])).toEqual(expect.arrayContaining([['ISU', '66'], ['BYU', '252']]));
  });

  it('honours a stated home/away swap, and refuses a code or id that would map two ways', () => {
    const d = fixtureEvents.find((x) => x.event.event_id === 'evt_1f7f2822f37fb1a8e34e')!;
    const se = (d.extensions as { script_engine: { script_generation: { identity: Record<string, unknown> } } }).script_engine;
    const swapped = { ...d, extensions: { script_engine: { ...se, script_generation: { ...se.script_generation, identity: { ...se.script_generation.identity, status: 'RESOLVED', orientation_swapped: true } } } } };
    expect(pairsOf(swapped).map((p) => [p.code, p.espn])).toEqual(expect.arrayContaining([['ISU', '252'], ['BYU', '66']]));
    const { conflicts } = mergePairs({ ISU: { e: '66', n: 'Iowa State', l: 1 } }, pairsOf(swapped));
    expect(conflicts.join(' ')).toMatch(/ISU: ESPN 66 .* vs 252/);
    expect(mergePairs({}, pairsOf(d)).conflicts).toEqual([]);
  });

  it('every logo the map promises is committed', () => {
    const promised = Object.entries(TEAMS).filter(([, t]) => t.l);
    expect(promised.length).toBeGreaterThan(200);
    for (const [code, t] of promised) expect(existsSync(join(PUBLIC, 'teams', 'cfb', `${t.e}.webp`)), code).toBe(true);
  });
});

describe('the shared team-logo resolver', () => {
  it('resolves both teams of two CFB matchups to committed CFB logos by ESPN id', () => {
    expect(teamLogo('CFB', 'ISU')).toBe(`${import.meta.env.BASE_URL}teams/cfb/66.webp`);
    expect(teamLogo('CFB', 'BYU')).toBe(`${import.meta.env.BASE_URL}teams/cfb/252.webp`);
    expect(teamLogo('CFB', 'NMSU')).toBe(`${import.meta.env.BASE_URL}teams/cfb/166.webp`);
    expect(teamLogo('CFB', 'FIU')).toBe(`${import.meta.env.BASE_URL}teams/cfb/2229.webp`);
  });

  it('a CFB code it does not know gets no logo (text mark), never a guessed one', () => {
    expect(teamLogo('CFB', 'NOT_A_TEAM')).toBeNull();
    expect(teamLogo('CFB', null)).toBeNull();
    // CFB never borrows an NFL logo for a code both leagues use.
    expect(teamLogo('CFB', 'KC')).toBeNull();
  });

  it('NFL is unchanged', () => {
    expect(teamLogo('NFL', 'KC')).toBe(`${import.meta.env.BASE_URL}teams/nfl/KC.webp`);
    expect(teamLogo('NFL', 'ZZZ')).toBeNull();
    expect(teamColors('NFL', 'KC')).toEqual(['#E31837', '#FFB81C']);
  });

  it('NHL is unchanged (no committed NHL logos: text marks, its own colors)', () => {
    expect(teamLogo('NHL', 'BOS')).toBeNull();
    expect(teamLogo('NHL', 'TOR')).toBeNull();
    expect(teamColors('NHL', 'BOS')).toEqual(['#FFB81C', '#000000']);
  });
});
