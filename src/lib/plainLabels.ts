// Plain-language labels for the publication's internal codes (issue 35 / 43). Screens show these words; the codes
// themselves (enum constants, schema names, run ids, repository names, file paths) stay on Data & provenance and in
// the machine-readable packet. Every lane can adopt these helpers.

/** Data-quality status (VERIFIED / PARTIAL / RESEARCH / UNAVAILABLE / UNKNOWN) in words, with what it means. */
export const QUALITY_LABEL: Record<string, { word: string; meaning: string }> = {
  VERIFIED: { word: 'Verified', meaning: 'Checked by the publication against its source.' },
  PARTIAL: { word: 'Incomplete', meaning: 'Published, but parts are missing; the limitations say which.' },
  RESEARCH: { word: 'Research grade', meaning: 'Useful context; not validated for betting.' },
  UNAVAILABLE: { word: 'Not published', meaning: 'The publication does not provide this yet.' },
  UNKNOWN: { word: 'Not stated', meaning: 'The publication gives no quality status for this.' },
};

export function qualityLabel(status: string | null | undefined): { word: string; meaning: string } {
  const s = (status ?? 'UNKNOWN').toUpperCase();
  return QUALITY_LABEL[s] ?? { word: humanize(s), meaning: 'Status as published.' };
}

/** A publication's overall health (HEALTHY / RESEARCH_ONLY / DEGRADED / STALE / UNAVAILABLE) in words. */
export const HEALTH_LABEL: Record<string, { word: string; meaning: string }> = {
  HEALTHY: { word: 'Healthy', meaning: 'Recent run, every component current.' },
  RESEARCH_ONLY: { word: 'Research only', meaning: 'Current, but its model numbers do not permit a bet.' },
  DEGRADED: { word: 'Degraded', meaning: 'Published, with some components missing or late.' },
  STALE: { word: 'Out of date', meaning: 'The newest run is older than the publication’s own freshness limit.' },
  UNAVAILABLE: { word: 'Not available', meaning: 'Nothing could be read from this publication.' },
  UNKNOWN: { word: 'Unknown', meaning: 'Health could not be read.' },
};

export function healthLabel(status: string | null | undefined): { word: string; meaning: string } {
  const s = (status ?? 'UNKNOWN').toUpperCase();
  return HEALTH_LABEL[s] ?? { word: humanize(s), meaning: 'Status as published.' };
}

/** Bet authority (ACTIONABLE / RESEARCH_CANDIDATE / RESEARCH_ONLY / RESEARCH / LIVE / SHADOW) in words. */
export const AUTHORITY_LABEL: Record<string, string> = {
  ACTIONABLE: 'Actionable',
  LIVE: 'Live',
  RESEARCH_CANDIDATE: 'Research candidate',
  RESEARCH_ONLY: 'Research only',
  RESEARCH: 'Research only',
  SHADOW: 'Trial model (not yet promoted)',
  NONE: 'No bet authority',
};

export function authorityLabel(a: string | null | undefined): string {
  if (!a) return 'Research only';
  const s = a.toUpperCase();
  return AUTHORITY_LABEL[s] ?? humanize(s);
}

/**
 * A model version string for readers: "shadow-0.4.0" → "Trial model 0.4.0", "pure-0.5.0+roster" → "Market-independent
 * model 0.5.0", "DATA_ONLY_V1" → "Data-only model v1", "projection_v2.0" → "Projection model v2.0",
 * "dc_laplace_v1" → "Dixon–Coles model v1". Unknown codes are de-underscored, never dropped.
 */
export function modelVersionLabel(v: unknown): string | null {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  let m = /^shadow[-_ ]?v?(\d[\w.]*)/i.exec(s);
  if (m) return `Trial model ${m[1]}`;
  m = /^pure[-_ ]?v?(\d[\d.]*)/i.exec(s);
  if (m) return `Market-independent model ${m[1]}`;
  m = /^data[_-]?only[_-]?v?(\d[\w.]*)/i.exec(s);
  if (m) return `Data-only model v${m[1]}`;
  m = /^dc[_-]laplace[_-]?v?(\d[\w.]*)/i.exec(s);
  if (m) return `Dixon–Coles model v${m[1]}`;
  m = /^ledger\s+(\w+)\s*\(projection_v([\d.]+)\)/i.exec(s);
  if (m) return `${humanize(m[1])} ledger (projection model v${m[2]})`;
  m = /^projection[_-]?v?([\d.]+)/i.exec(s);
  if (m) return `Projection model v${m[1]}`;
  return humanize(s);
}

