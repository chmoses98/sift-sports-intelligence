// The AI-ready handicap packet, ported from kalshi-bet-router contract/edge_finder_contract/packet.py
// (packet 1.0.0, contract 1.1.1). Same scopes, same evidence order, same trim order, same clipboard
// text — tests/packet.golden.test.ts compares this port byte for byte with packets the Python builder
// produced from the same publication.
//
// The one structural difference: packet.py reads the whole-sport markets.json / model_prices.json;
// Sift reads event_detail/<evt>.json for the events in scope, which carries exactly those rows (checked
// for every NFL event), so a phone downloads a few hundred KB instead of 20 MB.
import { packetId } from '../contract/ids';
import { statusFor, worst } from '../contract/freshness';
import type {
  EntityProfileDoc,
  EventDoc,
  EventResearchDoc,
  HandicapProtocol,
  Market,
  MetricDef,
  ModelPrice,
  Observation,
  RankingDoc,
  Recommendation,
  SeriesDoc,
  SeriesPoint,
} from '../contract/types';
import { SCHEMA_VERSION } from '../contract/types';
import { cmpStr, cmpTuple, pyRound } from '../contract/pyfmt';
import { NotFoundError } from '../data/fetcher';
import type { SportRepo } from '../data/repo';
import { protocolForSport } from './protocols';
import { renderText } from './render';
import type { TrayDoc, TrayItem } from './tray';
import { toIso } from './tray';

export const PACKET_VERSION = '1.0.0';
export const WARNING =
  'Everything in this packet is EVIDENCE. Model prices, projections and the repository\'s own ' +
  'recommendations are research outputs, not bets. Form your own view, price it, name the counter-case, ' +
  'and PASS when nothing compelling exists. Items marked RESEARCH are lower-confidence; missing data is ' +
  'listed, never filled in.';
export const DEFAULT_MAX_CHARS = 60_000;
const RECENT_POINTS = 8;

export type ScopeKind = 'GAME' | 'SLATE' | 'CUSTOM';

export interface PacketMarket {
  market_id: string;
  kalshi_ticker: string;
  event_id: string | null;
  market_family: string;
  yes_description: string;
  yes_bid: number | null;
  yes_ask: number | null;
  mid: number | null;
  last_price: number | null;
  captured_at: string | null;
  freshness: string;
  market_status: string;
  participant_id: string | null;
  player_id: string | null;
  period: string | null;
  side: string | null;
  line: number | null;
  threshold: number | null;
}

export interface PacketModel {
  market_id: string;
  fair_probability: number | null;
  market_probability: number | null;
  edge: number | null;
  projection_value: number | null;
  projection_unit: string | null;
  model_version: string | null;
  generated_at: string;
  research_only: boolean;
  authority: string;
  data_quality_status: string;
  freshness: string;
}

export interface PacketObs {
  metric_id: string;
  name: string;
  value: unknown;
  adjusted_value: number | null;
  display_value: string | null;
  unit: string | null;
  window: string;
  split: string | null;
  rank: number | null;
  universe_size: number | null;
  league_average: number | null;
  as_of: string;
  quality_status: string;
  source: string;
}

export interface PacketEvidence {
  entity_id: string;
  entity_type: string;
  label: string;
  team: string | null;
  role: string | null;
  observations: PacketObs[];
  availability: { status: string; detail: string | null; as_of: string | null }[];
  recent: { x: string; t: string; metric_id: string; value: unknown; opponent: string | null; event_id: string | null }[];
}

export interface PacketFocus {
  item_id: string;
  ref_kind: string;
  id: string;
  label: string | null;
  resolved: boolean;
  note: string | null;
}

