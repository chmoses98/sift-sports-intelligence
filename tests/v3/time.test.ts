// Start-time formatting in actual viewer time zones (model/time.ts): the schedule's UTC instants render in the viewer's local zone, and a day is
// the viewer's LOCAL calendar day. Zones are pinned per call, never the sandbox's (UTC), so these tests mean the same on every machine.
import { describe, expect, it } from 'vitest';
import { bucketOf, clockTime, compactWhen, dayClock, dayDiff, dayKey, dayOffset, dayWord, hasStart, keyLabel, keyWord, monthDay, numericDate, parts, shiftDayKey, weekdayClock, weekdayShort, whenWords, zonedMs } from '../../src/v3/model/time';

const NY = { zone: 'America/New_York', locale: 'en-US' };
const CHI = { zone: 'America/Chicago', locale: 'en-US' };
const LA = { zone: 'America/Los_Angeles', locale: 'en-US' };
const LON = { zone: 'Europe/London', locale: 'en-US' };
const AKL = { zone: 'Pacific/Auckland', locale: 'en-US' };
const UTC = { zone: 'UTC', locale: 'en-US' };
const t = (iso: string) => Date.parse(iso);
/** ICU writes "8:15 PM" with a narrow no-break space before the meridiem; compare on plain spaces. */
const plain = (s: string) => s.replace(/\s/g, ' ');

// DAL at PHI, the real Monday-night game of the captured slate: 2026-10-27T00:15:00Z.
const DAL_PHI = t('2026-10-27T00:15:00Z');
const SLATE_NOW = t('2026-10-26T23:25:00Z');

describe('the DAL at PHI start (2026-10-27T00:15:00Z) in the viewer zone', () => {
  it('is Monday 8:15 PM in New York, not "Tue 12:15 AM"', () => {
    expect(plain(clockTime(DAL_PHI, NY))).toBe('8:15 PM');
    expect(weekdayShort(DAL_PHI, NY)).toBe('Mon');
    expect(plain(weekdayClock(DAL_PHI, NY))).toBe('Mon 8:15 PM');
    expect(dayKey(DAL_PHI, NY)).toBe('2026-10-26');
    expect(monthDay(DAL_PHI, NY)).toBe('Oct 26');
    expect(numericDate(DAL_PHI, NY)).toBe('10/26');
  });
  it('is Monday 7:15 PM in Chicago and 5:15 PM in Los Angeles', () => {
    expect(plain(weekdayClock(DAL_PHI, CHI))).toBe('Mon 7:15 PM');
    expect(plain(weekdayClock(DAL_PHI, LA))).toBe('Mon 5:15 PM');
    expect(dayKey(DAL_PHI, CHI)).toBe('2026-10-26');
    expect(dayKey(DAL_PHI, LA)).toBe('2026-10-26');
  });
  it('is Tuesday in London (GMT after the UK change on 2026-10-25) and in Auckland (NZDT, UTC+13)', () => {
    expect(plain(weekdayClock(DAL_PHI, LON))).toBe('Tue 12:15 AM');
    expect(dayKey(DAL_PHI, LON)).toBe('2026-10-27');
    expect(plain(weekdayClock(DAL_PHI, AKL))).toBe('Tue 1:15 PM');
    expect(dayKey(DAL_PHI, AKL)).toBe('2026-10-27');
  });
  it('reads Tue 12:15 AM only for a viewer whose zone is UTC (the sandbox symptom)', () => {
    expect(plain(weekdayClock(DAL_PHI, UTC))).toBe('Tue 12:15 AM');
  });
  it('is "Today" for a New York, Chicago, Los Angeles or Auckland viewer on the slate evening and "Tomorrow" for London', () => {
    expect(dayWord(DAL_PHI, SLATE_NOW, NY)).toBe('Today');
    expect(dayWord(DAL_PHI, SLATE_NOW, CHI)).toBe('Today');
    expect(dayWord(DAL_PHI, SLATE_NOW, LA)).toBe('Today');
    expect(dayWord(DAL_PHI, SLATE_NOW, LON)).toBe('Tomorrow');
    expect(dayWord(DAL_PHI, SLATE_NOW, AKL)).toBe('Today'); // Auckland is already on Tue Oct 27 at 12:25 PM NZDT
    expect(plain(dayClock(DAL_PHI, SLATE_NOW, NY, ' · '))).toBe('Today · 8:15 PM');
  });
  it('is bucketed to Monday (today) for New York, never to the UTC date', () => {
    expect(bucketOf(DAL_PHI, SLATE_NOW, NY)).toBe('today');
    expect(dayOffset(DAL_PHI, SLATE_NOW, NY)).toBe(0);
    expect(bucketOf(DAL_PHI, SLATE_NOW, LON)).toBe('tomorrow');
  });
});

