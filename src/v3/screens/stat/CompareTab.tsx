// SD4 and SD5: compare two teams (unit by unit, one league track per row) or two players (their recent game-log values). Team ranks come
// from the two team profiles; player comparisons use the game log and show the missing league rank as a locked row, never a substitute.
import { useEffect, useMemo } from 'react';
import { percentileOf } from '../../data/research/normalize';
import { useTeamProfile } from '../../data/research/hooks';
import { usePlayerVM } from '../../data/usePlayer';
import { NavRow, PlayerLink, TeamLink } from '../../nav/Targets';
import { routes } from '../../nav/routes';
import { capability } from '../../model/capabilities';
import { statDecl } from '../../model/statDecl';
import { compareBlocks, defaultThreshold, entryValue, f1, fmtValue, ordinal, playerSummary } from '../../model/statDetail';
import { GapTrack } from '../../ui/charts/RankTrack';
import { PlayerBars } from '../../ui/charts/PlayerBars';
import { Icon } from '../../ui/Icon';
import { useSheet } from '../../ui/Sheet';
import { TeamLogo } from '../../ui/TeamLogo';
import { LockedRow } from '../../ui/atoms';
import type { StatCtx } from './ctx';
import { PlayerPickerBody, TeamPickerBody } from './pickers';

const isAdj = (id: string) => /^(adj_|oa_)/.test(id);
const EMPTY = '-';

export function CompareTab({ ctx, setSub }: { ctx: StatCtx; setSub: (s: string | null) => void }) {
  const cap = capability(ctx.slug, 'statCompare');
  if (ctx.mode === 'demo') return <div className="st-state"><b>Sample data has no comparison</b>Switch to real data to compare two teams or two players.</div>;
  if (cap.status !== 'ready') return <LockedRow title="Compare is not shown.">{cap.reason}</LockedRow>;
  return ctx.st.cmpm === 'players' ? <ComparePlayers ctx={ctx} setSub={setSub} /> : <CompareTeams ctx={ctx} />;
}

function Mode({ ctx }: { ctx: StatCtx }) {
  const on = ctx.st.cmpm;
  return (
    <div className="st-segc" role="group" aria-label="Compare">
      <button type="button" aria-pressed={on === 'teams'} onClick={() => ctx.set({ cmpm: 'teams' })}>Teams</button>
      <button type="button" aria-pressed={on === 'players'} onClick={() => ctx.set({ cmpm: 'players' })}>Players</button>
    </div>
  );
}

// ------------------------------------------------------------------ teams

function CompareTeams({ ctx }: { ctx: StatCtx }) {
  const { slug, st } = ctx;
  const sheet = useSheet();
  const a = st.a === EMPTY ? null : st.a ?? ctx.sel;
  const b = st.b === EMPTY ? null : st.b ?? ctx.opp;
  const pa = useTeamProfile(slug, a), pb = useTeamProfile(slug, b);
  const decl = statDecl(slug);
  const blocks = useMemo(() => (pa.profile && pb.profile ? compareBlocks(slug, pa.profile, pb.profile) : []), [slug, pa.profile, pb.profile]);
  const pick = (which: 'a' | 'b') => sheet.open('Choose a team', <TeamPickerBody slug={slug} team={ctx.team} picked={[a, b]} onPick={(code) => ctx.set({ [which]: code })} />, { tall: true });
  const chip = (which: 'a' | 'b', code: string | null) => code ? (
    <span className="st-wc">
      <TeamLink team={{ slug, id: code }} label={`${ctx.team(code).name}, team page`}><TeamLogo team={ctx.team(code)} size={30} /><b>{code}</b></TeamLink>
      <button type="button" className="x" aria-label={`Remove ${code}`} onClick={() => ctx.set({ [which]: EMPTY })}><Icon name="close" size={12} /></button>
    </span>
  ) : <button type="button" className="st-wc st-wc--add" onClick={() => pick(which)}><Icon name="plus" size={14} /> Add team</button>;
  const n = blocks[0]?.lines[0]?.a.n ?? null;

  let body;
  if (!decl) body = <LockedRow title="No comparison set yet.">This sport has no declared set of statistics to compare two teams on.</LockedRow>;
  else if (!a || !b) body = <div className="st-state"><b>Choose two teams</b>Compare shows how two teams rank, unit by unit.</div>;
  else if (pa.loading || pb.loading) body = <div className="v3-skel" style={{ height: 320, marginTop: 10 }} role="status" aria-label="Loading comparison" />;
  else if (!pa.profile || !pb.profile) body = <div className="st-state"><b>No profile</b>The publication has no team profile for {!pa.profile ? a : b}.</div>;
  else if (!blocks.length) body = <div className="st-state"><b>Nothing to compare</b>The publication has no ranked statistic that both {a} and {b} share in the same window.</div>;
  else body = (
    <>
      <div className="st-card st-cmpc">
        {blocks.map((g, gi) => (
          <div key={g.title}>
            <div className={`st-grh${gi ? ' again' : ''}`}><span className={`st-rl ${g.role}`}>{g.role === 'o' ? 'OFF' : 'DEF'}</span><b>{g.title}</b><small>1st is best · {a}, {b}</small></div>
            {g.lines.map((l) => {
              const av = entryValue(l.a, isAdj(l.id)), bv = entryValue(l.b, isAdj(l.id));
              return (
                <NavRow key={l.id} to={routes.stat({ slug, statId: l.id }, { win: l.window, sel: a, opp: b })} kind="stat" className="st-cr" label={`${l.label}: ${a} ${ordinal(l.a.rank!)}, ${b} ${ordinal(l.b.rank!)}. Open its ranking`}>
                  <div className="cl"><b>{l.label}</b><span>{fmtValue(av, l.unit)} · {fmtValue(bv, l.unit)}</span></div>
                  <div className="ctr">
                    <GapTrack
                      role={l.role}
                      a={{ pct: percentileOf(l.a.rank, l.a.n) ?? 0, better: l.aBetter, node: <TeamLink team={{ slug, id: a }} label={`${a}, team page`}><TeamLogo team={ctx.team(a)} size={16} /></TeamLink> }}
                      b={{ pct: percentileOf(l.b.rank, l.b.n) ?? 0, better: l.aBetter == null ? null : !l.aBetter, node: <TeamLink team={{ slug, id: b }} label={`${b}, team page`}><TeamLogo team={ctx.team(b)} size={16} /></TeamLink> }}
                    />
                  </div>
                  <div className="cnk"><b className={l.aBetter ? 'w' : ''}>{l.a.rank}</b><b className={l.aBetter === false ? 'w' : ''}>{l.b.rank}</b></div>
                </NavRow>
              );
            })}
          </div>
        ))}
      </div>
      <p className="st-note st-note--pad">Each marker is a team’s rank among {n}; the bolder marker is the better rank. Tap a row for that statistic’s full ranking, a logo for the team.</p>
    </>
  );
  return (
    <>
      <div className="st-who">{chip('a', a)}<span className="st-vs">vs</span>{chip('b', b)}<Mode ctx={ctx} /></div>
      {body}
    </>
  );
}

