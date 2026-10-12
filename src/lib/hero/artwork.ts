// Illustrative matchup artwork for the game hero. AI-generated promotional art approved by the owner for the Rams–Bills
// visual prototype: it is NOT a photograph of real players and is labelled as such. Scoped by matchup, so it never
// appears for another game.
export interface HeroArtwork {
  /** Full width (2171 px) and a 1200 px file for phones/tablets. */
  src: string;
  srcSmall: string;
  /** The two clubs the art depicts (either order). */
  teams: readonly [string, string];
  label: string;
}

const BASE = `${import.meta.env.BASE_URL}heroes/art/`;
const LAR_BUF: HeroArtwork = {
  src: `${BASE}nfl-lar-buf-2171.webp`,
  srcSmall: `${BASE}nfl-lar-buf-1200.webp`,
  teams: ['LAR', 'BUF'],
  label: 'Illustrative artwork — AI-generated, not a photograph',
};

const norm = (c: string) => (c === 'LA' ? 'LAR' : c);

/** The artwork for exactly this matchup, or null. */
export function heroArtwork(sport: string, a: string | null | undefined, b: string | null | undefined): HeroArtwork | null {
  if (sport !== 'NFL' || !a || !b) return null;
  const pair = [norm(a), norm(b)].sort().join('|');
  return pair === [...LAR_BUF.teams].sort().join('|') ? LAR_BUF : null;
}
