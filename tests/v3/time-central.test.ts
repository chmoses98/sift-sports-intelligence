// One module formats start times (model/time.ts). This keeps it that way: no other v3 file may read local calendar fields or format a date or a
// time of day itself (the way a sandbox in UTC would silently agree with its own mistakes), and nothing outside the module may name a time zone.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join('src', 'v3');
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : []; });
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const FORBIDDEN = [
  /\.toLocale(Date|Time)String\(/, /\.toLocaleString\(\s*(undefined|['"])/, // formatting a Date (a plain number's toLocaleString() takes no locale)
  /\.getHours\(|\.getMinutes\(|\.getDay\(|\.getDate\(|\.getMonth\(|\.getFullYear\(|\.getTimezoneOffset\(/,
  /\.toDateString\(|Intl\.DateTimeFormat/,
  /timeZone\s*:/,
  /America\/(New_York|Chicago|Los_Angeles|Denver)|Europe\/London|Pacific\/Auckland/,
];

describe('start times are formatted in one module', () => {
  const offenders: string[] = [];
  for (const f of files(root)) {
    if (f.endsWith(join('model', 'time.ts'))) continue;
    const src = stripComments(readFileSync(f, 'utf8'));
    for (const re of FORBIDDEN) if (re.test(src)) offenders.push(`${f.slice(root.length + 1)}: ${re}`);
  }
  it('no v3 file outside model/time.ts formats a date or time, reads local calendar fields or names a zone', () => {
    expect(offenders).toEqual([]);
  });
  it('the module itself never hard-codes a zone', () => {
    const src = stripComments(readFileSync(join(root, 'model/time.ts'), 'utf8'));
    expect(/America\/|Europe\/|Pacific\//.test(src)).toBe(false);
  });
});
