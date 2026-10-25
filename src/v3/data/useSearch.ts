// Universal search across every published sport: teams, players, games and statistics (including statistics with no priced market).
// Entity lists come from each sport's explorer search index (loaded lazily when Explore opens) and from the live slate.
import { useMemo } from 'react';
import type { SearchEntry } from '../../contract/types';
import { useAsync, useRepo } from '../../data/hooks';
import { sportBySlug } from '../../data/sports';
import { heroTeam } from '../../lib/hero/input';
import { demoOn } from '../state/prefs';
import { useSlate } from './useSlate';
import type { V3Game, V3Team } from '../model/types';

export const EXPLORER_SPORTS = ['nfl', 'nba', 'nhl', 'mlb'] as const;

export function useSearchIndex(slug: string, enabled: boolean) {
  const repo = useRepo(enabled ? sportBySlug(slug) : undefined);
  const ready = enabled && !!repo.data?.hasExplorer;
  return useAsync(ready ? `v3:si:${slug}` : null, () => repo.data!.searchIndex());
}

export interface Hit {
  kind: 'player' | 'team' | 'game' | 'stat';
  key: string;
  slug: string;
  title: string;
  subtitle: string;
  route: string;
  team?: V3Team;
  game?: V3Game;
  /** A statistic with no priced market still opens a real Stat Detail. */
  unpriced?: boolean;
  rank: number;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Higher is better: exact > starts-with > word-start > contains > all tokens present. 0 = no match. */
export function score(q: string, text: string, aliases: string[] = []): number {
  if (!q) return 1;
  const hay = [text, ...aliases].map(norm);
  let best = 0;
  for (const h of hay) {
    if (h === q) best = Math.max(best, 100);
    else if (h.startsWith(q)) best = Math.max(best, 80);
    else if (h.includes(` ${q}`)) best = Math.max(best, 60);
    else if (h.includes(q)) best = Math.max(best, 40);
    else { const toks = q.split(' '); if (toks.length > 1 && toks.every((t) => h.includes(t))) best = Math.max(best, 30); }
  }
  return best;
}

export function useSearchHits(query: string, sport: string | 'all', cat: 'all' | Hit['kind']) {
  const slate = useSlate();
  const demo = demoOn();
  const q = norm(query);
  const idx = {
    nfl: useSearchIndex('nfl', !demo), nba: useSearchIndex('nba', !demo), nhl: useSearchIndex('nhl', !demo), mlb: useSearchIndex('mlb', !demo),
  };
  const loading = !demo && Object.values(idx).some((x) => x.loading);
  const hits = useMemo(() => {
    const out: Hit[] = [];
    const inSport = (slug: string) => sport === 'all' || sport === slug;
    // games (and the teams on the slate, which covers sports without a search index, e.g. college football)
    const seenTeams = new Set<string>();
    for (const g of slate.games) {
      if (!inSport(g.slug)) continue;
      for (const t of [g.away, g.home]) {
        const k = `${t.slug}:${t.id}`;
        if (seenTeams.has(k)) continue; seenTeams.add(k);
        const s = score(q, `${t.name} ${t.abbr}`, [t.nick]);
        if (s) out.push({ kind: 'team', key: k, slug: t.slug, title: t.name, subtitle: `${t.sport === 'CFB' ? 'NCAAF' : t.sport} · team`, route: `/v3/team/${t.slug}/${encodeURIComponent(t.id)}`, team: t, rank: s });
      }
      const s = score(q, `${g.away.name} ${g.home.name} ${g.away.abbr} ${g.home.abbr}`, [`${g.away.nick} ${g.home.nick}`]);
      if (s) out.push({ kind: 'game', key: g.key, slug: g.slug, title: `${g.away.nick} at ${g.home.nick}`, subtitle: `${g.sport === 'CFB' ? 'NCAAF' : g.sport} · ${g.phase === 'live' ? 'Live' : g.phase === 'final' ? 'Final' : new Date(g.startMs).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`, route: `/v3/game/${g.slug}/${encodeURIComponent(g.eventId)}`, game: g, rank: s - (g.phase === 'final' ? 8 : 0) });
    }
    const seenMetric = new Set<string>();
    for (const slug of EXPLORER_SPORTS) {
      if (!inSport(slug)) continue;
      const items: SearchEntry[] = idx[slug].data?.items ?? [];
      const code = slug.toUpperCase();
      for (const e of items) {
        if (e.kind === 'TEAM') {
          const k = `${slug}:${e.id}`;
          const t = heroTeam(code, e.label.length <= 4 ? e.label : e.tokens.find((x) => x.length <= 3)?.toUpperCase() ?? e.label, e.label);
          const short = e.secondary && /^[A-Z]{2,4}$/.test(e.secondary) ? e.secondary : null;
          if (seenTeams.has(`${slug}:${short ?? e.id}`)) continue;
          const s = score(q, e.label, e.aliases);
          if (s) { const code2 = short ?? e.id; out.push({ kind: 'team', key: k, slug, title: e.label, subtitle: `${code} · team`, route: `/v3/team/${slug}/${encodeURIComponent(code2)}`, team: t ? { id: code2, slug, sport: code, name: t.name, nick: t.short, abbr: code2, logo: t.logo, colors: t.colors } : undefined, rank: s - 1 }); }
        } else if (e.kind === 'PLAYER') {
          const s = score(q, e.label, e.aliases);
          if (s) out.push({ kind: 'player', key: `${slug}:${e.id}`, slug, title: e.label, subtitle: `${code} · ${e.secondary ?? e.context.position ?? 'player'}`, route: `/v3/player/${slug}/${encodeURIComponent(e.id)}`, rank: s });
        } else if (e.kind === 'RANKING') {
          // One row per statistic (the season ranking leads); every window is one tap deeper on its Stat Detail.
          const name = e.label.replace(/ ranking \([^)]*\)$/, '');
          const win = /\(([^)]+)\)$/.exec(e.label)?.[1] ?? 'SEASON';
          const mk = `${slug}:${name}`;
          if (seenMetric.has(mk) && win !== 'SEASON') continue;
          const s = score(q, name, e.aliases);
          if (s) { seenMetric.add(mk); out.push({ kind: 'stat', key: `${slug}:${e.id}`, slug, title: name, subtitle: `${code} · ${win === 'ADJ_RIDGE' ? 'opponent-adjusted' : win === 'SEASON' ? 'season' : win} ranking`, route: `/v3/stat/${slug}/${encodeURIComponent(e.id)}`, unpriced: true, rank: s - (win === 'SEASON' ? 0 : 3) }); }
        }
      }
    }
    if (demo) {
      const sample = ['Points per game', 'Yards per game', 'Success rate', 'Points allowed per game', 'Explosive plays allowed', 'Adjusted EPA per play'];
      for (const slug of ['nfl', 'nba'] as const) {
        if (!inSport(slug)) continue;
        sample.forEach((name, i) => { const sc = score(q, name); if (sc) out.push({ kind: 'stat', key: `${slug}:sample-${i}`, slug, title: name, subtitle: `${slug.toUpperCase()} · sample ranking`, route: `/v3/stat/${slug}/sample-${i}`, unpriced: true, rank: sc }); });
      }
      if (inSport('nba')) { const sc = score(q, 'Sample Guard'); if (sc) out.push({ kind: 'player', key: 'nba:sample-guard', slug: 'nba', title: 'Sample Guard', subtitle: 'NBA · G · sample', route: '/v3/player/nba/sample-guard', rank: sc }); }
    }
    return out.filter((h) => cat === 'all' || h.kind === cat).sort((a, b) => b.rank - a.rank || a.title.localeCompare(b.title));
  }, [slate.games, q, sport, cat, idx.nfl.data, idx.nba.data, idx.nhl.data, idx.mlb.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return { hits, loading, q };
}
