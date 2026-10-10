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

export type DiscoveryKind = 'market' | 'mismatch' | 'context' | 'freshness' | 'model';
export type Significance = 'high' | 'medium' | 'low';

export const KIND_WORD: Record<DiscoveryKind, string> = {
  market: 'Market', mismatch: 'Matchup mismatch', context: 'Lineup & context', freshness: 'Data freshness', model: 'Model evidence',
};

export interface Fact { label: string; value: string }

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
  const d = decisionOf(o.status, o.confidence.calibration);
  const significance: Significance = o.rank.tier <= 2 ? 'high' : o.rank.tier === 3 ? 'medium' : 'low';
  const isProp = /player|prop|goal|shots|points|assists|saves|strikeout|hits|bases/i.test(`${o.family ?? ''} ${o.what.title}`);
  return {
    id: `mkt:${o.id}`,
    kind: 'market',
    sport: o.sport,
    slug: o.slug,
    title: `${o.what.side === 'NO' ? 'NO · ' : ''}${o.what.title}`,
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
    ],
    method: `${o.authority || 'Publication'} candidate, repriced on the current quote where one exists; break-even includes Kalshi's fee.`,
    source: `${o.sport} publication · recommendations`,
    observedAt: o.price.observedAt,
    eventId: o.eventId,
    gameHref: o.gameHref,
    href: o.href,
    players: [],
    risk: o.risk,
    workspaces: isProp ? ['props', 'market'] : ['market'],
    opportunity: o,
  };
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
    href: routes.game(slug, ev.event_id, { tab: 'matchups' }),
    players: [],
    risk: 'A ranked mismatch describes the matchup. It is not a priced edge: the market may already reflect it.',
    workspaces: ['football', 'props'],
    insight: ins,
  };
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
