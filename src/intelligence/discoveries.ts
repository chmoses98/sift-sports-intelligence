// THE DISCOVERY LAYER — what the Intelligence Terminal and Home's preview call a "discovery": something in today's
// published research worth a researcher's attention. Every discovery is derived deterministically from fields a
// publication already carries (opportunities, opponent-adjusted matchup ranks, lineup context, publication clocks);
// Sift never invents one.
//
// Two separate ratings, never merged:
//   significance  how much the finding matters to understanding the game (a #2 offense against a #31 defense is
//                 highly significant)
//   evidence      how strong the published betting evidence is (Back / Watch / No Edge, from src/lib/decision.ts).
//                 A large mismatch with no priced edge has high significance and "No Edge" evidence.
import type { EventResearchDoc } from '../contract/types';
import { decisionOf, type Decision } from '../lib/decision';
import { routes } from '../lib/routes';
import { matchupInsights, type MatchupInsight } from '../insights/matchups';
import { isLive } from '../opportunity/rank';
import type { Opportunity, SportVerdict } from '../opportunity/types';
import { ago } from '../lib/format';
import { scrutiny } from '../opportunity/scrutiny';
import { betPhrase } from '../lib/betWords';

export type DiscoveryKind = 'market' | 'mismatch' | 'context' | 'freshness' | 'model';
export type Significance = 'high' | 'medium' | 'low';

export const KIND_WORD: Record<DiscoveryKind, string> = {
  market: 'Market', mismatch: 'Matchup mismatch', context: 'Lineup & context', freshness: 'Data freshness', model: 'Model evidence',
};

export interface Fact { label: string; value: string }

/** Where a finding leads: a script, a player or prop, a stat, a market, or the evidence behind a conclusion. */
export interface Lead { kind: 'script' | 'player' | 'stat' | 'market' | 'evidence' | 'game' | 'data'; label: string; href: string }

export interface Discovery {
  id: string;
  kind: DiscoveryKind;
  sport: string;
  slug: string;
  title: string;
  /** One plain sentence on why it exists. */
  why: string;
  significance: Significance;
  /** Betting evidence for the finding, when it is about a contract; null for non-market findings. */
  evidence: Decision | null;
  facts: Fact[];
  /** Where the numbers come from and how they were adjusted. */
  method: string;
  source: string;
  observedAt: string | null;
  eventId: string | null;
  gameHref: string | null;
  href: string | null;
  /** Players named by the finding, for the player panel. */
  players: { id: string; name: string }[];
  risk: string | null;
  /** Workspaces this belongs to (Football Lab, Prop Lab, Market Lab). */
  workspaces: Workspace[];
  /** The plainly explained conclusion: what the finding means for reading the game, and what it does not mean. */
  meaning: string;
  /** Research it leads to, most useful first (at most four). */
  leads: Lead[];
  opportunity?: Opportunity;
  insight?: MatchupInsight;
}

export type Workspace = 'football' | 'props' | 'market';
export const WORKSPACES: { id: Workspace; label: string; sub: string }[] = [
  { id: 'football', label: 'Football Lab', sub: 'Opponent-adjusted matchups, scripts and usage' },
  { id: 'props', label: 'Prop Lab', sub: 'Players, distributions and prop markets' },
  { id: 'market', label: 'Market Lab', sub: 'Prices, model disagreement and reliability' },
];

const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const cents = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);

