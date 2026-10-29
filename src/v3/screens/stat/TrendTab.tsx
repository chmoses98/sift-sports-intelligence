// SD2: how the selected team's statistic has moved, game by game. Twelve games (or one season) as bars with the rolling average and
// the league level, opponent logos under each bar, one observation selected with its two exits (that game, that opponent), and the
// averages by season. Only the selected team's one series is fetched. A statistic with no per-game series shows how its rank moves
// across the windows the profile publishes, and says so.
import { useMemo, useState } from 'react';
import { useTeamIndex, useTeamProfile } from '../../data/research/hooks';
import { percentileOf } from '../../data/research/normalize';
import { useSeries } from '../../data/useStatDetail';
import { GameLink, NavRow, StatLink, TeamLink } from '../../nav/Targets';
import { routes } from '../../nav/routes';
import { capability } from '../../model/capabilities';
import { monthDay } from '../../model/time';
import { cutPoints, fmtBar, fmtValue, gameTag, ordinal, orderWindows, seasonRows, seasonsOf, seriesPoints, siteSplit, spanLabel, windowLabel, LAST_N, MAX_BARS } from '../../model/statDetail';
import { ObsBars } from '../../ui/charts/ObsBars';
import { ObsList, type ObsRow } from './ObsList';
import { RankTrack } from '../../ui/charts/RankTrack';
import { Icon } from '../../ui/Icon';
import { useSheet } from '../../ui/Sheet';
import { TeamLogo } from '../../ui/TeamLogo';
import { LockedRow } from '../../ui/atoms';
import type { StatCtx } from './ctx';
import { TeamPickerBody } from './pickers';

const md = (iso: string) => monthDay(Date.parse(iso));

export function ChooseTeam({ ctx, title, body }: { ctx: StatCtx; title: string; body: string }) {
  const sheet = useSheet();
  return (
    <div className="st-state">
      <b>{title}</b>{body}
      <div style={{ marginTop: 10 }}>
        <button type="button" className="st-btn st-btn--pri" onClick={() => sheet.open('Choose a team', <TeamPickerBody slug={ctx.slug} team={ctx.team} picked={[ctx.sel]} onPick={(code) => ctx.set({ sel: code, obs: null })} />, { tall: true })}>Choose a team</button>
      </div>
    </div>
  );
}

export function TrendTab({ ctx }: { ctx: StatCtx }) {
  const { slug, ranking, sel } = ctx;
  const cap = capability(slug, 'statTrend');
  if (ctx.mode === 'demo') return <div className="st-state"><b>Sample data has no history</b>Switch to real data to see a team’s game-by-game values.</div>;
  if (cap.status !== 'ready') return <LockedRow title="Trend is not shown.">{cap.reason}</LockedRow>;
  if (!sel) return <ChooseTeam ctx={ctx} title="Choose a team" body={`Trend shows one team’s ${ranking.name} game by game.`} />;
  return <TeamTrend ctx={ctx} sel={sel} />;
}

