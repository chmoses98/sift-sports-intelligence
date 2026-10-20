export const HUB_HORIZON_DAYS: number;
export const KICKOFF_TOLERANCE_MS: number;
export interface SlateItem { event_id: string; status?: string; start_time_utc?: string }
export type Mode = 'POPULATED' | 'EMPTY_SLATE' | 'EITHER';
export interface Expectation { pregame: number; actionable: number; rail: Mode; hub: Mode }
export interface Verdict { ok: boolean; mode: Mode; msg: string }
export interface RailFacts { list: boolean; items: number; emptyState: boolean; waiting: boolean }
export interface HubFacts { heading: boolean; tiles: number; tprops: boolean; rows: number; boardEmpty: number; strip: number; note: boolean; unavailable: boolean }
export function upcomingGames<T extends SlateItem>(items: T[] | undefined, now: number, days: number): T[];
export function isActionable(item: SlateItem | undefined, now: number): boolean;
export function expectation(items: SlateItem[] | undefined, now: number, opts?: { tolerance?: number }): Expectation;
export function judgeRail(expect: Expectation, facts: RailFacts): Verdict;
export function judgePropsHub(expect: Expectation, facts: HubFacts): Verdict;
export function badBoardText(text: string | null | undefined): string | null;
