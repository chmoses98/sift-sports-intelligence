// The ONLY text the quote-delivery path ever puts in front of a user: the approved missing-price wording
// (docs/sift3/QUOTE_DELIVERY.md, "Decisions"). A list price pill shows a dash; an exact contract with no reliable quote
// shows the sentence and a Retry control, with the price-dependent fee and break-even rows hidden. There is no age,
// timestamp, badge, "stale" or "updated" text anywhere: freshness is internal (quoteUsable.ts, availability.ts and
// the store's diagnostics, none of which are rendered). Nothing in this branch renders these strings; the screens
// that show prices (UI branch) import them so the wording lives in one place, and a test scans them.
export const MISSING_PRICE = Object.freeze({
  list: '—',
  contract: 'Price unavailable right now',
  retry: 'Retry',
});

/**
 * A market the provider positively reports as closed, settled or expired: no price will return, so the exact-contract
 * sheet says so instead of offering a Retry. A list row still shows the dash. Suspended and not-yet-open markets can
 * change, so they keep the ordinary missing-price sentence and its Retry (MISSING_PRICE).
 */
export const MARKET_CLOSED = Object.freeze({
  list: '—',
  contract: 'Market closed',
});
