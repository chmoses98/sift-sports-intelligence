// Every start time SIFT 3.0 shows is formatted here, and nowhere else.
//
// A start time is an INSTANT (epoch milliseconds, from the schedule authority's UTC start). It is shown in the VIEWER's local time zone
// (the device's own zone; never a hard-coded one and never a zone label we would have to invent), and a "day" is the viewer's LOCAL
// calendar day: it begins at local midnight, so a 25-hour day on the US daylight-saving change and a game that starts after local
// midnight (whatever its UTC date) are bucketed correctly. A missing or unreadable start shows NOTHING (an empty string / null), never a guess.
//
// Day arithmetic is done on calendar keys ("2026-10-26"), never by adding 24 h, so daylight-saving days cannot shift a boundary.
// Every function takes an optional environment (`{ zone, locale }`) so tests can pin the zone; the app passes none and gets the device's.
export interface TimeEnv { zone?: string; locale?: string }

/** A finite epoch-millisecond start (anything else is "no start time"). */
export const hasStart = (ms: number | null | undefined): ms is number => typeof ms === 'number' && Number.isFinite(ms);

/** The device's IANA time zone ("America/New_York"), or "UTC" when the runtime cannot say. */
export function viewerZone(): string {
  try { return new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(zone: string | undefined, locale: string | undefined, key: string, o: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = `${zone ?? ''}|${locale ?? ''}|${key}`;
  let f = cache.get(k);
  if (!f) {
    try { f = new Intl.DateTimeFormat(locale, { ...o, timeZone: zone }); } catch { f = new Intl.DateTimeFormat(locale, { ...o, timeZone: 'UTC' }); }
    cache.set(k, f);
  }
  return f;
}
// The device zone can change under a running page (travel, settings), so the default zone is resolved on every call, never cached with a formatter.
const zoneOf = (e?: TimeEnv) => e?.zone ?? viewerZone();

export interface Parts { y: number; m: number; d: number; hh: number; mm: number; ss: number; /** 0 = Sunday */ dow: number }

/** The wall-clock fields of an instant in a zone. */
export function parts(ms: number, e?: TimeEnv): Parts {
  const f = fmt(zoneOf(e), 'en-US', 'parts', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23', weekday: 'short' });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday);
  return { y: Number(o.year), m: Number(o.month), d: Number(o.day), hh: Number(o.hour) % 24, mm: Number(o.minute), ss: Number(o.second), dow };
}

const pad = (n: number) => String(n).padStart(2, '0');
export const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const unkey = (key: string): [number, number, number] => { const [y, m, d] = key.split('-').map(Number); return [y, m, d]; };

/** The viewer's local calendar day of an instant, "YYYY-MM-DD"; null without a start. Keys compare correctly as strings. */
export function dayKey(ms: number | null | undefined, e?: TimeEnv): string | null {
  if (!hasStart(ms)) return null;
  const p = parts(ms, e);
  return keyOf(p.y, p.m, p.d);
}

/** The calendar day `n` days after (or before) a day key. Pure calendar arithmetic: a 23- or 25-hour day is one day. */
export function shiftDayKey(key: string, n: number): string {
  const [y, m, d] = unkey(key);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return keyOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Whole calendar days from `a` to `b` (b later is positive). */
export function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = unkey(a), [by, bm, bd] = unkey(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Days from the viewer's today to the start's local day (0 today, 1 tomorrow, -1 yesterday); null without a start. */
export function dayOffset(ms: number | null | undefined, now: number, e?: TimeEnv): number | null {
  const k = dayKey(ms, e);
  const t = dayKey(now, e);
  return k == null || t == null ? null : dayDiff(t, k);
}

export type DayBucket = 'earlier' | 'yesterday' | 'today' | 'tomorrow' | 'later';
/** Where a start falls relative to the viewer's local today; null without a start. */
export function bucketOf(ms: number | null | undefined, now: number, e?: TimeEnv): DayBucket | null {
  const n = dayOffset(ms, now, e);
  return n == null ? null : n < -1 ? 'earlier' : n === -1 ? 'yesterday' : n === 0 ? 'today' : n === 1 ? 'tomorrow' : 'later';
}

/** "Mon, Oct 26": a day key written as a short date. Locale-aware; the key's own calendar date, never shifted by a zone. */
export function keyLabel(key: string, e?: TimeEnv): string {
  const [y, m, d] = unkey(key);
  return fmt('UTC', e?.locale, 'keylabel', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "Today", "Tomorrow", "Yesterday" or the short date, for a day key relative to the viewer's today key. */
export function keyWord(key: string, todayKey: string, e?: TimeEnv): string {
  const n = dayDiff(todayKey, key);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : keyLabel(key, e);
}

/** "8:15 PM" in the viewer's zone ("20:15" where the device's locale uses 24 h); "" without a start. */
export function clockTime(ms: number | null | undefined, e?: TimeEnv): string {
  if (!hasStart(ms)) return '';
  return fmt(zoneOf(e), e?.locale, 'clock', { hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
}

/** "Today", "Tomorrow", "Yesterday", else "Tue, Oct 27", by the viewer's local day; "" without a start. */
export function dayWord(ms: number | null | undefined, now: number = Date.now(), e?: TimeEnv): string {
  const k = dayKey(ms, e);
  const t = dayKey(now, e);
  return k == null || t == null ? '' : keyWord(k, t, e);
}

/** "Mon": the weekday of the viewer's local day; "" without a start. */
export function weekdayShort(ms: number | null | undefined, e?: TimeEnv): string {
  if (!hasStart(ms)) return '';
  return fmt(zoneOf(e), e?.locale, 'weekday', { weekday: 'short' }).format(new Date(ms));
}

/** "Oct 27": the viewer's local month and day; "" without a start. */
export function monthDay(ms: number | null | undefined, e?: TimeEnv): string {
  if (!hasStart(ms)) return '';
  return fmt(zoneOf(e), e?.locale, 'monthday', { month: 'short', day: 'numeric' }).format(new Date(ms));
}

/** "10/26": the viewer's local month/day as numbers (axis labels); "" without a start. */
export function numericDate(ms: number | null | undefined, e?: TimeEnv): string {
  if (!hasStart(ms)) return '';
  const p = parts(ms, e);
  return `${p.m}/${p.d}`;
}

/** "Mon 8:15 PM": weekday and clock (compact rows and strips); "" without a start. */
export function weekdayClock(ms: number | null | undefined, e?: TimeEnv): string {
  return hasStart(ms) ? `${weekdayShort(ms, e)} ${clockTime(ms, e)}` : '';
}

/** "Tomorrow 8:15 PM" (separator configurable: " · " in a hero); "" without a start. */
export function dayClock(ms: number | null | undefined, now: number = Date.now(), e?: TimeEnv, sep = ' '): string {
  return hasStart(ms) ? `${dayWord(ms, now, e)}${sep}${clockTime(ms, e)}` : '';
}

/** "Mon 8:15 PM" within the coming week, "Nov 15 1:00 PM" beyond it (a date, so far-off games are unambiguous); "" without a start. */
export function whenWords(ms: number | null | undefined, now: number = Date.now(), e?: TimeEnv): string {
  const n = dayOffset(ms, now, e);
  if (n == null) return '';
  return `${n > -1 && n < 6 ? weekdayShort(ms, e) : monthDay(ms, e)} ${clockTime(ms, e)}`;
}

/** A row's start: just the clock tonight ("8:15 PM"), then "Tomorrow 8:15 PM", a weekday within the week ("Thu 8:15 PM"), a date beyond ("Nov 3 8:15 PM"). "" without a start. */
export function compactWhen(ms: number | null | undefined, now: number = Date.now(), e?: TimeEnv): string {
  const n = dayOffset(ms, now, e);
  if (n == null) return '';
  const at = clockTime(ms, e);
  if (n === 0) return at;
  const day = n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : n > 1 && n < 6 ? weekdayShort(ms, e) : monthDay(ms, e);
  return `${day} ${at}`;
}

/** The instant of a wall-clock time on a day key in a zone (a viewer's local midnight is `zonedMs(key, 0, 0)`). Used where the app builds
 *  sample kick-offs and where the Games date filter needs a day's bounds. Resolved against the zone's own offset on that day, so the
 *  daylight-saving change cannot move it. A repeated wall time (fall back) resolves to its first occurrence; one that does not exist (spring forward) still
 *  resolves to a real instant beside the gap. */
export function zonedMs(key: string, hh: number, mm: number, e?: TimeEnv): number {
  const [y, m, d] = unkey(key);
  const wall = Date.UTC(y, m - 1, d, hh, mm, 0);
  const offsetAt = (t: number) => { const p = parts(t, e); return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(t / 1000) * 1000; };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t);
  return t;
}
