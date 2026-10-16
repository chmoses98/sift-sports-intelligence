// "What matters today" may only speak about games on the viewer's local calendar day (intelligence/schedule.ts), and Home's
// preview / the Games page's grouped schedule (components/sift2/GameList.tsx, views/broadcast/games.ts) must scale to a
// 100-game multi-sport slate without losing a game. Time zones are set per test: the local day is what decides.
import { afterEach, describe, expect, it } from 'vitest';
import type { BoardItem } from '../src/contract/types';
import { sportByCode } from '../src/data/sports';
import type { Discovery } from '../src/intelligence/discoveries';
import { comingUpWhen, gameKey, parseStart, scopeDiscoveries } from '../src/intelligence/schedule';
import { GROUP_CAP, groupGames, teamName } from '../src/components/sift2/GameList';
import { gameRows, HOME_PREVIEW, previewGames, type GameRow } from '../src/views/broadcast/games';

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => { if (ORIGINAL_TZ === undefined) delete process.env.TZ; else process.env.TZ = ORIGINAL_TZ; });
const inTZ = (tz: string, fn: () => void) => { process.env.TZ = tz; fn(); };
const utc = (iso: string) => Date.parse(iso);

const finding = (id: string, startsAt: string | null, over: Partial<Discovery> = {}): Discovery => ({
  id, kind: 'mismatch', sport: 'NFL', slug: 'nfl', title: id, why: '', significance: 'high', evidence: null, facts: [], method: '', source: '', observedAt: null,
  startsAt, eventId: id, gameHref: null, href: null, players: [], risk: null, workspaces: [], meaning: '', leads: [], ...over,
});
const sched = (...g: [id: string, start: string, phase?: string][]) => new Map(g.map(([id, start, phase]) => [gameKey('nfl', id), { startMs: utc(start), phase: phase ?? 'PREGAME' }]));

describe('findings are placed by the game’s local calendar day', () => {
  // 12:00 PM CDT on Tuesday 2026-10-13.
  const now = utc('2026-10-13T17:00:00Z');
  it('today, coming up, and neither (yesterday, over a week away)', () => {
    inTZ('America/Chicago', () => {
      const games = sched(['tonight', '2026-10-14T00:00:00Z'], ['tomorrow', '2026-10-14T18:00:00Z'], ['later', '2026-10-17T18:00:00Z'], ['far', '2026-10-25T18:00:00Z'], ['gone', '2026-10-12T18:00:00Z']);
      const ds = ['tonight', 'tomorrow', 'later', 'far', 'gone'].map((id) => finding(id, null));
      const r = scopeDiscoveries(ds, games, now);
      expect(r.today.map((x) => x.d.id)).toEqual(['tonight']);
      expect(r.comingUp.map((x) => x.d.id)).toEqual(['tomorrow', 'later']);
      expect(r.excluded).toBe(2);
    });
  });
  it('a late game is today even though its UTC date is tomorrow; a game just after local midnight is not', () => {
    inTZ('America/Chicago', () => {
      const games = sched(['late', '2026-10-14T03:30:00Z'], ['after', '2026-10-14T05:30:00Z']);
      const r = scopeDiscoveries([finding('late', null), finding('after', null)], games, now);
      expect(r.today.map((x) => x.d.id)).toEqual(['late']);
      expect(r.comingUp.map((x) => x.d.id)).toEqual(['after']);
    });
  });
  it('the same game is today in one zone and tomorrow in another', () => {
    const games = sched(['g', '2026-10-13T20:00:00Z']);
    const at = utc('2026-10-13T08:00:00Z'); // 1:00 AM Oct 13 in Los Angeles, 9:00 PM Oct 13 in Auckland
    inTZ('America/Los_Angeles', () => expect(scopeDiscoveries([finding('g', null)], games, at).today).toHaveLength(1));
    inTZ('Pacific/Auckland', () => { const r = scopeDiscoveries([finding('g', null)], games, at); expect(r.today).toHaveLength(0); expect(r.comingUp).toHaveLength(1); });
  });
  it('holds across the daylight-saving change (a 25-hour day)', () => {
    inTZ('America/New_York', () => {
      const n = utc('2026-11-01T12:00:00Z'); // 7:00 AM EST on the day clocks go back
      const games = sched(['inside', '2026-11-02T04:30:00Z'], ['outside', '2026-11-02T05:30:00Z']);
      const r = scopeDiscoveries([finding('inside', null), finding('outside', null)], games, n);
      expect(r.today.map((x) => x.d.id)).toEqual(['inside']);
      expect(r.comingUp.map((x) => x.d.id)).toEqual(['outside']);
    });
  });
  it('never calls a future game today, whatever the zone or the hour', () => {
    for (const tz of ['UTC', 'America/Chicago', 'Pacific/Auckland', 'Asia/Kolkata', 'America/St_Johns']) {
      inTZ(tz, () => {
        for (let h = -60; h <= 240; h += 7) {
          const start = now + h * 3600_000;
          const id = `g${h}`;
          const r = scopeDiscoveries([finding(id, null)], sched([id, new Date(start).toISOString()]), now);
          const sameLocalDay = new Date(start).toDateString() === new Date(now).toDateString();
          expect(r.today.length === 1).toBe(sameLocalDay);
          if (r.comingUp.length) expect(new Date(start).toDateString()).not.toBe(new Date(now).toDateString());
        }
      });
    }
  });
});

