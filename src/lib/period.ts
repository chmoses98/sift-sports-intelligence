// Market periods across sports. The full game is 'FULL' in the NFL/NHL publications and 'FULL_GAME' in the MLB
// contract; every full-game check goes through isFullGame so a baseball game line is never filed as a half or a
// quarter. Inning windows ('F5' = the first five innings) read as words, never as codes.

/** True for a full-game period label ('FULL', 'FULL_GAME'). A missing period is left to each caller's own rule. */
export function isFullGame(period: string | null | undefined): boolean {
  return period === 'FULL' || period === 'FULL_GAME';
}

const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

/** Baseball inning windows: 'F5' → "First 5 innings", 'F1' → "1st inning", 'I3' → "3rd inning". Null for anything else. */
export function inningWords(period: string | null | undefined): string | null {
  const f = /^F(\d)$/.exec(period ?? '');
  if (f) return f[1] === '1' ? '1st inning' : `First ${f[1]} innings`;
  const i = /^I(\d)$/.exec(period ?? '');
  if (i) return `${ORD[Number(i[1])]} inning`;
  return null;
}

/** A period in words for any sport ("First 5 innings", "1H"); null for the full game. */
export function periodWords(period: string | null | undefined): string | null {
  if (!period || isFullGame(period)) return null;
  return inningWords(period) ?? period;
}
