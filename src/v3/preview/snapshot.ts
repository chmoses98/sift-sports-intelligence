// PREVIEW ONLY (never imported by the app): a captured-data build of SIFT 3.0 for hosts that cannot reach the research feeds (the Claude
// Artifact viewer). Every document is a PUBLISHED document captured on disk (see capture.ts for the pack format and scripts/v3-preview/ for how
// the capture is built). This file installs, before the app starts:
//   * a fixed page clock (capture instant minus 3 s);
//   * a fetch shim: requests for published documents (raw.githubusercontent.com) are answered from the packs, nothing else leaves the page
//     (any other external host answers 404 "not captured"; there is no live-quote fetch of any kind);
//   * the banner and the "About this capture" sheet that say what is real, what is transformed and what is not captured;
//   * an optional labelled switch, "Demo: no reliable quote", that skips the observation re-stamp so the app's own quote gate withholds prices.
// A document that was not captured answers 404 exactly like a missing publication: the app shows its own unavailable states.
import { CLOCK_LEAD_MS, clockOf, fromBase64, readEntry, restampMarketTimes, sha1, utcLabel, type CaptureIndex } from './capture';

const NOQUOTE_KEY = 'sift3.capture.noQuote';
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage may be blocked: the switch then does nothing */ } },
};

export interface CaptureDebug {
  index: CaptureIndex | null;
  clockAt: string;
  noQuoteDemo: boolean;
  /** Request URLs of published documents answered from the packs, in order. */
  served: string[];
  /** Request URLs of published documents that were not captured (answered 404). */
  missed: string[];
  /** Requests to any other external host (answered 404 without leaving the page). */
  blocked: string[];
  /** Pack files fetched, in order. */
  packsFetched: string[];
}
declare global { interface Window { __siftCapture?: CaptureDebug } }

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, css?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text != null) e.textContent = text;
  return e;
};

export async function installSnapshot(): Promise<CaptureDebug> {
  const realFetch = globalThis.fetch.bind(globalThis);
  const base = document.baseURI;
  let index: CaptureIndex | null = null;
  try {
    const r = await realFetch(new URL('snapshot/index.json', base).href);
    if (r.ok) index = (await r.json()) as CaptureIndex;
  } catch { /* the banner says so below */ }
  const capturedAt = index?.capturedAt ?? '1970-01-01T00:00:00Z';
  const noQuote = store.get(NOQUOTE_KEY) === '1';
  // The app persists the quotes it has seen (src/live/store.ts) so a reload starts with them. A preview must never start from quotes left by an earlier
  // visit or another capture (or, in the demo, by the same capture with times that were re-stamped): it starts empty every time.
  store.set('sift.liveQuotes.v1', null);
  const PAGE_NOW = clockOf(capturedAt);
  const clockIso = new Date(PAGE_NOW).toISOString();
  const dbg: CaptureDebug = { index, clockAt: clockIso, noQuoteDemo: noQuote, served: [], missed: [], blocked: [], packsFetched: [] };
  window.__siftCapture = dbg;

  // The page's clock, fixed (a running clock would drift the captured quotes out of the display gate within a minute).
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...a: unknown[]) { super(...((a.length ? a : [PAGE_NOW]) as [number])); }
    static override now() { return PAGE_NOW; }
  }
  (globalThis as { Date: DateConstructor }).Date = FixedDate as unknown as DateConstructor;

  const packs = new Map<number, Promise<Uint8Array>>();
  const loadPack = (i: number): Promise<Uint8Array> => {
    let p = packs.get(i);
    if (!p) {
      const meta = index!.packs[i];
      dbg.packsFetched.push(meta.file);
      p = realFetch(new URL(meta.file, base).href).then(async (r) => {
        if (!r.ok) throw new Error(`pack ${meta.file}: HTTP ${r.status}`);
        return meta.file.endsWith('.txt') ? fromBase64(await r.text()) : new Uint8Array(await r.arrayBuffer());
      });
      p.catch(() => packs.delete(i));
      packs.set(i, p);
    }
    return p;
  };

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (/^https:\/\/raw\.githubusercontent\.com\//.test(url)) {
      const entry = index?.docs[await sha1(url)];
      if (!entry) { dbg.missed.push(url); return new Response('not captured', { status: 404 }); }
      try {
        const text = await readEntry(await loadPack(entry[0]), entry);
        dbg.served.push(url);
        return new Response(noQuote ? text : restampMarketTimes(text, clockIso), { status: 200, headers: { 'content-type': 'application/json' } });
      } catch {
        dbg.missed.push(url);
        return new Response('captured pack unavailable', { status: 503 });
      }
    }
    if (/^(https?:)?\/\//.test(url) && !url.startsWith(location.origin)) { dbg.blocked.push(url); return new Response('not captured', { status: 404 }); }
    return realFetch(input, init);
  };

  mountBanner(index, dbg);
  return dbg;
}

