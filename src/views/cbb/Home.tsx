// The CBB sport home. Useful before November: the research status first, then the real schedule (with
// "projection pending" until a game enters the capture window), the frozen model lineup, the prospective
// sample (N first, no inference below the locked minimum) and roster readiness — with drill-through to the
// slate, games, teams, metrics and national rankings. Methodology stays one tap away.
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { HealthDoc } from '../../contract/types';
import { useAsync } from '../../data/hooks';
import { Icon } from '../../components/Icon';
import { ErrorState, Skeleton } from '../../components/ui';
import { routes } from '../../lib/routes';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import { CONFIDENCE_ORDER, CONFIDENCE_TEXT, eventExt, fmt1, statusExt, type CbbStatus, type ScoreSlice } from './data';
import { GameRow, useCbbEvents } from './Slate';
import { ConfidenceChip, RoleTag } from './ui';

const groupOf = (m: { extensions?: unknown }) => (m.extensions as { cbb?: { group?: string } } | undefined)?.cbb?.group;

const DAY = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '—';

export function CbbHomeView() {
  const { sport, repo, slug, metrics } = useSport();
  const health = useAsync(`health:${sport.code}:${repo.source.root}`, () => repo.health());
  const events = useCbbEvents();
  useVisit(sport.label, 'sport');
  const upcoming = useMemo(
    () => (events.data?.items ?? []).filter((e) => e.status === 'SCHEDULED' || e.status === 'LIVE').sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc)),
    [events.data],
  );
  const finals = useMemo(() => (events.data?.items ?? []).filter((e) => e.status === 'FINAL').sort((a, b) => b.start_time_utc.localeCompare(a.start_time_utc)), [events.data]);
  if (health.loading || events.loading) return <div className="page"><Skeleton lines={6} tall /></div>;
  const st = statusExt(health.data);
  if (!health.data || !st) return <div className="page"><ErrorState error={health.error} what="CBB research status" /></div>;
  const projected = upcoming.filter((e) => eventExt(e)?.primary);
  const firstDay = eventExt(upcoming[0])?.date_et;
  const shown = upcoming.slice(0, 12);
  const ranked = [...metrics.values()].filter((m) => m.entity_type === 'TEAM');
  return (
    <div className="page shome cbbhome">
      <header className="hbar">
        <h1 className="hbar__h">CBB</h1>
        <span className="hbar__m">{sport.fullName} · {st.season} · {st.research_status === 'PRESEASON' ? 'preseason' : 'in season'}</span>
        <span className="hbar__x"><Link to={routes.slate(slug)} className="btn btn--sm">Full slate <Icon name="arrowRight" size={14} /></Link></span>
      </header>

      <ResearchStatus st={st} health={health.data} projected={projected.length} />

      <section className="cbbhome__games" aria-labelledby="cb-up-h">
        <div className="phead">
          <h2 className="phead__t phead__t--serif" id="cb-up-h">Upcoming games</h2>
          <span className="phead__sub">{firstDay ? `from ${DAY(upcoming[0].start_time_utc)}` : ''} · {upcoming.length} D-I games in this window</span>
          <div className="phead__x"><Link className="phead__more" to={routes.slate(slug)}>All games <Icon name="arrowRight" size={14} /></Link></div>
        </div>
        {!upcoming.length && <p className="muted">No upcoming D-I games in this publication's window.</p>}
        {projected.length === 0 && upcoming.length > 0 && <p className="cbbhome__pend">Projection pending — these games have not entered the prospective capture window (30 hours before tip).</p>}
        <ul className="cgames">{shown.map((e) => <GameRow key={e.event_id} e={e} slug={slug} />)}</ul>
        {upcoming.length > shown.length && <p className="small"><Link to={routes.slate(slug)}>{upcoming.length - shown.length} more games on the slate →</Link></p>}
      </section>

      <div className="cbbhome__grid">
        <Models st={st} />
        <Prospective st={st} />
        <Readiness st={st} />
        <section className="panel" aria-labelledby="cb-rk-h">
          <div className="phead"><h2 className="phead__t" id="cb-rk-h">National rankings</h2></div>
          {ranked.length ? (
            [['ratings', 'Opponent-adjusted ratings'], ['roster', 'Roster truth']].map(([g, title]) => {
              const ms = ranked.filter((m) => groupOf(m) === g);
              const live = ms.filter((m) => m.freshness !== 'UNKNOWN');
              return (
                <div key={g} className="cbbhome__rkg">
                  <div className="eyebrow">{title}</div>
                  {live.length ? (
                    <ul className="cbbhome__rk">{live.map((m) => <li key={m.metric_id}><Link to={routes.metric(slug, m.metric_id)}>{m.name}</Link></li>)}</ul>
                  ) : <p className="muted small">{ms.length} metrics publish their D-I rankings with the first archived projections.</p>}
                </div>
              );
            })
          ) : <p className="muted">No metric is published yet.</p>}
          <p className="muted small">Ratings are opponent-adjusted inside the model fit; roster metrics come from roster truth and are not adjusted.</p>
        </section>
      </div>

      {finals.length > 0 && (
        <section className="cbbhome__games" aria-labelledby="cb-fin-h">
          <div className="phead"><h2 className="phead__t phead__t--serif" id="cb-fin-h">Recent finals</h2></div>
          <ul className="cgames">{finals.slice(0, 8).map((e) => <GameRow key={e.event_id} e={e} slug={slug} />)}</ul>
        </section>
      )}
    </div>
  );
}

