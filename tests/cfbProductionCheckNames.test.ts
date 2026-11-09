// The CFB production check compares a Script Engine card's title (data-canonical, which the app has already run through
// cfbDisplayText) with the PUBLISHED title. It must therefore canonicalize the published title by the app's own rules;
// this holds the check's copy equal to the app's function, so the two cannot drift.
import { describe, expect, it } from 'vitest';
import teamsJson from '../src/lib/cfb-teams.json';
import publicJson from '../src/lib/cfb-public-names.json';
import { cfbDisplayText } from '../src/lib/cfbTeams';
import { makeCanonicalText } from '../scripts/cfb/names.mjs';

const teams = (teamsJson as unknown as { teams: Record<string, { n: string }> }).teams;
const names = (publicJson as unknown as { names: Record<string, string> }).names;
const canonicalText = makeCanonicalText(teams, names);

describe('production check: published CFB text -> canonical', () => {
  it('says the schedule name by the public name (the 2026-11-08 failure: UMass @ Toledo)', () => {
    expect(canonicalText('Massachusetts hangs around')).toBe('UMass hangs around');
    expect(canonicalText('Toledo controls')).toBe('Toledo controls');
    expect(canonicalText('Competitive grind')).toBe('Competitive grind');
  });

  it('equals cfbDisplayText for every school: schedule name and "X St." form, alone and inside a sentence', () => {
    const samples: string[] = [];
    for (const t of Object.values(teams)) {
      samples.push(t.n, `${t.n} controls`, `${t.n} hangs around`, `Back ${t.n} (alt)`);
      const st = /^(.+) State$/.exec(t.n);
      if (st) samples.push(`${st[1]} St.`, `${st[1]} St. wins 1st Half`);
    }
    samples.push('Miss St. wins', 'Appalachian St. controls', 'St. at St.', 'Miami (OH) controls', 'Miami controls');
    expect(samples.length).toBeGreaterThan(400);
    const diffs = samples.filter((s) => canonicalText(s) !== cfbDisplayText(s));
    expect(diffs).toEqual([]);
  });

  it('actually rewrites something (guards against an empty alias map passing the parity check)', () => {
    expect(canonicalText('Massachusetts controls')).not.toBe('Massachusetts controls');
  });
});
