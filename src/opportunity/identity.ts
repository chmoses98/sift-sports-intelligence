// CONTRACT IDENTITY — before a card says "YES Vasco da Gama to win", the Kalshi ticker it prices must actually be that
// contract. A publication names the side in words ("Result: home", "ML_Away", "Felipe De Dios"); the ticker names it
// in Kalshi's own codes (…-26OCT10VDGCR-CR). Sift checks the two agree wherever the ticker carries a team or player
// code, and refuses to feature a row where the code points at the OTHER side: its fair probability belongs to one
// contract and its price to another, so its "edge" is an artefact (live, 2026-10-09: Clube do Remo's contract labelled
// "Result: home" at 9.5¢ against Vasco's 57% home-win probability).
//
//   VERIFIED     the ticker's code sits on the side the publication names
//   MISMATCH     the ticker's code sits on the other side: never featured, a PASS with the reason
//   UNVERIFIED   the ticker carries no side code (totals, both-teams-to-score) or the code is ambiguous: as published
//
// Pure functions over strings; no network, no guessing. A code is only read as a side when it fits exactly one side.

export type Orientation = 'VERIFIED' | 'MISMATCH' | 'UNVERIFIED';

export interface OrientationRead {
  state: Orientation;
  /** Why, in one sentence, when the state is MISMATCH. */
  reason: string | null;
}

const OK: OrientationRead = { state: 'VERIFIED', reason: null };
const UNKNOWN: OrientationRead = { state: 'UNVERIFIED', reason: null };

export interface TickerParts {
  series: string;
  /** The event's participant codes, concatenated as Kalshi lists them ("VDGCR", "CLECWS", "COVDED"). */
  pair: string;
  /** The contract's own code ("CR", "CR3", "LAD", "TIE", "PUE1LEO0", "DED"). */
  suffix: string;
}

/** Series, participant pair and contract suffix of a Kalshi game-level ticker, or null when it has another shape. */
export function tickerParts(ticker: string | null | undefined): TickerParts | null {
  const segs = String(ticker ?? '').toUpperCase().split('-');
  if (segs.length !== 3) return null;
  // Event segment: a date (26OCT10), an optional HHMM start (MLB: 26OCT071800), then the pair.
  const m = /^\d{2}[A-Z]{3}\d{2}(?:\d{4})?([A-Z][A-Z0-9]*)$/.exec(segs[1]);
  if (!m || !segs[2]) return null;
  return { series: segs[0], pair: m[1], suffix: segs[2] };
}

/**
 * Where the suffix's participant code sits in the pair: 'first', 'second', 'tie', or null when it fits neither or both.
 * The code is the suffix with an optional trailing line number (CR3 = CR, over/by 3); at least two letters.
 */
export function codePosition(pair: string, suffix: string): 'first' | 'second' | 'tie' | null {
  if (suffix === 'TIE') return 'tie';
  let first = false;
  let second = false;
  for (let k = suffix.length; k >= 2; k--) {
    const code = suffix.slice(0, k);
    if (!/^\d*$/.test(suffix.slice(k)) || code.length >= pair.length) continue;
    if (pair.startsWith(code)) first = true;
    if (pair.endsWith(code)) second = true;
  }
  return first === second ? null : first ? 'first' : 'second';
}

/** An exact-score suffix (PUE1LEO0) read against the pair: the goals of the pair's first and second participant. */
export function scoreOf(pair: string, suffix: string): [number, number] | null {
  for (let i = 2; i <= pair.length - 2; i++) {
    const a = pair.slice(0, i);
    const b = pair.slice(i);
    const m = new RegExp(`^${a}(\\d+)${b}(\\d+)$`).exec(suffix);
    if (m) return [Number(m[1]), Number(m[2])];
  }
  return null;
}

/** The side a soccer publication's market description names: home / away / draw, or null for a contract with no side. */
export function soccerLabelSide(desc: string): 'home' | 'away' | 'draw' | null {
  const d = desc.toLowerCase();
  const m = /result:\s*(home|away|draw)\b/.exec(d) ?? /\b(home|away) (?:wins by|team total)\b/.exec(d) ?? /first team to score:\s*(home|away)\b/.exec(d);
  return m ? (m[1] as 'home' | 'away' | 'draw') : null;
}