function ResearchStatus({ st, health, projected }: { st: CbbStatus; health: HealthDoc; projected: number }) {
  const pre = st.research_status === 'PRESEASON';
  return (
    <section className="panel cbbstat" aria-labelledby="cb-st-h">
      <div className="cbbstat__l">
        <div className="eyebrow">Research status</div>
        <h2 className="cbbstat__h" id="cb-st-h">{pre ? 'Preseason: the prospective experiment is armed' : 'Prospective evaluation in progress'}</h2>
        <p className="muted">
          {pre
            ? <>First game {DAY(st.first_game_utc)}. Projections are archived by the frozen pipeline within 30 hours of each tip — none exists yet, and none is made early.</>
            : <>{projected} upcoming games carry a pre-tip projection; {st.games_in_capture_window} tip within the next 30 hours.</>}
        </p>
      </div>
      <dl className="cbbstat__kv">
        <div><dt>Schedule</dt><dd><b className="num">{st.schedule.d1_games}</b> D-I games</dd></div>
        <div><dt>Prospective sample</dt><dd><b className="num">N = {st.prospective.game_1.N}</b> game 1</dd></div>
        <div><dt>Bet authority</dt><dd>{health.bet_authority === 'RESEARCH_ONLY' ? 'Research only' : health.bet_authority}</dd></div>
        <div><dt>Markets</dt><dd>{st.markets.published ? `${st.markets.published} contracts` : 'not published'}</dd></div>
      </dl>
    </section>
  );
}

function Models({ st }: { st: CbbStatus }) {
  return (
    <section className="panel" aria-labelledby="cb-md-h">
      <div className="phead"><h2 className="phead__t" id="cb-md-h">Model status</h2></div>
      <ul className="cbbmods">
        {st.models.map((m) => (
          <li key={m.version}><RoleTag role={m.role} version={m.version} /><span className="muted small">{m.role === 'incumbent' ? 'production incumbent: the primary projection' : m.role === 'roster_overlay' ? 'P-ROSTER-1: roster-truth overlay on pure-0.5.0' : 'shadow research comparison'}</span></li>
        ))}
      </ul>
      <p className="muted small">{st.model_note}</p>
    </section>
  );
}

function slice(s: ScoreSlice, k: 'base' | 'roster' | 'incumbent') {
  const v = s[k];
  return v ? `${fmt1(v.MAE)} / ${fmt1(v.RMSE)} / ${v.bias != null ? (v.bias > 0 ? '+' : '') + v.bias.toFixed(2) : '—'}` : '—';
}

function Prospective({ st }: { st: CbbStatus }) {
  const g = st.prospective.game_1;
  const synthetic = (st.prospective.note ?? '').startsWith('SYNTHETIC');
  return (
    <section className="panel" aria-labelledby="cb-pr-h">
      <div className="phead"><h2 className="phead__t" id="cb-pr-h">Prospective evaluation</h2></div>
      <p className="cbbn"><b className="num">N = {g.N}</b> <span className="muted">game-1 observations</span></p>
      {g.N === 0 ? (
        <p className="muted">No conclusion yet.{st.prospective.note ? ` ${st.prospective.note.charAt(0).toUpperCase()}${st.prospective.note.slice(1)}.` : ''}</p>
      ) : (
        <>
          {synthetic && <p className="cbbsyn">{st.prospective.note}</p>}
          <table className="dtable">
            <caption>Preregistered summary · MAE / RMSE / bias (points, home margin)</caption>
            <tbody>
              <tr><th scope="row">Base pure-0.5.0</th><td className="num">{slice(g, 'base')}</td></tr>
              <tr><th scope="row">P-ROSTER-1</th><td className="num">{slice(g, 'roster')}</td></tr>
              <tr><th scope="row">Incumbent pure-0.2.0</th><td className="num">{slice(g, 'incumbent')}</td></tr>
              <tr><th scope="row">Δ MAE (roster − base)</th><td className="num">{g.delta_MAE != null ? (g.delta_MAE > 0 ? '+' : '') + g.delta_MAE.toFixed(2) : '—'}</td></tr>
              <tr><th scope="row">Games improved</th><td className="num">{g.pct_games_improved != null ? `${Math.round(g.pct_games_improved * 100)}%` : '—'}</td></tr>
            </tbody>
          </table>
          {!st.prospective.inference_allowed && <p className="muted small">{g.N} game-1 observations · insufficient sample for inference (the locked minimum is {st.prospective.min_n_for_inference} games over {st.prospective.min_days_for_inference} days). Not proof of anything.</p>}
        </>
      )}
      <p className="muted small">Protocol: {st.prospective.protocol ?? '—'}. Research transparency, not a track record.</p>
    </section>
  );
}

function Readiness({ st }: { st: CbbStatus }) {
  const c = st.roster_readiness.counts;
  return (
    <section className="panel" aria-labelledby="cb-rr-h">
      <div className="phead"><h2 className="phead__t" id="cb-rr-h">Roster readiness</h2></div>
      <ul className="cbbready">
        {CONFIDENCE_ORDER.map((k) => (
          <li key={k} title={CONFIDENCE_TEXT[k]}><ConfidenceChip c={k} /><b className="num">{c[k] ?? 0}</b></li>
        ))}
      </ul>
      <p className="muted small">Teams by roster confidence in roster-truth snapshot {st.roster_readiness.snapshot_at?.slice(0, 16).replace('T', ' ') ?? '—'} UTC. CONFIRMED: {CONFIDENCE_TEXT.CONFIRMED.toLowerCase()}</p>
    </section>
  );
}
