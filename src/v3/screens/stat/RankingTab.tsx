// SD1, SD7: the league ranking. Selected-team card, the dot plot of every team, the ranked list. The selected team is outlined in cyan
// and the next opponent dashed; tapping a bar, value, rank or dot moves the highlight in place (replace history), a team's logo or name
// opens Team Research, the selected card opens Team Research, the raw/adjusted switch opens the counterpart statistic's own ranking.
import { useMemo } from 'react';
import { NavRow, StatLink, TeamLink } from '../../nav/Targets';
import { routes } from '../../nav/routes';
import { barShare, fmtValue, ordinal, rankedTeams, sampleSpan, seasonPair, spreadOf, visibleRows, windowLabel, type RankedTeam } from '../../model/statDetail';
import { useTeamProfile } from '../../data/research/hooks';
import type { WindowObs } from '../../data/research/types';
import { unitWord, valueNote } from '../../model/statDecl';
import { DotPlot } from '../../ui/charts/DotPlot';
import { Icon } from '../../ui/Icon';
import { TeamLogo } from '../../ui/TeamLogo';
import type { StatCtx } from './ctx';
import { familyOf } from './family';
import { SideBySide } from './SideBySide';

export function FamilySwitch({ ctx }: { ctx: StatCtx }) {
  const { slug, statId, st } = ctx;
  const fam = ctx.mode === 'real' ? familyOf(slug, statId) : null;
  if (!fam) {
    return ctx.mode === 'real' && ctx.adjusted
      ? <div className="st-fam"><span className="st-fam2"><Icon name="info" size={13} /> Opponent-adjusted · no raw counterpart ranking is linked in the registry</span></div>
      : null;
  }
  const keep = { sel: ctx.sel, opp: ctx.opp };
  // The version being shown is a button (in place); the other version is the counterpart statistic's own ranking, a real navigation.
  const seg = (id: string, label: string) => id === statId
    ? <button type="button" aria-pressed={!st.sbs} onClick={() => ctx.set({ sbs: false })}>{label}</button>
    : <StatLink stat={{ slug, statId: id }} state={keep} label={`${label}: open its own ranking`}>{label}</StatLink>;
  // SD1 shows the two statistics as a two-way switch; SD3 (side by side) adds the third segment. From SD1 the side-by-side view is the
  // link on the note line, so the locked two-way switch is not changed.
  return (
    <div className="st-fam">
      <div className="st-segc st-segc--wide" role="group" aria-label="Statistic version">
        {seg(fam.adjId, 'Opponent-adjusted')}
        {seg(fam.rawId, 'Raw')}
        {st.sbs && <button type="button" aria-pressed onClick={() => ctx.set({ sbs: true })}>Side by side</button>}
      </div>
      <span className="st-fam2"><Icon name={st.sbs ? 'lock' : 'info'} size={13} /> {st.sbs ? 'Separate rankings, never mixed in one list' : 'Two different statistics, ranked separately'}
        {!st.sbs && <button type="button" className="st-sbs" onClick={() => ctx.set({ sbs: true })}>Side by side <Icon name="chevR" size={12} /></button>}
      </span>
    </div>
  );
}

function WindowChips({ ctx, obs }: { ctx: StatCtx; obs: Record<string, WindowObs> | undefined }) {
  if (ctx.windows.length < 2) return null;
  const span = sampleSpan(ctx.ranking);
  return (
    <div className="st-chips" role="group" aria-label="Window">
      {ctx.windows.map((w) => {
        const on = w === ctx.window;
        // A season label carries the games it covers: from the ranking when it is the one open, else from the selected team's own observation.
        const seasonal = w === 'SEASON' || /^\d{4}(-\d{2})?$/.test(w);
        const games = on ? span : obs?.[w]?.sample != null ? `${obs[w].sample} g` : null;
        const suffix = seasonal && games ? ` · ${games}` : '';
        return <button key={w} type="button" className="st-chip" aria-pressed={on} onClick={() => ctx.set({ win: w })}>{windowLabel(w)}{suffix}</button>;
      })}
    </div>
  );
}

