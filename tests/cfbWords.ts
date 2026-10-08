// The CFB vocabulary rules shared by the home and game page tests.

/** Words and figures the CFB pages never show (docs: the research-signals contract and the V2 read). */
export const BANNED: RegExp[] = [
  /\+EV\b/i, /\bEV\b/, /fair value/i, /bet up to/i, /\block\b/i, /\bhammer\b/i, /best bet/i, /high value bet/i, /proven edge/i,
  /\bfade\b/i, /bet against/i, /bad bet/i, /guarantee/i, /probabilit/i, /% chance/i, /chance to win/i, /\blikely\b/i,
  /prediction interval/i, /forecast band/i,
];
/** A percentage anywhere except the range labels "Middle 50%" / "Middle 80%". */
export const percentOutsideRanges = (t: string) => /\d\s*%/.test(t.replace(/Middle (50|80)%/g, ''));