/**
 * Soccer: Kalshi lists the home side first in the event code (KXEPLGAME-…ARSLEE: Arsenal at home), so a contract the
 * publication calls "home" must carry the pair's first code, "away" the second, "draw" TIE; an exact score
 * "a-b (home-away)" must read a-b in pair order.
 */
export function soccerOrientation(ticker: string | null | undefined, desc: string, names: { home: string; away: string }): OrientationRead {
  const t = tickerParts(ticker);
  if (!t) return UNKNOWN;
  const score = /exact score (\d+)-(\d+) \(home-away\)/i.exec(desc);
  if (score) {
    const s = scoreOf(t.pair, t.suffix);
    if (!s) return UNKNOWN;
    const [h, a] = [Number(score[1]), Number(score[2])];
    if (s[0] === h && s[1] === a) return OK;
    return { state: 'MISMATCH', reason: `The publication calls this ${h}-${a} (${names.home}-${names.away}), but Kalshi’s contract ${ticker} is ${s[0]}-${s[1]} in its own home-away order.` };
  }
  const side = soccerLabelSide(desc);
  if (!side) return UNKNOWN;
  const pos = codePosition(t.pair, t.suffix);
  if (pos == null) return UNKNOWN;
  const want = side === 'draw' ? 'tie' : side === 'home' ? 'first' : 'second';
  if (pos === want) return OK;
  const actual = pos === 'tie' ? 'the draw' : pos === 'first' ? names.home : names.away;
  return { state: 'MISMATCH', reason: `The publication labels this contract ${side === 'draw' ? 'the draw' : `${side} (${side === 'home' ? names.home : names.away})`}, but Kalshi’s ticker ${ticker} is ${actual}’s contract: its fair probability and its price describe different outcomes.` };
}

/** MLB: the contract suffix is the team's own code (…CLECWS-CWS4 is the home team's total); it must be the side the ledger names. */
export function mlbOrientation(ticker: string | null | undefined, sideWord: 'home' | 'away' | null, codes: { home: string | null | undefined; away: string | null | undefined }): OrientationRead {
  const t = tickerParts(ticker);
  if (!t || !sideWord || !codes.home || !codes.away) return UNKNOWN;
  const code = t.suffix.replace(/\d+$/, '');
  const home = codes.home.toUpperCase();
  const away = codes.away.toUpperCase();
  if (code === (sideWord === 'home' ? home : away)) return OK;
  if (code === (sideWord === 'home' ? away : home)) return { state: 'MISMATCH', reason: `The ledger names the ${sideWord} side, but Kalshi’s ticker ${ticker} is ${code}’s contract.` };
  return UNKNOWN;
}

const letters = (s: string) => s.toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(Boolean);
/** True when a player-code suffix reads as this player's name: a surname token or the surname run together (DED = De Dios). */
function nameFits(code: string, name: string): boolean {
  const toks = letters(name);
  const rest = toks.slice(1).join('');
  return toks.some((t) => t.startsWith(code)) || (rest.length > 0 && rest.startsWith(code));
}

/** Tennis: a player contract's suffix (DED, AUG20) must read as the player the publication names, not the opponent. */
export function tennisOrientation(ticker: string | null | undefined, subject: string | null, opponent: string | null): OrientationRead {
  const t = tickerParts(ticker);
  if (!t || !subject || !opponent) return UNKNOWN;
  const code = t.suffix.replace(/\d+$/, '');
  if (code.length < 2) return UNKNOWN;
  const mine = nameFits(code, subject);
  const theirs = nameFits(code, opponent);
  if (mine && !theirs) return OK;
  if (theirs && !mine) return { state: 'MISMATCH', reason: `The publication names ${subject}, but Kalshi’s ticker ${ticker} is ${opponent}’s contract.` };
  return UNKNOWN;
}
