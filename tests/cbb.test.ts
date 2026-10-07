// CBB presentation adapter: the publication's CBB extensions read back faithfully (synthetic fixtures built
// by the CBB repo's own publisher, e2e/data/cbb), the sport registered as its own sport, TBD tips never shown
// as a midnight time, and the packet protocol extension picked for CBB.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EventDoc, EventResearchDoc, HealthDoc } from '../src/contract/types';
import { sportByCode, sportBySlug, explorable } from '../src/data/sports';
import { NAV_SPORTS } from '../src/data/nav';
import { protocolForSport } from '../src/packet/protocols';
import { eventExt, marginWords, researchExt, statusExt, tipLabel } from '../src/views/cbb/data';

const root = (v: string) => join(__dirname, '..', 'e2e', 'data', 'cbb', v, 'app', 'latest');
const read = <T,>(v: string, rel: string): T => JSON.parse(readFileSync(join(root(v), rel), 'utf-8')) as T;
const events = (v: string) => read<{ items: EventDoc[] }>(v, 'events.json').items;
const byGid = (v: string, gid: string) => events(v).find((e) => eventExt(e)?.cbb_game_id === gid)!;

describe('CBB registration', () => {
  it('is its own explorable sport, never NBA or CFB', () => {
    const s = sportByCode('CBB')!;
    expect(s.slug).toBe('cbb');
    expect(s.fullName).toBe("NCAA Division I Men's Basketball");
    expect(s.branch).toBe('app-data');
    expect(s.rawBase).toBe('https://raw.githubusercontent.com/chmoses98/cbb-edge-finder/app-data/app/latest');
    expect(s.snapshotBase).toBeNull();
    expect(explorable(s)).toBe(true);
    expect(sportBySlug('cbb')).toBe(s);
    expect(sportByCode('NBA')!.rawBase).not.toBe(s.rawBase);
    const nav = NAV_SPORTS.find((n) => n.slug === 'cbb')!;
    expect(nav.label).toBe('CBB');
    expect(protocolForSport('CBB').protocol_id).toBe('edge_finder.handicap.cbb.v1');
  });
});

describe('CBB extensions', () => {
  it('reads the season fixture: incumbent first, every archived row, UNSCORABLE visible', () => {
    const e = byGid('season', 'G900000005');
    const c = eventExt(e)!;
    expect(c.projection_state).toBe('PROJECTED');
    expect(c.primary!.version).toBe('pure-0.2.0');
    expect(c.models).toEqual(['pure-0.2.0', 'pure-0.3.0', 'pure-0.4.0', 'pure-0.5.0', 'pure-0.5.0+roster']);
    expect(eventExt(byGid('season', 'G900000012'))!.integrity.status).toBe('UNSCORABLE');
    const files = read<{ files: Record<string, { kind: string; entity_id: string }> }>('season', 'explorer/index.json').files;
    const rel = Object.entries(files).find(([, f]) => f.entity_id === e.event_id)![0];
    const r = researchExt(read<EventResearchDoc>('season', `explorer/${rel}`))!;
    expect(r.models_detail.map((m) => m.role)).toEqual(['incumbent', 'shadow', 'shadow', 'shadow', 'roster_overlay']);
    expect(r.models_detail.every((m) => m.as_of < e.start_time_utc)).toBe(true);
    expect(r.proster!.sides.home.expected_rotation.length).toBeGreaterThan(0);
  });

  it('reads the preseason health: N = 0, nothing projected, games still listed', () => {
    const st = statusExt(read<HealthDoc>('preseason', 'health.json'))!;
    expect(st.research_status).toBe('PRESEASON');
    expect(st.prospective.game_1.N).toBe(0);
    expect(st.prospective.inference_allowed).toBe(false);
    expect(Object.keys(st.projection_states)).toEqual(['PENDING_WINDOW']);
    expect(events('preseason').length).toBeGreaterThan(0);
    expect(events('preseason').every((e) => eventExt(e)!.primary === null)).toBe(true);
  });

  it('never shows a TBD tip as a time', () => {
    const e = byGid('season', 'G900000002');
    expect(eventExt(e)!.tbd).toBe(true);
    expect(tipLabel(e.start_time_utc, eventExt(e))).toMatch(/time TBD$/);
    expect(marginWords(2.24, 'Kansas', 'Duke')).toBe('Kansas by 2.2');
    expect(marginWords(-3, 'Kansas', 'Duke')).toBe('Duke by 3.0');
  });
});