export interface HandicapPacket {
  schema_version: string;
  kind: 'handicap_packet';
  packet_id: string;
  packet_version: string;
  protocol: Pick<HandicapProtocol, 'protocol_id' | 'version' | 'extends' | 'principles' | 'steps' | 'outputs_required' | 'forbidden' | 'evidence_weights'>;
  scope: { kind: ScopeKind; event_ids: string[]; window_start: string | null; window_end: string | null; label: string };
  sports: string[];
  generated_at: string;
  data_as_of: string;
  warning: string;
  user_focus: PacketFocus[];
  events: {
    event_id: string;
    label: string;
    start_time_utc: string;
    status: string;
    home_participant: string | null;
    away_participant: string | null;
    venue: string | null;
    context_notes: string[];
    theses: { summary: string | null; supporting_factors: string[]; opposing_factors: string[]; research_only: boolean }[];
  }[];
  evidence: PacketEvidence[];
  markets: PacketMarket[];
  model_evidence: PacketModel[];
  repo_recommendations: {
    market_id: string;
    selection: string;
    status: string;
    fair_probability: number | null;
    bet_up_to_price: number | null;
    authority: string;
    research_only: boolean;
    created_at: string;
  }[];
  quality: {
    sources: string[];
    market_freshness: string;
    model_freshness: string;
    research_only_items: string[];
    missing: string[];
    capabilities: Record<string, string>;
  };
  budget: { max_chars: number; chars: number; truncated: string[] };
}

export interface PacketRequest {
  scope: ScopeKind;
  eventId?: string;
  windowStart?: string;
  windowEnd?: string;
  tray?: TrayDoc;
  generatedAt?: string;
  maxChars?: number;
  onProgress?: (msg: string) => void;
  /**
   * Sift's live market layer (src/live/). It changes VALUES, never the packet format: market rows get
   * the newest trustworthy quote (yes_bid/yes_ask/last/captured_at/market_status) and their freshness
   * is classified with the market-quote policy; data-quality notes go to quality.missing and the live
   * source to quality.sources. Without it the builder is exactly packet.py (the golden tests).
   */
  live?: LivePacketInputs;
}

export interface LivePacketInputs {
  overlay: (m: Market) => Market;
  marketFreshness: (capturedAt: string | null, now: string) => string;
  notes: string[];
  sources: string[];
}

export function eventLabel(ev: Pick<EventDoc, 'participants' | 'home_participant' | 'away_participant'>): string {
  const names = new Map(ev.participants.map((p) => [p.participant_id, p.short_name || p.display_name]));
  if (ev.home_participant && ev.away_participant) {
    return `${names.get(ev.away_participant) ?? '?'} @ ${names.get(ev.home_participant) ?? '?'}`;
  }
  return [...names.values()].join(' vs ');
}

const mid = (m: Market): number | null =>
  m.yes_bid != null && m.yes_ask != null ? pyRound((m.yes_bid + m.yes_ask) / 2, 6) : m.market_probability;

function packetMarket(m: Market, now: string, classify?: LivePacketInputs['marketFreshness']): PacketMarket {
  return {
    market_id: m.market_id, kalshi_ticker: m.kalshi_ticker, event_id: m.event_id ?? null,
    market_family: m.market_family, yes_description: m.yes_description, yes_bid: m.yes_bid ?? null,
    yes_ask: m.yes_ask ?? null, mid: mid(m), last_price: m.last_price ?? null, captured_at: m.captured_at ?? null,
    freshness: classify ? classify(m.captured_at ?? null, now) : m.captured_at ? statusFor(m.captured_at, 'market_data', now) : 'UNKNOWN',
    market_status: m.market_status ?? 'UNKNOWN', participant_id: m.participant_id ?? null, player_id: m.player_id ?? null,
    period: m.period ?? null, side: m.side ?? null, line: m.line ?? null, threshold: m.threshold ?? null,
  };
}

function packetModel(mp: ModelPrice, now: string, recAuthority: Map<string, [boolean, string]>): PacketModel {
  const [researchOnly, authority] = recAuthority.get(mp.market_id) ?? [true, 'RESEARCH_ONLY'];
  return {
    market_id: mp.market_id, fair_probability: mp.fair_probability ?? null, market_probability: mp.market_probability ?? null,
    edge: mp.edge ?? null, projection_value: mp.projection_value ?? null, projection_unit: mp.projection_unit ?? null,
    model_version: mp.model_version ?? null, generated_at: mp.generated_at, research_only: researchOnly, authority,
    data_quality_status: mp.data_quality_status ?? 'UNKNOWN', freshness: statusFor(mp.generated_at, 'model', now),
  };
}

