// TR2: how the team compares and whether that is changing. Raw or opponent-adjusted (two different lists, never mixed), a window
// (season, last 6, last 34 where published), and per statistic the value, the league rank and a ghost marker for the long baseline.
// Every row opens that statistic's ranking with the team highlighted.
import { useMemo } from 'react';
import { Icon } from '../../ui/Icon';
import { LeagueTrack, type TrackMark } from '../../ui/charts/LeagueTrack';
import { LockedRow } from '../../ui/atoms';
import { fmtValue, ordinal, profileOf, rankText, seasonGames, type ProfileRowVM } from '../../model/teamResearch';
import { SegC, Skel, StatT, type ReadyCtx, type TeamPageCtx } from './parts';

function Row({ c, r, role, baseline }: { c: ReadyCtx; r: ProfileRowVM; role: 'o' | 'd' | 'n'; baseline: string | null }) {
  const o = r.obs;
  const marks: TrackMark[] = [];
  if (r.base?.pct != null) marks.push({ key: 'g', cls: 'g', pct: r.base.pct });
  marks.push({ key: 'm', cls: role, pct: o.pct ?? 0 });
  const d = r.delta;
  const dv = d == null ? null : d > 0 ? <i className="up">▲ {d}</i> : d < 0 ? <i className="dn">▼ {-d}</i> : <i className="fl">–</i>;
  const name = o.name.replace(/ allowed$/, '');
  return (
    <StatT c={c} obs={o} label={`${o.name}: ${fmtValue(o.value, o.unit)}, ${rankText(o)}${d != null && baseline ? `, ${d > 0 ? 'up' : d < 0 ? 'down' : 'level'} ${Math.abs(d)} on ${baseline}` : ''}. Open league ranking`} className="prr">
      <div className="pn"><b>{name}</b><span className="num">{fmtValue(o.value, o.unit)}</span></div>
      {o.pct != null ? <LeagueTrack marks={marks} height={26} /> : <span className="tm-ptr tm-ptr--none" />}
      <div className="pk"><b className="num">{o.rank == null ? '—' : ordinal(o.rank)}</b><small>{dv ? <>{dv} vs {baseline}</> : o.rank == null ? 'not ranked' : o.n ? `of ${o.n}` : ' '}</small></div>
    </StatT>
  );
}

export function Profile({ c }: { c: TeamPageCtx }) {
  const ready = c.profile && !c.defsLoading ? (c as ReadyCtx) : null;
  const v = useMemo(
    () => (c.profile && !c.defsLoading ? profileOf(c.slug, c.profile, { adj: c.state.adj, win: c.state.win, all: c.state.all }, c.look) : null),
    [c.slug, c.profile, c.defsLoading, c.look, c.state.adj, c.state.win, c.state.all],
  );
  if (!ready) return <div className="tm-body"><Skel h={44} label="Loading statistics" /><Skel h={44} /><Skel h={520} /></div>;
  if (!v) return <div className="tm-body"><LockedRow title="Statistics">The publication has no statistics for this team to list.</LockedRow></div>;
  const games = seasonGames(ready.profile);
  const adjWord = ready.decl.profile?.adjustedWindowWord ?? 'Opponent-adjusted rating';
  const seasonLabel = games != null ? `Season · ${games} g` : 'Season';
  return (
    <div className="tm-prof">
      <div className="ctlrow"><SegC wide options={[[false, 'Raw'], [true, 'Opponent-adjusted']] as const} value={c.state.adj} onChange={(adj) => c.set({ adj })} label="Statistic basis" /></div>
      <div className="ctlrow">
        {v.adjusted
          ? <div className="tm-seg tm-seg--wide" role="group" aria-label="Window"><button type="button" aria-pressed="true" disabled>{adjWord}</button></div>
          : <SegC wide options={v.windows.map((w) => [w.key, w.key === 'SEASON' ? seasonLabel : w.label] as const)} value={v.window} onChange={(win) => c.set({ win })} label="Window" />}
      </div>
      <div className="ctlrow k">
        <span><i className="kd o" />Offense</span><span><i className="kd d" />Defense</span>
        {v.baselineLabel && <span><i className="kd g" />{v.baselineLabel.replace(/^./, (x) => x.toUpperCase())} games</span>}
      </div>
      <div className="profl">
        {v.groups.map((g) => (
          <section key={g.key} aria-label={g.label}>
            <div className="grh">{g.role ? <span className={`rl ${g.role === 'off' ? 'o' : 'd'}`}>{g.role === 'off' ? 'OFF' : 'DEF'}</span> : <span className="rl n">{g.label.slice(0, 3).toUpperCase()}</span>}<b>{g.label}</b><small>{v.adjusted ? 'opponent-adjusted' : `raw, ${v.window === 'SEASON' ? 'season' : (v.windows.find((w) => w.key === v.window)?.label ?? v.window).toLowerCase()}`}</small></div>
            {g.rows.map((r) => <Row key={r.obs.id} c={ready} r={r} role={g.role === 'off' ? 'o' : g.role === 'def' ? 'd' : 'n'} baseline={v.baselineLabel} />)}
          </section>
        ))}
      </div>
      {v.hasMore && (
        <button type="button" className="showall" aria-expanded={c.state.all} onClick={() => c.set({ all: !c.state.all })}>
          {c.state.all ? 'Show fewer statistics' : `Show all ${v.counts.off} offense and ${v.counts.def} defense stats`} <Icon name={c.state.all ? 'chevU' : 'chevR'} size={14} />
        </button>
      )}
      <p className="tm-note tm-note--pad">
        Raw values describe what happened, not how good the team is. Opponent-adjusted values are a different statistic and never sit in the same list.
        {ready.profile.metrics.size ? ` Ranks are among the ${v.groups[0]?.rows[0]?.obs.n ?? 'published'} teams in the current packet.` : ''}
      </p>
    </div>
  );
}