function SelectedCard({ ctx, t }: { ctx: StatCtx; t: RankedTeam }) {
  const { ranking, slug, def } = ctx;
  const note = valueNote(slug, ranking.id, ranking.unit, ranking.name);
  return (
    <NavRow to={routes.team({ slug, id: t.code })} kind="team" className="st-selc" label={`${t.name}, ${ordinal(t.rank)} of ${ranking.n} teams. Open team`}>
      <TeamLogo team={ctx.team(t.code, t.name)} size={44} />
      <div className="b2"><small>{t.code} {unitWord(slug, ranking.id, def?.short_name ?? null)}</small><b className="num">{ordinal(t.rank)}</b><small>of {ranking.n} teams</small></div>
      <div className={`sv ${ctx.role}`}><b className="num">{ctx.fmt(t.value)}</b><small>{note}</small></div>
      <div className="m2"><small>Ahead of</small><b className="num">{ranking.n - t.rank}</b><small>teams</small></div>
    </NavRow>
  );
}

function RankRow({ ctx, t, sel, opp, share }: { ctx: StatCtx; t: RankedTeam; sel: boolean; opp: boolean; share: number }) {
  const { slug } = ctx;
  const pick = () => { if (!sel) ctx.set({ sel: t.code }); };
  const id = { slug, id: t.code };
  return (
    <NavRow to={routes.team(id)} kind="team" className={`st-rkr${sel ? ' is-sel' : ''}${opp ? ' is-opp' : ''}`} label={`${t.name}, rank ${t.rank}. Open team`}>
      <button type="button" className="rn num st-hit" aria-label={`${t.name}, rank ${t.rank}: highlight`} aria-pressed={sel} onClick={pick}>{t.rank}</button>
      <TeamLink team={id} label={`${t.name} logo, team page`}><TeamLogo team={ctx.team(t.code, t.name)} size={26} /></TeamLink>
      <TeamLink team={id} label={`${t.name}, team page`} className="nm"><span>{ctx.team(t.code, t.name).nick}</span>{sel ? <i>Selected</i> : opp ? <i className="o">Next opponent</i> : null}</TeamLink>
      <button type="button" className="bw st-hit" aria-label={`${t.name} bar: highlight`} onClick={pick}><i className={ctx.role} style={{ width: `${(share * 100).toFixed(1)}%` }} /></button>
      <button type="button" className="vl num st-hit" aria-label={`${t.name} ${ctx.fmt(t.value)}: highlight`} onClick={pick}>{ctx.fmt(t.value)}</button>
    </NavRow>
  );
}

function SeasonOverSeason({ ctx, obs }: { ctx: StatCtx; obs: Record<string, WindowObs> | undefined }) {
  const pair = seasonPair(obs, ctx.window);
  if (!pair || !ctx.sel) return null;
  const { from, to } = pair;
  const n = ctx.ranking.n;
  const y = (o: WindowObs) => 4 + (26 * ((o.rank ?? 1) - 1)) / Math.max(1, (o.n ?? n) - 1);
  const unit = ctx.ranking.unit;
  const end = (side: typeof from, cls: string) => (
    <StatLink stat={{ slug: ctx.slug, statId: ctx.statId }} state={{ sel: ctx.sel, opp: ctx.opp, win: side.window }} label={`${windowLabel(side.window)}: ${ordinal(side.obs.rank!)}, open that window's ranking`} className={cls}>
      <small>{windowLabel(side.window)}</small><b className="num">{ordinal(side.obs.rank!)}</b><span>{fmtValue(side.obs.value ?? side.obs.adjusted, unit)}</span>
    </StatLink>
  );
  const small = from.obs.sample != null && to.obs.sample != null && to.obs.sample < from.obs.sample / 2;
  return (
    <div className="st-card st-hst">
      <div className="st-exh"><span className="st-eyebrow">Season over season</span></div>
      <div className="st-slp">
        {end(from, 'l')}
        <svg width="120" height="34" viewBox="0 0 120 34" aria-hidden="true"><line x1="6" y1={y(from.obs)} x2="114" y2={y(to.obs)} stroke="var(--sift-cyan)" strokeWidth="2" /><circle cx="6" cy={y(from.obs)} r="4" fill="#0a0d11" stroke="#a4acb6" strokeWidth="1.6" /><circle cx="114" cy={y(to.obs)} r="4.5" fill="var(--sift-cyan)" /></svg>
        {end(to, 'r')}
      </div>
      {small && <p className="st-note">A season-long rank against a {to.obs.sample}-game rank: the sample is small, so the gap is shown, not explained.</p>}
    </div>
  );
}