/** A published opportunity as a discovery. Significance follows its tier; evidence is the decision word. */
export function marketDiscovery(o: Opportunity): Discovery {
  const d0 = decisionOf(o.status, o.confidence.calibration);
  const x = scrutiny(o);
  // An extreme gap is a reason to check, never stronger evidence: its basis says so.
  const d = x && d0.word !== 'No Edge' ? { ...d0, basis: `${d0.basis} · extreme gap, check before trusting` } : d0;
  const significance: Significance = o.rank.tier <= 2 ? 'high' : o.rank.tier === 3 ? 'medium' : 'low';
  const isProp = /player|prop|goal|shots|points|assists|saves|strikeout|hits|bases/i.test(`${o.family ?? ''} ${o.what.title}`);
  return {
    id: `mkt:${o.id}`,
    kind: 'market',
    sport: o.sport,
    slug: o.slug,
    title: betPhrase(o.what.side, o.what.title).text,
    why: o.why,
    significance,
    evidence: d,
    facts: [
      { label: 'Executable ask', value: cents(o.price.ask) },
      { label: 'Break-even after fee', value: cents(o.price.breakEven) },
      { label: 'Publication fair', value: pct(o.price.fair) },
      { label: 'Bet up to', value: o.price.betUpTo == null ? 'Not published' : cents(o.price.betUpTo) },
      { label: 'Authority', value: o.authority || '—' },
      ...(o.confidence.record ? [{ label: 'Family record', value: o.confidence.record.line }] : []),
      ...(x ? x.checks.map((c) => ({ label: `Check · ${c.label}`, value: `${c.ok === true ? 'Pass' : c.ok === false ? 'Fail' : 'Unverified'} — ${c.note}` })) : []),
    ],
    method: `${o.authority || 'Publication'} candidate, repriced on the current quote where one exists; break-even includes Kalshi's fee.`,
    source: `${o.sport} publication · recommendations`,
    observedAt: o.price.observedAt,
    eventId: o.eventId,
    gameHref: o.gameHref,
    href: o.href,
    players: [],
    risk: x ? `${x.line} ${o.risk ?? ''}`.trim() : o.risk,
    workspaces: isProp ? ['props', 'market'] : ['market'],
    meaning: marketMeaning(o, d.word),
    leads: ([
      ...(o.href ? [{ kind: 'market' as const, label: 'This contract', href: o.href }] : []),
      { kind: 'market', label: 'Every market on this game', href: routes.game(o.slug, o.eventId, { tab: 'markets' }) },
      ...(isProp && o.slug === 'nfl' ? [{ kind: 'player' as const, label: 'Player props on this game', href: routes.game(o.slug, o.eventId, { tab: 'props' }) }] : []),
      { kind: 'evidence', label: `How the ${o.sport === 'SOCCER' ? 'soccer' : o.sport} model has done`, href: routes.pulse(o.slug) },
    ] as Lead[]).slice(0, 4),
    opportunity: o,
  };
}

/** What a market finding means, in one or two plain sentences, keyed on the decision word (never stronger). */
export function marketMeaning(o: Opportunity, word: Decision['word']): string {
  const fair = o.price.fair == null ? null : Math.round(o.price.fair * 100);
  const be = o.price.breakEven == null ? null : Math.round(o.price.breakEven * 100);
  const gap = fair != null && be != null ? ` The publication puts this at ${fair}% against a ${be}¢ break-even after the fee.` : '';
  if (word === 'Back') return `The publication permits a bet on this at the current price${o.price.betUpTo != null ? `, up to ${Math.round(o.price.betUpTo * 100)}¢` : ''}.${gap} Size and timing stay your call.`;
  if (o.confidence.calibration === 'MARKET_BEATS_MODEL') return `The model disagrees with the market here, but on this kind of contract the market has had the better settled record.${gap} Read it as a disagreement, not an edge.`;
  if (o.status === 'WATCH') return 'A published research signal on this game: a reason to look closer, not a priced edge.';
  return `The model prices this side above the market.${gap} The model is not validated for betting, so this is something to study, not a bet.`;
}