function TeamTrend({ ctx, sel }: { ctx: StatCtx; sel: string }) {
  const { slug, ranking, st } = ctx;
  const prof = useTeamProfile(slug, sel);
  const ti = useTeamIndex(slug);
  const seriesId = prof.profile?.seriesByMetric.get(ranking.metricId) ?? null;
  const ser = useSeries(slug, seriesId);
  const pts = useMemo(() => (ser.series ? seriesPoints(ser.series, slug, ctx.adjusted) : []), [ser.series, slug, ctx.adjusted]);
  const unit = ser.series?.unit ?? ranking.unit;
  // The column a finger is down on, shown live (bar lit, readout, details card) until it is lifted; the address changes only on lifting.
  const [preview, setPreview] = useState<number | null>(null);
  const team = ctx.team(sel);
  const metric = prof.profile?.metrics.get(ranking.id);

  if (prof.loading || ser.loading) return <div className="v3-skel" style={{ height: 240, marginTop: 10 }} role="status" aria-label="Loading history" />;
  if (!prof.profile) return <div className="st-state"><b>No profile for {sel}</b>The publication has no team profile for {sel}, so there is no history to draw.</div>;
  if (!seriesId || ser.error || !pts.length) return <WindowPath ctx={ctx} sel={sel} reason={!seriesId ? 'The publication carries no per-game series for this team and statistic.' : 'The per-game series could not be read.'} />;

  const { shown, total, cut } = cutPoints(pts, st.st);
  const at = shown.findIndex((p) => p.i === st.obs);
  const committed = at < 0 ? shown.length - 1 : at;
  const selIdx = preview != null && preview < shown.length ? preview : committed;
  const selPt = shown[selIdx];
  const gameOf = (eventId: string | null) => (eventId ? prof.profile!.games.find((g) => g.eventId === eventId) : undefined);
  const codeOf = (pid: string | null) => (pid ? ti.byId.get(pid)?.short_name ?? null : null);
  const showLeague = ctx.window === 'SEASON' || /^\d{4}(-\d{2})?$/.test(ctx.window);
  const league = showLeague ? ranking.summary.mean : null;
  const bars = shown.map((p) => {
    const g = gameOf(p.eventId), o = codeOf(p.opponentId);
    return { key: p.t, value: p.value, rolling: p.rolling, text: fmtBar(p.value, unit), tip: `${md(p.t)}${o ? ` · ${g?.home === false ? 'at' : 'vs'} ${o}` : ''} · ${fmtValue(p.value, unit)}` };
  });
  const obsRows: ObsRow[] = shown.map((p) => {
    const g = gameOf(p.eventId);
    return { i: p.i, date: md(p.t), tag: gameTag(g?.competition), opp: codeOf(p.opponentId), away: g?.home === false, value: fmtValue(p.value, unit), final: g?.result ? `${g.result.for}–${g.result.against}` : null, eventId: p.eventId };
  }).reverse();
  const under = shown.map((p) => {
    const o = codeOf(p.opponentId);
    return o ? <TeamLink key={p.t} team={{ slug, id: o }} label={`${o}, team page`}><TeamLogo team={ctx.team(o)} size={17} /></TeamLink> : <span key={p.t} />;
  });

  const game = gameOf(selPt.eventId);
  const opp = codeOf(selPt.opponentId);
  const tag = gameTag(game?.competition);
  const final = game?.result ? `${game.result.for}–${game.result.against}` : null;
  const seasons = seasonsOf(pts);
  const last = cutPoints(pts, null).shown;
  const rows = seasonRows(pts, metric?.windows, prof.profile.season);
  const site = prof.profile.season ? siteSplit(pts, (id) => gameOf(id)?.home, prof.profile.season) : { home: null, away: null };
  const missingRank = rows.some((r) => !r.rank);
  const onlyCurrent = rows.filter((r) => r.rank).every((r) => r.current);
  const noun = unit === 'points' ? 'Points' : ranking.name;

  return (
    <>
      <div className="st-chips" role="group" aria-label="Seasons">
        <button type="button" className="st-chip" aria-pressed={cut === 'last'} onClick={() => ctx.set({ st: null, obs: null })}>{spanLabel(last)} · last {Math.min(LAST_N, pts.length)}</button>
        {[...seasons].reverse().map((s) => {
          const n = pts.filter((p) => p.season === s).length;
          return <button key={s} type="button" className="st-chip" aria-pressed={cut === s} onClick={() => ctx.set({ st: s, obs: null })}>{s.replace('-', '–')}{s === prof.profile!.season ? ` · ${n} g` : ''}</button>;
        })}
      </div>
      <div className="st-card st-trc">
        <ObsBars bars={bars} league={league} sel={selIdx} preview={preview} onPreview={setPreview} onSelect={(i) => ctx.set({ obs: shown[i].i })} under={under} label={`${team.name} ${ranking.name}, ${shown.length} games`} />
        <div className="st-trkl"><span><i className="st-bx" />{noun}</span>{shown.some((p) => p.rolling != null) && <span><i className="ln" />Rolling avg</span>}{league != null && <span><i className="dl" />League {fmtValue(league, unit)}</span>}</div>
      </div>
      {total > MAX_BARS && <p className="st-note st-note--pad">Showing the latest {MAX_BARS} of {total} games.</p>}
      <div className={`st-card st-obc${preview != null ? ' is-press' : ''}`} data-obs-card>
        <div className="st-obh"><b>{tag ? `${tag} · ` : ''}{opp ? `${game?.home === false ? 'at' : 'vs'} ${opp}` : 'Game'}</b><span>{md(selPt.t)}</span></div>
        <div className="st-obv">
          {final ? <div><b className="num">{final}</b><small>final</small></div> : <div><b className="num">{fmtValue(selPt.value, unit)}</b><small>this game</small></div>}
          {selPt.rolling != null ? <div><b className="num">{fmtValue(selPt.rolling, unit)}</b><small>rolling average</small></div> : final ? <div><b className="num">{fmtValue(selPt.value, unit)}</b><small>this game</small></div> : <div />}
          <div className="st-obb">
            {selPt.eventId && <GameLink game={{ slug, eventId: selPt.eventId }} className="st-btn st-btn--pri" label={`Game Detail: ${opp ? `${team.abbr} ${game?.home === false ? 'at' : 'vs'} ${opp}` : 'this game'}`}>Game Detail</GameLink>}
            {opp && <TeamLink team={{ slug, id: opp }} className="st-btn" label={`${opp}, team page`}>{opp} <Icon name="chevR" size={12} /></TeamLink>}
          </div>
        </div>
      </div>
      <div className="st-card st-seas">
        <span className="st-eyebrow">By season</span>
        {rows.map((r) => (
          <button key={r.season} type="button" className="st-ssr" aria-pressed={cut === r.season} onClick={() => ctx.set({ st: r.season, obs: null })}>
            <b>{r.season.replace('-', '–')}</b><span>{r.games} games</span><b className="num">{fmtValue(r.avg, unit)}</b>
            {r.rank ? <em>{ordinal(r.rank.rank)} of {r.rank.n}</em> : <em className="lk">rank —</em>}
          </button>
        ))}
        {site.home && prof.profile.season && <div className="st-ssr"><b>Home, {prof.profile.season.replace('-', '–')}</b><span>{site.home.n} games</span><b className="num">{fmtValue(site.home.avg, unit)}</b><em /></div>}
        {site.away && prof.profile.season && <div className="st-ssr"><b>Away, {prof.profile.season.replace('-', '–')}</b><span>{site.away.n} games</span><b className="num">{fmtValue(site.away.avg, unit)}</b><em /></div>}
        {missingRank && <p className="st-note">{onlyCurrent ? 'League ranks are published for the current season only.' : 'League ranks are published only for the seasons that show one.'}</p>}
      </div>
      <ObsList rows={obsRows} slug={slug} team={team.abbr} noun={unit === 'points' ? 'points' : ranking.name.toLowerCase()} selected={shown[committed].i} onSelect={(i) => ctx.set({ obs: i })} label={`${team.name} ${ranking.name}, ${shown.length} games`} />
      <p className="st-vh" role="status">{`Showing ${md(shown[committed].t)}${codeOf(shown[committed].opponentId) ? `, ${gameOf(shown[committed].eventId)?.home === false ? 'at' : 'vs'} ${codeOf(shown[committed].opponentId)}` : ''}, ${fmtValue(shown[committed].value, unit)}`}</p>
    </>
  );
}

