// Player imagery for the Game Script cards (REVIEW ASSETS until a licensed source is chosen; see
// scripts/players/players.json). Each script gets the imagery of the team its scenario is about: the favourite
// for the two "favourite" scripts, both teams for a one-score game, the underdog for "underdog controls".
// A team with no player image falls back to its own logo as atmosphere — never initials or a silhouette.
import manifest from './player-images.json';
import type { ScriptId, ScriptSet } from './scripts';

interface PlayerImage { name: string; team: string; slot: string; focus?: string; file: string; source: string; artist: string; license: string; license_url: string | null; modifications?: string; review_asset?: boolean }
const IMAGES = (manifest as { players: Record<string, PlayerImage> }).players;

export interface ScriptArt { kind: 'player' | 'logo'; team: string; src: string | null; focus: string; name: string | null }

function forTeam(team: string, prefer: string[]): ScriptArt {
  const mine = Object.entries(IMAGES).filter(([, p]) => p.team === team);
  for (const slot of [...prefer, 'lead', 'control', 'pull-away']) {
    const hit = mine.find(([, p]) => p.slot === slot);
    if (hit) return { kind: 'player', team, src: `${import.meta.env.BASE_URL}players/nfl/${hit[0]}.webp`, focus: hit[1].focus ?? 'center 20%', name: hit[1].name };
  }
  return { kind: 'logo', team, src: null, focus: 'center', name: null };
}

export function scriptArt(set: ScriptSet, id: ScriptId): ScriptArt[] {
  const fav = set.fav === 'home' ? set.homeAbbr : set.awayAbbr;
  const dog = set.fav === 'home' ? set.awayAbbr : set.homeAbbr;
  if (id === 'fav-big') return [forTeam(fav, ['pull-away'])];
  if (id === 'fav') return [forTeam(fav, ['control'])];
  if (id === 'close') return [forTeam(set.awayAbbr, ['lead']), forTeam(set.homeAbbr, ['lead'])];
  return [forTeam(dog, ['lead'])];
}

/** Every player image with its credit, for Data & provenance. */
export function allPlayerImages(): (PlayerImage & { id: string })[] {
  return Object.entries(IMAGES).map(([id, p]) => ({ id, ...p }));
}