/** An opponent-adjusted matchup edge (NFL event research) as a discovery: significant, not a bet. */
export function mismatchDiscovery(ins: MatchupInsight, r: EventResearchDoc, slug: string): Discovery {
  const ev = r.event;
  const label = ev.participants.map((p) => p.short_name ?? p.display_name).join(' @ ');
  return {
    id: `mm:${ev.event_id}:${ins.id}`,
    kind: 'mismatch',
    sport: r.sport ?? 'NFL',
    slug,
    title: ins.headline,
    why: `${ins.offense.team.nick} ${ins.offense.unit} (${ins.offense.rank.text}, ${ins.offense.rank.tierWord}) against ${ins.defense.team.nick} ${ins.defense.unit} (${ins.defense.rank.text}, ${ins.defense.rank.tierWord}) in ${label}.`,
    significance: ins.size === 'major' ? 'high' : 'medium',
    evidence: null,
    facts: [
      { label: `${ins.offense.team.abbr} ${ins.offense.unit}`, value: `#${ins.offense.rank.rank} of ${ins.offense.rank.of} · ${ins.offense.rank.tierWord}` },
      { label: `${ins.defense.team.abbr} ${ins.defense.unit}`, value: `#${ins.defense.rank.rank} of ${ins.defense.rank.of} · ${ins.defense.rank.tierWord}` },
      { label: 'Edge size', value: ins.size === 'major' ? 'Major' : 'Clear' },
      { label: 'Area', value: ins.areaLabel },
    ],
    method: 'League ranks of the publication’s opponent-adjusted EPA ratings (rank 1 = best for the unit’s job); a major edge is a strength gap of 0.55 or more, clear 0.35.',
    source: `${r.sport ?? 'NFL'} event research · matchup`,
    observedAt: r.generated_at ?? null,
    eventId: ev.event_id,
    gameHref: routes.game(slug, ev.event_id),
    href: routes.game(slug, ev.event_id, { tab: 'matchup' }),
    players: [],
    risk: 'A ranked mismatch describes the matchup. It is not a priced edge: the market may already reflect it.',
    workspaces: ['football', 'props'],
    meaning: mismatchMeaning(ins),
    leads: [
      { kind: 'game', label: 'Full matchup, unit by unit', href: routes.game(slug, ev.event_id, { tab: 'matchup' }) },
      { kind: 'stat', label: `${ins.offense.team.abbr} ${ins.offense.unit} vs ${ins.defense.team.abbr} ${ins.defense.unit} numbers`, href: routes.metric(slug, ins.offense.metricId, { team: ins.offense.team.pid, opp: ins.defense.team.pid, event: ev.event_id }) },
      { kind: 'player', label: AREA_PLAYERS[ins.area] ?? 'Player props on this game', href: routes.game(slug, ev.event_id, { tab: 'props' }) },
      { kind: 'script', label: 'Game scripts it feeds', href: routes.game(slug, ev.event_id, { tab: 'script' }) },
    ],
    insight: ins,
  };
}

const AREA_PLAYERS: Partial<Record<MatchupInsight['area'], string>> = {
  run: 'Rushing props on this game',
  pass: 'Passing and receiving props',
  protection: 'Quarterback props on this game',
  explosive: 'Longest-play and yardage props',
  redzone: 'Touchdown props on this game',
};

/** The plainly explained conclusion of a ranked mismatch: where it would show, and that it is not a priced edge. */
export function mismatchMeaning(ins: MatchupInsight): string {
  const o = ins.offense.team.nick;
  const d = ins.defense.team.nick;
  /** Possessive: "Lions’", "Texans’"; a nickname not ending in s takes "’s" ("Heat’s"). */
  const pos = (n: string) => (/s$/i.test(n) ? `${n}’` : `${n}’s`);
  const offEdge = ins.side === 'offense';
  const where: Record<string, string> = {
    run: offEdge ? `${o} should find room on the ground: it would show in their lead back’s rushing line and in scripts where they lean on the run.` : `${d} should be able to shut down the ${o} run game, pushing ${o} toward the pass.`,
    pass: offEdge ? `${pos(o)} passing game has the better of this matchup: it would show in the quarterback’s and lead receivers’ yardage.` : `${pos(d)} pass defense has the better of this matchup: it would show in a quieter day for ${pos(o)} quarterback and receivers.`,
    protection: offEdge ? `${pos(o)} line should keep its quarterback clean, which usually means more time and fewer sacks.` : `${pos(d)} pass rush should get home against ${pos(o)} protection: sacks and hurried throws are where it would show.`,
    explosive: offEdge ? `${o} create big plays and ${d} allow them: long gains, and so the game total, are where it would show.` : `${d} limit big plays and ${o} rely on them: expect fewer long gains from ${o}.`,
    turnovers: `The turnover battle leans ${ins.beneficiary.nick}: context for the margin, not a market of its own.`,
    early: offEdge ? `${o} should stay ahead of the chains on early downs, which keeps drives alive.` : `${d} should win early downs and put ${o} in long-yardage spots.`,
    redzone: offEdge ? `${o} finish drives well and ${d} struggle to stop it: touchdown props are where it would show.` : `${d} tighten up in the red zone: field goals instead of touchdowns for ${o}.`,
    overall: offEdge ? `${pos(o)} offense is clearly the stronger unit in this matchup.` : `${pos(d)} defense is clearly the stronger unit in this matchup.`,
  };
  return `${where[ins.area] ?? ''} It describes the matchup; it is not a priced edge, and the market may already reflect it.`.trim();
}

