// A completed game that has no event-research document (most of the last four seasons). Everything
// here comes from the two teams' published game lists and per-game series; nothing is synthesized —
// in particular there is no player box score, because the NFL publication does not carry player game logs.
import { Link } from 'react-router';
import { TrendChart } from '../charts/TrendChart';
import type { EntityProfileDoc, ProfileGame, SeriesDoc } from '../contract/types';
import { useAsync } from '../data/hooks';
import { Icon } from '../components/Icon';
import { EntityLink, ErrorState, Notice, QualityBadge, SaveButton, Skeleton, Stratum, TeamMark } from '../components/ui';
import { displayName, metricFormatter, shortDate } from '../lib/format';
import { routes } from '../lib/routes';
import { useDirectory } from '../state/directory';
import { capStatus, useSport } from '../state/sport';
import { useVisit } from '../state/trail';

function Around({ prof, eventId, slug, label }: { prof: EntityProfileDoc; eventId: string; slug: string; label: string }) {
  const games = [...prof.games].sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc));
  const i = games.findIndex((g) => g.event_id === eventId);
  if (i < 0) return null;
  const win = games.slice(Math.max(0, i - 3), i + 4);
  return (
    <div className="around">
      <div className="eyebrow">{label}</div>
      <ol className="around__list">
        {win.map((g) => (
          <li key={g.event_id} className={g.event_id === eventId ? 'is-here' : undefined}>
            <GameRowLink g={g} slug={slug} teamId={prof.entity.participant_id} />
          </li>
        ))}
      </ol>
    </div>
  );
}

export function GameRowLink({ g, slug, teamId }: { g: ProfileGame; slug: string; teamId: string }) {
  const res = g.result;
  return (
    <Link to={routes.game(slug, g.event_id, { team: teamId })} className="grow">
      <span className="grow__c">{g.competition?.replace(/^(\d{4}) REG week /, '$1 · W')}</span>
      <span className="grow__o">{g.home_away === 'AWAY' ? '@' : 'vs'} {g.opponent_name}</span>
      {res?.outcome ? (
        <span className={`grow__r grow__r--${res.outcome}`}>
          <b>{res.outcome}</b> <span className="num">{res.for}–{res.against}</span>
        </span>
      ) : (
        <span className="grow__r grow__r--sched">{shortDate(g.start_time_utc)}</span>
      )}
    </Link>
  );
}

function pointAt(s: SeriesDoc | undefined, eventId: string) {
  return s?.points.find((p) => p.event_id === eventId) ?? null;
}

