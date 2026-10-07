// Types for slate.mjs (tests import it from TypeScript).
import type { Publication } from './lib.mjs';
export interface BoardItem { event_id: string; status: string; start_time_utc: string; [k: string]: unknown }
export interface Board { generated_at?: string | null; items?: BoardItem[] }
export interface FeedIndexGame { key: string; event_ids?: string[]; markets: number }
export interface SlateOptions { source?: string | null; horizonDays?: number; lookbackHours?: number }
export const LOOKBACK_HOURS: number;
export const HORIZON_DAYS: number;
export function isEligibleEvent(item: BoardItem, now: number, o?: { horizonDays?: number; lookbackHours?: number }): boolean;
export function danglingEvents(items: BoardItem[], now: number, o?: { lookbackHours?: number }): BoardItem[];
export function publicationStatus(board: Board, now: number, o?: SlateOptions): Omit<Publication, 'sport'>;
export function publishVerdict(publication: Pick<Publication, 'status' | 'reasons'>, games: number, markets: number): { publish: boolean; reason: string };
type Brief = { event_id: string; status: string; start_time_utc: string };
export function selectTarget(board: Board, now: number, feedIndex?: { games?: FeedIndexGame[] } | null, o?: SlateOptions): {
  mode: 'CURRENT' | 'OFF_SLATE' | 'STALE'; publication: Omit<Publication, 'sport'>; target: Brief | null;
  feed: { covered: boolean; key: string | null; markets: number } | null; historical: Brief | null;
};
export function honestPublicationStates(boardGeneratedAt: string | null | undefined, now: number): string[];