/** A publication whose market or model clock has gone stale: a monitoring discovery, never hidden. */
export function freshnessDiscoveries(verdicts: SportVerdict[], now: number): Discovery[] {
  const out: Discovery[] = [];
  for (const v of verdicts) {
    if (v.error) {
      out.push(base(v, 'freshness', `${v.label} publication could not be read`, `Sift could not load the ${v.label} publication: ${v.error}. Its screens show what was last read, with its age.`, 'high', now));
      continue;
    }
    const at = v.marketCaptureAt ? Date.parse(v.marketCaptureAt) : NaN;
    if (v.games > 0 && Number.isFinite(at) && now - at > 6 * 3600_000) {
      out.push(base(v, 'freshness', `${v.label} market capture is ${ago(v.marketCaptureAt, now).replace(/ ago$/, '')} old`, `The ${v.label} publication last captured prices ${ago(v.marketCaptureAt, now)} while it lists ${v.games} upcoming games. Its candidates are repriced only where a live quote exists.`, now - at > 24 * 3600_000 ? 'high' : 'medium', now));
    }
  }
  return out;
}

function base(v: SportVerdict, kind: DiscoveryKind, title: string, why: string, significance: Significance, now: number): Discovery {
  return {
    id: `${kind}:${v.slug}`, kind, sport: v.sport, slug: v.slug, title, why, significance, evidence: null,
    facts: [{ label: 'Games listed', value: String(v.games) }, { label: 'Market capture', value: v.marketCaptureAt ? ago(v.marketCaptureAt, now) : 'Not published' }, { label: 'Model state', value: v.modelState ?? '—' }],
    method: 'Publication health and the market-capture clock as published; quotes are FRESH under 15 minutes and STALE over 30.',
    source: `${v.label} health.json`, observedAt: v.marketCaptureAt, eventId: null, gameHref: null, href: routes.status(), players: [], risk: null, workspaces: ['market'],
    meaning: `Every ${v.label} price on SIFT is as old as that capture until a live quote replaces it, so a candidate may already have moved.`,
    leads: [{ kind: 'data', label: 'Data & provenance', href: routes.status() }, { kind: 'game', label: `${v.label} home`, href: routes.sport(v.slug) }],
  };
}

/** Every discovery for today, most significant first (then markets with stronger evidence, then start time). */
export function buildDiscoveries(input: { opportunities: Opportunity[]; verdicts: SportVerdict[]; research: { r: EventResearchDoc; slug: string }[]; now: number }): Discovery[] {
  const markets = input.opportunities.filter((o) => isLive(o) || o.status === 'WATCH').slice(0, 60).map(marketDiscovery);
  const mismatches = input.research.flatMap(({ r, slug }) => matchupInsights(r).slice(0, 2).map((i) => mismatchDiscovery(i, r, slug)));
  const fresh = freshnessDiscoveries(input.verdicts, input.now);
  const sig = { high: 0, medium: 1, low: 2 } as const;
  const ev = (d: Discovery) => (d.evidence ? { back: 0, research: 1, watch: 2, noedge: 3 }[d.evidence.tone] : 4);
  return [...markets, ...mismatches, ...fresh].sort((a, b) => sig[a.significance] - sig[b.significance] || ev(a) - ev(b) || a.title.localeCompare(b.title));
}
