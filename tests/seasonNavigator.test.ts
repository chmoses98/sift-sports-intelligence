// Owner report 2026-10-10 (docs/screenshots/2026-10-10/season-phone.jpg): Arizona's weeks 1–3 read "Bye" and week 4
// read "NYG @ NYG". Arizona played LAC, SEA and SF in weeks 1–3 (public/data/nfl/history/teams.json); the publication
// simply did not list those games. Sift has no complete league schedule, so it must never infer a bye.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nextTrail, EXPLORE_STEP, type TrailStep } from '../src/state/trail';
import type { TeamHistoryDoc } from '../src/history/types';
import { anchorFromHistory, weekAnchor, weekCell, weekOf } from '../src/views/explore/SeasonView';

const hist = JSON.parse(readFileSync(join(__dirname, '..', 'public', 'data', 'nfl', 'history', 'teams.json'), 'utf-8')) as TeamHistoryDoc;
const ARI = { participant_id: 'prt_ari', short_name: 'ARI' };
const names: Record<string, string> = { prt_ari: 'ARI', prt_nyg: 'NYG', prt_det: 'DET', prt_buf: 'BUF', prt_la: 'LA' };
const nameOf = (pid: string | null) => (pid ? names[pid] ?? '?' : '?');
const ev = (id: string, away: string, home: string, start: string, status = 'SCHEDULED') => ({ event_id: id, path: '', start_time_utc: start, status, home_participant: home, away_participant: away, participants: [away, home] });

describe('season grid: the Arizona report', () => {
  const ari = hist.teams.ARI.weeks;

  it('weeks 1–3 with other games listed but not Arizona’s are completed games from history, never Bye', () => {
    const others = [ev('e1', 'prt_buf', 'prt_la', '2026-09-14T00:20:00Z', 'FINAL')];
    for (const w of [1, 2, 3]) {
      const cell = weekCell(others, ARI, nameOf, ari.find((x) => x.week === w));
      expect(cell.kind).toBe('played');
      if (cell.kind === 'played') expect(cell.opp).toBe(['LAC', 'SEA', 'SF'][w - 1]);
    }
  });

  it('without a history record, a partial week is "not published", not a bye', () => {
    const cell = weekCell([ev('e1', 'prt_buf', 'prt_la', '2026-09-14T00:20:00Z', 'FINAL')], ARI, nameOf, undefined);
    expect(cell).toEqual({ kind: 'unpublished', games: 1 });
    expect(weekCell([], ARI, nameOf, undefined)).toEqual({ kind: 'unlisted' });
  });

  it('week 4 names Arizona away at the Giants once: opponent NYG, Arizona not home', () => {
    const cell = weekCell([ev('e4', 'prt_ari', 'prt_nyg', '2026-10-04T17:00:00Z', 'FINAL')], ARI, nameOf, ari.find((x) => x.week === 4));
    expect(cell).toMatchObject({ kind: 'game', opp: 'NYG', home: false });
  });

  it('an event that names the team on both sides, or itself as opponent, is an identity conflict', () => {
    expect(weekCell([ev('x', 'prt_ari', 'prt_ari', '2026-10-04T17:00:00Z')], ARI, nameOf, undefined).kind).toBe('conflict');
    const unknownOpp = weekCell([ev('y', 'prt_ari', 'prt_zzz', '2026-10-04T17:00:00Z')], ARI, nameOf, undefined);
    expect(unknownOpp.kind).toBe('conflict');
  });

  it('history anchors week numbering even when the publication window starts late', () => {
    const anchor = anchorFromHistory(ari)!;
    expect(new Date(anchor).getUTCDay()).toBe(2); // a Tuesday
    expect(weekOf('2026-09-13T20:25:00Z', anchor)).toBe(1);
    expect(weekOf('2026-10-04T17:00:00Z', anchor)).toBe(4);
    expect(weekOf('2026-10-11T17:00:00Z', anchor)).toBe(5);
    // the old anchor from a window that begins at week 4 would have called week 4 "week 1"
    expect(weekOf('2026-10-04T17:00:00Z', weekAnchor('2026-10-02T00:15:00Z'))).toBe(1);
  });
});

describe('breadcrumbs follow the destination hierarchy', () => {
  const s = (href: string, label: string, kind: TrailStep['kind']): TrailStep => ({ href, label, kind });
  const nfl = s('/nfl', 'NFL', 'sport');
  const bufla = s('/nfl/game/e1', 'BUF @ LA', 'game');
  const props = s('/nfl/props?game=e1', 'Prop explorer', 'explore');
  const season = s('/nfl/season', 'Season', 'season');

  it('Season reached from a game and the prop explorer reads Explore › Season, not BUF @ LA › Prop explorer › Season', () => {
    let t = nextTrail([nfl], bufla);
    t = nextTrail(t, props, EXPLORE_STEP);
    expect(t.map((x) => x.label)).toEqual(['Explore', 'Prop explorer']);
    t = nextTrail(t, season, EXPLORE_STEP);
    expect(t.map((x) => x.label)).toEqual(['Explore', 'Season']);
  });

  it('a direct link and a refresh give the same crumb', () => {
    expect(nextTrail([], season, EXPLORE_STEP)).toEqual(nextTrail([nfl, bufla, props], season, EXPLORE_STEP));
  });

  it('a week or team change on Season keeps one step', () => {
    const t = nextTrail(nextTrail([], season, EXPLORE_STEP), s('/nfl/season?week=4&team=ARI', 'Season', 'season'), EXPLORE_STEP);
    expect(t.map((x) => x.href)).toEqual(['/explore', '/nfl/season?week=4&team=ARI']);
  });

  it('going back to a game from Season restarts at that game (back/forward never leaks the tool path)', () => {
    const t = nextTrail(nextTrail([], season, EXPLORE_STEP), bufla);
    expect(t.map((x) => x.label)).toEqual(['BUF @ LA']);
    expect(nextTrail([nfl, props], bufla).map((x) => x.label)).toEqual(['NFL', 'BUF @ LA']);
  });
});