function packetObs(o: Observation, name: string): PacketObs {
  const ctx = o.context ?? ({} as Partial<NonNullable<Observation['context']>>);
  return {
    metric_id: o.metric_id, name, value: o.value, adjusted_value: o.adjusted_value ?? null,
    display_value: o.display_value ?? null, unit: o.unit ?? null, window: o.window.label,
    split: o.split ? `${o.split.dimension}=${o.split.value}` : null, rank: ctx.rank ?? null,
    universe_size: ctx.universe_size ?? null, league_average: ctx.league_average ?? null, as_of: o.as_of,
    quality_status: o.quality_status, source: o.source,
  };
}

async function evidenceForProfile(
  repo: SportRepo,
  prof: EntityProfileDoc,
  metricNames: Map<string, string>,
  focusMetricIds: Set<string>,
): Promise<PacketEvidence> {
  const obs: PacketObs[] = prof.metrics.map((o) => packetObs(o, metricNames.get(o.metric_id) ?? o.metric_id));
  for (const rows of Object.values(prof.splits ?? {})) {
    for (const o of rows) obs.push(packetObs(o, metricNames.get(o.metric_id) ?? o.metric_id));
  }
  const sorted = [...obs].sort((a, b) => cmpTuple([a.metric_id, a.window, a.split ?? ''], [b.metric_id, b.window, b.split ?? '']));
  const seen = new Set<string>();
  const kept: PacketObs[] = [];
  for (const o of sorted) {
    const key = JSON.stringify([o.metric_id, o.window, o.split]);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(o);
  }
  const recent: PacketEvidence['recent'] = [];
  for (const ref of (prof.series ?? []).slice(0, 12)) {
    const d: SeriesDoc | null = await repo.series(ref.series_id).catch(() => null);
    if (!d) continue;
    const pts: SeriesPoint[] =
      focusMetricIds.has(d.metric_id) || recent.length < 3 * RECENT_POINTS ? d.points.slice(-RECENT_POINTS) : d.points.slice(-3);
    for (const p of pts) {
      recent.push({ x: p.x, t: p.t, metric_id: d.metric_id, value: p.value ?? null, opponent: p.opponent_id ?? null, event_id: p.event_id ?? null });
    }
  }
  return {
    entity_id: prof.entity.participant_id,
    entity_type: prof.entity_type,
    label: prof.entity.display_name,
    team: prof.team?.display_name ?? null,
    role: ((prof.entity.metadata ?? {}) as Record<string, unknown>).position as string | null ?? null,
    observations: kept,
    availability: (prof.availability ?? []) as PacketEvidence['availability'],
    recent,
  };
}

interface Resolved {
  item: TrayItem;
  resolved: boolean;
  label: string | null;
  document: unknown;
  event_ids: string[];
  entity_ids: string[];
  market_ids: string[];
  note: string | null;
  metric_id: string | null;
}

async function tryGet<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