function mountBanner(index: CaptureIndex | null, dbg: CaptureDebug) {
  const bar = el('div', 'background:#1b1f25;color:#f5d38e;font:600 11px/15px -apple-system,system-ui,sans-serif;padding:6px 12px;border-bottom:1px solid #39414b;display:flex;gap:10px;align-items:center;justify-content:space-between');
  bar.setAttribute('role', 'note');
  bar.dataset.captureBanner = '1';
  const msg = el('span');
  if (!index) {
    msg.textContent = 'CAPTURED DATA could not be loaded: the snapshot index is missing from this host.';
    bar.style.color = '#ff9c8f';
  } else {
    msg.textContent = `CAPTURED DATA · ${utcLabel(index.capturedAt)} · prices as captured, not live${dbg.noQuoteDemo ? ' · DEMO: no reliable quote' : ''}`;
  }
  const about = el('button', 'all:unset;box-sizing:border-box;cursor:pointer;min-height:32px;min-width:44px;display:inline-flex;align-items:center;justify-content:center;padding:0 10px;border:1px solid #5a4a22;border-radius:8px;color:#ffe3a6;font:600 11px/1 -apple-system,system-ui,sans-serif;white-space:nowrap', 'About');
  about.type = 'button';
  about.setAttribute('aria-haspopup', 'dialog');
  about.setAttribute('aria-label', 'About this capture');
  about.dataset.captureAbout = '1';
  about.addEventListener('click', () => openAbout(index, dbg, about));
  bar.append(msg, about);
  document.body.prepend(bar);
}

function openAbout(index: CaptureIndex | null, dbg: CaptureDebug, opener: HTMLElement) {
  if (document.querySelector('[data-capture-sheet]')) return;
  const back = el('div', 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center');
  back.dataset.captureSheet = '1';
  const card = el('div', 'box-sizing:border-box;width:min(100%,520px);max-height:88dvh;overflow:auto;background:#12161c;color:#e8ecf1;border:1px solid #39414b;border-radius:16px 16px 0 0;padding:16px 16px calc(20px + env(safe-area-inset-bottom));font:400 14px/1.45 -apple-system,system-ui,sans-serif');
  card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', 'About this capture');
  const close = () => { back.remove(); opener.focus(); };
  const head = el('div', 'display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px');
  head.append(el('h2', 'margin:0;font:700 17px/1.2 -apple-system,system-ui,sans-serif', 'About this capture'));
  const x = el('button', 'all:unset;cursor:pointer;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;border:1px solid #39414b;font:600 13px/1 -apple-system,system-ui,sans-serif', 'Close');
  x.type = 'button'; x.addEventListener('click', close);
  head.append(x);
  card.append(head);
  const h = (t: string) => card.append(el('h3', 'margin:14px 0 4px;font:700 13px/1.3 -apple-system,system-ui,sans-serif;color:#f5d38e;text-transform:uppercase;letter-spacing:.04em', t));
  const list = (items: string[]) => { const ul = el('ul', 'margin:0;padding-left:18px'); for (const t of items) ul.append(el('li', 'margin:2px 0', t)); card.append(ul); };
  if (!index) {
    card.append(el('p', '', 'The snapshot index could not be loaded from this host, so no published document is available and every screen shows its own unavailable state.'));
  } else {
    card.append(el('p', 'margin:0', `This is SIFT 3.0 running on a snapshot of real published documents captured ${utcLabel(index.capturedAt)}. It is not live: nothing on it updates, and the prices are the prices at the time of capture. The page clock is fixed at ${utcLabel(dbg.clockAt)} (${CLOCK_LEAD_MS / 1000} seconds before the capture instant), so "today", kickoff times and countdowns describe that moment, not now.`));
    h('What is real');
    list([
      ...(index.about?.real ?? [`${index.total.toLocaleString('en-US')} published documents.`]),
      'Every document is exactly as published: none was edited, filled in or estimated. The only change to what a document says is listed under What is transformed.',
      ...(index.stamps?.earliest && index.stamps.latest ? [`The documents were collected over several hours: their own generation times run from ${utcLabel(index.stamps.earliest)} to ${utcLabel(index.stamps.latest)}, so some are stamped after the page clock. The page clock is the capture instant, not the newest document.`] : []),
    ]);
    h('What is transformed');
    list([
      `The page clock is fixed at ${utcLabel(dbg.clockAt)}.`,
      dbg.noQuoteDemo
        ? 'Observation times are NOT re-stamped while the demo below is on: the quote gate sees the times as published.'
        : `Market observation times (the quote feed's generated and observed times, and the captured time on each market in a game's documents) are set to the page clock, so a price captured minutes earlier passes the display gate. Prices themselves, and every other field, are untouched.`,
      ...(index.about?.transformed ?? []),
    ]);
    h('What is not captured');
    const nc = index.about?.notCaptured ?? [];
    list([
      ...nc,
      'Live scores, in-play states and anything after the capture instant. Links to documents that were not captured show the screen\'s own unavailable state.',
    ]);
    card.append(el('p', 'margin:6px 0 0;color:#9aa4b2', `This session: ${dbg.served.length} published documents served from the capture, ${dbg.missed.length} requested but not captured, ${dbg.blocked.length} requests to other hosts refused. Nothing is fetched from the network.`));
    h('Demo: no reliable quote');
    card.append(el('p', 'margin:0 0 8px', 'Shows the withheld-price state through the app\'s real quote gate. The prices keep the observation times they were published with; the gate finds those too old (or too new) for the page clock and withholds the price. Lists then show a dash and a contract sheet says the price is unavailable, with the fee rows hidden. Switching reloads the page.'));
    const label = el('label', 'display:flex;gap:10px;align-items:center;min-height:44px');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = dbg.noQuoteDemo; cb.style.cssText = 'width:22px;height:22px';
    cb.dataset.captureNoquote = '1';
    cb.addEventListener('change', () => { store.set(NOQUOTE_KEY, cb.checked ? '1' : null); location.reload(); });
    label.append(cb, el('span', '', 'Demo: no reliable quote'));
    card.append(label);
    if (index.build) card.append(el('p', 'margin:12px 0 0;color:#9aa4b2;font-size:12px', index.build));
  }
  back.append(card);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.body.append(back);
  x.focus();
}
