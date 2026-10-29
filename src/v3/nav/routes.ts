// Route builders: the only place a v3 research address is assembled. Every team, player, statistic, game, prop and price tap in the app
// resolves through one of these, so a given object has one destination everywhere (the locked navigation contract).
import { encode, type StateOf } from '../state/url';
import { gameSchema, playerSchema, propsSchema, statSchema, teamSchema } from './schemas';

export interface TeamRef { slug: string; id: string }
export interface PlayerRef { slug: string; id: string }
export interface StatRef { slug: string; statId: string }
export interface GameRef { slug: string; eventId: string }

const seg = (s: string) => encodeURIComponent(s);

export const routes = {
  home: () => '/v3',
  games: () => '/v3/games',
  explore: () => '/v3/explore',
  following: () => '/v3/following',
  /** A team: Team Research. */
  team: (t: TeamRef, s: Partial<StateOf<typeof teamSchema.fields>> = {}) => `/v3/team/${t.slug}/${seg(t.id)}${encode(teamSchema, s)}`,
  /** A player: Player Research. */
  player: (p: PlayerRef, s: Partial<StateOf<typeof playerSchema.fields>> = {}) => `/v3/player/${p.slug}/${seg(p.id)}${encode(playerSchema, s)}`,
  /** A statistic, rank, value or percentile: Stat Detail, ranking tab, the selected team or player highlighted. */
  stat: (r: StatRef, s: Partial<StateOf<typeof statSchema.fields>> = {}) => `/v3/stat/${r.slug}/${seg(r.statId)}${encode(statSchema, s)}`,
  /** A game, score, result row or matchup strip: Game Detail. Completed games use the same route. */
  game: (g: GameRef, s: Partial<StateOf<typeof gameSchema.fields>> = {}) => `/v3/game/${g.slug}/${seg(g.eventId)}${encode(gameSchema, s)}`,
  /** A prop, a prop count, "props today": Prop Discovery filtered to what was in view. */
  props: (s: Partial<StateOf<typeof propsSchema.fields>> = {}) => `/v3/props${encode(propsSchema, s)}`,
} as const;

/** The semantic kinds of tap target, in the order the contract lists them. */
export const TAP_KINDS = ['team', 'stat', 'player', 'props', 'price', 'game'] as const;
export type TapKind = (typeof TAP_KINDS)[number];

/** The same address with a sheet open (pushes a history entry, so Back closes it) or closed. */
export function withSheet(search: string, sheet: { kind: string; tk?: string } | null): string {
  const q = new URLSearchParams(search);
  q.delete('sheet'); q.delete('tk');
  if (sheet) { q.set('sheet', sheet.kind); if (sheet.tk) q.set('tk', sheet.tk); }
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Decode which sheet an address asks for. */
export function sheetOf(search: string): { kind: string; tk: string | null } | null {
  const q = new URLSearchParams(search);
  const kind = q.get('sheet');
  return kind ? { kind: kind.slice(0, 24), tk: q.get('tk')?.slice(0, 80) ?? null } : null;
}
