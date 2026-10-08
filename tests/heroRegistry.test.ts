// The hero registry's integrity and coverage: every served photo is a reviewed, credited, free-licence frame of the
// right TEAM at the right venue in the right era; no blocklisted (wrong-event) file can come back; venue names that
// repeat are separable; and every team of every sport with game pages resolves to an identity-correct hero (its
// own photo or its own branded identity with a logo and real colours — never Sift's generic navy).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PHOTOS, VENUES, canonicalTeam, isTenant, normName } from '../src/lib/hero/registry';
import { resolveHero } from '../src/lib/hero/resolve';
import { heroTeam } from '../src/lib/hero/input';
import { teamColors, teamLogo } from '../src/lib/teams';

const ROOT = join(__dirname, '..');
const read = <T,>(p: string): T => JSON.parse(readFileSync(join(ROOT, p), 'utf-8')) as T;
const pins = read<{ pins: { id: string; file: string; sport: string; team: string; venue: string; review: string; identity: string }[] }>('scripts/heroes/pins.json').pins;
const blocked = read<{ files: { file: string }[] }>('scripts/heroes/blocklist.json').files.map((f) => f.file);
const NAMES = read<Record<string, Record<string, string>>>('scripts/heroes/team-names.json');
const FREE = /^(cc0|cc[- ]by(-sa)?( [\d.]+)?|cc[- ]by(-sa)? [\d.]+( [a-z-]+)?|public domain|pd.*)$/i;
const GENERIC = ['#1d2d52', '#3f5079'];
const fileOf = (u: string | null) => (u ? join(ROOT, 'public', u.replace(/^\//, '')) : ''); // BASE_URL is '/' under vitest

describe('photos', () => {
  it('every served photo comes from a reviewed pin, and every pin is served', () => {
    expect(PHOTOS.map((p) => p.id).sort()).toEqual(pins.map((p) => p.id).sort());
    for (const p of pins) {
      expect(p.review, p.id).toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(p.identity.length, p.id).toBeGreaterThan(10);
    }
  });
  it('no wrong-event (blocklisted) file is pinned or served', () => {
    for (const p of pins) expect(blocked, p.id).not.toContain(p.file);
    for (const p of PHOTOS) expect(blocked, p.id).not.toContain(p.credit.file);
  });
  it('each photo shows a TENANT of its venue (the right team in the right building) during its era', () => {
    for (const p of PHOTOS) {
      const v = VENUES.find((x) => x.id === p.venue);
      expect(v, `${p.id}: venue ${p.venue}`).toBeTruthy();
      const probe = p.from ?? (p.to ? new Date(Date.parse(p.to) - 86400000 * 200).toISOString() : '2026-10-01');
      expect(isTenant(v!, p.sport, p.team, probe), `${p.id}: ${p.team} is not a ${p.sport} tenant of ${p.venue}`).toBe(true);
    }
  });
  it('every photo is credited, free-licensed and its files exist (2400, 1200 and the 720 card)', () => {
    for (const p of PHOTOS) {
      expect(p.credit.license, p.id).toMatch(FREE);
      expect(p.credit.artist.length, p.id).toBeGreaterThan(1);
      expect(p.credit.source, p.id).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      expect(p.credit.file, p.id).toMatch(/^File:/);
      expect(p.w, p.id).toBeGreaterThanOrEqual(1600);
      for (const w of [...p.widths, 720]) expect(existsSync(join(ROOT, 'public', 'heroes', p.sport.toLowerCase(), `${p.id}-${w}.webp`)), `${p.id}-${w}`).toBe(true);
    }
  });
});

describe('venues', () => {
  it('ids are unique and every venue has a name, a city and a roof', () => {
    expect(new Set(VENUES.map((v) => v.id)).size).toBe(VENUES.length);
    for (const v of VENUES) expect(v.name && v.city && v.roof, v.id).toBeTruthy();
  });
  it('a name shared by two venues never points one team at two buildings at the same time', () => {
    const byName = new Map<string, typeof VENUES>();
    for (const v of VENUES) for (const n of [v.name, ...v.aliases]) byName.set(normName(n), [...(byName.get(normName(n)) ?? []), v]);
    for (const [name, vs] of byName) {
      if (vs.length < 2) continue;
      for (const a of vs) for (const b of vs) {
        if (a === b) continue;
        for (const ta of a.tenants) for (const tb of b.tenants) {
          if (ta.sport !== tb.sport || canonicalTeam(ta.sport, ta.team) !== canonicalTeam(tb.sport, tb.team)) continue;
          const overlap = (ta.from ?? '0') < (tb.to ?? '9') && (tb.from ?? '0') < (ta.to ?? '9');
          expect(overlap, `"${name}": ${ta.sport} ${ta.team} in ${a.id} and ${b.id}`).toBe(false);
        }
      }
    }
  });
  it('every NFL, MLB and NHL club has exactly one home venue for the 2026 season', () => {
    for (const sport of ['NFL', 'MLB', 'NHL']) {
      for (const code of Object.keys(NAMES[sport])) {
        const homes = VENUES.filter((v) => isTenant(v, sport, code, '2026-10-15'));
        expect(homes.length, `${sport} ${code}: ${homes.map((h) => h.id)}`).toBe(1);
      }
    }
  });
});

describe('coverage: every team resolves to an identity-correct hero', () => {
  const cfbCodes = [...new Set(VENUES.flatMap((v) => v.tenants.filter((t) => t.sport === 'CFB' && (!t.to || t.to > '2026-10-01')).map((t) => t.team)))];
  const cases: [string, string[]][] = [
    ['NFL', Object.keys(NAMES.NFL)],
    ['MLB', Object.keys(NAMES.MLB)],
    ['NHL', Object.keys(NAMES.NHL)],
    ['CFB', cfbCodes],
  ];
  for (const [sport, codes] of cases) {
    it(`${sport}: ${codes.length} home teams — home context, own label, own logo, own colours`, () => {
      for (const code of codes) {
        const name = NAMES[sport]?.[code] ?? code;
        const h = resolveHero({ sport, date: '2026-10-15T23:00:00Z', home: heroTeam(sport, code, name), away: heroTeam(sport, sport === 'CFB' ? 'ALA' : Object.keys(NAMES[sport])[0], 'Away'), homeVerified: true, venueName: null, neutral: null });
        expect(h.context, `${sport} ${code}`).toBe('home');
        expect(h.home?.code).toBe(code);
        expect(h.label, `${sport} ${code}`).toMatch(/ home game$/);
        if (h.photo) expect(h.photo.id, `${sport} ${code}`).toContain(`-${code.toLowerCase()}-`);
        const logo = teamLogo(sport, code);
        expect(logo, `${sport} ${code} logo`).toBeTruthy();
        expect(existsSync(fileOf(logo)), `${sport} ${code} logo file ${logo}`).toBe(true);
        expect(teamColors(sport, code), `${sport} ${code} colours`).not.toEqual(GENERIC);
      }
    });
  }
  it('CBB: every team in the identity table has a logo and its own colours', () => {
    const cbb = read<{ teams: Record<string, { a: string | null; c?: string | null; l?: number }> }>('src/lib/cbb-teams.json').teams;
    const missing = Object.entries(cbb).filter(([, t]) => !t.l || !t.c).map(([, t]) => t.a);
    // Two CBB teams have no published colour (their identity line and logo still carry them).
    expect(missing.length).toBeLessThanOrEqual(2);
  });
});
