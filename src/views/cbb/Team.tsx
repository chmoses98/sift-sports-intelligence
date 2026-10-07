// A CBB team: identity first (logo, conference, record, next game), a visual summary of published national
// ranks, roster construction (the 200 expected minutes by origin and the expected rotation), the
// opponent-adjusted ratings (once the team has an archived projection) and roster metrics — labelled NOT
// opponent-adjusted — with their full D-I rankings, then upcoming games with opponent logos and the full
// schedule behind a disclosure. Ratings and projections are kept apart: a projection is one game's pre-tip
// view, never a season power rating.
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import type { Observation } from '../../contract/types';
import { useAsync } from '../../data/hooks';
import { Icon } from '../../components/Icon';
import { TermInfo } from '../../components/Gloss';
import { ErrorState, Notice, QualityBadge, Skeleton, Stratum } from '../../components/ui';
import { metricFormatter } from '../../lib/format';
import { routes } from '../../lib/routes';
import { useNow } from '../../live/hooks';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import { MetricRow } from '../Team';
import { etDate, fmt1, marginWords, pct0, teamExt, teamShort, tipLabel } from './data';
import { Rotation, RosterCounts } from './Game';
import { accent, confShort, identity } from './identity';
import { AsOf, CbbMark, ConfidenceChip, StateLine } from './ui';
import { MinutesComp, StatTile, TeamLogo } from './viz';

const GLANCE: { id: string; label: string; group: 'ratings' | 'roster' }[] = [
  { id: 'met_cbb.adj_off', label: 'Adj. offense', group: 'ratings' },
  { id: 'met_cbb.adj_def', label: 'Adj. defense', group: 'ratings' },
  { id: 'met_cbb.adj_tempo', label: 'Adj. tempo', group: 'ratings' },
  { id: 'met_cbb.returning_minutes_share', label: 'Returning minutes', group: 'roster' },
  { id: 'met_cbb.expected_transfer_minutes', label: 'Minutes to transfers', group: 'roster' },
  { id: 'met_cbb.expected_first_d1_minutes', label: 'Minutes to first-D-I', group: 'roster' },
];