describe('local midnight is the day boundary', () => {
  it('splits a game just before and just after New York midnight (EDT: 04:00Z)', () => {
    expect(dayKey(t('2026-10-27T03:59:59Z'), NY)).toBe('2026-10-26');
    expect(dayKey(t('2026-10-27T04:00:00Z'), NY)).toBe('2026-10-27');
    expect(plain(clockTime(t('2026-10-27T04:00:00Z'), NY))).toBe('12:00 AM');
    expect(plain(clockTime(t('2026-10-27T03:59:00Z'), NY))).toBe('11:59 PM');
  });
  it('splits at Chicago midnight (CDT: 05:00Z)', () => {
    expect(dayKey(t('2026-10-27T04:59:59Z'), CHI)).toBe('2026-10-26');
    expect(dayKey(t('2026-10-27T05:00:00Z'), CHI)).toBe('2026-10-27');
  });
  it('a game after local midnight is tomorrow whatever its UTC date', () => {
    const now = t('2026-10-26T22:00:00Z'); // 6 PM Monday in New York, still Monday 22:00 UTC
    const late = t('2026-10-27T04:30:00Z'); // 12:30 AM Tuesday in New York, 04:30 UTC Tuesday
    const early = t('2026-10-27T03:30:00Z'); // 11:30 PM Monday in New York
    expect(bucketOf(late, now, NY)).toBe('tomorrow');
    expect(bucketOf(early, now, NY)).toBe('today');
    expect(dayWord(early, now, NY)).toBe('Today');
    expect(dayWord(late, now, NY)).toBe('Tomorrow');
  });
  it('a viewer whose local date differs from the UTC date is bucketed by the local date', () => {
    // 2026-10-27T01:00Z is still Monday evening in New York, Chicago and Los Angeles but Tuesday in London and Auckland.
    const g = t('2026-10-27T01:00:00Z');
    const now = t('2026-10-26T20:00:00Z');
    expect(dayKey(g, NY)).toBe('2026-10-26');
    expect(dayKey(g, LA)).toBe('2026-10-26');
    expect(dayKey(g, AKL)).toBe('2026-10-27');
    expect(bucketOf(g, now, NY)).toBe('today');
    expect(bucketOf(g, now, LON)).toBe('tomorrow');
  });
});

describe('the US daylight-saving change on 2026-11-01', () => {
  it('has two 1:30 AM wall times in New York, an hour apart, on the same day', () => {
    const first = t('2026-11-01T05:30:00Z'); // 1:30 AM EDT
    const second = t('2026-11-01T06:30:00Z'); // 1:30 AM EST
    expect(plain(clockTime(first, NY))).toBe('1:30 AM');
    expect(plain(clockTime(second, NY))).toBe('1:30 AM');
    expect(dayKey(first, NY)).toBe('2026-11-01');
    expect(dayKey(second, NY)).toBe('2026-11-01');
  });
  it('the day is 25 hours long: local midnights are 04:00Z and 05:00Z the next day', () => {
    expect(zonedMs('2026-11-01', 0, 0, NY)).toBe(t('2026-11-01T04:00:00Z'));
    expect(zonedMs('2026-11-02', 0, 0, NY)).toBe(t('2026-11-02T05:00:00Z'));
    expect(zonedMs('2026-11-02', 0, 0, NY) - zonedMs('2026-11-01', 0, 0, NY)).toBe(25 * 3_600_000);
    expect(zonedMs('2026-11-01', 0, 0, CHI)).toBe(t('2026-11-01T05:00:00Z'));
    expect(zonedMs('2026-11-02', 0, 0, CHI)).toBe(t('2026-11-02T06:00:00Z'));
  });
  it('buckets by calendar day, not by adding 24 hours', () => {
    const noon = t('2026-11-01T17:00:00Z'); // noon EST on the 25-hour day
    expect(bucketOf(t('2026-11-02T04:59:00Z'), noon, NY)).toBe('today'); // 11:59 PM EST, Nov 1
    expect(bucketOf(t('2026-11-02T05:00:00Z'), noon, NY)).toBe('tomorrow'); // 12:00 AM EST, Nov 2
    expect(dayWord(t('2026-11-02T05:30:00Z'), noon, NY)).toBe('Tomorrow');
    // 24 hours after a 12:30 AM EDT start is still the same calendar day (Nov 1, 11:30 PM EST).
    expect(dayKey(t('2026-11-01T04:30:00Z') + 24 * 3_600_000, NY)).toBe('2026-11-01');
  });
  it('a wall time that exists maps back to itself, before and after the change', () => {
    for (const [key, hh, mm] of [['2026-10-31', 20, 15], ['2026-11-01', 0, 30], ['2026-11-01', 3, 0], ['2026-11-01', 20, 15], ['2026-11-02', 19, 0]] as const) {
      const ms = zonedMs(key, hh, mm, NY);
      const p = parts(ms, NY);
      expect([p.y, p.m, p.d, p.hh, p.mm]).toEqual([Number(key.slice(0, 4)), Number(key.slice(5, 7)), Number(key.slice(8, 10)), hh, mm]);
    }
  });
  it('resolves the repeated 1:30 AM to its first occurrence and survives the spring-forward gap', () => {
    expect(zonedMs('2026-11-01', 1, 30, NY)).toBe(t('2026-11-01T05:30:00Z'));
    expect(Number.isFinite(zonedMs('2026-03-08', 2, 30, NY))).toBe(true);
  });
  it('an evening kick-off is the same wall time the day before and the day after the change', () => {
    for (const key of ['2026-10-31', '2026-11-01', '2026-11-02']) expect(plain(clockTime(zonedMs(key, 20, 15, NY), NY))).toBe('8:15 PM');
  });
  it('Europe/London and Auckland change on their own dates, never on the US one', () => {
    expect(plain(clockTime(t('2026-10-24T19:00:00Z'), LON))).toBe('8:00 PM'); // BST (UTC+1) the day before the UK change
    expect(plain(clockTime(t('2026-10-25T19:00:00Z'), LON))).toBe('7:00 PM'); // GMT
    expect(plain(clockTime(t('2026-11-01T19:00:00Z'), LON))).toBe('7:00 PM');
    expect(plain(clockTime(t('2026-11-01T19:00:00Z'), AKL))).toBe('8:00 AM'); // NZDT UTC+13
  });
});

