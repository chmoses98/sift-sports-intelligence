// Real player photography: free-licence Wikimedia Commons photos, pinned per player in
// scripts/players/players.json, fetched once by .github/workflows/player-images.yml into public/players/nfl/
// and credited in player-images.json (shown on Data & provenance). Never AI imagery, never hot-linked.
// A player without a pinned photo has none: screens fall back to the team's logo and colour, never to
// initials or a silhouette.
import manifest from './player-images.json';

interface PlayerImage { name: string; team: string; slot: string; participant_id?: string; focus?: string; file: string; source: string; artist: string; license: string; license_url: string | null; modifications?: string; review_asset?: boolean }
const IMAGES = (manifest as { players: Record<string, PlayerImage> }).players;

export interface PlayerPhoto {
  src: string;
  /** CSS object-position that keeps the face in frame. */
  focus: string;
  name: string;
  credit: string;
}

const norm = (s: string) => s.toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');
const SLOT_ORDER = ['portrait', 'lead', 'control', 'pull-away'];

/** The best photo of one player (by publication id, else by name + team), or null. */
export function playerPhoto(pid: string | null | undefined, name?: string | null, team?: string | null, prefer: string[] = []): PlayerPhoto | null {
  const mine = Object.entries(IMAGES).filter(([, p]) => (pid && p.participant_id === pid) || (name && norm(p.name) === norm(name) && (!team || p.team === team)));
  if (!mine.length) return null;
  const order = [...prefer, ...SLOT_ORDER];
  const [id, p] = [...mine].sort((a, b) => (order.indexOf(a[1].slot) + 99) % 99 - (order.indexOf(b[1].slot) + 99) % 99)[0];
  return { src: `${import.meta.env.BASE_URL}players/nfl/${id}.webp`, focus: p.focus ?? 'center 20%', name: p.name, credit: `${p.artist} · ${p.license}` };
}

/** Every player image with its credit, for Data & provenance. */
export function allPlayerImages(): (PlayerImage & { id: string })[] {
  return Object.entries(IMAGES).map(([id, p]) => ({ id, ...p }));
}
