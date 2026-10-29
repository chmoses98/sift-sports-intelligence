// Start times come from the league schedule (the explorer index), never from Kalshi event metadata. The real explorer index (trimmed copy in
// tests/v3/fixtures, captured 2026-10-26) lists TOR at CGY at 00:30Z (8:30 PM ET); Kalshi's event implies 9:00 PM ET (01:00Z) (the case in
// docs/sift3/QUOTE_DELIVERY.md). When a board disagrees with the schedule, the schedule wins; Kalshi's time is not an input anywhere.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { BoardItem, ExplorerIndexDoc } from '../../src/contract/types';
import type { SportBundle } from '../../src/opportunity/load';
import { scheduleOf } from '../../src/v3/data/research/normalize';
import { scheduledStart } from '../../src/v3/data/research/gameMarkets';
import { knownSchedule, registerSchedule, withScheduleStarts, clearSchedules } from '../../src/v3/data/research/scheduleStarts';
import { SPORTS } from '../../src/data/sports';

const idx = JSON.parse(readFileSync('tests/v3/fixtures/nhl-index-slim.json', 'utf8')) as ExplorerIndexDoc;
const schedule = scheduleOf(idx);
const TOR_CGY = 'evt_9dcedbe131e7ff4c72d6';
const SCHEDULE_START = Date.parse('2026-10-27T00:30:00Z');
const KALSHI_IMPLIED = Date.parse('2026-10-27T01:00:00Z'); // 9:00 PM ET, as Kalshi's event implies

const part = (id: string, short: string) => ({ participant_id: id, short_name: short, display_name: short }) as BoardItem['participants'][number];
const item = (startUtc: string, id = TOR_CGY): BoardItem => ({
  event_id: id, start_time_utc: startUtc, status: 'SCHEDULED', away_participant: 'prt_3ce50da866d0a92fa2dc', home_participant: 'prt_227ffc695558a61da21f',
  participants: [part('prt_3ce50da866d0a92fa2dc', 'TOR'), part('prt_227ffc695558a61da21f', 'CGY')],
}) as unknown as BoardItem;
const nhl = SPORTS.find((s) => s.slug === 'nhl')!;
const bundle = (items: BoardItem[]): SportBundle => ({ sport: nhl, board: items, recommendations: null, theses: null, signals: null, modelState: null, marketCaptureAt: null, error: null });

describe('the schedule authority', () => {
  it('the real schedule lists TOR at CGY at 00:30Z', () => {
    expect(schedule.find((e) => e.eventId === TOR_CGY)).toMatchObject({ startUtc: '2026-10-27T00:30:00Z', homeCode: 'CGY', awayCode: 'TOR' });
  });
  it('scheduledStart is the schedule\'s time and nothing else: a board (or Kalshi) time of 01:00Z does not move it', () => {
    expect(scheduledStart(schedule, { eventId: TOR_CGY, away: 'TOR', home: 'CGY', startMs: KALSHI_IMPLIED })).toBe(SCHEDULE_START);
    // a different event id for the same pairing: found by the two teams within three days
    expect(scheduledStart(schedule, { eventId: 'evt_other', away: 'TOR', home: 'CGY', startMs: KALSHI_IMPLIED })).toBe(SCHEDULE_START);
    // a rematch a week later is a different game, not this one
    expect(scheduledStart(schedule, { eventId: 'evt_other', away: 'TOR', home: 'CGY', startMs: KALSHI_IMPLIED + 7 * 86_400_000 })).toBeNull();
  });
  it('a board whose time disagrees with the schedule is corrected to the schedule; one that agrees is left alone (same object)', () => {
    const wrong = [bundle([item('2026-10-27T01:00:00Z')])];
    const out = withScheduleStarts(wrong, () => schedule);
    expect(out[0].board[0].start_time_utc).toBe('2026-10-27T00:30:00Z');
    expect(wrong[0].board[0].start_time_utc).toBe('2026-10-27T01:00:00Z'); // the input is not mutated
    const right = [bundle([item('2026-10-27T00:30:00Z')])];
    expect(withScheduleStarts(right, () => schedule)[0]).toBe(right[0]);
  });
  it('without a schedule for the sport the board keeps its own time; an event the schedule does not know keeps its own time', () => {
    const b = [bundle([item('2026-10-27T01:00:00Z')])];
    expect(withScheduleStarts(b, () => undefined)[0]).toBe(b[0]);
    expect(withScheduleStarts(b, () => [])[0]).toBe(b[0]);
    const unknown = [bundle([{ ...item('2026-11-30T01:00:00Z', 'evt_unknown'), participants: [part('x', 'AAA'), part('y', 'BBB')], away_participant: 'x', home_participant: 'y' } as BoardItem])];
    expect(withScheduleStarts(unknown, () => schedule)[0]).toBe(unknown[0]);
  });
  it('tennis keeps the board\'s own nominal time (verified by first-ball status, not by the schedule)', () => {
    const tennis = SPORTS.find((s) => s.slug === 'tennis');
    if (!tennis) return;
    const b: SportBundle[] = [{ ...bundle([item('2026-10-27T01:00:00Z')]), sport: tennis }];
    expect(withScheduleStarts(b, () => schedule)[0]).toBe(b[0]);
  });
  it('the registry is idempotent for the same document and replaces on a new one', () => {
    clearSchedules();
    registerSchedule('nhl', schedule, idx);
    expect(knownSchedule('nhl')).toBe(schedule);
    registerSchedule('nhl', [...schedule], idx); // same source document: ignored
    expect(knownSchedule('nhl')).toBe(schedule);
    const next = [...schedule];
    registerSchedule('nhl', next, { ...idx });
    expect(knownSchedule('nhl')).toBe(next);
    clearSchedules();
    expect(knownSchedule('nhl')).toBeUndefined();
  });
});

describe('no Kalshi time is read anywhere in v3', () => {
  // Kalshi's event and market metadata carry times of their own (close_time, expected_expiration_time, expiration_time, strike_date). None
  // may be read by v3 code: a start time is the schedule's, and a market's closing time is not a start time.
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(n)) out.push(p); }
    return out;
  };
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  it('src/v3 never reads close_time, closeTime, expected_expiration_time, expiration_time or strike_date', () => {
    const hits = walk(join(__dirname, '..', '..', 'src', 'v3')).filter((f) => /close_?time|closeTime|expected_expiration|expiration_time|strike_date/i.test(code(readFileSync(f, 'utf8'))));
    expect(hits).toEqual([]);
  });
});