export function HistoricalGameView({ eventId, teamId }: { eventId: string; teamId: string | null }) {
  const { sport, repo, slug, metrics, caps } = useSport();
  const dir = useDirectory(repo);
  const team = useAsync(teamId ? `prof:${sport.code}:${teamId}` : null, () => repo.profile(teamId!));
  const row = team.data?.games.find((g) => g.event_id === eventId) ?? null;
  const oppId = row?.opponent_id ?? null;
  const opp = useAsync(oppId ? `prof:${sport.code}:${oppId}` : null, () => repo.profile(oppId!));
  const series = useAsync(team.data ? `hseries:${sport.code}:${teamId}` : null, () => Promise.all(team.data!.series.map((s) => repo.series(s.series_id))));
  const oppSeries = useAsync(opp.data ? `hseries:${sport.code}:${oppId}` : null, () => Promise.all(opp.data!.series.map((s) => repo.series(s.series_id))));
  const tAbbr = team.data?.entity.short_name ?? '';
  const oAbbr = opp.data?.entity.short_name ?? dir.data?.team(oppId)?.abbr ?? '';
  const label = row ? `${row.home_away === 'AWAY' ? `${tAbbr} @ ${oAbbr}` : `${oAbbr} @ ${tAbbr}`} · ${row.competition?.replace(/ REG week /, ' W')}` : null;
  useVisit(label, 'history');

  if (!teamId) {
    return (
      <div className="page">
        <Notice title="This game has no research document">
          Open it from a team's schedule or a trend chart so Sift knows which team's published record to read it from.
        </Notice>
      </div>
    );
  }
  if (team.loading || (oppId && opp.loading)) return <div className="page"><Skeleton lines={6} tall /></div>;
  if (!team.data) return <div className="page"><ErrorState error={team.error} what="the team profile" /></div>;
  if (!row) return <div className="page"><Notice title="Game not in this team's published game list">The team profile lists the last four seasons; this game is not among them.</Notice></div>;

  const home = row.home_away === 'AWAY' ? { id: oppId, abbr: oAbbr, name: displayName(row.opponent_name) } : { id: teamId, abbr: tAbbr, name: displayName(team.data.entity.display_name) };
  const away = row.home_away === 'AWAY' ? { id: teamId, abbr: tAbbr, name: displayName(team.data.entity.display_name) } : { id: oppId, abbr: oAbbr, name: displayName(row.opponent_name) };
  const res = row.result;
  const homeScore = row.home_away === 'AWAY' ? res?.against : res?.for;
  const awayScore = row.home_away === 'AWAY' ? res?.for : res?.against;
  const sPF = series.data?.find((s) => s.metric_id === 'met_nfl.points_for');
  const plStatus = capStatus(caps, 'player_game_logs');

  return (
    <div className="page game game--hist">
      <header className="mh mh--hist">
        <div className="mh__eyebrow">
          <EntityLink to={routes.sport(slug)} kind="sport" quiet>{sport.label}</EntityLink>
          <span>·</span>
          <span>{row.competition}</span>
          <span className="chip">Historical game</span>
        </div>
        <div className="mh__teams">
          <div className="mh__team mh__team--away">
            <TeamMark sport={sport.code} abbr={away.abbr} size="lg" />
            <div className="mh__tn">
              {away.id ? <Link to={routes.team(slug, away.id)} className="mh__name">{away.name}</Link> : <span className="mh__name">{away.name}</span>}
              <span className="mh__rec">away</span>
            </div>
            <span className="mh__score num">{awayScore ?? '—'}</span>
          </div>
          <div className="mh__at"><span className="mh__final">{row.status}</span></div>
          <div className="mh__team mh__team--home">
            <TeamMark sport={sport.code} abbr={home.abbr} size="lg" />
            <div className="mh__tn">
              {home.id ? <Link to={routes.team(slug, home.id)} className="mh__name">{home.name}</Link> : <span className="mh__name">{home.name}</span>}
              <span className="mh__rec">home</span>
            </div>
            <span className="mh__score num">{homeScore ?? '—'}</span>
          </div>
        </div>
        <div className="mh__meta">
          <span><Icon name="clock" size={14} /> {new Date(row.start_time_utc).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}</span>
          <span>Result source: nflverse schedule (schedule_cache.csv) · <QualityBadge status={capStatus(caps, 'historical_results')} /></span>
        </div>
        <div className="mh__actions">
          <SaveButton text="Game" ref_kind="EVENT" sport={sport.code} id={eventId} label={{ label: label ?? eventId, sub: shortDate(row.start_time_utc), href: routes.game(slug, eventId, { team: teamId }) }} />
          {sPF && (
            <SaveButton
              text="Chart point" ref_kind="CHART_POINT" sport={sport.code} id={sPF.series_id}
              extra={{ series_id: sPF.series_id, x: pointAt(sPF, eventId)?.x ?? null, metric_id: sPF.metric_id, event_id: eventId }}
              label={{ label: `${tAbbr} points · ${row.competition}`, sub: 'chart point', href: routes.game(slug, eventId, { team: teamId }) }}
            />
          )}
        </div>
      </header>

      <Stratum n="01" title="The game in its metrics" sub="Each team's published per-game series at this game, and the trailing mean going in.">
        <div className="hmetrics">
          {[{ prof: team.data, ss: series.data }, { prof: opp.data, ss: oppSeries.data }].map(({ prof, ss }) =>
            prof ? (
              <div key={prof.entity.participant_id} className="hmetrics__team">
                <div className="hmetrics__th"><TeamMark sport={sport.code} abbr={prof.entity.short_name} size="sm" /> {prof.entity.display_name}</div>
                <table className="dtable">
                  <thead><tr><th>Metric</th><th className="r">This game</th><th className="r">Trailing mean</th></tr></thead>
                  <tbody>
                    {(ss ?? []).map((s) => {
                      const p = pointAt(s, eventId);
                      const fmt = metricFormatter(metrics.get(s.metric_id));
                      return (
                        <tr key={s.series_id}>
                          <td><Link to={routes.metric(slug, s.metric_id, { team: prof.entity.participant_id, event: eventId })}>{metrics.get(s.metric_id)?.name ?? s.metric_id}</Link></td>
                          <td className="r num">{p ? fmt(p.value) : '—'}</td>
                          <td className="r num">{p ? fmt(p.rolling_value) : '—'}</td>
                        </tr>
                      );
                    })}
                    {!ss && <tr><td colSpan={3}><Skeleton lines={1} /></td></tr>}
                  </tbody>
                </table>
              </div>
            ) : null,
          )}
        </div>
      </Stratum>

      {sPF && (
        <Stratum n="02" title={`${team.data.entity.display_name} — points per game`} sub="This game highlighted in the team's last 40. Tap any other game to move there.">
          <TrendChart
            points={sPF.points}
            format={metricFormatter(metrics.get(sPF.metric_id))}
            unit={sPF.unit ?? ''}
            rollingWindow={sPF.rolling_window}
            title={`${team.data.entity.display_name} points per game`}
            opponentLabel={(id) => dir.data?.team(id)?.abbr ?? '?'}
            selectedX={pointAt(sPF, eventId)?.x ?? null}
            renderDetail={(p) => (
              <Link className="btn btn--ghost btn--sm" to={routes.game(slug, p.event_id ?? '', { team: teamId })}>
                Open {p.x} <Icon name="arrowRight" size={14} />
              </Link>
            )}
          />
        </Stratum>
      )}

      <Stratum n="03" title="Around this game" sub="Form going in and coming out, for both teams.">
        <div className="around__grid">
          <Around prof={team.data} eventId={eventId} slug={slug} label={team.data.entity.display_name} />
          {opp.data && <Around prof={opp.data} eventId={eventId} slug={slug} label={opp.data.entity.display_name} />}
        </div>
      </Stratum>

      <Stratum n="04" title="Player performances" sub="Who did what in this game.">
        <Notice tone="research" title={`Player game logs are ${plStatus} for ${sport.label}`}>
          {caps.get('player_game_logs')?.limitations?.[0] ?? 'Not published.'} Sift shows no box score it cannot source. Current players:
        </Notice>
        <div className="chips">
          {[team.data, opp.data].filter(Boolean).flatMap((p) => p!.players.slice(0, 8)).map((p) => (
            <EntityLink key={p.participant_id} to={routes.player(slug, p.participant_id)} kind="player">{p.display_name} <span className="muted">{p.role}</span></EntityLink>
          ))}
        </div>
      </Stratum>
    </div>
  );
}