// ------------------------------------------------------------------ players

function ComparePlayers({ ctx, setSub }: { ctx: StatCtx; setSub: (s: string | null) => void }) {
  const { slug, st } = ctx;
  const a = st.a && st.a !== EMPTY ? st.a : null, b = st.b && st.b !== EMPTY ? st.b : null;
  const sheet = useSheet();
  const pick = (which: 'a' | 'b') => sheet.open('Choose a player', <PlayerPickerBody slug={slug} teams={[ctx.sel, ctx.opp]} team={ctx.team} picked={[a, b]} onPick={(id) => ctx.set({ [which]: id, cs: null, thr: null })} />, { tall: true });
  const chip = (which: 'a' | 'b', id: string | null) => id
    ? <PlayerChip key={which} ctx={ctx} id={id} onRemove={() => ctx.set({ [which]: EMPTY })} />
    : <button type="button" className="st-wc st-wc--add" onClick={() => pick(which)}><Icon name="plus" size={14} /> Add player</button>;
  return (
    <>
      <div className="st-who">{chip('a', a)}<span className="st-vs">vs</span>{chip('b', b)}<Mode ctx={ctx} /></div>
      {a && b ? <PlayerPair ctx={ctx} a={a} b={b} setSub={setSub} /> : <div className="st-state"><b>Choose two players</b>Players are listed from the teams in view{ctx.sel ? ` (${[ctx.sel, ctx.opp].filter(Boolean).join(', ')})` : ''}. Their recent game-log values are compared side by side.</div>}
      <WhyNoRank ctx={ctx} />
    </>
  );
}

function PlayerChip({ ctx, id, onRemove }: { ctx: StatCtx; id: string; onRemove: () => void }) {
  const { vm } = usePlayerVM(ctx.slug, id);
  const name = vm?.name.split(' ').slice(-1)[0] ?? '…';
  return (
    <span className="st-wc">
      <PlayerLink player={{ slug: ctx.slug, id }} label={`${vm?.name ?? 'Player'}, player page`}><b>{name}</b></PlayerLink>
      <button type="button" className="x" aria-label={`Remove ${vm?.name ?? 'player'}`} onClick={onRemove}><Icon name="close" size={12} /></button>
    </span>
  );
}

function WhyNoRank({ ctx }: { ctx: StatCtx }) {
  return (
    <>
      <div className="st-olc"><Icon name="info" size={14} /><span>League rank among players is not published</span><button type="button" className="st-why-btn" aria-expanded={ctx.st.more} onClick={() => ctx.set({ more: !ctx.st.more })}>Why <Icon name="chevR" size={12} /></button></div>
      {ctx.st.more && <p className="st-why" role="note">The publications rank teams only. Player-level league rankings and percentiles are not published for any sport, so a rank, a percentile or a comparison to the league is never shown for a player; values here are the players’ own recent game-log values.</p>}
    </>
  );
}