describe('missing or inconsistent schedule data is never relabelled as today', () => {
  const now = utc('2026-10-13T17:00:00Z');
  it('leaves out a finding with no start, an unparseable start, or a start with no offset', () => {
    inTZ('America/Chicago', () => {
      const r = scopeDiscoveries([finding('a', null), finding('b', 'soon'), finding('c', '2026-10-13T19:00:00'), finding('d', '')], new Map(), now);
      expect(r.today).toHaveLength(0);
      expect(r.comingUp).toHaveLength(0);
      expect(r.excluded).toBe(4);
    });
  });
  it('uses the finding’s own offset-bearing start when the board has no such game', () => {
    inTZ('America/Chicago', () => {
      const r = scopeDiscoveries([finding('own', '2026-10-13T19:00:00-05:00')], new Map(), now);
      expect(r.today.map((x) => x.d.id)).toEqual(['own']);
    });
  });
  it('drops a finding whose two schedule sources disagree about the local day', () => {
    inTZ('America/Chicago', () => {
      const r = scopeDiscoveries([finding('x', '2026-10-14T19:00:00Z')], sched(['x', '2026-10-13T19:00:00Z']), now);
      expect(r.today).toHaveLength(0);
      expect(r.comingUp).toHaveLength(0);
      expect(r.excluded).toBe(1);
    });
  });
  it('drops findings about games that are over, and ignores data-freshness notices', () => {
    inTZ('America/Chicago', () => {
      const games = sched(['f', '2026-10-13T18:00:00Z', 'FINAL'], ['p', '2026-10-13T18:00:00Z', 'POSTPONED'], ['ok', '2026-10-13T23:00:00Z', 'PREGAME']);
      const r = scopeDiscoveries([finding('f', null), finding('p', null), finding('ok', null), finding('fresh', null, { kind: 'freshness', eventId: null })], games, now);
      expect(r.today.map((x) => x.d.id)).toEqual(['ok']);
      expect(r.excluded).toBe(2);
    });
  });
  it('parseStart demands an explicit offset', () => {
    expect(Number.isFinite(parseStart('2026-10-13T19:00:00Z'))).toBe(true);
    expect(Number.isFinite(parseStart('2026-10-13T19:00:00+01:00'))).toBe(true);
    expect(Number.isFinite(parseStart('2026-10-13T19:00:00'))).toBe(false);
    expect(Number.isFinite(parseStart(null))).toBe(false);
  });
  it('a coming-up finding names its day and time', () => {
    inTZ('America/Chicago', () => expect(comingUpWhen(utc('2026-10-15T00:15:00Z'))).toMatch(/Wed.*Oct 14.*7:15\s?PM/));
  });
});

// ---------------------------------------------------------------------------------------------------- large slates
const NAMES: Record<string, [string, string][]> = {
  NBA: [['Boston Celtics', 'BOS'], ['New York Knicks', 'NYK'], ['Denver Nuggets', 'DEN'], ['Miami Heat', 'MIA']],
  NHL: [['Boston Bruins', 'BOS'], ['Toronto Maple Leafs', 'TOR'], ['Colorado Avalanche', 'COL'], ['Dallas Stars', 'DAL']],
  MLB: [['Atlanta Braves', 'ATL'], ['New York Yankees', 'NYY'], ['Houston Astros', 'HOU'], ['Seattle Mariners', 'SEA']],
  NFL: [['Buffalo Bills', 'BUF'], ['New England Patriots', 'NE'], ['Dallas Cowboys', 'DAL'], ['Chicago Bears', 'CHI']],
  CFB: [['University at Albany Great Danes', 'ALB'], ['Stony Brook Seawolves', 'STBK'], ['Ohio State Buckeyes', 'OSU'], ['Georgia Bulldogs', 'UGA']],
  CBB: [['Duke Blue Devils', 'DUKE'], ['Kansas Jayhawks', 'KU'], ['Saint Joseph’s Hawks', 'SJU'], ['Gonzaga Bulldogs', 'GONZ']],
};
const NOW = utc('2026-10-13T17:00:00Z');
function slate(spec: Record<string, number>, status = (_i: number) => 'SCHEDULED'): GameRow[] {
  const bundles = Object.entries(spec).map(([code, n]) => ({
    sport: sportByCode(code)!, recommendations: null, theses: null, signals: null, modelState: null, marketCaptureAt: null, error: null,
    board: Array.from({ length: n }, (_, i): BoardItem => {
      const [a, b] = [NAMES[code][i % 4], NAMES[code][(i + 1) % 4]];
      return {
        event_id: `${code}_${i}`, league: code, competition: null, status: status(i), start_time_utc: new Date(NOW + (1 + (i % 9)) * 3600_000 + i * 60_000).toISOString(), home_participant: 'h', away_participant: 'a',
        participants: [{ participant_id: 'h', display_name: b[0], short_name: b[1], participant_type: 'TEAM' }, { participant_id: 'a', display_name: a[0], short_name: a[1], participant_type: 'TEAM' }],
        data_freshness: 'FRESH' as never, health_flags: [], detail_path: '', market_captured_at: null, model_generated_at: null, markets_available: 4, markets_priced: 0, recommendations_count: 0, wagers_count: 0,
      };
    }),
  }));
  return gameRows(bundles, [], NOW);
}

