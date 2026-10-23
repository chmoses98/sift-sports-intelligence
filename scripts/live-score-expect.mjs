// What the live site must show for a game in play, given what the score provider actually says. Pure functions: the production check
// (scripts/v4-production-check.mjs) reads the page and the provider and hands both here; tests/liveScoreExpect.test.ts pins every state.
//
// The states (docs/LIVE_SCORES_REAL.md): real scores are connected for NBA only (SportScore, free tier, attribution required). Everything else in play says
// the score is unavailable; a game the provider cannot be matched to says so; a provider answer that has gone stale keeps its last verified score
// with its age. A score is never invented, never shown for an unsupported sport, and never shown without its source.

/** Sports whose in-play scores may appear (NBA from SportScore; tennis only as finished matches, never in play). */
export const SCORED_IN_PLAY = new Set(['nba']);

const NBA_COMPETITION = /^national basketball association$|^nba$/i;
const num = (v) => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; return Number.isInteger(n) ? n : null; };
export const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

/** SportScore's basketball match list -> the NBA games in it, with the fields the page can be checked against. */
export function providerNba(body) {
  const list = Array.isArray(body?.matches) ? body.matches : [];
  return list.filter((m) => NBA_COMPETITION.test(String(m.competition ?? ''))).map((m) => ({
    home: String(m.home ?? ''), away: String(m.away ?? ''), startMs: Date.parse(m.time), status: String(m.status ?? '').toLowerCase(),
    statusText: m.status_text ? String(m.status_text) : null, homeScore: num(m.home_score), awayScore: num(m.away_score), updated: body.updated ?? null,
  })).filter((g) => g.home && g.away && Number.isFinite(g.startMs));
}

/** The provider's game for a published one: both team names and a start within three hours (the same game, not a rematch on another night). */
export function findProviderGame(games, { home, away, startMs, nowMs = Date.now() }) {
  const h = norm(home); const a = norm(away);
  const same = (x, y) => x && y && (x === y || x.includes(y) || y.includes(x));
  // with a start time: within three hours of it; without one (a row only names the sides): a game that started in the last nine hours or starts within the hour
  const near = (g) => (startMs != null ? Math.abs(g.startMs - startMs) <= 3 * 3600_000 : g.startMs <= nowMs + 3600_000 && g.startMs >= nowMs - 9 * 3600_000);
  return games.find((g) => same(norm(g.home), h) && same(norm(g.away), a) && near(g)) ?? null;
}

const isPlayStatus = (s) => /^(live|inplay|inprogress|started|q[1-4]|1sthalf|2ndhalf|halftime|ht|break|overtime|ot)$/.test(String(s ?? '').replace(/[\s_-]+/g, ''));
const isFinalStatus = (s) => /^(finished|ended|final|ft|complete|completed)$/.test(String(s ?? '').replace(/[\s_-]+/g, ''));

/** What a provider game can support on screen: a score only when it is live or final and has both numbers. */
export function providerSupports(p) {
  if (!p) return { score: false, live: false, final: false };
  const both = p.homeScore != null && p.awayScore != null;
  return { score: both && (isPlayStatus(p.status) || isFinalStatus(p.status)), live: isPlayStatus(p.status), final: isFinalStatus(p.status) };
}

/**
 * One in-play row on Home or Games. `mid` is the row's centre text ("Q3 4:32 · LIVE · 12s", "In play Score n/a", "Live No score reported"),
 * `score` the row's score text when it shows one ("98–95"), `slug` the sport in the game's address.
 * Returns { ok, state, why } where state is 'score' | 'unavailable' | 'no-score'.
 */
export function judgeRow({ slug, mid, score }) {
  const m = String(mid ?? '').replace(/\s+/g, ' ').trim();
  if (score) {
    if (!SCORED_IN_PLAY.has(slug)) return { ok: false, state: 'score', why: `${slug.toUpperCase()} is in play and shows a score (${score}); no feed covers it` };
    const fresh = /\b(LIVE|Live)\b|\d+\s?s\b|\d+\s?m\b|Updated|stale|Stale|ago/.test(m);
    return fresh ? { ok: true, state: 'score', why: 'a score with its freshness' } : { ok: false, state: 'score', why: `a score with no freshness or source line ("${m}")` };
  }
  if (/Score n\/a|Score unavailable|No score reported/.test(m)) return { ok: true, state: /No score reported/.test(m) ? 'no-score' : 'unavailable', why: 'says the score is unavailable' };
  return { ok: false, state: 'unavailable', why: `in play with neither a score nor a statement that it is unavailable ("${m}")` };
}