export function CbbTeamView({ teamId }: { teamId: string }) {
  const { sport, repo, slug, metrics } = useSport();
  const prof = useAsync(`prof:${sport.code}:${teamId}`, () => repo.profile(teamId));
  const now = useNow(60_000);
  const p = prof.data;
  useVisit(p ? teamShort(p.entity) : null, 'team');
  if (prof.loading) return <div className="page"><Skeleton lines={8} tall /></div>;
  const c = teamExt(p);
  if (!p || !c) return <div className="page"><ErrorState error={prof.error} what="this team's profile" /></div>;
  const name = teamShort(p.entity);
  const id = identity(p.entity.participant_id);
  const tc = accent(id);
  const groupOf = (o: Observation) => (metrics.get(o.metric_id)?.extensions as { cbb?: { group?: string } } | undefined)?.cbb?.group;
  const ratings = p.metrics.filter((o) => groupOf(o) === 'ratings');
  const roster = p.metrics.filter((o) => groupOf(o) === 'roster');
  const ro = c.roster;
  const done = p.games.filter((g) => g.result);
  const wins = done.filter((g) => g.result?.outcome === 'W').length;
  const upcoming = c.upcoming;
  const oppOf = new Map(p.games.map((g) => [g.event_id, g.opponent_id]));
  const next = upcoming[0];
  const glance = GLANCE.map((g) => ({ ...g, o: p.metrics.find((o) => o.metric_id === g.id) })).filter((g) => g.o);
  return (
    <div className="page cteam" style={{ '--tc': tc } as CSSProperties}>
      <header className="cth">
        <div className="cth__id">
          <CbbMark p={p.entity} size="xl" />
          <div className="cth__t">
            <div className="eyebrow">{id?.conference ?? c.conference ?? 'NCAA Division I'}</div>
            <h1 className="h-display h-display--md cth__h">{p.entity.display_name}</h1>
            <div className="cth__meta">
              {done.length > 0 && <span className="cth__rec num">{wins}–{done.length - wins}</span>}
              <ConfidenceChip c={ro.confidence} />
              <span className="muted small">{c.schedule_games} D-I games · {c.completed_games} final</span>
            </div>
          </div>
        </div>
        {next && (
          <Link className="cth__next" to={next.path ? routes.game(slug, next.event_id) : routes.slate(slug)}>
            <span className="eyebrow">Next game</span>
            <span className="cth__nx">
              <TeamLogo pid={oppOf.get(next.event_id)} size={40} />
              <span className="cth__nxt">
                <b>{next.home_away === 'HOME' ? 'vs' : next.home_away === 'AWAY' ? 'at' : 'vs'} {identity(oppOf.get(next.event_id))?.name ?? next.opponent}</b>
                <span>{tipLabel(next.start, next.tbd ? { tbd: true, date_et: next.date_et } : null)}{next.home_away === 'NEUTRAL' ? ' · neutral site' : ''}</span>
              </span>
            </span>
            {next.primary ? (
              <span className="cth__nxp num">Projected {next.home_away === 'AWAY' ? `${fmt1(next.primary.away_score)}–${fmt1(next.primary.home_score)}` : `${fmt1(next.primary.home_score)}–${fmt1(next.primary.away_score)}`}</span>
            ) : <span className="cth__nxs"><Icon name="clock" size={12} /> <StateLine state={next.projection_state} compact /></span>}
          </Link>
        )}
      </header>

      {glance.length > 0 && (
        <section className="ctiles" aria-label="At a glance">
          {glance.map((g) => {
            const def = metrics.get(g.id);
            const ctx = g.o!.context;
            return (
              <StatTile
                key={g.id}
                label={<>{g.label} {g.group === 'roster' ? <span className="ctiles__na">not adj.</span> : <span className="ctiles__adj">adj.</span>}</>}
                value={metricFormatter(def, Math.abs(g.o!.value ?? 1))(g.o!.value)}
                rank={ctx?.rank ?? null}
                size={ctx?.universe_size}
                tone={tc}
                directional={def?.higher_is_better != null}
                href={routes.metric(slug, g.id, { team: p.entity.participant_id })}
                note={ctx?.league_median != null ? `D-I median ${metricFormatter(def, Math.abs(ctx.league_median))(ctx.league_median)}` : undefined}
              />
            );
          })}
        </section>
      )}

      <Stratum id="ct-roster" title="Roster construction" sub={ro.available ? <>Roster truth snapshot {ro.snapshot_at?.slice(0, 16).replace('T', ' ')} UTC. <TermInfo k="cbb_expected_minutes" /></> : undefined}>
        <div className="cbuild">
          <div className="cbuild__l">
            <ConfidenceChip c={ro.confidence} long />
            {ro.reason_text && <p className="muted small">Why: {ro.reason_text}{ro.fresh_sources?.length ? ` (current sources: ${ro.fresh_sources.join(', ')})` : ''}.</p>}
            {ro.continuity && (
              <>
                <div className="cbuild__h">Where the 200 expected minutes come from</div>
                <MinutesComp m={ro.continuity.minutes} />
                <dl className="cproj__grid cproj__grid--sm">
                  <div className="ckv"><dt>Returning-minutes share</dt><dd>{pct0(ro.continuity.returning_minutes_share)}</dd></div>
                  <div className="ckv"><dt>Expected before roster truth</dt><dd>{pct0(ro.continuity.expected_returning_share)}</dd></div>
                  <div className="ckv"><dt>First-D-I expected to play</dt><dd className="num">{ro.continuity.first_d1_expected_to_play ?? '—'}</dd></div>
                </dl>
              </>
            )}
            {ro.counts && <RosterCounts counts={ro.counts} />}
          </div>
          <div className="cbuild__r">
            <Rotation players={ro.expected_rotation ?? []} note={ro.rotation_valid ? null : `No expected rotation: ${ro.rotation_note ?? 'not built'}.`} max={14} open={8} />
            <p className="muted small">Expected pregame rotation from roster and prior participation evidence — not a confirmed starting lineup.</p>
          </div>
        </div>
      </Stratum>

      <Stratum id="ct-ratings" title="Opponent-adjusted ratings" sub={c.ratings ? <>Newest archived pregame rating (<AsOf iso={c.ratings.as_of} label="" now={now} />, {c.ratings.version}). Tap a metric for the full D-I ranking.</> : undefined}>
        {ratings.length ? (
          <ul className="mrow2__list">{ratings.map((o) => <MetricRow key={o.observation_id} o={o} slug={slug} teamId={p.entity.participant_id} sportCode={sport.code} teamLabel={name} />)}</ul>
        ) : (
          <Notice tone="research" title="Ratings publish with this team's first archived projection">Opponent-adjusted ratings are stored in the pre-tip projection records; none exists for {name} yet, so none is shown.</Notice>
        )}
      </Stratum>

      {roster.length > 0 && (
        <Stratum id="ct-rmetrics" title={<>Roster metrics <span className="ctag">not opponent-adjusted</span></>} sub="From roster truth; they describe roster construction, not team strength. Tap for the full D-I ranking.">
          <ul className="mrow2__list">{roster.map((o) => <MetricRow key={o.observation_id} o={o} slug={slug} teamId={p.entity.participant_id} sportCode={sport.code} teamLabel={name} />)}</ul>
        </Stratum>
      )}

      <Stratum id="ct-next" title="Upcoming games" sub="Pre-tip projections appear within 30 hours of tip; a projection is one game's view, not a season rating.">
        {upcoming.length ? (
          <ul className="cnext">
            {upcoming.map((u) => {
              const opp = oppOf.get(u.event_id);
              const body = (
                <>
                  <span className="cnext__w">{u.tbd ? `${etDate(u.date_et)} · TBD` : tipLabel(u.start, null)}</span>
                  <span className="cnext__o">
                    <span className="cnext__ha">{u.home_away === 'HOME' ? 'vs' : u.home_away === 'AWAY' ? 'at' : 'vs'}</span>
                    <TeamLogo pid={opp} size={24} />
                    <span className="cnext__on">{identity(opp)?.name ?? u.opponent}</span>
                    {u.home_away === 'NEUTRAL' && <span className="flag flag--plain">neutral</span>}
                    {opp && <span className="cnext__cf">{confShort(identity(opp)?.conference)}</span>}
                  </span>
                  {u.primary ? (
                    <span className="cnext__p num">{u.home_away === 'AWAY'
                      ? `${name} ${fmt1(u.primary.away_score)} – ${fmt1(u.primary.home_score)}`
                      : `${name} ${fmt1(u.primary.home_score)} – ${fmt1(u.primary.away_score)}`}</span>
                  ) : <span className="cnext__s"><Icon name="clock" size={12} /> <StateLine state={u.projection_state} compact /></span>}
                </>
              );
              return <li key={u.event_id}>{u.path ? <Link className="cnext__a" to={routes.game(slug, u.event_id)}>{body}</Link> : <span className="cnext__a">{body}</span>}</li>;
            })}
          </ul>
        ) : <p className="muted">No upcoming D-I game is scheduled.</p>}
      </Stratum>

      <details className="gnotes csch">
        <summary>Full schedule · {p.games.length} D-I games{done.length ? ` · ${wins}–${done.length - wins}` : ''}</summary>
        <ul className="csched">
          {p.games.map((g) => {
            const res = g.result;
            const body = (
              <>
                <span className="csched__d">{new Date(g.start_time_utc).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                <span className="csched__o"><TeamLogo pid={g.opponent_id} size={18} /> {g.home_away === 'HOME' ? 'vs' : g.home_away === 'AWAY' ? 'at' : 'vs'} {g.opponent_name}{g.home_away === 'NEUTRAL' ? <span className="muted small"> · neutral</span> : null}</span>
                <span className="csched__r num">{res ? `${res.outcome} ${res.for}–${res.against}` : g.status === 'SCHEDULED' ? '' : g.status.toLowerCase()}</span>
              </>
            );
            return <li key={g.event_id}>{g.path ? <Link to={routes.game(slug, g.event_id)} className="csched__a">{body}</Link> : <span className="csched__a csched__a--x">{body}</span>}</li>;
          })}
        </ul>
      </details>

      <details className="gnotes">
        <summary>Data &amp; provenance</summary>
        <p className="small muted"><QualityBadge quality={p.quality} /> {p.quality.source} · generated {p.quality.generated_at} · {p.quality.limitations.join(' · ')}</p>
        <p className="small muted">Team {c.team_id} · ESPN {c.espn_team_id}. Roster snapshot {ro.snapshot ?? '—'}{ro.continuity?.audit_snapshot ? ` · continuity audit ${ro.continuity.audit_snapshot}` : ''}.</p>
        {c.ratings && <p className="small muted">Ratings from {c.ratings.event} ({c.ratings.version}, games seen {c.ratings.games_seen ?? '—'}).</p>}
        {upcoming[0]?.primary && <p className="small muted">Next projection: {marginWords(upcoming[0].primary.margin, 'home', 'away')} (home − away), archived {upcoming[0].primary.as_of}.</p>}
        <p className="small muted">Logo: the school’s mark as published by ESPN, committed to Sift once. Presentation only.</p>
      </details>
    </div>
  );
}
