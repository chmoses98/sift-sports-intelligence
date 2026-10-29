export const FORMAT: string;
export const sha1: (s: string) => string;
export interface Family { name: string; dir: string }
export interface MergedDoc { bytes: Buffer; family: string; kind: string }
export function kindOf(bytes: Uint8Array): string;
export function readCache(dir: string): Map<string, Buffer>;
export function readCapturedAt(dir: string): string;
export function mergeCaches(base: Family, others: Family[], gaps?: Family | null): {
  docs: Map<string, MergedDoc>;
  additions: { hash: string; family: string; kind: string }[];
  skipped: Record<string, { absent: number; sameUrlDifferentBytes: number }>;
  counts: Record<string, number>;
};
export interface Run { name: string; hashes: string[] }
export function planPacks(docs: Map<string, MergedDoc>, groups: { group: string; hashes: string[] }[], cap: number): Run[];
export interface BuiltPacks { packs: { name: string; docs: number; bytes: number; buf: Buffer }[]; entries: Record<string, [number, number, number]> }
export function buildPacks(docs: Map<string, MergedDoc>, runs: Run[], cap: number, min?: number): BuiltPacks;
export function writePacks(out: string, built: BuiltPacks, encoding?: 'bin' | 'b64'): { meta: { file: string; name: string; docs: number; bytes: number }[]; entries: Record<string, [number, number, number]> };
export function readDoc(index: { docs: Record<string, [number, number, number]> }, packBytes: (i: number) => Buffer, hash: string): Buffer | null;