/**
 * The Live card on a game page against the provider. `page` = { mode, heading, score, period, status, source, credit, unavailableTitle } as read from the DOM
 * (mode = the card's data-live-score value or null; score "Away 98 · Home 95"; credit = the "Powered by SportScore" link is visible and points at sportscore.com).
 * `providers` are the provider's game as fetched before and after the page read (the score may move between them; either may match).
 */
export function judgeGamePage({ slug, page, providers = [], providerOk = true }) {
  const problems = [];
  const sup = providers.map(providerSupports);
  const providerScoreable = sup.some((s) => s.score);
  if (!SCORED_IN_PLAY.has(slug)) {
    if (page.mode) problems.push(`${slug.toUpperCase()} shows a live score card (${page.mode}); no feed covers it`);
    if (!page.unavailableTitle) problems.push('an in-play game of a sport with no score feed does not say its live score is unavailable');
    return { ok: problems.length === 0, state: 'unavailable', problems };
  }
  if (!page.mode) {
    if (!page.unavailableTitle) problems.push('NBA game in play with no score card and no "score unavailable" statement');
    // the provider has a scored game the page could not match: refused by the identity rules, which is allowed to be stricter than a name match: report, do not fail
    return { ok: problems.length === 0, state: 'unavailable', problems, note: providerScoreable ? 'the provider lists a scored game that the page did not match (identity rules are stricter than a name match)' : null };
  }
  // providerOk=false: the provider could not be read from here, so the page is judged on its own statements only (and the run says so)
  if (providerOk && !providerScoreable) problems.push(`a ${page.mode} score is shown but the provider has no scored game for it`);
  const m = /(\d+)\s*·\s*.*?(\d+)\s*$/.exec(String(page.score ?? '').replace(/\s+/g, ' ')) ?? /(\d+)\D+(\d+)/.exec(String(page.score ?? ''));
  const shown = m ? [Number(m[1]), Number(m[2])] : null;
  if (!shown) problems.push(`the card has no readable score ("${page.score}")`);
  else if (providerOk && providerScoreable && !providers.some((p) => providerSupports(p).score && p.awayScore === shown[0] && p.homeScore === shown[1])) {
    problems.push(`the page shows ${shown[0]}-${shown[1]} but the provider says ${providers.filter(Boolean).map((p) => `${p.awayScore}-${p.homeScore}`).join(' then ')}`);
  }
  const live = page.mode !== 'final';
  if (live) {
    const want = providerOk ? providers.find((p) => p?.statusText)?.statusText ?? null : null;
    const period = String(page.period ?? '').toLowerCase();
    if (!period) problems.push('no period line');
    else if (want && !period.includes(want.toLowerCase()) && !/^(q|p|h|ot)\d|quarter|half|ot|overtime/.test(period)) problems.push(`period "${page.period}" is not the provider's "${want}"`);
    else if (providerOk && !want && !/not reported/.test(period)) problems.push(`the provider gave no period but the page says "${page.period}"`);
  }
  const status = String(page.status ?? '');
  if (page.mode === 'live' && !/live|in play/i.test(status)) problems.push(`a fresh score does not say it is live ("${status}")`);
  if (page.mode === 'delayed' && !/\d+\s?(s|m|h)\b/i.test(status)) problems.push(`a delayed score does not say how old it is ("${status}")`);
  if (page.mode === 'last_known') {
    if (!/Last known score/i.test(page.heading ?? '')) problems.push(`a stale score is not headed "Last known score" ("${page.heading}")`);
    if (!/\d+\s?(s|m|h)\b/i.test(status)) problems.push(`a stale score does not carry its age ("${status}")`);
    if (/\bLIVE\b/.test(status)) problems.push('a stale score is called live');
  }
  if (!/sportscore/i.test(page.source ?? '')) problems.push(`the card does not name its source ("${page.source}")`);
  if (!page.credit) problems.push('no visible "Powered by SportScore" link');
  return { ok: problems.length === 0, state: page.mode, problems, note: providerOk ? null : 'the provider could not be read from this runner: the card was judged on its own statements only' };
}
