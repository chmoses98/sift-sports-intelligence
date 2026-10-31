// Where a game was opened from, and how Back gets there. Pure logic (the hooks that apply it are in ./useGameNav.ts).
//
// The model: every game entry carries an `origin` marker in its history state: the position (react-router's history `idx`) of the entry
// the viewer was on when they opened the game, or null when there is no in-app entry below it (a deep link, a shared link, a fresh tab).
//  - The marker is written once, when a game screen first mounts on an entry (the entry below a freshly pushed game IS the screen that opened it).
//  - Every in-place change on the game (tab, switching to another game, a sheet, an expanded unit) carries the state forward, so the marker
//    survives all of them, a reload, and the browser Back/Forward buttons (history state is stored by the browser with the entry).
//  - Switching games replaces the entry instead of pushing one, so the stack never grows with the games the viewer flicks through.
//  - Back is "go to the origin": the distance between this entry and the marker, in one step, however many in-place entries (an open unit, a
//    tab changed after a unit) sit between. With no origin it goes Home with replace, so a deep link never leaves the app or loops.
// Cross-entity hops (a game to a team to another game) stay ordinary pushes: the game opened from a team has that team as its origin.

export const ORIGIN_KEY = 'v3origin';
/** The screen a game with no in-app history goes Back to. */
export const ORIGIN_FALLBACK = '/v3';

type Bag = Record<string, unknown>;
const bag = (state: unknown): Bag => (state && typeof state === 'object' ? (state as Bag) : {});

/** The marker an entry carries: a history position, null (no origin), or undefined (no game screen has seen this entry yet). */
export function readOrigin(state: unknown): number | null | undefined {
  const v = bag(state)[ORIGIN_KEY];
  if (v === null) return null;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined;
}

/** The same state with the marker set (other keys, such as an open sheet's flag, are kept). */
export function withOrigin(state: unknown, origin: number | null): Bag {
  return { ...bag(state), [ORIGIN_KEY]: origin };
}

/** State to carry onto a replacement entry (a game switch): the marker and nothing else (an open sheet's flag belongs to the entry that is being replaced). */
export function carryOrigin(state: unknown): Bag | null {
  const o = readOrigin(state);
  return o === undefined ? null : { [ORIGIN_KEY]: o };
}

/** The position of an entry: react-router stores it in `history.state.idx` (0 for the first entry of a tab). Anything else is unknown. */
export function positionOf(historyState: unknown): number | null {
  const i = bag(historyState).idx;
  return typeof i === 'number' && Number.isInteger(i) && i >= 0 ? i : null;
}

/** The origin to record for a game entry seen for the first time at `idx`: the entry just below it, when there is one. */
export function originFor(idx: number | null): number | null {
  return idx != null && idx > 0 ? idx - 1 : null;
}

export type BackPlan =
  /** Step `delta` entries back in one go (always negative). */
  | { kind: 'pop'; delta: number }
  /** No in-app origin: replace this entry with the fallback screen. */
  | { kind: 'fallback'; to: string };

/** What Back does from the entry at `idx` whose state is `state`. */
export function planBack(state: unknown, idx: number | null): BackPlan {
  const o = readOrigin(state);
  if (o == null || idx == null || o >= idx) {
    // Undecided (an entry no game screen has marked) with something below it: the old behaviour, one step. Otherwise nothing is below.
    if (o === undefined && idx != null && idx > 0) return { kind: 'pop', delta: -1 };
    return { kind: 'fallback', to: ORIGIN_FALLBACK };
  }
  return { kind: 'pop', delta: o - idx };
}
