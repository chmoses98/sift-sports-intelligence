// The NFL distribution production check decides from the publication's own data what to do (scripts/nfl-distribution-plan.mjs):
// check the live Explorer for the current game's promoted-family players, or report "not applicable" - never a silent pass, never a
// failure for a legitimately empty schedule. Real feed + artifact (tests/fixtures/nfl-distribution, the 2026-10-19 WAS @ SF publication).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { currentGame, distributionPlan, HORIZON_MS, LOOKBACK_MS, type PlanItem } from '../../scripts/nfl-distribution-plan.mjs';

const dir = join(__dirname, '..', 'fixtures', 'nfl-distribution');
const feed = JSON.parse(readFileSync(join(dir, 'projections.json'), 'utf-8'));
const art = JSON.parse(readFileSync(join(dir, 'distributions.json'), 'utf-8'));
const KICK = Date.parse('2026-10-20T00:15:00Z');
const game = (status: string, start = KICK, teams = ['WAS', 'SF']): PlanItem => ({ event_id: 'evt_1', status, start_time_utc: new Date(start).toISOString(), participants: teams.map((short_name) => ({ short_name })) });
const H = 3600e3;
const plan = (over: Record<string, unknown> = {}) => distributionPlan({ items: [game('SCHEDULED')], feed, art, now: KICK - 3 * H, ...over } as never);

describe('which game is current', () => {
  it('the soonest unfinished game from a few hours back to ten days ahead', () => {
    const items = [game('FINAL', KICK - 3 * 86400e3), { ...game('SCHEDULED', KICK + 86400e3), event_id: 'evt_2' }, game('IN_PROGRESS', KICK)];
    expect(currentGame(items, KICK + H)!.event_id).toBe('evt_1');
    expect(currentGame(items, KICK + LOOKBACK_MS + 60e3)!.event_id).toBe('evt_2');         // the first has been over for a while
    expect(currentGame([game('SCHEDULED', KICK + HORIZON_MS + H)], KICK)).toBeNull();      // too far ahead
    expect(currentGame([game('FINAL')], KICK - H)).toBeNull();
    expect(currentGame(undefined, KICK)).toBeNull();
  });
});

describe('the plan', () => {
  it('a current game with promoted-family rows: check the top two per family that the artifact carries', () => {
    const p = plan();
    expect(p.mode).toBe('CHECK');
    expect(p.problems).toEqual([]);
    const byFam = (f: string) => p.targets.filter((t) => t.family === f);
    expect(byFam('receptions').length).toBe(2);
    expect(byFam('completions').length).toBe(2);
    expect(byFam('receptions')[0].mean).toBeGreaterThanOrEqual(byFam('receptions')[1].mean);
    for (const t of p.targets) expect(t.dist).toBeTruthy();
  });
  it('after kick-off the game is still checked (the Explorer keeps working)', () => {
    expect(plan({ now: KICK + 2 * H }).mode).toBe('CHECK');
  });
  it('no current game: not applicable, with the reason (a finished week is not a failure)', () => {
    const p = plan({ items: [game('FINAL')], now: KICK + 4 * 86400e3 });
    expect(p.mode).toBe('NOT_APPLICABLE');
    expect(p.reason).toMatch(/no current NFL game/);
    expect(plan({ items: [] }).mode).toBe('NOT_APPLICABLE');
  });
  it('a game the feed does not cover: not applicable, naming the game', () => {
    const p = plan({ items: [game('SCHEDULED', KICK, ['GB', 'CHI'])] });
    expect(p.mode).toBe('NOT_APPLICABLE');
    expect(p.reason).toMatch(/GB @ CHI/);
  });
  it('club codes that differ between the board and the feed still match', () => {
    const f = structuredClone(feed);
    for (const r of f.players) { if (r.team === 'WAS') r.team = 'WSH'; if (r.opponent === 'WAS') r.opponent = 'WSH'; }
    expect(plan({ feed: f }).targets.some((t) => t.row.team === 'WSH')).toBe(true);
  });
  it('a missing or unreadable artifact for a game with rows is a failure, not a pass', () => {
    expect(plan({ art: null })).toMatchObject({ mode: 'CHECK', problems: [expect.stringMatching(/missing/)], targets: [] });
    expect(plan({ feed: null }).problems[0]).toMatch(/feed is unreadable/);
  });
  it('an artifact for another feed or another schema is a failure', () => {
    expect(plan({ art: { ...art, projection: { ...art.projection, generated_utc: '2026-10-18T00:00:00Z' } } }).problems[0]).toMatch(/describes the feed of 2026-10-18/);
    expect(plan({ art: { ...art, schema: 'x' } }).problems[0]).toMatch(/schema is x/);
  });
  it('a feed row that is neither in the artifact nor listed as excluded is a failure; an honestly excluded one is a note', () => {
    const victim = art.rows.find((r: { family: string }) => r.family === 'receptions');
    const dropped = { ...art, rows: art.rows.filter((r: unknown) => r !== victim) };
    expect(plan({ art: dropped }).problems[0]).toMatch(/neither in the artifact nor listed as excluded/);
    const listed = { ...dropped, excluded: [{ player_id: victim.player_id, family: victim.family, game_id: victim.game_id, why: 'the archived pmf is not a probability distribution' }] };
    const p = plan({ art: listed });
    expect(p.problems).toEqual([]);
    expect(p.notes[0]).toMatch(/honestly excluded/);
    expect(p.targets.every((t) => t.playerId !== victim.player_id || t.family !== victim.family)).toBe(true);
  });
  it('everything excluded: not applicable, not a pass for nothing', () => {
    const rows = feed.players.filter((p: { family: string }) => p.family === 'receptions' || p.family === 'completions');
    const none = { ...art, rows: art.rows.filter((r: { family: string }) => r.family !== 'receptions' && r.family !== 'completions'), excluded: rows.map((r: { game_id: string; player_id: string; family: string }) => ({ game_id: r.game_id, player_id: r.player_id, family: r.family, why: 'x' })) };
    expect(plan({ art: none }).mode).toBe('NOT_APPLICABLE');
  });
});
