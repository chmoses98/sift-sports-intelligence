// Types for scripts/stadiums/lib.mjs (used by the unit tests).
export interface Rect { x0: number; y0: number; x1: number; y1: number }
export interface Focus { x: number; y: number }
export interface Crop { focus: Focus; mobile_focus?: Focus; card_focus?: Focus; keep: Rect }
export interface Targets {
  breakpoint_px: number;
  files: Record<'desktop' | 'mobile' | 'card', { suffix: string; aspect?: number; width?: number; height?: number; max_width?: number; max_height?: number; quality: number }>;
  source_min: { width: number; height: number; aspect_min: number; aspect_max: number };
  targets: { id: string; file: 'desktop' | 'mobile' | 'card'; aspect: [number, number]; keep_min: number; where: string }[];
}
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Photo = Record<string, any>;
export type VenueEntry = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const ROOT: string;
export const PATHS: Record<'venues' | 'photos' | 'targets' | 'public' | 'candidates' | 'inbox', string>;
export const QUALITY_BAR: string[];
export function load(): { venues: VenueEntry[]; photos: Record<string, Photo>; targets: Targets };
export function norm(s: string): string;
export function fileWindow(file: 'desktop' | 'mobile' | 'card', srcAspect: number, crop: Crop, targets: Targets): Rect;
export function displayFocus(file: 'desktop' | 'mobile' | 'card', crop: Crop): Focus;
export function visibleRect(win: Rect, srcAspect: number, boxAspect: number, pos: Focus): Rect;
export function coverage(keep: Rect, rect: Rect): number;
export function cropReport(photo: Photo, targets: Targets): { id: string; coverage: number; required: number; ok: boolean }[];
export function suggestedDesktopFocusY(photo: Photo, targets: Targets): number;
export function venueByName(venues: VenueEntry[], name: string, date?: string | null): VenueEntry | null;
export function venueForTeam(venues: VenueEntry[], team: string, date?: string | null): VenueEntry | null;
export function validateVenues(venues: VenueEntry[]): string[];
export function validatePhotos(photos: Record<string, Photo>, venues: VenueEntry[], targets: Targets, opts?: { checkFiles?: boolean; publicDir?: string; root?: string }): { errors: string[]; findings: string[]; owned: Set<string> };
export function webpSize(buf: Uint8Array): { width: number; height: number } | null;
export function imageSize(path: string): { width: number; height: number };
