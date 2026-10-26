// SD3: raw and opponent-adjusted, kept apart. Two cards, each its own statistic with its own window, rank and top three; the raw card
// shows how the selected team's rank moves across the raw windows. Nothing here is combined or subtracted: a note says why.
import { useMemo } from 'react';
import { useMetricDefs, useRankingDoc, useTeamProfile } from '../../data/research/hooks';
import { StatLink, TeamLink } from '../../nav/Targets';
import { fmtValue, ordinal, orderWindows, rankedTeams, resolveStat, windowLabel, windowSentence } from '../../model/statDetail';
import { roleOf, valueNote } from '../../model/statDecl';
import { RankTrack } from '../../ui/charts/RankTrack';
import { Icon } from '../../ui/Icon';
import { TeamLogo } from '../../ui/TeamLogo';
import { percentileOf } from '../../data/research/normalize';
import type { StatCtx } from './ctx';
import { familyOf } from './family';

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

function VersionCard({ ctx, id, kind }: { ctx: StatCtx; id: string; kind: 'raw' | 'adj' }) {
  const { slug } = ctx;
  const prefer = ctx.season ? [ctx.season] : [];
  const res = useMemo(() => (ctx.catalog ? resolveStat(ctx.catalog, id, id === ctx.statId ? ctx.window : null, prefer) : null), [ctx.catalog, id, ctx.statId, ctx.window, ctx.season]); // eslint-disable-line react-hooks/exhaustive-deps
  const rk = useRankingDoc(slug, res?.ok ? res.rankingId : null);
  const defs = useMetricDefs(slug);
  const prof = useTeamProfile(slug, ctx.sel);
  const def = res?.ok ? defs.data?.get(res.metricId) : undefined;
  const r = rk.ranking;
  const teams = useMemo(() => (r ? rankedTeams(r) : []), [r]);
  const role = roleOf(slug, id);
  const fmt = (v: number | null) => fmtValue(v, r?.unit ?? null);
  const selT = ctx.sel ? teams.find((t) => t.code === ctx.sel) : undefined;
  const tag = kind === 'raw' ? 'RAW' : 'ADJUSTED';
  const stat = { slug, statId: id };
  const keep = { sel: ctx.sel, opp: ctx.opp };
  if (!res || !res.ok) return <div className="st-card st-rvc"><div className="st-th2"><span className="st-tg">{tag}</span><b>{id.replace(/_/g, ' ')}</b></div><p className="st-note">This version has no published ranking.</p></div>;
  if (!r) return <div className="st-card st-rvc" role="status" aria-label={`Loading ${tag.toLowerCase()} ranking`}><div className="st-th2"><span className="st-tg">{tag}</span><b>{def?.name ?? id.replace(/_/g, ' ')}</b></div><div className="v3-skel" style={{ height: 120, marginTop: 10 }} /></div>;
  const rawDoesNot = kind === 'raw' && /what happened, not how good/i.test(def?.description ?? '');
  const sub = kind === 'raw' ? `${windowLabel(res.window)} window${rawDoesNot ? ' · what happened, not how good' : ''}` : `${windowSentence(res.window, def)} · opponent-adjusted`;
  // The raw statistic's rank in each raw window, from the selected team's own profile.
  const path = kind === 'raw' && ctx.sel && prof.profile ? orderWindows(Object.keys(prof.profile.metrics.get(id)?.windows ?? {})).map((w) => ({ w, o: prof.profile!.metrics.get(id)!.windows[w] })).filter((x) => x.o.rank != null) : [];
  return (
    <div className={`st-card st-rvc ${kind}`}>
      <div className="st-th2"><span className="st-tg">{tag}</span><b>{r.name}</b></div>
      <div className="st-wnd">{sub}</div>
      {selT && (
        <>
          <div className="st-rvw">
            <div className="o"><b className="num">{ordinal(selT.rank)}</b><small>of {r.n}</small></div>
            <div className={`v ${role}`}><b className="num">{fmt(selT.value)}</b><small>{valueNote(slug, r.id, r.unit, r.name)}</small></div>
          </div>
          <RankTrack pct={percentileOf(selT.rank, r.n)} role={role} letter={role === 'd' ? 'D' : 'O'} height={26} />
        </>
      )}
      <div className="st-tops" aria-label={`Top three, ${tag.toLowerCase()}`}>
        {teams.slice(0, 3).map((t) => (
          <span key={t.code}>{t.rank}<TeamLink team={{ slug, id: t.code }} label={`${t.name}, team page`}><TeamLogo team={ctx.team(t.code, t.name)} size={20} /></TeamLink><b className="num">{fmt(t.value)}</b></span>
        ))}
      </div>
      {path.length > 1 && (
        <div className="st-wpath">
          {path.map(({ w, o }) => (
            <StatLink key={w} stat={stat} state={{ ...keep, win: w }} label={`${windowLabel(w)}: ${ordinal(o.rank!)}, open that window's ranking`}>
              <small>{windowLabel(w)}{w === 'SEASON' && o.sample ? ` · ${o.sample} g` : ''}</small><b className="num">{ordinal(o.rank!)}</b><span>{fmtValue(o.value, r.unit)}</span>
            </StatLink>
          ))}
        </div>
      )}
      <StatLink stat={stat} state={{ ...keep, win: res.window }} className="st-opn" label={`Open the ${tag.toLowerCase()} ranking`}>Open this ranking <Icon name="chevR" size={14} /></StatLink>
    </div>
  );
}

export function SideBySide({ ctx }: { ctx: StatCtx }) {
  const fam = familyOf(ctx.slug, ctx.statId);
  const defs = useMetricDefs(ctx.slug);
  const prof = useTeamProfile(ctx.slug, ctx.sel);
  if (!fam) return null;
  const desc = (id: string) => {
    const w = ctx.catalog ? resolveStat(ctx.catalog, id, id === ctx.statId ? ctx.window : null, ctx.season ? [ctx.season] : []) : null;
    if (!w || !w.ok) return null;
    const def = defs.data?.get(w.metricId);
    const sample = prof.profile?.metrics.get(id)?.windows[w.window]?.sample;
    return w.window === 'SEASON' && sample ? `${WORDS[sample] ?? sample} games` : `a ${lowerFirst(windowSentence(w.window, def))}`;
  };
  const a = desc(fam.adjId), b = desc(fam.rawId);
  return (
    <>
      <VersionCard ctx={ctx} id={fam.rawId} kind="raw" />
      <VersionCard ctx={ctx} id={fam.adjId} kind="adj" />
      {a && b && <p className="st-note st-note--pad">Windows differ by design ({b} against {a}), so the two ranks are never subtracted into a “schedule effect”.</p>}
    </>
  );
}