describe('Home previews at most six games, however big the slate', () => {
  it.each([0, 2, 10, 40, 100, 160])('a %i-game slate previews no more than six and never the featured game', (n) => {
    const rows = slate({ NBA: Math.ceil(n * 0.4), NHL: Math.ceil(n * 0.3), MLB: n - Math.ceil(n * 0.4) - Math.ceil(n * 0.3) > 0 ? n - Math.ceil(n * 0.4) - Math.ceil(n * 0.3) : 0 }).slice(0, n);
    const featured = rows[0] ?? null;
    const p = previewGames(rows, { exclude: featured });
    expect(p.length).toBeLessThanOrEqual(HOME_PREVIEW);
    expect(p.length).toBe(Math.min(HOME_PREVIEW, Math.max(0, n - (featured ? 1 : 0))));
    expect(featured && p.includes(featured)).toBeFalsy();
    expect(new Set(p).size).toBe(p.length);
  });
  it('does not let one deep sport crowd out the others on a mixed slate', () => {
    const rows = slate({ NBA: 40, NHL: 6, MLB: 6, NFL: 14 });
    const p = previewGames(rows);
    expect(new Set(p.map((g) => g.sport)).size).toBeGreaterThanOrEqual(3);
    expect(p.filter((g) => g.sport === 'NBA').length).toBeLessThanOrEqual(2);
  });
  it('previews games still to come before games that are over, and fills with finished ones only when needed', () => {
    const rows = slate({ NBA: 8 }, (i) => (i < 5 ? 'FINAL' : 'SCHEDULED'));
    const p = previewGames(rows);
    expect(p.slice(0, 3).every((g) => g.phase === 'PREGAME')).toBe(true);
    expect(p.filter((g) => g.phase === 'FINAL').length).toBe(3);
    expect(previewGames(slate({ NBA: 5 }, () => 'FINAL')).length).toBe(5);
  });
});

describe('the Games page lists every game, grouped by sport then start hour', () => {
  it.each([0, 2, 10, 40, 100])('keeps all of a %i-game slate in sport groups', (n) => {
    const rows = slate({ NBA: Math.floor(n / 2), NHL: Math.floor(n / 4), CBB: n - Math.floor(n / 2) - Math.floor(n / 4) });
    const groups = groupGames(rows);
    expect(groups.flatMap((g) => g.games)).toHaveLength(rows.length);
    expect(groups.flatMap((g) => g.slots.flatMap((s) => s.games))).toHaveLength(rows.length);
    expect(new Set(groups.map((g) => g.slug)).size).toBe(groups.length);
  });
  it('orders sports like the navigation, and games chronologically inside each hour slot', () => {
    const groups = groupGames(slate({ MLB: 6, NFL: 4, NBA: 5, CBB: 3 }));
    expect(groups.map((g) => g.slug)).toEqual(['nfl', 'mlb', 'nba', 'cbb']);
    for (const g of groups) {
      const starts = g.games.map((x) => x.startMs);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
      for (const slot of g.slots) expect(new Set(slot.games.map((x) => new Date(x.startMs).getHours())).size).toBe(1);
    }
  });
  it('a game with no usable start is kept, last, under "Time TBC"', () => {
    const rows = slate({ NBA: 3 });
    rows[1] = { ...rows[1], startMs: Number.NaN };
    const g = groupGames(rows)[0];
    expect(g.games).toHaveLength(3);
    expect(g.slots.at(-1)!.label).toBe('Time TBC');
  });
  it('a long slate is capped per sport only in the view, never in the data', () => {
    const rows = slate({ NBA: 100 });
    expect(groupGames(rows)[0].games).toHaveLength(100);
    expect(GROUP_CAP).toBeLessThan(100);
  });
});

describe('team names on a row', () => {
  const p = (display_name: string, short_name = 'X') => ({ participant_id: 'p', display_name, short_name, participant_type: 'TEAM' as const });
  it('drops a repeated nickname but keeps real names whole', () => {
    expect(teamName(p('New York Jets Jets'))).toBe('New York Jets');
    expect(teamName(p('Los Angeles Rams Rams'))).toBe('Los Angeles Rams');
    expect(teamName(p('Saint Joseph’s Hawks'))).toBe('Saint Joseph’s Hawks');
    expect(teamName(p('University at Albany Great Danes'))).toBe('University at Albany Great Danes');
    expect(teamName(p('Real Real Madrid'))).toBe('Real Real Madrid');
    expect(teamName(undefined)).toBe('TBD');
  });
});
