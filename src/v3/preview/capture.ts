// PREVIEW ONLY (never imported by the app): the pure parts of the captured-data preview, kept apart from the DOM shim so they are unit-tested.
// The pack format (`sift3.captured-pack.v1`) is written by scripts/v3-preview/capture-lib.mjs: documents are gzip members laid back to back in
// packs/pNN.bin (or base64 text in packs/pNN.txt), and snapshot/index.json maps the SHA-1 of a request URL to [pack, offset, length].
export const PACK_FORMAT = 'sift3.captured-pack.v1';

export interface CaptureIndex {
  format: string;
  /** When the base capture was taken (ISO, UTC). */
  capturedAt: string;
  /** The fixed page clock: capturedAt minus CLOCK_LEAD_MS. */
  clockAt: string;
  /** The span of the documents' own generation stamps (informational, shown in the About sheet). */
  stamps?: { earliest: string | null; latest: string | null };
  /** Document counts by family (which cache a document came from). */
  families: Record<string, number>;
  total: number;
  packs: { file: string; name: string; docs: number; bytes: number }[];
  docs: Record<string, [number, number, number]>;
  /** Plain statements for the About sheet, written by the build. */
  about?: { real?: string[]; transformed?: string[]; notCaptured?: string[] };
  build?: string;
}

/** The page clock sits this far BEFORE the capture instant: the quote gate tolerates 5 s of future, so quotes stamped at the capture instant pass. */
export const CLOCK_LEAD_MS = 3_000;

export const sha1 = async (s: string): Promise<string> => [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error('captured document is not a gzip member (the host altered the pack?)');
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Slice one document's gzip member out of its (decoded) pack and decompress it to text. */
export async function readEntry(pack: Uint8Array, entry: [number, number, number]): Promise<string> {
  const [, off, len] = entry;
  return new TextDecoder().decode(await gunzip(pack.subarray(off, off + len)));
}

/**
 * THE ONE TRANSFORMATION OF DOCUMENT CONTENT: market observation times are set to `clockIso` so a price captured minutes before the clock
 * passes the display gate. Prices, sizes, tickers and every other field are untouched. Which fields: the quote feed's `generated_at` and every
 * market's `observed_at`; a game document's markets' `captured_at`; a ranking/board/other document is returned byte for byte.
 */
export function restampMarketTimes(text: string, clockIso: string): string {
  let j: { kind?: string; schema?: string; generated_at?: string; markets?: { captured_at?: string | null; observed_at?: string | null }[] };
  try { j = JSON.parse(text); } catch { return text; }
  if (!Array.isArray(j?.markets)) return text;
  if (j.kind === 'event_detail' || j.kind === 'event_research') { for (const m of j.markets) if (m.captured_at) m.captured_at = clockIso; }
  else if (j.schema === 'sift.live_quotes.v1') { j.generated_at = clockIso; for (const m of j.markets) if (m.observed_at) m.observed_at = clockIso; }
  else return text;
  return JSON.stringify(j);
}

/** Capture instant -> the fixed clock (ms since epoch). */
export const clockOf = (capturedAt: string): number => Date.parse(capturedAt) - CLOCK_LEAD_MS;

/** "26 Oct 2026, 23:25 UTC": unambiguous whatever the device's time zone. */
export function utcLabel(iso: string): string {
  const d = new Date(Date.parse(iso));
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${m} ${d.getUTCFullYear()}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}
