// What the probe is allowed to do, decided BEFORE any request is made. Pure, so it is tested.
//
// The rules (the owner's: internal experiments must respect provider conditions and rate limits):
//   * a feed whose terms are reported to prohibit automation never runs without --ack-prohibited <feed> (and the doc says
//     to read those terms first);
//   * a feed with no published licence, or a non-commercial notice, never runs without --ack-unlicensed;
//   * every feed has a hard minimum interval; the requested interval can only be slower;
//   * one request in flight per feed, total run length capped, and a 403/429 STOPS that feed for the rest of the run;
//   * a LICENSED_TRIAL feed runs under the vendor's own limits (quota is checked against the plan).
export const MAX_MINUTES = 240;

export function planRun(feedIds, extractors, opts) {
  const { interval = 5000, minutes = 150, ackUnlicensed = false, ackProhibited = [] } = opts;
  const errors = [];
  const feeds = [];
  if (!(minutes > 0) || minutes > MAX_MINUTES) errors.push(`--minutes must be 1..${MAX_MINUTES}`);
  for (const id of feedIds) {
    const ex = extractors[id];
    if (!ex) { errors.push(`unknown feed "${id}"`); continue; }
    const st = ex.rights.status;
    if (st === 'TERMS_REPORTED_TO_PROHIBIT_AUTOMATION' && !ackProhibited.includes(id)) errors.push(`${id}: ${ex.rights.note} Refusing. Read the terms; if you still decide to run it, pass --ack-prohibited ${id}.`);
    else if ((st === 'NO_LICENCE_PUBLISHED' || st === 'NON_COMMERCIAL_NOTICE_REPORTED') && !ackUnlicensed) errors.push(`${id}: ${ex.rights.note} Pass --ack-unlicensed to confirm this is a short internal measurement.`);
    const every = Math.max(interval, ex.rights.minIntervalMs);
    feeds.push({ id, sport: ex.sport, status: st, intervalMs: every, requests: Math.ceil((minutes * 60_000) / every), perMinute: +(60_000 / every).toFixed(2), clamped: every > interval });
  }
  return { ok: errors.length === 0, errors, feeds, totalRequests: feeds.reduce((n, f) => n + f.requests, 0) };
}

/** After a response: should this feed keep running? 403/429 stop it for the run; 5xx backs off; anything else carries on. */
export function afterResponse(status) {
  if (status === 403 || status === 429) return 'STOP';
  if (status >= 500) return 'BACKOFF';
  return 'OK';
}
