// The featured hero's honesty, in a phrase: a publication's long model caveat becomes one plain line, and the full
// wording stays one tap away (the hero's info popover). Nothing here changes what the numbers are or how strong
// they are; it only shortens how the limitation is first stated.

/** One plain phrase for a model's published caveat. */
export function modelTag(caveat: string | null | undefined): string | null {
  if (!caveat) return null;
  if (/\b(behind|trails?|redundant|worse than|below)\b[^.]*\bmarket\b/i.test(caveat)) return 'Research model · behind the closing market';
  return 'Research model';
}

/** Where the market figures came from, in a few words. */
export function marketTag(basis: string | null | undefined): string | null {
  if (!basis) return null;
  if (/midpoint/i.test(basis)) return 'Midpoint estimate, not a live price';
  if (/game-winner/i.test(basis)) return 'Game-winner contracts';
  return basis;
}