/** packet.resolve_tray: each item resolved against the publication; unresolved items are reported, never invented. */
export async function resolveTray(repo: SportRepo, tray: TrayDoc, metrics: Map<string, MetricDef>): Promise<Resolved[]> {
  const out: Resolved[] = [];
  for (const item of tray.items) {
    const kind = item.ref_kind;
    const ref = item.id;
    const res: Resolved = { item, resolved: false, label: null, document: null, event_ids: [], entity_ids: [], market_ids: [], note: item.note ?? null, metric_id: null };
    if (kind === 'TEAM' || kind === 'PLAYER') {
      const d = await tryGet(repo.profile(ref));
      if (d) Object.assign(res, { resolved: true, label: d.entity.display_name, document: d, entity_ids: [ref], event_ids: (d.games ?? []).map((g) => g.event_id) });
    } else if (kind === 'EVENT') {
      const d = await tryGet(repo.eventResearch(ref));
      if (d) Object.assign(res, { resolved: true, label: eventLabel(d.event), document: d, event_ids: [ref] });
    } else if (kind === 'METRIC') {
      const m = metrics.get(ref);
      if (m) Object.assign(res, { resolved: true, label: m.name, document: m, metric_id: ref });
    } else if (kind === 'RANKING' || kind === 'SERIES') {
      const d = kind === 'RANKING' ? await tryGet<RankingDoc | SeriesDoc>(repo.ranking(ref)) : await tryGet<RankingDoc | SeriesDoc>(repo.series(ref));
      if (d) {
        Object.assign(res, {
          resolved: true, label: `${kind.toLowerCase()} ${d.metric_id}`, document: d, metric_id: d.metric_id,
          entity_ids: 'entity_id' in d ? [d.entity_id] : [],
        });
      }
    } else if (kind === 'CHART_POINT') {
      const sid = item.extra?.series_id ?? null;
      const x = item.extra?.x ?? null;
      const d = sid ? await tryGet(repo.series(sid)) : null;
      const pt = d ? d.points.find((p) => p.x === x) : undefined;
      if (d && pt) {
        Object.assign(res, {
          resolved: true, label: `${d.metric_id} @ ${x}`, document: { series: d, point: pt }, metric_id: d.metric_id,
          entity_ids: [d.entity_id], event_ids: pt.event_id ? [pt.event_id] : [],
        });
      }
    } else if (kind === 'MARKET' || kind === 'PROJECTION') {
      const eid = item.extra?.event_id ?? null;
      const detail = eid ? await tryGet(repo.eventDetail(eid)) : null;
      if (kind === 'MARKET') {
        const m = detail?.markets.find((x) => x.market_id === ref);
        if (m) Object.assign(res, { resolved: true, label: m.yes_description, document: m, market_ids: [ref], event_ids: m.event_id ? [m.event_id] : [] });
      } else {
        const mp = detail?.model_prices.find((x) => x.model_price_id === ref);
        if (mp) Object.assign(res, { resolved: true, label: `model price ${mp.market_id}`, document: mp, market_ids: [mp.market_id], event_ids: mp.event_id ? [mp.event_id] : [] });
      }
    }
    out.push(res);
  }
  return out;
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const sortStr = (xs: string[]) => [...xs].sort(cmpStr);

interface ScopeInfo {
  eventIds: string[];
  label: string;
  focus: PacketFocus[];
  focusEntityIds: string[];
  focusMarketIds: string[];
  focusMarketEvents: string[];
  focusMetricIds: Set<string>;
  missing: string[];
}

/** Step 1 of packet.build: the scope -> event ids and the user's focus. */
async function resolveScope(
  repo: SportRepo,
  req: PacketRequest,
  eventsDoc: { items: EventDoc[] },
  metrics: Map<string, MetricDef>,
  progress: (m: string) => void,
): Promise<ScopeInfo> {
  const eventsById = new Map(eventsDoc.items.map((e) => [e.event_id, e]));
  const focus: PacketFocus[] = [];
  const focusEntityIds: string[] = [];
  const focusMarketIds: string[] = [];
  const focusMarketEvents: string[] = [];
  const focusMetricIds = new Set<string>();
  const missing: string[] = [];
  let eventIds: string[];
  let label: string;
  if (req.scope === 'GAME') {
    if (!req.eventId || !eventsById.has(req.eventId)) throw new Error(`event ${req.eventId} is not in this publication`);
    eventIds = [req.eventId];
    label = eventLabel(eventsById.get(req.eventId)!);
  } else if (req.scope === 'SLATE') {
    if (!req.windowStart || !req.windowEnd) throw new Error('a SLATE scope needs window_start and window_end');
    const s = Date.parse(req.windowStart);
    const e = Date.parse(req.windowEnd);
    eventIds = sortStr(eventsDoc.items.filter((ev) => s <= Date.parse(ev.start_time_utc) && Date.parse(ev.start_time_utc) <= e).map((ev) => ev.event_id));
    label = `slate ${toIso(req.windowStart)}..${toIso(req.windowEnd)}`;
  } else {
    if (!req.tray) throw new Error('a CUSTOM scope needs a research tray');
    progress('Resolving research tray');
    const resolved = await resolveTray(repo, req.tray, metrics);
    eventIds = sortStr(uniq(resolved.flatMap((r) => r.event_ids).filter((eid) => eventsById.has(eid))));
    for (const r of resolved) {
      focus.push({ item_id: r.item.item_id, ref_kind: r.item.ref_kind, id: r.item.id, label: r.label, resolved: r.resolved, note: r.note });
      if (!r.resolved) missing.push(`tray item ${r.item.ref_kind} ${r.item.id} is not in this publication`);
      focusEntityIds.push(...r.entity_ids);
      focusMarketIds.push(...r.market_ids);
      focusMarketEvents.push(...r.event_ids.filter((e) => r.market_ids.length && e));
      if (r.item.ref_kind === 'METRIC') focusMetricIds.add(r.item.id);
      else if (['RANKING', 'SERIES', 'CHART_POINT'].includes(r.item.ref_kind) && r.document && r.metric_id) focusMetricIds.add(r.metric_id);
    }
    label = `research tray (${req.tray.items.length} items)`;
  }
  return { eventIds, label, focus, focusEntityIds, focusMarketIds, focusMarketEvents, focusMetricIds, missing };
}

/** Step 4 of packet.build: every market of the events in scope (+ focused markets), in packet order. */
async function scopeMarkets(repo: SportRepo, scope: ScopeInfo): Promise<{ markets: Market[]; modelPrices: ModelPrice[] }> {
  const inScope = new Set(scope.eventIds);
  const marketEventIds = sortStr(uniq([...scope.eventIds, ...scope.focusMarketEvents]));
  const all: Market[] = [];
  const modelPrices: ModelPrice[] = [];
  for (const eid of marketEventIds) {
    const d = await tryGet(repo.eventDetail(eid));
    if (!d) continue;
    all.push(...d.markets);
    modelPrices.push(...d.model_prices);
  }
  const focusMarkets = new Set(scope.focusMarketIds);
  const markets: Market[] = [];
  const seen = new Set<string>();
  const sorted = [...all].sort((a, b) =>
    cmpTuple([a.event_id ?? '', a.market_family, a.kalshi_ticker], [b.event_id ?? '', b.market_family, b.kalshi_ticker]),
  );
  for (const m of sorted) {
    if ((inScope.has(m.event_id ?? '') || focusMarkets.has(m.market_id)) && !seen.has(m.market_id)) {
      seen.add(m.market_id);
      markets.push(m);
    }
  }
  return { markets, modelPrices };
}

/**
 * Exactly the markets a packet for this request will carry (same scope rules as buildPacket), so
 * the live layer can refresh them BEFORE the packet is built (packet preflight).
 */
export async function packetScopeMarkets(repo: SportRepo, req: PacketRequest): Promise<Market[]> {
  const [eventsDoc, metrics] = await Promise.all([repo.events(), repo.hasExplorer ? repo.metricMap() : Promise.resolve(new Map<string, MetricDef>())]);
  const scope = await resolveScope(repo, req, eventsDoc, metrics, req.onProgress ?? (() => {}));
  return (await scopeMarkets(repo, scope)).markets;
}

export async function buildPacket(repo: SportRepo, req: PacketRequest): Promise<HandicapPacket> {
  const progress = req.onProgress ?? (() => {});
  const manifest = await repo.manifest();
  const sport = manifest.sport;
  const now = req.generatedAt ? toIso(req.generatedAt) : manifest.generated_at;
  const proto = protocolForSport(sport);
  const [eventsDoc, recsDoc, thesesDoc, metrics] = await Promise.all([
    repo.events(), repo.recommendations(), repo.theses(), repo.hasExplorer ? repo.metricMap() : Promise.resolve(new Map<string, MetricDef>()),
  ]);
  const eventsById = new Map(eventsDoc.items.map((e) => [e.event_id, e]));
  const recs: Recommendation[] = recsDoc.items;
  const theses = new Map(thesesDoc.items.map((t) => [t.event_id, t]));
  const recAuthority = new Map<string, [boolean, string]>(recs.map((r) => [r.market_id, [Boolean(r.research_only), r.authority]]));

  // 1. the scope -> event ids and focus
  const scope = await resolveScope(repo, req, eventsDoc, metrics, progress);
  const { eventIds, label, focus, focusEntityIds, focusMetricIds } = scope;
  const missing = [...scope.missing];
  // 2. events + participants
  const packetEvents: HandicapPacket['events'] = [];
  const participantIds: string[] = [];
  const research = new Map<string, EventResearchDoc | null>();
  for (const eid of eventIds) {
    const r = repo.hasExplorer ? await tryGet(repo.eventResearch(eid)) : null;
    research.set(eid, r);
  }
  for (const eid of eventIds) {
    const ev = eventsById.get(eid)!;
    const r = research.get(eid) ?? null;
    const notes = r ? [...(r.context?.notes ?? [])] : [];
    const th = theses.get(eid);
    packetEvents.push({
      event_id: eid, label: eventLabel(ev), start_time_utc: ev.start_time_utc, status: ev.status,
      home_participant: ev.home_participant ?? null, away_participant: ev.away_participant ?? null, venue: ev.venue ?? null,
      context_notes: notes,
      theses: th ? [{ summary: th.summary ?? null, supporting_factors: th.supporting_factors ?? [], opposing_factors: th.opposing_factors ?? [], research_only: true }] : [],
    });
    participantIds.push(...ev.participants.map((p) => p.participant_id));
    if (r) participantIds.push(...(r.players ?? []).map((p) => p.participant_id));
    else missing.push(`no event research for ${eid}`);
  }

  // 3. evidence: focused entities first, then event participants, deduplicated
  const metricNames = new Map([...metrics.values()].map((m) => [m.metric_id, m.name]));
  const metricStatus = new Map([...metrics.values()].map((m) => [m.metric_id, m.quality.status]));
  const orderedEntities = uniq([...focusEntityIds, ...participantIds]);
  const evidence: PacketEvidence[] = [];
  let n = 0;
  for (const pid of orderedEntities) {
    n++;
    if (n % 10 === 0) progress(`Collecting evidence (${n}/${orderedEntities.length})`);
    const prof = repo.hasExplorer ? await tryGet(repo.profile(pid)) : null;
    if (!prof) {
      missing.push(`no profile for ${pid}`);
      continue;
    }
    evidence.push(await evidenceForProfile(repo, prof, metricNames, focusMetricIds));
  }

  // 4. markets: every market of the events in scope (+ focused markets), model evidence for those markets
  progress('Loading markets and model prices');
  const { markets: scoped, modelPrices } = await scopeMarkets(repo, scope);
  const live = req.live;
  const packetMarkets: PacketMarket[] = scoped.map((m) => packetMarket(live ? live.overlay(m) : m, now, live?.marketFreshness));
  const seenM = new Set(packetMarkets.map((m) => m.market_id));
  if (!packetMarkets.length) missing.push('no current markets for the scope');
  const packetModels: PacketModel[] = [];
  const seenMp = new Set<string>();
  const sortedPrices = stableSortDesc(modelPrices, (a, b) => cmpTuple([a.market_id, a.generated_at], [b.market_id, b.generated_at]));
  for (const mp of sortedPrices) {
    if (seenM.has(mp.market_id) && !seenMp.has(mp.market_id)) {
      seenMp.add(mp.market_id);
      packetModels.push(packetModel(mp, now, recAuthority));
    }
  }
  packetModels.sort((a, b) => cmpStr(a.market_id, b.market_id));
  const repoRecs = [...recs]
    .sort((a, b) => cmpTuple([a.market_id, a.created_at], [b.market_id, b.created_at]))
    .filter((r) => seenM.has(r.market_id))
    .map((r) => ({
      market_id: r.market_id, selection: r.selection, status: r.status, fair_probability: r.fair_probability ?? null,
      bet_up_to_price: r.bet_up_to_price ?? null, authority: r.authority, research_only: r.research_only, created_at: r.created_at,
    }));

  // 5. quality
  const evidenceMetricIds = new Set(evidence.flatMap((e) => e.observations.map((o) => o.metric_id)));
  const researchOnlyItems = sortStr(
    uniq([
      ...evidence.flatMap((e) => e.observations.filter((o) => o.quality_status === 'RESEARCH').map((o) => o.metric_id)),
      ...packetModels.filter((m) => m.research_only).map((m) => m.market_id),
      ...[...metricStatus.entries()].filter(([mid, st]) => st === 'RESEARCH' && evidenceMetricIds.has(mid)).map(([mid]) => mid),
    ]),
  );
  let caps: Record<string, string> = {};
  const capDoc = repo.hasExplorer ? await tryGet(repo.capabilities()) : null;
  if (capDoc) {
    caps = Object.fromEntries(capDoc.items.filter((c) => c.status !== 'UNKNOWN').map((c) => [c.capability, c.status]));
  } else {
    missing.push('no capability manifest (no explorer published)');
  }
  const sources = sortStr(
    uniq([...evidence.flatMap((e) => e.observations.map((o) => o.source)), 'kalshi markets', ...(packetModels.length ? ['model prices'] : []), ...(live?.sources ?? [])]),
  );
  const marketFresh = packetMarkets.length ? worst(...packetMarkets.map((m) => m.freshness)) : 'UNKNOWN';
  const modelFresh = packetModels.length ? worst(...packetModels.map((m) => m.freshness)) : 'UNKNOWN';
  const asOfCandidates = [
    ...packetMarkets.map((m) => m.captured_at).filter((x): x is string => !!x),
    ...packetModels.map((m) => m.generated_at),
    manifest.generated_at,
  ];
  const dataAsOf = asOfCandidates.reduce((a, b) => (b > a ? b : a));

  const packet: HandicapPacket = {
    schema_version: SCHEMA_VERSION,
    kind: 'handicap_packet',
    packet_id: packetId(proto.protocol_id, req.scope, [...eventIds, ...focus.map((f) => f.item_id)], dataAsOf),
    packet_version: PACKET_VERSION,
    protocol: {
      protocol_id: proto.protocol_id, version: proto.version, extends: proto.extends, principles: proto.principles,
      steps: proto.steps, outputs_required: proto.outputs_required, forbidden: proto.forbidden, evidence_weights: proto.evidence_weights,
    },
    scope: {
      kind: req.scope, event_ids: eventIds, window_start: req.windowStart ? toIso(req.windowStart) : null,
      window_end: req.windowEnd ? toIso(req.windowEnd) : null, label,
    },
    sports: [sport],
    generated_at: now,
    data_as_of: dataAsOf,
    warning: WARNING,
    user_focus: focus,
    events: packetEvents,
    evidence,
    markets: packetMarkets,
    model_evidence: packetModels,
    repo_recommendations: repoRecs,
    quality: {
      sources, market_freshness: marketFresh, model_freshness: modelFresh, research_only_items: researchOnlyItems,
      missing: sortStr(uniq([...missing, ...(live?.notes ?? [])])), capabilities: caps,
    },
    budget: { max_chars: req.maxChars ?? DEFAULT_MAX_CHARS, chars: 0, truncated: [] },
  };
  progress('Fitting the clipboard budget');
  fitBudget(packet, packet.budget.max_chars);
  return packet;
}

/** Python sorted(..., reverse=True): descending, equal elements keep their original order. */
function stableSortDesc<T>(xs: T[], cmp: (a: T, b: T) => number): T[] {
  return xs.map((x, i) => [x, i] as const).sort((a, b) => cmp(b[0], a[0]) || a[1] - b[1]).map(([x]) => x);
}

/** Python len() of a str: code points, not UTF-16 units. */
export function pyLen(s: string): number {
  let surrogates = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) surrogates++;
  }
  return s.length - surrogates;
}

