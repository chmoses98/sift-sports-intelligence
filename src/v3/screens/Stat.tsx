// Stat Detail and League Rankings (locked designs SD1 to SD7). Every rank, value and percentile in the app opens this screen.
//   /v3/stat/:slug/:statId?win=&sel=&opp=&tab=...   statId is the metric's SHORT id ("adj_off_epa"); the first build's ranking id
//   ("rnk_…") still resolves (through the catalog) and the address is rewritten in place; "sample-N" is the labelled sample view model.
// The address is the state: tab, window, selection, next opponent, observation, comparison picks, expanded About and the "all" list
// all live in it, in-place changes replace the history entry, and Back restores the entry exactly (scroll included, by the shell).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from '../../routing';
import './stat.css';
import { useMetricDefs, useRankingDoc, useTeamIndex } from '../data/research/hooks';
import { percentileOf, shortMetricId } from '../data/research/normalize';
import { familyOf } from './stat/family';
import type { RankingVM } from '../data/research/types';
import { useNextOpponent, useStatCatalog } from '../data/useStatDetail';
import { toStatTeam, useStatVM } from '../data/useStat';
import { capability } from '../model/capabilities';
import { roleOf, statDecl } from '../model/statDecl';
import { fmtValue, ordinal, rankedTeams, resolveStat, universeNote, windowLabel } from '../model/statDetail';
import { saveResearch, pushVisit, removeSaved, useSaved, demoOn } from '../state/prefs';
import { findSaved } from '../model/saved';
import { STAT_TABS, statSchema } from '../nav/schemas';
import { routes } from '../nav/routes';
import { encode, useRouteState } from '../state/url';
import { sportBySlug } from '../../data/sports';
import type { MetricDef } from '../../contract/types';
import type { V3Team } from '../model/types';
import { failureKind } from '../data/failure';
import { DataState } from '../ui/DataState';
import { Icon } from '../ui/Icon';
import { Tabs, LockedRow } from '../ui/atoms';
import type { StatCtx } from './stat/ctx';
import { RankingTab } from './stat/RankingTab';
import { TrendTab } from './stat/TrendTab';
import { CompareTab } from './stat/CompareTab';
import { AboutTab } from './stat/AboutTab';

type Tab = (typeof STAT_TABS)[number];
const TAB_LABEL: Record<Tab, string> = { ranking: 'Ranking', trend: 'Trend', compare: 'Compare', about: 'About' };
const TABS = STAT_TABS.map((k) => ({ key: k, label: TAB_LABEL[k] }));

interface HeaderText { eyebrow: string; title: string; sub: string }

function Frame({ head, tab, onTab, saved, onSave, onBack, children }: { head: HeaderText; tab: Tab | null; onTab: (t: Tab) => void; saved: boolean; onSave: (() => void) | null; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="v3-page st">
      <header className="st-hd">
        <button type="button" className="v3-iconbtn" aria-label="Back" onClick={onBack}><Icon name="back" size={26} /></button>
        <div className="tt"><span className="st-eyebrow">{head.eyebrow}</span><h1>{head.title}</h1><small>{head.sub}</small></div>
        {onSave && <button type="button" className={`v3-iconbtn st-bm${saved ? ' is-on' : ''}`} aria-pressed={saved} aria-label={saved ? 'Remove saved statistic' : 'Save this statistic'} onClick={onSave}><Icon name="bookmark" size={22} fill={saved} /></button>}
      </header>
      {tab && <div className="st-tabs"><Tabs tabs={TABS} value={tab} onChange={onTab} label="Statistic views" /></div>}
      {children}
    </div>
  );
}

function useBack() {
  const nav = useNavigate();
  const loc = useLocation();
  return () => { if (loc.key !== 'default') nav(-1); else nav('/v3/explore', { replace: true }); };
}