describe('day words and groupings', () => {
  const now = t('2026-10-27T15:00:00Z'); // 11 AM Tuesday in New York
  it('Today / Tomorrow / Yesterday / a dated word', () => {
    expect(dayWord(t('2026-10-27T23:00:00Z'), now, NY)).toBe('Today');
    expect(dayWord(t('2026-10-28T23:00:00Z'), now, NY)).toBe('Tomorrow');
    expect(dayWord(t('2026-10-26T23:00:00Z'), now, NY)).toBe('Yesterday');
    expect(dayWord(t('2026-10-30T23:00:00Z'), now, NY)).toBe('Fri, Oct 30');
  });
  it('whenWords names a weekday within the week and a date beyond it', () => {
    expect(plain(whenWords(t('2026-10-30T23:00:00Z'), now, NY))).toBe('Fri 7:00 PM');
    expect(plain(whenWords(t('2026-11-15T18:00:00Z'), now, NY))).toBe('Nov 15 1:00 PM');
  });
  it('compactWhen is just the clock tonight, then weekday / date', () => {
    expect(plain(compactWhen(t('2026-10-28T00:15:00Z'), now, NY))).toBe('8:15 PM');
    expect(plain(compactWhen(t('2026-10-29T00:15:00Z'), now, NY))).toBe('Wed 8:15 PM'); // tomorrow, named by its weekday: the week is unambiguous and the row is narrow
    expect(plain(compactWhen(t('2026-10-31T00:15:00Z'), now, NY))).toBe('Fri 8:15 PM');
    expect(plain(compactWhen(t('2026-11-15T18:00:00Z'), now, NY))).toBe('Nov 15 1:00 PM');
  });
  it('day keys shift and diff by calendar days across month, year and leap boundaries', () => {
    expect(shiftDayKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDayKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDayKey('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftDayKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(dayDiff('2026-10-31', '2026-11-02')).toBe(2);
    expect(dayDiff('2026-11-02', '2026-10-31')).toBe(-2);
  });
  it('labels a day key with its own calendar date, whatever the zone', () => {
    expect(keyLabel('2026-10-27', NY)).toBe('Tue, Oct 27');
    expect(keyLabel('2026-10-27', AKL)).toBe('Tue, Oct 27');
    expect(keyWord('2026-10-27', '2026-10-27')).toBe('Today');
    expect(keyWord('2026-10-28', '2026-10-27')).toBe('Tomorrow');
    expect(keyWord('2026-11-04', '2026-10-27', NY)).toBe('Wed, Nov 4');
  });
});

describe('a missing start time shows nothing', () => {
  const bad: (number | null | undefined)[] = [NaN, null, undefined, Infinity];
  it('every formatter answers empty / null, never a guess', () => {
    for (const x of bad) {
      expect(hasStart(x)).toBe(false);
      expect(clockTime(x, NY)).toBe('');
      expect(dayWord(x, SLATE_NOW, NY)).toBe('');
      expect(weekdayShort(x, NY)).toBe('');
      expect(monthDay(x, NY)).toBe('');
      expect(numericDate(x, NY)).toBe('');
      expect(weekdayClock(x, NY)).toBe('');
      expect(dayClock(x, SLATE_NOW, NY)).toBe('');
      expect(whenWords(x, SLATE_NOW, NY)).toBe('');
      expect(compactWhen(x, SLATE_NOW, NY)).toBe('');
      expect(dayKey(x, NY)).toBeNull();
      expect(dayOffset(x, SLATE_NOW, NY)).toBeNull();
      expect(bucketOf(x, SLATE_NOW, NY)).toBeNull();
    }
  });
  it('epoch zero is a real instant, not a missing one', () => {
    expect(hasStart(0)).toBe(true);
    expect(dayKey(0, UTC)).toBe('1970-01-01');
  });
});
