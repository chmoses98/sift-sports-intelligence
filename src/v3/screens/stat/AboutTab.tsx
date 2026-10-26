// SD6: what the statistic measures, the limits the publication states (quoted, never softened; all of them one tap away) and related
// statistics. Related statistics are derived in the client for now (the registry's own list is empty: backend backlog item 1) and say so.
import { useMemo } from 'react';
import { useMetricDefs, useTeamProfile } from '../../data/research/hooks';
import { percentileOf } from '../../data/research/normalize';
import { deriveRelated } from '../../data/research/relations';
import { GameLink, NavRow, TeamLink } from '../../nav/Targets';
import { routes } from '../../nav/routes';
import { briefFor, directionWord, limitsOf, ordinal, resolveStat, updateWord, windowSentence } from '../../model/statDetail';
import { roleOf } from '../../model/statDecl';
import { RankTrack } from '../../ui/charts/RankTrack';
import { Icon } from '../../ui/Icon';
import { TeamLogo } from '../../ui/TeamLogo';
import type { StatCtx } from './ctx';

const RELATION_WORD: Record<string, string> = { raw_counterpart: 'Raw version', adjusted_counterpart: 'Opponent-adjusted version', opposing_unit: 'Opposing unit', component: 'Component' };

export function AboutTab({ ctx }: { ctx: StatCtx }) {
  const { ranking, def, st } = ctx;
  const open = st.more;
  const limits = limitsOf(def, ranking);
  const upd = updateWord(def?.update_frequency);
  const toggle = () => ctx.set({ more: !open });
  return (
    <div className="st-bd">
      <div className="st-card st-abt">
        <div className="st-exh"><span className="st-eyebrow">What it measures</span><span className="st-chip dir">{directionWord(ctx.ranking.higherIsBetter)}</span></div>
        <p>{briefFor(ranking.id, def)}</p>
        <div className="st-kv">
          <div><small>Window</small><b>{ctx.mode === 'demo' ? 'Sample' : windowSentence(ctx.window, def)}</b></div>
          <div><small>Teams</small><b>{ranking.n} teams{ranking.universe && <small>{ranking.universe}</small>}</b></div>
          {upd && <div><small>Updated</small><b>{upd}</b></div>}
          {open && def?.methodology_version && <div><small>Methodology</small><b>{def.methodology_version}</b></div>}
          {open && def?.source && <div><small>Source</small><b>{def.source}</b></div>}
        </div>
        {open && def?.description && <div className="st-full"><p>{def.description}</p></div>}
        <button type="button" className="st-more" aria-expanded={open} onClick={toggle}>{open ? 'Hide the full definition' : 'Full definition'} <Icon name={open ? 'chevD' : 'chevR'} size={13} /></button>
      </div>
      <div className="st-card st-lim">
        <div className="st-exh"><span className="st-eyebrow">Limits the publication states</span></div>
        {(open ? limits : limits.slice(0, 3)).map((l) => <div key={l} className="st-li"><Icon name="info" size={13} /><span className={open ? '' : 'clamp'}>{l}</span></div>)}
        {!limits.length && <div className="st-li"><span>The publication states no limits for this statistic.</span></div>}
        {!!limits.length && <button type="button" className="st-more" aria-expanded={open} onClick={toggle}>{open ? `Showing all ${limits.length} limits, methodology and source` : `All ${limits.length} limits in full, methodology and source`} <Icon name={open ? 'chevD' : 'chevR'} size={13} /></button>}
      </div>
      <Related ctx={ctx} />
      <Chips ctx={ctx} />
    </div>
  );
}

function Related({ ctx }: { ctx: StatCtx }) {
  const { slug, sel, opp } = ctx;
  const defs = useMetricDefs(slug);
  const prof = useTeamProfile(slug, sel);
  const rows = useMemo(() => {
    if (ctx.mode === 'demo') return (ctx.sampleRelated ?? []).map((r) => ({ id: r.id, name: r.name, tag: null as string | null, window: null as string | null, obs: null, role: ctx.role }));
    if (!defs.data || !ctx.catalog) return [];
    return deriveRelated(slug, ctx.statId, defs.data).flatMap((r) => {
      // A related statistic is listed only if its own ranking is published, so every row opens something.
      const res = resolveStat(ctx.catalog!, r.id, null, ctx.season ? [ctx.season] : []);
      if (!res.ok) return [];
      const obs = prof.profile?.metrics.get(r.id)?.windows[res.window] ?? null;
      return [{ id: r.id, name: defs.data!.get(r.metricId)?.name ?? r.id, tag: RELATION_WORD[r.relation] ?? null, window: res.window, obs, role: roleOf(slug, r.id) }];
    });
  }, [ctx.mode, ctx.sampleRelated, ctx.catalog, ctx.statId, ctx.season, ctx.role, defs.data, prof.profile, slug]);
  if (!rows.length) return null;
  return (
    <>
      <div className="st-relh"><span className="st-eyebrow">Related statistics</span>{sel && <span className="seeall">{sel} rank</span>}</div>
      <div className="st-card st-relc">
        {rows.map((r) => (
          <NavRow key={r.id} to={routes.stat({ slug, statId: r.id }, { sel, opp, win: r.window })} kind="stat" className="st-rr2" label={`${r.name}${r.obs?.rank ? `: ${sel} ${ordinal(r.obs.rank)}` : ''}. Open its ranking`}>
            <span className="nm">{r.name}{r.tag && <small>{r.tag}</small>}</span>
            {r.obs?.rank != null ? <RankTrack pct={percentileOf(r.obs.rank, r.obs.n)} role={r.role} height={20} /> : <span />}
            <b className="num">{r.obs?.rank != null ? ordinal(r.obs.rank) : sel && ctx.mode === 'real' ? '—' : ''}</b>
            <Icon name="chevR" size={14} />
          </NavRow>
        ))}
      </div>
      {ctx.mode === 'real' && <p className="st-note st-note--pad">Related statistics are derived here from the registry’s category and names, because its own related list is empty (backend backlog item 1).</p>}
    </>
  );
}

function Chips({ ctx }: { ctx: StatCtx }) {
  const { slug, sel, event } = ctx;
  if (!sel && !event) return null;
  const t = sel ? ctx.team(sel) : null;
  return (
    <div className="st-rel2">
      {t && <TeamLink team={{ slug, id: sel! }} label={`Team Research, ${t.name}`}><TeamLogo team={t} size={14} />Team Research · {t.name}</TeamLink>}
      {event && event.homeCode && event.awayCode && <GameLink game={{ slug, eventId: event.eventId }} state={{ tab: 'matchup' }} label={`Game matchup, ${event.awayCode} at ${event.homeCode}`}>Game matchup · {event.awayCode} at {event.homeCode}</GameLink>}
    </div>
  );
}