const slugTitle = (id: string) => id.replace(/^[a-z]+_/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

function headerOf(ctx: StatCtx, tab: Tab, cmpSub: string | null): HeaderText {
  const { ranking, sportCode, st } = ctx;
  if (tab === 'trend') return { eyebrow: 'Trend', title: ranking.name, sub: `${sportCode} · ${ranking.n} teams${ctx.sel ? ` · ${ctx.team(ctx.sel).name}` : ''}` };
  if (tab === 'compare') {
    const players = st.cmpm === 'players';
    return { eyebrow: 'Compare', title: players ? 'Compare players' : 'Compare teams', sub: players ? cmpSub ?? 'Game-log values · last 10 games' : `${sportCode} · ${statDecl(ctx.slug)?.compareSub ?? 'team statistics'}` };
  }
  if (tab === 'about') return { eyebrow: 'About this statistic', title: ranking.name, sub: `${sportCode} · ${ctx.adjusted ? 'opponent-adjusted' : 'raw'}` };
  if (st.sbs && ctx.mode === 'real') return { eyebrow: 'League ranking', title: ctx.rawName ?? ranking.name, sub: 'Raw and opponent-adjusted are separate statistics' };
  return { eyebrow: 'League ranking', title: ranking.name, sub: `${sportCode} · ${universeNote(ranking.universe, ranking.n)}` };
}

/** Everything the screen shows once a ranking is in hand. Real and sample statistics take the same path. */
function Body({ ctx, fell, onBack }: { ctx: StatCtx; fell: string | null; onBack: () => void }) {
  const { st, slug, ranking } = ctx;
  const saved = useSaved();
  const [cmpSub, setCmpSub] = useState<string | null>(null);
  const tab = st.tab;
  const route = routes.stat({ slug, statId: ctx.statId }, { ...st, win: ctx.mode === 'real' ? ctx.window : st.win });
  const savedItem = findSaved(saved, route);
  const selT = useMemo(() => (ctx.sel ? rankedTeams(ranking).find((t) => t.code === ctx.sel) ?? null : null), [ctx.sel, ranking]);
  const subtitle = `${ctx.sportCode} · ${windowLabel(ctx.window)} ranking`;
  useEffect(() => {
    pushVisit({ route: `/v3/stat/${slug}/${ctx.statId}`, title: ranking.name, subtitle, kind: 'stat', slug });
  }, [slug, ctx.statId, ranking.name, subtitle]);
  const onSave = () => {
    if (savedItem) { removeSaved(savedItem.id); return; }
    saveResearch({
      title: ranking.name,
      subtitle: `${subtitle}${ctx.sel ? ` · ${ctx.sel}` : ''}`,
      route,
      chips: [TAB_LABEL[tab], windowLabel(ctx.window), ...(ctx.sel ? [ctx.sel] : [])].slice(0, 4),
      snapshot: selT ? [{ label: `${selT.code} rank`, value: `${ordinal(selT.rank)} of ${ranking.n}`, asOf: ranking.asOf || null }, { label: ranking.name, value: ctx.fmt(selT.value), asOf: ranking.asOf || null }] : undefined,
    });
  };
  return (
    <Frame head={headerOf(ctx, tab, cmpSub)} tab={tab} onTab={(t) => ctx.set({ tab: t })} saved={!!savedItem} onSave={onSave} onBack={onBack}>
      {ctx.mode === 'demo' && <span className="st-sample" role="note">Sample ranking</span>}
      {fell && <p className="st-fell" role="note">{fell}</p>}
      {tab === 'ranking' && <RankingTab ctx={ctx} />}
      {tab === 'trend' && <TrendTab ctx={ctx} />}
      {tab === 'compare' && <CompareTab ctx={ctx} setSub={setCmpSub} />}
      {tab === 'about' && <AboutTab ctx={ctx} />}
    </Frame>
  );
}

// ------------------------------------------------------------------ real statistics

function LiveStat({ slug, statId }: { slug: string; statId: string }) {
  const loc = useLocation();
  const nav = useNavigate();
  const back = useBack();
  const [st, set] = useRouteState(statSchema);
  const cat = useStatCatalog(slug, st.sel);
  const ti = useTeamIndex(slug);
  const res = useMemo(() => (cat.catalog ? resolveStat(cat.catalog, statId, st.win, cat.season ? [cat.season] : []) : null), [cat.catalog, cat.season, statId, st.win]);
  const rk = useRankingDoc(slug, res?.ok ? res.rankingId : null);
  const defs = useMetricDefs(slug);
  const next = useNextOpponent(slug, st.sel, st.opp);
  const sport = sportBySlug(slug);
  const sportCode = sport?.code ?? slug.toUpperCase();

  // The first build's address used a ranking id: say the statistic and window in the locked vocabulary, replacing the entry (no ghost entry).
  useEffect(() => {
    if (!res?.ok || !res.legacy) return;
    const search = encode(statSchema, { win: res.window }, loc.search);
    nav({ pathname: `/v3/stat/${slug}/${encodeURIComponent(res.id)}`, search }, { replace: true, state: loc.state });
  }, [res, slug, loc.search, loc.state, nav]);

  const def = res?.ok ? defs.data?.get(res.metricId) : undefined;
  const ranking = rk.ranking;
  const teamFor = useCallback((code: string, name?: string): V3Team => toStatTeam(sportCode, slug, code, name ?? ranking?.entries.find((e) => e.code === code)?.name ?? ti.byCode.get(code)?.display_name ?? code), [sportCode, slug, ranking, ti.byCode]);
  const fam = res?.ok ? familyOf(slug, res.id) : null;
  const rawName = fam && defs.data ? [...defs.data.values()].find((d) => shortMetricId(d.metric_id) === fam.rawId)?.name ?? null : null;
  const ctx = useMemo<StatCtx | null>(() => {
    if (!res?.ok || !ranking) return null;
    return {
      mode: 'real', slug, sportCode, statId: res.id, window: res.window, windows: res.windows, def, catalog: cat.catalog, ranking, adjusted: ranking.adjusted, rawName,
      role: roleOf(slug, res.id), season: cat.season, st, set, sel: st.sel, opp: next.opp, event: next.event, team: teamFor, fmt: (v) => fmtValue(v, ranking.unit),
    };
  }, [res, ranking, slug, sportCode, def, rawName, cat.catalog, cat.season, st, set, next.opp, next.event, teamFor]);

  const head: HeaderText = { eyebrow: 'League ranking', title: def?.name ?? slugTitle(statId), sub: sportCode };
  if (!cat.loading && cat.failure != null && !cat.catalog) return <Frame head={head} tab={null} onTab={() => {}} saved={false} onSave={null} onBack={back}><DataState title="Statistics unavailable" err={cat.failure} retry={cat.retry} alert>The list of statistics for this sport</DataState></Frame>;
  if (!cat.explorer && !cat.loading) return <Frame head={head} tab={null} onTab={() => {}} saved={false} onSave={null} onBack={back}><div className="st-state"><b>No statistics yet</b>This sport publishes no statistics yet.</div></Frame>;
  if (cat.loading || !res) return <Frame head={head} tab={null} onTab={() => {}} saved={false} onSave={null} onBack={back}><div role="status" aria-label="Loading statistic"><div className="v3-skel" style={{ height: 120, marginTop: 14 }} /><div className="v3-skel" style={{ height: 300, marginTop: 14 }} /></div></Frame>;
  if (!res.ok) return <Frame head={{ ...head, title: 'Statistic not available' }} tab={null} onTab={() => {}} saved={false} onSave={null} onBack={back}><div className="st-state"><b>Statistic not available</b>The publication has no ranking with this identity.<br /><a href="#/v3/explore">Search statistics</a></div></Frame>;
  if (rk.error) return <Frame head={head} tab={st.tab} onTab={(t) => set({ tab: t })} saved={false} onSave={null} onBack={back}><DataState title={failureKind(rk.failure) === 'not-published' ? 'This ranking is not in the publication' : 'Ranking unavailable'} err={rk.failure} retry={rk.retry} alert>The ranking behind this statistic</DataState></Frame>;
  if (!ctx) return <Frame head={head} tab={st.tab} onTab={(t) => set({ tab: t })} saved={false} onSave={null} onBack={back}><div role="status" aria-label="Loading statistic"><div className="v3-skel" style={{ height: 120, marginTop: 14 }} /><div className="v3-skel" style={{ height: 300, marginTop: 14 }} /></div></Frame>;
  const fell = res.fellBack && res.requested ? `No “${windowLabel(res.requested)}” window is published for this statistic; showing ${windowLabel(res.window)}.` : null;
  return <Body ctx={ctx} fell={fell} onBack={back} />;
}

// ------------------------------------------------------------------ the labelled sample

function SampleStat({ slug, statId }: { slug: string; statId: string }) {
  const back = useBack();
  const [st, set] = useRouteState(statSchema);
  const { vm } = useStatVM(slug, statId);
  const sportCode = sportBySlug(slug)?.code ?? slug.toUpperCase();
  const ranking = useMemo<RankingVM | null>(() => {
    if (!vm) return null;
    const vals = vm.entries.map((e) => e.value).filter((v): v is number => v != null).sort((a, b) => a - b);
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const median = vals.length ? (vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2) : null;
    const n = vm.entries.length;
    return {
      rankingId: vm.id, metricId: vm.id, id: vm.id, name: vm.name, unit: vm.unit, window: 'SEASON', higherIsBetter: vm.higherIsBetter, universe: vm.universe, n, season: null, asOf: '',
      entries: vm.entries.map((e) => ({ rank: e.rank, entityId: e.entityId, code: e.team.id, name: e.team.name, value: e.value, adjusted: null, percentile: percentileOf(e.rank, n), sample: null })),
      summary: { mean, median, min: vals[0] ?? null, max: vals[vals.length - 1] ?? null, stdev: null }, limitations: vm.limitations, adjusted: vm.adjusted,
    };
  }, [vm]);
  const teamFor = useCallback((code: string, name?: string): V3Team => vm?.entries.find((e) => e.team.id === code)?.team ?? toStatTeam(sportCode, slug, code, name ?? code), [vm, sportCode, slug]);
  const ctx = useMemo<StatCtx | null>(() => {
    if (!vm || !ranking) return null;
    const def = { metric_id: vm.id, name: vm.name, short_name: null, description: vm.description, methodology_version: vm.methodology, source: vm.source, known_limitations: vm.limitations, update_frequency: null } as unknown as MetricDef;
    return {
      mode: 'demo', slug, sportCode, statId, window: 'SEASON', windows: ['SEASON'], def, catalog: null, ranking, adjusted: vm.adjusted, rawName: null, role: statId === 'sample-3' || statId === 'sample-4' ? 'd' : 'o', season: null,
      st, set, sel: st.sel, opp: st.opp, event: null, team: teamFor, fmt: (v) => fmtValue(v, ranking.unit), sampleRelated: vm.related.map((r) => ({ id: r.id, name: r.name })),
    };
  }, [vm, ranking, slug, sportCode, statId, st, set, teamFor]);
  if (!ctx) return <Frame head={{ eyebrow: 'League ranking', title: 'Sample statistic', sub: sportCode }} tab={null} onTab={() => {}} saved={false} onSave={null} onBack={back}><div className="v3-skel" style={{ height: 300, marginTop: 14 }} role="status" aria-label="Loading statistic" /></Frame>;
  return <Body ctx={ctx} fell={null} onBack={back} />;
}

// ------------------------------------------------------------------ route

function GatedStat({ slug, reason }: { slug: string; reason: string }) {
  const back = useBack();
  const label = sportBySlug(slug)?.label ?? slug.toUpperCase();
  return (
    <Frame head={{ eyebrow: 'League ranking', title: 'Statistic', sub: label }} tab={null} onTab={() => {}} saved={false} onSave={null} onBack={back}>
      <LockedRow title={`${label} statistics are not shown.`}>{reason}</LockedRow>
    </Frame>
  );
}

export function Stat() {
  const { slug = '', statId = '' } = useParams();
  if (demoOn()) return <SampleStat slug={slug} statId={statId} />;
  const cap = capability(slug, 'ranking');
  if (cap.status !== 'ready') return <GatedStat slug={slug} reason={cap.reason} />;
  return <LiveStat slug={slug} statId={statId} />;
}
