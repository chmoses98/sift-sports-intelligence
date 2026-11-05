// NBA team research (published by nba-edge-finder). It opens ONLY when the team profile passes `nbaCurrency` (model/nbaTeam.ts): this season, built from this
// season's games, observed in the last three days. Otherwise the screen is a lock that names exactly what the publication lacks. It never relabels last
// season's numbers. SIFT's blended estimate and the raw current-season ratings are shown as two different things with two different labels.
import './nba-team.css';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from '../../../routing';
import { useAsync } from '../../../data/hooks';
import { useTeamVM } from '../../data/useTeam';
import { compareTeams, factorLine, nbaCurrency, nbaTeamView, signed, type Factor, type NbaTeamView } from '../../model/nbaTeam';
import { clockTime, dayWord } from '../../model/time';
import { demoOn, pushVisit } from '../../state/prefs';
import { AlertBell, FollowStar } from '../../ui/Controls';
import { DataState } from '../../ui/DataState';
import { GameCard } from '../../ui/GameCard';
import { Icon } from '../../ui/Icon';
import { TeamLogo } from '../../ui/TeamLogo';
import { Rank } from '../../ui/rank';
import { teamHref } from '../../ui/gamebits';
import type { EntityProfileDoc } from '../../../contract/types';
import { SearchButton } from '../../ui/SearchButton';

const when = (iso: string | null) => (iso ? `${dayWord(Date.parse(iso))} ${clockTime(Date.parse(iso))}` : 'unknown');

function Back() {
  const nav = useNavigate();
  const loc = useLocation();
  return <button type="button" className="v3-iconbtn" aria-label="Back" onClick={() => (loc.key !== 'default' ? nav(-1) : nav('/v3', { replace: true }))}><Icon name="back" size={24} /></button>;
}

