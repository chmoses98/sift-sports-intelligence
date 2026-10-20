export const FAMILIES: string[];
export const LABEL: Record<string, string>;
export const LOOKBACK_MS: number;
export const HORIZON_MS: number;
export interface PlanItem { event_id: string; status: string; start_time_utc: string; participants?: { short_name?: string }[] }
export interface FeedRow { player_id: string; name: string; team: string; game_id: string; family: string; mean: number; [k: string]: unknown }
export interface Plan {
  mode: 'NOT_APPLICABLE' | 'CHECK'; reason: string | null; game: PlanItem | null; pregame?: boolean;
  targets: { name: string; family: string; label: string; playerId: string; gameId: string; mean: number; dist: Record<string, unknown>; row: FeedRow }[];
  problems: string[]; notes: string[];
}
export function currentGame(items: PlanItem[] | undefined, now: number): PlanItem | null;
export function keyOf(r: { game_id: string; player_id: string; family: string }): string;
export function distributionPlan(a: { items: PlanItem[] | undefined; feed: { generated_utc: string; players: FeedRow[] } | null; art: Record<string, any> | null; now: number; perFamily?: number }): Plan;