const size = (p: HandicapPacket) => pyLen(renderText(p));

/** packet._fit_budget: trim in a fixed order; markets and model evidence are never trimmed. */
export function fitBudget(packet: HandicapPacket, maxChars: number): void {
  const truncated = packet.budget.truncated;
  if (size(packet) > maxChars) {
    for (const e of packet.evidence) if (e.recent.length) e.recent = e.recent.slice(-3);
    truncated.push('recent series points reduced to 3 per series');
  }
  if (size(packet) > maxChars) {
    for (const e of packet.evidence) if (e.observations.length > 24) e.observations = e.observations.slice(0, 24);
    truncated.push('observations capped at 24 per entity');
  }
  if (size(packet) > maxChars && packet.repo_recommendations.length) {
    packet.repo_recommendations = [];
    truncated.push('repository recommendations omitted');
  }
  if (size(packet) > maxChars) {
    for (const e of packet.evidence) e.recent = [];
    truncated.push('recent series points omitted');
  }
  const focus = new Set(packet.user_focus.map((f) => f.id));
  for (const [kind, cap] of [['PLAYER', 8], [null, 12]] as const) {
    if (size(packet) <= maxChars) break;
    for (const e of packet.evidence) {
      if (!focus.has(e.entity_id) && (kind === null || e.entity_type === kind) && e.observations.length > cap) {
        e.observations = e.observations.slice(0, cap);
      }
    }
    truncated.push(`observations capped at ${cap} per ${kind ? 'player' : 'entity'} (tray items kept)`);
  }
  if (size(packet) > maxChars) truncated.push('over budget: every market in scope was kept');
  packet.budget.chars = size(packet);
}
