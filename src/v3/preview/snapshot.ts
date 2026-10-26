// PREVIEW ONLY (never imported by the app): a captured snapshot of REAL published documents, for sharing SIFT 3.0 on a phone from a host
// that cannot reach the research feeds (the Claude Artifact viewer). Every document is the publication's own, captured at CAPTURED_AT;
// requests for anything not captured answer 404 exactly like a missing document, and the page says it is a snapshot. Two things are
// pinned so the capture stays readable: market observation times are set to the capture instant, and the page clock is fixed a few
// seconds after it (the display gate otherwise, correctly, withholds a price that old). Prices are therefore the prices AS CAPTURED.
export const CAPTURED_AT = '2026-10-26T19:00:00Z';
const PAGE_NOW = Date.parse(CAPTURED_AT) + 5_000;

const sha1 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

function stamp(text: string): string {
  let j: { kind?: string; schema?: string; generated_at?: string; markets?: { captured_at?: string | null; observed_at?: string | null }[] };
  try { j = JSON.parse(text); } catch { return text; }
  if (!Array.isArray(j?.markets)) return text;
  if (j.kind === 'event_detail') { for (const m of j.markets) if (m.captured_at) m.captured_at = CAPTURED_AT; }
  else if (j.schema === 'sift.live_quotes.v1') { j.generated_at = CAPTURED_AT; for (const m of j.markets) if (m.observed_at) m.observed_at = CAPTURED_AT; }
  else return text;
  return JSON.stringify(j);
}

export function installSnapshot() {
  // The page's clock, fixed.
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...a: unknown[]) { super(...((a.length ? a : [PAGE_NOW]) as [number])); }
    static override now() { return PAGE_NOW; }
  }
  (globalThis as { Date: DateConstructor }).Date = FixedDate as unknown as DateConstructor;

  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (/^https:\/\/raw\.githubusercontent\.com\//.test(url)) {
      const r = await realFetch(new URL(`snapshot/${await sha1(url)}.json`, document.baseURI).href, init);
      if (!r.ok) return new Response('not captured', { status: 404 });
      return new Response(stamp(await r.text()), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (/^https?:\/\//.test(url) && !url.startsWith(location.origin)) return new Response('not captured', { status: 404 });
    return realFetch(input, init);
  };

  const bar = document.createElement('div');
  bar.setAttribute('role', 'note');
  bar.style.cssText = 'background:#1b1f25;color:#f5d38e;font:600 11px/15px -apple-system,system-ui,sans-serif;text-align:center;padding:6px 12px;border-bottom:1px solid #39414b';
  bar.textContent = 'CAPTURED SNAPSHOT · real published data as of 26 Oct 2026 19:00 UTC · prices are as captured, not live · only the Player Research route is captured';
  document.body.prepend(bar);
}