/** The statistic has no per-game series: how the team's rank moves between the windows its profile publishes. */
function WindowPath({ ctx, sel, reason }: { ctx: StatCtx; sel: string; reason: string }) {
  const prof = useTeamProfile(ctx.slug, sel);
  const metric = prof.profile?.metrics.get(ctx.ranking.id);
  const ws = orderWindows(Object.keys(metric?.windows ?? {})).filter((w) => metric!.windows[w].rank != null);
  const team = ctx.team(sel);
  return (
    <>
      <div className="st-state" role="note"><b>No game-by-game series</b>{reason} The path below shows {team.nick}’s rank in each published window instead.</div>
      {ws.length > 1 ? (
        <div className="st-card st-seas st-path">
          <span className="st-eyebrow">{sel} across windows</span>
          {ws.map((w) => {
            const o = metric!.windows[w];
            return (
              <NavRow key={w} to={routes.stat({ slug: ctx.slug, statId: ctx.ranking.id }, { win: w, sel, opp: ctx.opp })} kind="stat" className="st-ssr" label={`${windowLabel(w)}: ${ordinal(o.rank!)}, open that window's ranking`}>
                <b>{windowLabel(w)}</b>
                <RankTrack pct={percentileOf(o.rank, o.n)} role={ctx.role} height={24} />
                <b className="num" style={{ textAlign: 'right' }}>{ordinal(o.rank!)}</b>
                <b className="num" style={{ textAlign: 'right' }}>{fmtValue(o.value ?? o.adjusted, ctx.ranking.unit)}</b>
              </NavRow>
            );
          })}
          <p className="st-note">The rank in each published window; tap one to open its ranking.</p>
        </div>
      ) : <div className="st-state"><b>One window only</b>{ctx.ranking.name} is published with a single window for {team.nick}, so there is no path to draw.</div>}
      <StatLink stat={{ slug: ctx.slug, statId: ctx.ranking.id }} state={{ sel, opp: ctx.opp, win: ctx.window }} className="st-opn" label="Open the ranking">Open the ranking <Icon name="chevR" size={14} /></StatLink>
    </>
  );
}