function Lock({ team, reasons, season, asOf }: { team: { name: string }; reasons: string[]; season: string | null; asOf: string | null }) {
  return (
    <div className="nba-lock v3-state v3-state--warn" role="note" data-testid="nba-lock">
      <Icon name="info" size={20} />
      <div>
        <b>{team.name} research is waiting for current data</b>
        <ul>{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        <p>The last statistics in the publication are for {season ?? 'an unknown season'}{asOf ? `, as of ${asOf.slice(0, 10)}` : ''}. SIFT does not show last season’s numbers as this season’s. This screen opens by itself when the publication carries 2026-27 games.</p>
      </div>
    </div>
  );
}

function RatingCard({ v }: { v: NbaTeamView }) {
  const w = v.blend.weightCurrent;
  return (
    <section className="nba-rate" aria-label="Team rating">
      <div className="nba-rate__main">
        <small>SIFT blended estimate</small>
        <b className="num" data-testid="blend-net">{signed(v.blend.net)}</b>
        <span>net rating per 100 possessions vs league · <Rank rank={v.blend.netRank} n={30} word /></span>
      </div>
      <div className="nba-rate__split">
        <div><small>{v.season} only (observed)</small><b className="num">{signed(v.cur.net)}</b><span>{v.games} games · <Rank rank={v.cur.netRank} n={30} /></span></div>
        <div><small>Offense / defense (blend)</small><b className="num">{signed(v.blend.off)} / {signed(v.blend.def)}</b><span>{v.blend.offRank ? `off ${v.blend.offRank}` : ''}{v.blend.defRank ? ` · def ${v.blend.defRank}` : ''}</span></div>
      </div>
      {w != null && (
        <div className="nba-wt" role="img" aria-label={`The estimate is ${Math.round(w * 100)} percent this season and ${Math.round((1 - w) * 100)} percent ${v.priorSeason ?? 'last season'}`}>
          <i style={{ width: `${Math.round(w * 100)}%` }} />
          <span>{Math.round(w * 100)}% {v.season} · {Math.round((1 - w) * 100)}% {v.priorSeason ?? 'last season'}{v.blend.continuity != null ? ` · roster continuity ${Math.round(v.blend.continuity * 100)}%` : ''}</span>
        </div>
      )}
      <p className="nba-note">Opponent-adjusted. The blend leans on {v.priorSeason ?? 'last season'} less each game played; it is an estimate of true strength, the {v.season} figure is what has happened. Coaching changes and in-season injuries are not modelled.</p>
    </section>
  );
}

function FactorRow({ f }: { f: Factor }) {
  return (
    <li className="nba-f">
      <span>{f.label}</span>
      <b className="num">{f.text}</b>
      {f.hib == null ? <em>style</em> : <Rank rank={f.rank} n={f.n} />}
    </li>
  );
}

function Strengths({ v }: { v: NbaTeamView }) {
  if (!v.strengths.length && !v.weaknesses.length) return null;
  return (
    <section className="nba-sw" aria-label="Strengths and weaknesses">
      <div className="nba-sw__c is-good"><h3>Strengths</h3><ul>{v.strengths.map((f) => <li key={f.id}>{factorLine(f)}</li>)}{!v.strengths.length && <li>No top-quarter ranks yet.</li>}</ul></div>
      <div className="nba-sw__c is-bad"><h3>Weaknesses</h3><ul>{v.weaknesses.map((f) => <li key={f.id}>{factorLine(f)}</li>)}{!v.weaknesses.length && <li>No bottom-quarter ranks yet.</li>}</ul></div>
    </section>
  );
}

function Form({ v, codeOf }: { v: NbaTeamView; codeOf: (id: string, name: string) => string }) {
  if (!v.form.length) return <p className="nba-note">No completed {v.season} games in the publication.</p>;
  const max = Math.max(10, ...v.form.map((g) => Math.abs(g.margin)));
  return (
    <section aria-label="Recent form">
      <h2 className="v3-h2">Recent form <small>{v.record ? `${v.record} this season` : ''}</small></h2>
      <ol className="nba-form">
        {[...v.form].reverse().map((g) => (
          <li key={`${g.eventId}${g.date}`} className={g.outcome === 'W' ? 'is-w' : 'is-l'} title={`${g.outcome} ${g.for}-${g.against} ${g.home ? 'vs' : 'at'} ${g.oppName}`}>
            <i style={{ height: `${Math.max(6, (Math.abs(g.margin) / max) * 46)}px` }} />
            <b className="num">{g.margin > 0 ? `+${g.margin}` : g.margin}</b>
            <small>{g.home ? '' : '@'}{codeOf(g.oppId, g.oppName)}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Matchup({ mine, theirs, opp, label }: { mine: NbaTeamView; theirs: NbaTeamView; opp: { name: string }; label: string }) {
  const rows = compareTeams(mine, theirs);
  const gap = mine.blend.net != null && theirs.blend.net != null ? mine.blend.net - theirs.blend.net : null;
  return (
    <section aria-label={`Matchup with ${opp.name}`}>
      <h2 className="v3-h2">{label}</h2>
      {gap != null && <p className="nba-gap" data-testid="rating-gap">Rating gap <b className="num">{signed(gap)}</b> per 100 possessions: the blended estimates favour {gap >= 0 ? 'this team' : opp.name} (before home court and rest).</p>}
      <table className="nba-cmp">
        <thead><tr><th scope="col">Statistic</th><th scope="col">This team</th><th scope="col">{opp.name.split(' ').slice(-1)[0]}</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}><th scope="row">{r.label}</th><td className={r.edge === 'mine' ? 'is-edge' : ''}>{r.mine}</td><td className={r.edge === 'theirs' ? 'is-edge' : ''}>{r.theirs}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="nba-note">Raw values with the published direction; the edge is shaded. Ranks and the blend are on each team’s own page.</p>
    </section>
  );
}

export function NbaTeam() {
  const { slug = 'nba', teamId = '' } = useParams();
  const code = decodeURIComponent(teamId);
  const t = useTeamVM(slug, code);
  const demo = demoOn();
  const [now] = useState(() => Date.now());
  const p = t.profile;
  const cur = useMemo(() => nbaCurrency(p, now), [p, now]);
  const view = useMemo(() => (p && cur.ok ? nbaTeamView(p) : null), [p, cur.ok]);
  const team = t.vm.team;
  useEffect(() => { if (team.name && team.name !== code) pushVisit({ route: `/v3/team/${slug}/${encodeURIComponent(code)}`, title: team.name, subtitle: 'NBA · team', kind: 'team', slug, logo: team.logo }); }, [team.name, team.logo, code, slug]);

  const next = t.upcoming[0] ?? null;
  const oppSide = next ? (next.home.id === team.id ? next.away : next.home) : null;
  const oppPid = oppSide ? t.index?.teams.find((x) => x.short_name === oppSide.id)?.participant_id ?? null : null;
  const oppDoc = useAsync<EntityProfileDoc | null>(t.repo && oppPid && cur.ok ? `v3:nba-opp:${oppPid}` : null, () => t.repo!.profile(oppPid!));
  const oppCur = useMemo(() => nbaCurrency(oppDoc.data, now), [oppDoc.data, now]);
  const oppView = useMemo(() => (oppDoc.data && oppCur.ok ? nbaTeamView(oppDoc.data) : null), [oppDoc.data, oppCur.ok]);

  if (demo) return <div className="nba" data-screen="nba-team"><div className="nba-bar"><Back /></div><div className="v3-state"><Icon name="info" size={20} /><div><b>Sample mode</b>NBA team research has no sample data. Turn sample data off to see the real publication.</div></div></div>;

  const header = (
    <div className="nba-bar">
      <Back />
      <TeamLogo team={team} size={34} />
      <div className="nba-bar__t"><h1>{team.name}</h1><small>NBA{view ? ` · ${view.season}${view.record ? ` · ${view.record}` : ''}` : ''}</small></div>
      <span className="nba-bar__r"><SearchButton /><FollowStar kind="teams" id={`${team.slug}:${team.id}`} label={team.name} /><AlertBell id={`${team.slug}:${team.id}`} label={team.name} /></span>
    </div>
  );

  if (t.loading) return <div className="nba" data-screen="nba-team">{header}<div className="v3-skel" style={{ height: 180, margin: '12px 16px' }} role="status" aria-label="Loading team research" /></div>;
  if (!p) return <div className="nba" data-screen="nba-team">{header}<DataState title="Team research unavailable" err={new Error('no team profile')} alert>The NBA team document could not be read.</DataState></div>;
  if (!cur.ok || !view) return <div className="nba" data-screen="nba-team" data-state="locked">{header}<Lock team={team} reasons={cur.reasons} season={cur.season} asOf={cur.asOf} /></div>;

  return (
    <div className="nba" data-screen="nba-team" data-state="current">
      {header}
      <p className="nba-asof" data-testid="nba-asof">{view.season} regular season · {view.games} games · through {when(view.asOf)} · ESPN box scores via nba-edge-finder</p>
      <RatingCard v={view} />
      <Strengths v={view} />
      <Form v={view} codeOf={(id, name) => t.index?.teams.find((x) => x.participant_id === id)?.short_name ?? name.split(' ').slice(-1)[0].slice(0, 3).toUpperCase()} />
      {next && (
        <section aria-label="Next game and its markets">
          <h2 className="v3-h2">Next game</h2>
          <div className="v3-gclist"><GameCard g={next} /></div>
          <p className="nba-note">Kalshi prices for this game are on its page, beside the matchup research.</p>
        </section>
      )}
      {next && oppSide && oppView && <Matchup mine={view} theirs={oppView} opp={oppSide} label={`vs ${oppSide.name}`} />}
      {next && oppSide && !oppView && oppDoc.loading && <div className="v3-skel" style={{ height: 120, margin: '12px 16px' }} role="status" aria-label="Loading the opponent" />}
      <section aria-label="Four factors and shooting">
        <h2 className="v3-h2">What the team does <small>raw, {view.season}</small></h2>
        {(['scoring', 'shooting', 'ball', 'boards', 'pace'] as const).map((g) => {
          const rows = view.factors.filter((f) => f.group === g);
          return rows.length ? <ul key={g} className="nba-fs">{rows.map((f) => <FactorRow key={f.id} f={f} />)}</ul> : null;
        })}
        <p className="nba-note">Not opponent-adjusted: these are what the team has done so far this season, ranked among the 30 teams. The adjusted view is the rating above.</p>
      </section>
      <section aria-label="Roster and availability">
        <h2 className="v3-h2">Roster</h2>
        {view.availability.length > 0 && <ul className="nba-av">{view.availability.map((a) => <li key={a.detail ?? a.player}><b>{a.status}</b> {a.detail}</li>)}</ul>}
        <ul className="nba-roster">
          {view.roster.map((r) => <li key={r.id}><Link to={`/v3/player/${slug}/${encodeURIComponent(r.id)}`}>{r.name}{r.role ? <small>{r.role}</small> : null}</Link></li>)}
        </ul>
        <p className="nba-note">Player contribution statistics (points, rebounds, assists, minutes) are on each player’s page. The publication stores no lineup or starter data.</p>
      </section>
      <p className="nba-note nba-foot">Source: nba-edge-finder explorer · quality RESEARCH · {view.priorSeason ? `blend with ${view.priorSeason} fitted on stored seasons; ` : ''}as of {view.asOf?.slice(0, 16).replace('T', ' ')} UTC. <Link to={teamHref(team)} replace>Refresh</Link></p>
    </div>
  );
}
