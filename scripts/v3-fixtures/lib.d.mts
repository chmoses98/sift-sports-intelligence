// Types for lib.mjs (the e2e helpers and the unit tests import it from TypeScript).
export const TOOL_VERSION: string;
export const INDEX_SCHEMA: string;
export const MANIFEST_SCHEMA: string;
export const FAMILIES: string[];
export const PROP_SPORTS: Record<string, string>;
export const ALLOWED_HOSTS: string[];
export const PACK_RAW_MAX: number;
export const FILE_MAX: number;
export const repoRoot: string;
export function bundleDir(dir?: string): string;
export function sha256(buf: Uint8Array | string): string;
export function cacheKey(url: string): string;
export function isoZ(d: Date | string | number): string;
export function gitSha(): string | null;

export interface ScanFinding { rule: string; match: string; at: number }
export interface AllowEntry { rule: string; match: string; reason: string }
export const SCAN_RULES: { id: string; re: RegExp }[];
export function scanText(text: string, allow?: AllowEntry[]): ScanFinding[];
export function checkUrl(url: string): string[];
export function loadAllow(dir?: string): AllowEntry[];
export function decodeUtf8(buf: Uint8Array): string | null;

export interface UrlEntry { status: number; sha256?: string | null; contentType?: string | null; fetchedAt?: string | null; bytes?: number }
export interface FamilyMeta { clock: { captured_at: string; basis: string }; [k: string]: unknown }
export interface Bundle { families: Record<string, { meta: FamilyMeta; urls: Record<string, UrlEntry> }>; docs: Map<string, Buffer>; tool: unknown }
export function emptyBundle(): Bundle;
export function loadBundle(dir?: string): Bundle;
export interface BundleIndex {
  schema: string;
  packs: Record<string, { file: string; sha256: string; compressed_bytes: number; raw_bytes: number; documents: number }>;
  documents: Record<string, { pack: string; offset: number; length: number }>;
  families: Record<string, { clock: { captured_at: string; basis: string }; urls: Record<string, { status: number; sha256?: string }> }>;
}
export interface BundleManifest {
  schema: string; tool: unknown; provenance: string; sources: unknown[];
  families: Record<string, { clock: { captured_at: string; basis: string }; documents: number; bytes: number; entries: { url: string; status: number; sha256: string | null; bytes: number; content_type: string | null; fetched_at: string | null }[]; [k: string]: unknown }>;
  totals: { families: number; urls: number; unique_documents: number; unique_bytes: number; pack_compressed_bytes: number };
}
export function writeBundle(dir: string | undefined, bundle: Bundle, o?: { tool?: unknown }): { index: BundleIndex; manifest: BundleManifest };
export function dirSize(dir: string): number;

export interface FixtureDocument { status: number; body: Buffer; contentType: string }
export interface FixtureFamily { name: string; clock: { captured_at: string; basis: string }; urls: string[]; get(url: string): FixtureDocument | null }
export interface FixtureReader { dir: string; index: BundleIndex; manifest: BundleManifest; families(): string[]; family(name: string): FixtureFamily }
/** The committed bundle, read lazily (packs are decompressed on first use and kept for the process). */
export function openBundle(dir?: string): FixtureReader;
/** The clock pin (an ISO instant) of a family. */
export function familyClock(name: string, dir?: string): string;