/** "RESEARCH_ONLY" → "Research only"; "met_nfl.epa_play" stays readable-ish; never returns the raw constant shape. */
export function humanize(code: string): string {
  const t = code.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t.charAt(0).toUpperCase() + t.slice(1);
}

/** Capability names from the capability manifest in words ("market_price_history" → "Market price history"). */
export const CAPABILITY_LABEL: Record<string, string> = {
  player_game_logs: 'Player game logs',
  team_game_logs: 'Team game logs',
  rankings: 'Rankings',
  time_series: 'Trends over time',
  opponent_adjustment: 'Opponent-adjusted ratings',
  schedule_strength: 'Strength of schedule',
  play_by_play: 'Play-by-play',
  venue_effects: 'Venue effects',
  situational_splits: 'Situational splits',
  usage: 'Player usage',
  market_price_history: 'Market price history',
  market_prices: 'Market prices',
  raw_projections: 'Model projections',
  projection_distributions: 'Projection ranges',
  player_props: 'Player props',
  game_markets: 'Game markets',
  matchup_metrics: 'Matchup metrics',
  injuries: 'Injuries',
};

export function capabilityLabel(name: string): string {
  return CAPABILITY_LABEL[name] ?? humanize(name);
}

/**
 * What a capability's status means for the reader, as one sentence: what is missing, why it matters, and when (if
 * known) it may arrive. `summary` is the publication's own summary line, shown verbatim after the plain sentence.
 */
export function availabilitySentence(name: string, status: string | null | undefined, summary?: string | null): string {
  const what = capabilityLabel(name);
  const s = (status ?? 'UNKNOWN').toUpperCase();
  const tail = summary ? ` Publication note: ${summary.replace(/\.$/, '')}.` : '';
  if (s === 'VERIFIED') return `${what}: published and checked.${tail}`;
  if (s === 'PARTIAL') return `${what}: only partly published, so some screens show less than usual.${tail}`;
  if (s === 'RESEARCH') return `${what}: research grade, shown for context and not validated.${tail}`;
  if (s === 'UNAVAILABLE') return `${what}: not published for this sport yet, so Sift does not show it.${tail}`;
  return `${what}: no status published.${tail}`;
}

/**
 * The short form for places that already say "model" ("SIFT model · v0.4.0 (trial)"): the version number with the
 * model's kind in brackets when it has one. "shadow-0.4.0" → "v0.4.0 (trial)", "pure-0.5.0" → "v0.5.0
 * (market-independent)", "DATA_ONLY_V1" → "v1 (data-only)", "projection_v2.0" → "v2.0".
 */
export function modelVersionShort(v: unknown): string | null {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  const kinds: [RegExp, string | null][] = [
    [/^shadow[-_ ]?v?(\d[\d.]*)/i, 'trial'],
    [/^pure[-_ ]?v?(\d[\d.]*)/i, 'market-independent'],
    [/^data[_-]?only[_-]?v?(\d[\d.]*)/i, 'data-only'],
    [/^dc[_-]laplace[_-]?v?(\d[\d.]*)/i, 'Dixon–Coles'],
    [/^projection[_-]?v?(\d[\d.]*)/i, null],
  ];
  for (const [re, kind] of kinds) {
    const m = re.exec(s);
    if (m) return `v${m[1]}${kind ? ` (${kind})` : ''}`;
  }
  return /^v?\d[\d.]*$/i.test(s) ? `v${s.replace(/^v/i, '')}` : humanize(s);
}

/**
 * Publication prose with its enum constants written as words: "only OPPONENT_ADJUSTED, MODEL and AVAILABILITY findings"
 * → "only opponent-adjusted, model and availability findings". Underscored constants are always rewritten; bare
 * all-caps words are rewritten only when listed in `words` (so team codes such as "NYR" stay as they are).
 */
export function plainCodes(text: string, words: string[] = ['RAW', 'MODEL', 'AVAILABILITY', 'RESEARCH', 'PARTIAL', 'UNAVAILABLE', 'VERIFIED', 'UNKNOWN']): string {
  const known = new Set(words);
  return text
    .replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, (c) => (c === 'OPPONENT_ADJUSTED' ? 'opponent-adjusted' : c.replace(/_/g, ' ').toLowerCase()))
    .replace(/\b[A-Z]{3,}\b/g, (c) => (known.has(c) ? c.toLowerCase() : c));
}
