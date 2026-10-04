// Client-side search over a sport's published search_index.json (research graph §7). No server:
// normalised tokens, prefix and one-typo matching, research synonyms ("pass defense" finds the
// dropback-defense metrics), and entity + intent parsing so "Baltimore pass defense" lands on
// Baltimore's pass-defense metric and "Josh Allen passing yards" on his passing-yards markets.
import type { SearchEntry } from '../contract/types';

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function tokenize(s: string): string[] {
  return normalize(s).split(/[^a-z0-9]+/).filter(Boolean);
}

/** Research vocabulary -> the words the contract's metric names actually use. */
export const SYNONYMS: Record<string, string[]> = {
  pass: ['pass', 'passing', 'dropback', 'db', 'air'],
  passing: ['passing', 'pass', 'dropback', 'db'],
  defense: ['defense', 'defensive', 'def', 'allowed', 'against'],
  defence: ['defensive', 'def', 'allowed', 'against'],
  d: ['defensive', 'def'],
  offense: ['offense', 'offensive', 'off'],
  offence: ['offensive', 'off'],
  o: ['offensive', 'off'],
  run: ['run', 'rush', 'rushing', 'carries', 'carry'],
  running: ['rush', 'rushing'],
  rush: ['rush', 'rushing', 'run'],
  rushing: ['rushing', 'rush'],
  pressure: ['pressure', 'sack', 'sacks', 'hit', 'protection'],
  sacks: ['sack', 'sacks'],
  explosive: ['explosive', 'explosives', 'big'],
  explosives: ['explosive'],
  turnovers: ['turnover', 'takeaway', 'interception', 'interceptions'],
  turnover: ['turnover', 'takeaway'],
  redzone: ['rz', 'red', 'zone'],
  pace: ['plays', 'drive', 'huddle', 'tempo', 'shotgun'],
  scoring: ['points', 'scored', 'td'],
  epa: ['epa'],
  yards: ['yards', 'yds'],
  receiving: ['receiving', 'rec', 'reception', 'receptions'],
  catches: ['receptions', 'reception', 'rec'],
  touchdown: ['touchdown', 'touchdowns', 'td', 'tds'],
  touchdowns: ['touchdowns', 'touchdown', 'td', 'tds'],
  td: ['td', 'tds', 'touchdown', 'touchdowns'],
  ml: ['moneyline', 'winner', 'game'],
  moneyline: ['moneyline', 'winner', 'game'],
  spread: ['spread', 'margin'],
  total: ['total', 'points'],
  over: ['total', 'over'],
};

export function expand(token: string): string[] {
  return SYNONYMS[token] ?? [token];
}

function editDistanceLe1(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else {
      // substitution or adjacent transposition
      if (a[i + 1] === b[j] && a[i] === b[j + 1]) {
        i += 2;
        j += 2;
        continue;
      }
      i++;
      j++;
    }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

export interface Indexed {
  entry: SearchEntry;
  tokens: string[];
}

export function indexEntries(entries: SearchEntry[]): Indexed[] {
  return entries.map((entry) => {
    const t = new Set<string>(entry.tokens ?? []);
    for (const s of [entry.label, entry.secondary ?? '', ...(entry.aliases ?? []), entry.context?.team ?? '', entry.context?.position ?? '']) {
      for (const k of tokenize(s)) t.add(k);
    }
    return { entry, tokens: [...t] };
  });
}

/** 3 exact · 2 prefix · 1 one-typo · 0 no match (over the token's synonyms). */
export function tokenScore(q: string, tokens: string[]): number {
  let best = 0;
  for (const alt of expand(q)) {
    for (const t of tokens) {
      if (t === alt) return 3;
      if (alt.length >= 2 && t.startsWith(alt)) best = Math.max(best, 2);
      else if (alt.length >= 4 && editDistanceLe1(alt, t)) best = Math.max(best, 1);
    }
  }
  return best;
}

const KIND_WEIGHT: Record<string, number> = { TEAM: 1.25, PLAYER: 1.15, EVENT: 1.1, METRIC: 1.0, RANKING: 0.7, SERIES: 0.6 };

export interface Hit {
  entry: SearchEntry;
  score: number;
  matched: string[];
  leftover: string[];
  full: boolean;
}

export function search(index: Indexed[], query: string, limit = 30): Hit[] {
  const q = tokenize(query);
  if (!q.length) return [];
  const qn = normalize(query.trim());
  const hits: Hit[] = [];
  for (const it of index) {
    let score = 0;
    const matched: string[] = [];
    const leftover: string[] = [];
    for (const t of q) {
      const s = tokenScore(t, it.tokens);
      if (s) {
        score += s;
        matched.push(t);
      } else leftover.push(t);
    }
    if (!matched.length) continue;
    const label = normalize(it.entry.label);
    if (label === qn) score += 6;
    else if (label.startsWith(qn)) score += 3;
    if ((it.entry.aliases ?? []).some((a) => normalize(a) === qn)) score += 5;
    score *= KIND_WEIGHT[it.entry.kind] ?? 1;
    hits.push({ entry: it.entry, score, matched, leftover, full: leftover.length === 0 });
  }
  hits.sort((a, b) => Number(b.full) - Number(a.full) || b.score - a.score || a.entry.label.localeCompare(b.entry.label));
  return hits.slice(0, limit);
}

export interface Intent {
  /** The team or player the query is about. */
  subject: SearchEntry;
  /** The rest of the query: what about them. */
  rest: string[];
  /** Metrics that match the rest, for the subject's entity type. */
  metrics: SearchEntry[];
}

/**
 * "Baltimore pass defense" -> subject Baltimore Ravens, rest [pass, defense], metrics matching the rest.
 * The subject must be matched by a prefix of the query; the rest must match something.
 */
export function parseIntent(index: Indexed[], query: string, metricEntityType: (e: SearchEntry) => string | null): Intent | null {
  const q = tokenize(query);
  if (q.length < 2) return null;
  const subjects = index.filter((i) => i.entry.kind === 'TEAM' || i.entry.kind === 'PLAYER');
  for (let cut = q.length - 1; cut >= 1; cut--) {
    const head = q.slice(0, cut);
    const rest = q.slice(cut);
    let best: { e: SearchEntry; s: number } | null = null;
    for (const it of subjects) {
      let s = 0;
      let all = true;
      for (const t of head) {
        const ts = tokenScore(t, it.tokens);
        if (!ts) {
          all = false;
          break;
        }
        s += ts;
      }
      if (all && (!best || s > best.s)) best = { e: it.entry, s };
    }
    if (!best) continue;
    const kind = best.e.kind === 'TEAM' ? 'TEAM' : 'PLAYER';
    const metrics = index
      .filter((i) => i.entry.kind === 'METRIC' && metricEntityType(i.entry) === kind)
      .map((i) => ({ e: i.entry, s: rest.reduce((acc, t) => acc + (tokenScore(t, i.tokens) || -100), 0) }))
      .filter((m) => m.s > 0)
      .sort((a, b) => b.s - a.s || a.e.label.length - b.e.label.length)
      .map((m) => m.e);
    return { subject: best.e, rest, metrics };
  }
  return null;
}

/** Does free text (a market description, a family label) match every rest token? */
export function matchesAll(rest: string[], text: string): boolean {
  const toks = tokenize(text);
  return rest.every((t) => tokenScore(t, toks) > 0);
}