function PlayerPair({ ctx, a, b, setSub }: { ctx: StatCtx; a: string; b: string; setSub: (s: string | null) => void }) {
  const { slug, st } = ctx;
  const A = usePlayerVM(slug, a), B = usePlayerVM(slug, b);
  const common = useMemo(() => (A.vm && B.vm ? A.vm.stats.filter((s) => B.vm!.stats.some((x) => x.key === s.key)) : []), [A.vm, B.vm]);
  const stat = common.find((s) => s.key === st.cs) ?? common[0];
  const last = (vm: typeof A.vm) => (vm ? [...vm.obs].sort((x, y) => x.date.localeCompare(y.date)).slice(-10) : []);
  const va = useMemo(() => (stat ? last(A.vm).map((o) => o.v[stat.key]).filter((v): v is number => v != null) : []), [A.vm, stat]); // eslint-disable-line react-hooks/exhaustive-deps
  const vb = useMemo(() => (stat ? last(B.vm).map((o) => o.v[stat.key]).filter((v): v is number => v != null) : []), [B.vm, stat]); // eslint-disable-line react-hooks/exhaustive-deps
  const thr = st.thr ?? defaultThreshold(va, vb);
  useEffect(() => { setSub(stat ? `${stat.label} · last 10 games` : null); return () => setSub(null); }, [stat, setSub]);

  if (A.loading || B.loading) return <div className="v3-skel" style={{ height: 300, marginTop: 10 }} role="status" aria-label="Loading game logs" />;
  if (!A.vm || !B.vm) return <div className="st-state"><b>Player not found</b>The publication has no profile for {!A.vm ? 'the first' : 'the second'} player.</div>;
  const empty = [A.vm, B.vm].find((v) => !v.obs.length);
  if (empty) return <div className="st-state"><b>No game log for {empty.name}</b>{empty.why ?? 'The publication carries no game log for this player.'}</div>;
  if (!stat) return <div className="st-state"><b>No statistic in common</b>{A.vm.name} and {B.vm.name} have no game-log statistic in common, so there is nothing to compare side by side.</div>;
  const sa = playerSummary(va, thr), sb = playerSummary(vb, thr);
  const max = Math.max(...va, ...vb, thr);
  const col = (vm: NonNullable<typeof A.vm>, vals: number[], id: string) => (
    <div className="st-pcc">
      <PlayerLink player={{ slug, id }} label={`${vm.name}, player page`}>
        <span className="st-sdph">
          <span className="st-av">{vm.photo ? <img src={vm.photo.src} alt="" /> : vm.team ? <TeamLogo team={vm.team} size={24} /> : null}</span>
          <span><b>{vm.name.split(' ').slice(-1)[0]}</b><small>{[vm.position, vm.team?.abbr].filter(Boolean).join(' · ')}</small></span>
        </span>
      </PlayerLink>
      <PlayerBars values={vals} thr={thr} max={max} label={`${vm.name}, last ${vals.length} games of ${stat.label}`} />
    </div>
  );
  const row = (label: string, x: string, y: string) => <div className="st-cmr"><span className="v">{x}</span><b>{label}</b><span className="v">{y}</span></div>;
  const n = Math.max(sa.n, sb.n);
  return (
    <>
      <div className="st-chips" role="group" aria-label="Statistic">
        {common.map((s) => <button key={s.key} type="button" className="st-chip" aria-pressed={s.key === stat.key} onClick={() => ctx.set({ cs: s.key, thr: null })}>{s.label}</button>)}
      </div>
      <div className="st-card st-pl">
        <div className="st-pcg">{col(A.vm, va, a)}{col(B.vm, vb, b)}</div>
        <div className="st-ln5">
          <span>dashed line =</span>
          <button type="button" className="st-step" aria-label="Lower the threshold" onClick={() => ctx.set({ thr: Math.max(0, thr - 1) })}>−</button>
          <b>{thr}+</b>
          <button type="button" className="st-step" aria-label="Raise the threshold" onClick={() => ctx.set({ thr: thr + 1 })}>+</button>
          <span>{stat.label.toLowerCase()}</span>
        </div>
        <div className="st-sdcm">
          {row(`Last-${n} average`, f1(sa.avg), f1(sb.avg))}
          {row('Median', sa.median == null ? '—' : String(sa.median), sb.median == null ? '—' : String(sb.median))}
          {row('Best game', sa.best == null ? '—' : String(sa.best), sb.best == null ? '—' : String(sb.best))}
          {row(`${thr}+ games`, `${sa.hits} of ${sa.n}`, `${sb.hits} of ${sb.n}`)}
        </div>
      </div>
    </>
  );
}