export function RankingTab({ ctx }: { ctx: StatCtx }) {
  const { ranking, st } = ctx;
  const prof = useTeamProfile(ctx.slug, ctx.sel);
  const obs = prof.profile?.metrics.get(ranking.id)?.windows;
  const teams = useMemo(() => rankedTeams(ranking), [ranking]);
  const spread = useMemo(() => spreadOf(teams), [teams]);
  const selT = ctx.sel ? teams.find((t) => t.code === ctx.sel) ?? null : null;
  const oppT = ctx.opp ? teams.find((t) => t.code === ctx.opp) ?? null : null;
  const rows = useMemo(() => visibleRows(teams, { sel: selT?.code ?? null, opp: oppT?.code ?? null, all: st.all }), [teams, selT, oppT, st.all]);
  const dots = useMemo(() => teams.map((t) => ({ code: t.code, v: t.value })), [teams]);

  return (
    <>
      <FamilySwitch ctx={ctx} />
      {st.sbs && ctx.mode === 'real' ? <SideBySide ctx={ctx} /> : (
        <>
          <WindowChips ctx={ctx} obs={obs} />
          {selT ? <SelectedCard ctx={ctx} t={selT} />
            : ctx.sel ? <div className="st-standin" role="note">{ctx.sel} is not in this ranking’s universe ({ranking.universe || `${ranking.n} teams`}), so it has no rank here.</div>
            : <div className="st-standin" role="note">Tap a team’s bar or value to select it.</div>}
          {selT && <SeasonOverSeason ctx={ctx} obs={obs} />}
          {teams.length >= 3 && (
            <div className="st-card st-swc">
              <DotPlot
                teams={dots} higherIsBetter={ranking.higherIsBetter} median={ranking.summary.median} sel={selT?.code ?? null} opp={oppT?.code ?? null} fmt={ctx.fmt}
                onSelect={(code) => { if (code !== ctx.sel) ctx.set({ sel: code }); }}
                label={`Every team's ${ranking.name} on one axis, best on the right.${selT ? ` ${selT.code} is ${ordinal(selT.rank)}.` : ''}`}
              />
              <div className="st-swk">
                {selT && <span><i className="st-kd st-kd--sel" />{selT.code}</span>}
                {oppT && <span><i className="st-kd st-kd--opp" />{oppT.code} · next opponent, {ordinal(oppT.rank)}</span>}
                {selT && oppT && <button type="button" className="st-cmpl" onClick={() => ctx.set({ tab: 'compare', cmpm: 'teams', a: selT.code, b: oppT.code })}>Compare <Icon name="chevR" size={12} /></button>}
              </div>
            </div>
          )}
          <div className="st-card st-rkc">
            <ol className="st-rk">
              {rows.map((r, i) => r.type === 'gap'
                ? <li key={`g${i}`} className="st-rkg">{r.count} more {r.count === 1 ? 'team' : 'teams'}</li>
                : <li key={r.team.code}><RankRow ctx={ctx} t={r.team} sel={r.team.code === selT?.code} opp={r.team.code === oppT?.code} share={barShare(r.team.value, spread?.lo ?? 0, spread?.hi ?? 0, ranking.higherIsBetter)} /></li>)}
            </ol>
            <button type="button" className="st-more st-more--c" aria-expanded={st.all} onClick={() => ctx.set({ all: !st.all })}>{st.all ? 'Show fewer' : `Show all ${ranking.n} teams`} <Icon name={st.all ? 'chevU' : 'chevR'} size={14} /></button>
          </div>
        </>
      )}
    </>
  );
}
