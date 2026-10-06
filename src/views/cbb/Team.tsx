// A CBB team as a research surface: roster confidence and continuity, the expected rotation, the
// opponent-adjusted ratings (once the team has an archived projection) and roster metrics with their full
// D-I rankings, the schedule with results and pre-tip projections. Ratings and projections are kept apart:
// a projection is one game's pre-tip view, never a season power rating.
import { Link } from 'react-router';
import { useAsync } from '../../data/hooks';
import { ErrorState, Notice, QualityBadge, Skeleton, Stratum } from '../../components/ui';
import { routes } from '../../lib/routes';
import { useNow } from '../../live/hooks';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import { MetricRow } from '../Team';
import { fmt1, marginWords, pct0, signed1, teamExt, teamShort, tipLabel } from './data';
import { Rotation } from './Game';
import { AsOf, CbbMark, ConfidenceChip, KV, StateLine } from './ui';

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
  const group = (g: string) => p.metrics.filter((o) => (metrics.get(o.metric_id)?.extensions as { cbb?: { group?: string } } | undefined)?.cbb?.group === g);
  const ratings = group('ratings');
  const roster = group('roster');
  const ro = c.roster;
  const done = p.games.filter((g) => g.result);
  const upcoming = c.upcoming;
  return (
    <div className="page cteam">
      <header className="cteam__h">
        <CbbMark p={p.entity} size="xl" />
        <div>
          <div className="eyebrow">{c.conference ?? 'NCAA Division I'}</div>
          <h1 className="h-display h-display--md">{p.entity.display_name}</h1>
          <div className="cteam__meta">
            <ConfidenceChip c={ro.confidence} />
            <span className="muted small">{c.schedule_games} D-I games · {c.completed_games} final</span>
          </div>
        </div>
      </header>

      <Stratum id="ct-next" title="Next games" sub="Pre-tip projections appear within 30 hours of tip; a projection is one game's view, not a season rating.">
        {upcoming.length ? (
          <ul className="cnext">
            {upcoming.map((u) => {
              const body = (
                <>
                  <span className="cnext__w">{tipLabel(u.start, u.tbd ? { tbd: true, date_et: u.date_et } : null)}</span>
                  <span className="cnext__o">{u.home_away === 'HOME' ? 'vs' : u.home_away === 'AWAY' ? 'at' : 'vs (neutral)'} {u.opponent}</span>
                  {u.primary ? (
                    <span className="cnext__p num">{u.home_away === 'AWAY'
                      ? `${name} ${fmt1(u.primary.away_score)} – ${fmt1(u.primary.home_score)}`
                      : `${name} ${fmt1(u.primary.home_score)} – ${fmt1(u.primary.away_score)}`}</span>
                  ) : <StateLine state={u.projection_state} compact />}
                </>
              );
              return <li key={u.event_id}>{u.path ? <Link className="cnext__a" to={routes.game(slug, u.event_id)}>{body}</Link> : <span className="cnext__a">{body}</span>}</li>;
            })}
          </ul>
        ) : <p className="muted">No upcoming D-I game is scheduled.</p>}
      </Stratum>

      <Stratum id="ct-roster" title="Roster" sub={ro.available ? `Roster truth snapshot ${ro.snapshot_at?.slice(0, 16).replace('T', ' ')} UTC` : undefined}>
        <ConfidenceChip c={ro.confidence} long />
        {ro.reason_text && <p className="muted small">Why: {ro.reason_text}{ro.fresh_sources?.length ? ` (current sources: ${ro.fresh_sources.join(', ')})` : ''}.</p>}
        {ro.continuity && (
          <>
            <dl className="cproj__grid">
              <KV k="Returning-minutes share">{pct0(ro.continuity.returning_minutes_share)}</KV>
              <KV k="Expected before roster truth">{pct0(ro.continuity.expected_returning_share)}</KV>
              <KV k="First-D-I players expected to play"><span className="num">{ro.continuity.first_d1_expected_to_play ?? '—'}</span></KV>
              <KV k="Game-1 continuity correction"><span className="num">{signed1(ro.continuity.game1_continuity_correction)}</span></KV>
            </dl>
            <MinutesBar m={ro.continuity.minutes} />
          </>
        )}
        {ro.counts && <p className="muted small">{ro.counts.listed} listed · {ro.counts.returning} returning · {ro.counts.transfer} transfers · {ro.counts.first_d1} first D-I · {ro.counts.conflicted} conflicted · {ro.counts.stale} stale</p>}
        <Rotation players={ro.expected_rotation ?? []} note={ro.rotation_valid ? null : `No expected rotation: ${ro.rotation_note ?? 'not built'}.`} max={14} />
        <p className="muted small">Expected pregame rotation from roster and prior participation evidence — not a confirmed starting lineup.</p>
      </Stratum>

      <Stratum id="ct-ratings" title="Opponent-adjusted ratings" sub={c.ratings ? <>Newest archived pregame rating (<AsOf iso={c.ratings.as_of} label="" now={now} />, {c.ratings.version}). Tap a metric for the full D-I ranking.</> : undefined}>
        {ratings.length ? (
          <ul className="mrow2__list">{ratings.map((o) => <MetricRow key={o.observation_id} o={o} slug={slug} teamId={p.entity.participant_id} sportCode={sport.code} teamLabel={name} />)}</ul>
        ) : (
          <Notice tone="research" title="Ratings publish with this team's first archived projection">Opponent-adjusted ratings are stored in the pre-tip projection records; none exists for {name} yet, so none is shown.</Notice>
        )}
      </Stratum>

      {roster.length > 0 && (
        <Stratum id="ct-rmetrics" title="Roster metrics" sub="From roster truth; not opponent-adjusted. Tap for the full D-I ranking.">
          <ul className="mrow2__list">{roster.map((o) => <MetricRow key={o.observation_id} o={o} slug={slug} teamId={p.entity.participant_id} sportCode={sport.code} teamLabel={name} />)}</ul>
        </Stratum>
      )}

      <Stratum id="ct-sched" title="Schedule" sub={done.length ? 'Results and opponents; open a game for its pre-tip research.' : 'The full D-I schedule. Games inside the research window open their research page.'}>
        <ul className="csched">
          {p.games.map((g) => {
            const res = g.result;
            const body = (
              <>
                <span className="csched__d">{new Date(g.start_time_utc).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                <span className="csched__o">{g.home_away === 'HOME' ? 'vs' : g.home_away === 'AWAY' ? 'at' : 'vs'} {g.opponent_name}{g.home_away === 'NEUTRAL' ? <span className="muted small"> · neutral</span> : null}</span>
                <span className="csched__r num">{res ? `${res.outcome} ${res.for}–${res.against}` : g.status === 'SCHEDULED' ? '' : g.status.toLowerCase()}</span>
              </>
            );
            return <li key={g.event_id}>{g.path ? <Link to={routes.game(slug, g.event_id)} className="csched__a">{body}</Link> : <span className="csched__a csched__a--x">{body}</span>}</li>;
          })}
        </ul>
        {p.opponents.length > 0 && <p className="muted small">{p.opponents.length} D-I opponents. Opponents link to their own profiles from each game page.</p>}
      </Stratum>

      <details className="gnotes">
        <summary>Data &amp; provenance</summary>
        <p className="small muted"><QualityBadge quality={p.quality} /> {p.quality.source} · generated {p.quality.generated_at} · {p.quality.limitations.join(' · ')}</p>
        <p className="small muted">Team {c.team_id} · ESPN {c.espn_team_id}. Roster snapshot {ro.snapshot ?? '—'}{ro.continuity?.audit_snapshot ? ` · continuity audit ${ro.continuity.audit_snapshot}` : ''}.</p>
        {c.ratings && <p className="small muted">Ratings from {c.ratings.event} ({c.ratings.version}, games seen {c.ratings.games_seen ?? '—'}).</p>}
        {upcoming[0]?.primary && <p className="small muted">Next projection: {marginWords(upcoming[0].primary.margin, 'home', 'away')} (home − away), archived {upcoming[0].primary.as_of}.</p>}
      </details>
    </div>
  );
}

function MinutesBar({ m }: { m: { returning: number | null; transfer: number | null; first_d1: number | null } }) {
  const parts = [['Returning', m.returning, 'ret'], ['Transfers', m.transfer, 'tr'], ['First D-I', m.first_d1, 'fd']] as const;
  const total = parts.reduce((a, [, v]) => a + (v ?? 0), 0);
  if (!total) return null;
  return (
    <figure className="cmin">
      <div className="cmin__bar" role="img" aria-label={parts.map(([l, v]) => `${l} ${fmt1(v)} minutes`).join(', ')}>
        {parts.map(([l, v, k]) => (v ? <span key={l} className={`cmin__s cmin__s--${k}`} style={{ width: `${(100 * v) / total}%` }} /> : null))}
      </div>
      <figcaption className="cmin__key">
        {parts.map(([l, v, k]) => <span key={l}><i className={`cmin__dot cmin__s--${k}`} aria-hidden="true" />{l} <b className="num">{fmt1(v)}</b></span>)}
        <span className="muted"> of 200 expected minutes</span>
      </figcaption>
    </figure>
  );
}
