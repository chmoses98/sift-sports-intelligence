import { useEffect, useMemo, useState } from 'react';
import type { EntityProfileDoc, MetricDef, ResearchMarket, SearchEntry } from '../contract/types';
import { SportRepo } from '../data/repo';
import { resolveSource } from '../data/source';
import { explorable, SPORTS, type SportConfig } from '../data/sports';
import { familyLabel } from '../lib/format';
import { STAT_LABEL } from '../lib/nfl';
import { indexEntries, matchesAll, parseIntent, search, type Hit, type Indexed } from './engine';

export interface SportIndex {
  sport: SportConfig;
  repo: SportRepo;
  index: Indexed[];
  metrics: Map<string, MetricDef>;
}

let loading: Promise<SportIndex[]> | null = null;

/** Search indexes for every explorable sport, loaded once (~170 KB for NFL). */
export function loadSearchIndexes(): Promise<SportIndex[]> {
  if (!loading) {
    loading = Promise.all(
      SPORTS.filter(explorable).map(async (sport) => {
        try {
          const src = await resolveSource(sport);
          const repo = new SportRepo(src);
          if (!repo.hasExplorer) return null;
          const [si, metrics] = await Promise.all([repo.searchIndex(), repo.metricMap()]);
          return { sport, repo, index: indexEntries(si.items), metrics };
        } catch {
          return null;
        }
      }),
    ).then((xs) => xs.filter((x): x is SportIndex => x !== null));
    loading.catch(() => (loading = null));
  }
  return loading;
}

export interface MarketHit {
  sport: SportConfig;
  market: ResearchMarket;
  subject: string;
}

export interface SearchState {
  ready: boolean;
  hits: (Hit & { sport: SportConfig; metricEntity: string | null })[];
  intent: { sport: SportConfig; subject: SearchEntry; rest: string[]; metrics: SearchEntry[]; profile: EntityProfileDoc | null } | null;
  markets: MarketHit[];
}

function marketText(m: ResearchMarket): string {
  const stat = m.yes_description.match(/iff .+? ([a-z_]+) \(/)?.[1];
  return `${familyLabel(m.market_family)} ${m.market_family} ${stat ? STAT_LABEL[stat] ?? stat : ''} ${m.yes_description} ${m.kalshi_ticker}`;
}

export function useSearch(query: string): SearchState {
  const [indexes, setIndexes] = useState<SportIndex[] | null>(null);
  const [profile, setProfile] = useState<{ key: string; doc: EntityProfileDoc | null } | null>(null);

  useEffect(() => {
    let alive = true;
    loadSearchIndexes().then((x) => alive && setIndexes(x));
    return () => {
      alive = false;
    };
  }, []);

  const base = useMemo(() => {
    if (!indexes || !query.trim()) return { hits: [], intent: null as null | { si: SportIndex; subject: SearchEntry; rest: string[]; metrics: SearchEntry[] } };
    const hits = indexes.flatMap((si) => search(si.index, query, 40).map((h) => ({ ...h, sport: si.sport, metricEntity: si.metrics.get(h.entry.id)?.entity_type ?? null })));
    hits.sort((a, b) => Number(b.full) - Number(a.full) || b.score - a.score);
    let intent = null;
    for (const si of indexes) {
      const it = parseIntent(si.index, query, (e) => si.metrics.get(e.id)?.entity_type ?? null);
      if (it) {
        intent = { si, ...it };
        break;
      }
    }
    return { hits: hits.slice(0, 40), intent };
  }, [indexes, query]);

  // Load the subject's profile so its own markets (and metric ranks) can answer the rest of the query.
  const subjectKey = base.intent ? `${base.intent.si.sport.code}:${base.intent.subject.id}` : null;
  useEffect(() => {
    if (!base.intent || !subjectKey) return;
    let alive = true;
    base.intent.si.repo.profile(base.intent.subject.id).then(
      (doc) => alive && setProfile({ key: subjectKey, doc }),
      () => alive && setProfile({ key: subjectKey, doc: null }),
    );
    return () => {
      alive = false;
    };
  }, [subjectKey, base.intent]);

  const prof = profile && profile.key === subjectKey ? profile.doc : null;
  const markets: MarketHit[] =
    base.intent && prof
      ? prof.markets
          .filter((m) => matchesAll(base.intent!.rest, marketText(m)))
          .slice(0, 12)
          .map((m) => ({ sport: base.intent!.si.sport, market: m, subject: prof.entity.display_name }))
      : [];

  return {
    ready: indexes !== null,
    hits: base.hits,
    intent: base.intent ? { sport: base.intent.si.sport, subject: base.intent.subject, rest: base.intent.rest, metrics: base.intent.metrics, profile: prof } : null,
    markets,
  };
}
