// The CBB sport home: basketball first. The season at a glance (the research status in one band), the
// games worth opening first (by a stated rule), the national picture from the published rankings (their
// own top fives, nothing re-ranked), roster storylines, conferences to explore, and the compact research
// status — with methodology one tap away. Useful before November: every block reads real preseason data.
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { EventDoc, HealthDoc } from '../../contract/types';
import { useAsync } from '../../data/hooks';
import { Icon } from '../../components/Icon';
import { TermInfo } from '../../components/Gloss';
import { ErrorState, Skeleton } from '../../components/ui';
import { metricFormatter } from '../../lib/format';
import { routes } from '../../lib/routes';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import { CONFIDENCE_ORDER, CONFIDENCE_TEXT, eventExt, fmt1, marginWords, statusExt, teamShort, tipLabel, type CbbLeaders, type CbbStatus, type ScoreSlice } from './data';
import { allTeams, confShort, identity } from './identity';
import { GameRow, marquee, teamConf, useCbbEvents } from './Slate';
import { CbbMark, ConfidenceChip, RoleTag, StateLine } from './ui';
import { TeamLogo } from './viz';

const DAY = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '—';

export function CbbHomeView() {
  const { sport, repo, slug } = useSport();
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
  const featured = marquee(upcoming, 6);
  const featuredIds = new Set(featured.map((e) => e.event_id));
  const rest = upcoming.filter((e) => !featuredIds.has(e.event_id)).slice(0, 8);
  return (
    <div className="page shome cbbhome">
      <header className="hbar">
        <h1 className="hbar__h">CBB</h1>
        <span className="hbar__m">{sport.fullName} · {st.season} · {st.research_status === 'PRESEASON' ? 'preseason' : 'in season'}</span>
        <span className="hbar__x"><Link to={routes.slate(slug)} className="btn btn--sm">Full slate <Icon name="arrowRight" size={14} /></Link></span>
      </header>

      <SeasonBand st={st} health={health.data} projected={projected.length} upcoming={upcoming.length} />

      {featured.length > 0 && (
        <section className="cbbhome__sec" aria-labelledby="cb-mq-h">
          <div className="phead">
            <h2 className="phead__t phead__t--serif" id="cb-mq-h">Games to open first</h2>
            <span className="phead__sub">Named events and neutral-site showcases first, then conference games, then the earliest tip</span>
          </div>
          <ul className="cmq">{featured.map((e) => <MarqueeCard key={e.event_id} e={e} slug={slug} />)}</ul>
        </section>
      )}

      <section className="cbbhome__sec" aria-labelledby="cb-up-h">
        <div className="phead">
          <h2 className="phead__t phead__t--serif" id="cb-up-h">Upcoming games</h2>
          <span className="phead__sub">{upcoming.length ? `from ${DAY(upcoming[0].start_time_utc)}` : ''} · {upcoming.length} D-I games in this window</span>
          <div className="phead__x"><Link className="phead__more" to={routes.slate(slug)}>All games <Icon name="arrowRight" size={14} /></Link></div>
        </div>
        {!upcoming.length && <p className="muted">No upcoming D-I games in this publication's window.</p>}
        {projected.length === 0 && upcoming.length > 0 && <p className="cbbhome__pend"><Icon name="clock" size={13} /> Projection pending — these games have not entered the prospective capture window (30 hours before tip).</p>}
        <ul className="cgames">{rest.map((e) => <GameRow key={e.event_id} e={e} slug={slug} showDate />)}</ul>
        {upcoming.length > rest.length + featured.length && <p className="small"><Link to={routes.slate(slug)}>{upcoming.length - rest.length - featured.length} more games on the slate →</Link></p>}
      </section>

      <NationalPicture st={st} slug={slug} />

      <Conferences slug={slug} events={upcoming} />

      <section className="cbbhome__sec" aria-labelledby="cb-rs-h">
        <div className="phead"><h2 className="phead__t phead__t--serif" id="cb-rs-h">Research status</h2><span className="phead__sub">Frozen models, prospective sample, roster readiness</span></div>
        <div className="cbbhome__grid">
          <Models st={st} />
          <Prospective st={st} />
          <Readiness st={st} />
        </div>
      </section>

      {finals.length > 0 && (
        <section className="cbbhome__sec" aria-labelledby="cb-fin-h">
          <div className="phead"><h2 className="phead__t phead__t--serif" id="cb-fin-h">Recent finals</h2></div>
          <ul className="cgames">{finals.slice(0, 8).map((e) => <GameRow key={e.event_id} e={e} slug={slug} showDate />)}</ul>
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ season band (research status, compact)

function SeasonBand({ st, health, projected, upcoming }: { st: CbbStatus; health: HealthDoc; projected: number; upcoming: number }) {
  const pre = st.research_status === 'PRESEASON';
  const days = st.first_game_utc ? Math.ceil((new Date(st.first_game_utc).getTime() - Date.now()) / 86_400_000) : null;
  return (
    <section className="panel cbbstat" aria-labelledby="cb-st-h">
      <div className="cbbstat__l">
        <div className="eyebrow">College basketball · {st.season}</div>
        <h2 className="cbbstat__h" id="cb-st-h">{pre ? 'Preseason: the prospective experiment is armed' : 'Prospective evaluation in progress'}</h2>
        <p className="muted">
          {pre
            ? <>First tip {DAY(st.first_game_utc)}{days != null && days > 0 ? <> — <b className="cbbstat__cd">{days} {days === 1 ? 'day' : 'days'}</b> away</> : null}. Projections are archived by the frozen pipeline within 30 hours of each tip; none exists yet, and none is made early. <TermInfo k="cbb_capture_window" /></>
            : <>{projected} of {upcoming} upcoming games carry a pre-tip projection; {st.games_in_capture_window} tip within the next 30 hours.</>}
        </p>
      </div>
      <dl className="cbbstat__kv">
        <div><dt>Schedule</dt><dd><b className="num">{st.schedule.d1_games.toLocaleString()}</b> D-I games</dd></div>
        <div><dt>Prospective sample</dt><dd><b className="num">N = {st.prospective.game_1.N}</b> game 1</dd></div>
        <div><dt>Bet authority</dt><dd>{health.bet_authority === 'RESEARCH_ONLY' ? 'Research only' : health.bet_authority}</dd></div>
        <div><dt>Markets</dt><dd>{st.markets.published ? `${st.markets.published} contracts` : 'not published'}</dd></div>
      </dl>
    </section>
  );
}

// ------------------------------------------------------------------ marquee

function MarqueeCard({ e, slug }: { e: EventDoc; slug: string }) {
  const c = eventExt(e)!;
  const home = e.participants.find((p) => p.participant_id === e.home_participant);
  const away = e.participants.find((p) => p.participant_id === e.away_participant);
  const hn = teamShort(home);
  const an = teamShort(away);
  const p = c.primary;
  const row = (pp: typeof home, name: string, score: number | null | undefined) => (
    <span className="cmq__t">
      <CbbMark p={pp} size="lg" />
      <span className="cmq__n"><b>{name}</b><span>{teamConf(pp?.participant_id) ?? ''}</span></span>
      {score != null && <span className="cmq__s num">{fmt1(score)}</span>}
    </span>
  );
  return (
    <li>
      <Link to={routes.game(slug, e.event_id)} className="cmq__a" aria-label={`${an} ${c.neutral_site ? 'versus' : 'at'} ${hn}, ${tipLabel(e.start_time_utc, c)}`}>
        <span className="cmq__top">
          <span className={c.tbd ? 'cmq__tbd' : ''}>{tipLabel(e.start_time_utc, c)}</span>
          {c.event_name ? <span className="cmq__ev">{c.event_name}</span> : c.neutral_site ? <span className="cmq__ev">Neutral site</span> : c.conference_game ? <span className="cmq__ev cmq__ev--conf">Conference game</span> : null}
        </span>
        {row(away, an, p?.away_score)}
        {row(home, hn, p?.home_score)}
        <span className="cmq__foot">
          {p ? <span className="cmq__proj">Projected · {marginWords(p.margin, hn, an)}</span> : <span className="cmq__pend"><Icon name="clock" size={12} /> <StateLine state={c.projection_state} compact /></span>}
          {(c.roster_confidence.home !== 'CONFIRMED' || c.roster_confidence.away !== 'CONFIRMED') && (
            <ConfidenceChip c={c.roster_confidence.away !== 'CONFIRMED' ? c.roster_confidence.away : c.roster_confidence.home} team={c.roster_confidence.away !== 'CONFIRMED' ? an : hn} />
          )}
        </span>
      </Link>
    </li>
  );
}

// ------------------------------------------------------------------ national picture (published rankings)

const CARDS: { slug: string; list: 'top' | 'bottom'; title: string; group: 'ratings' | 'roster' }[] = [
  { slug: 'adj_off', list: 'top', title: 'Best adjusted offense', group: 'ratings' },
  { slug: 'adj_def', list: 'top', title: 'Best adjusted defense', group: 'ratings' },
  { slug: 'adj_tempo', list: 'top', title: 'Fastest adjusted pace', group: 'ratings' },
  { slug: 'returning_minutes_share', list: 'top', title: 'Most returning minutes', group: 'roster' },
  { slug: 'returning_minutes_share', list: 'bottom', title: 'Fewest returning minutes', group: 'roster' },
  { slug: 'expected_transfer_minutes', list: 'top', title: 'Most minutes to transfers', group: 'roster' },
  { slug: 'expected_first_d1_minutes', list: 'top', title: 'Most minutes to first-D-I players', group: 'roster' },
];

function NationalPicture({ st, slug }: { st: CbbStatus; slug: string }) {
  const { metrics } = useSport();
  const L = st.leaders ?? {};
  const ratings = CARDS.filter((c) => c.group === 'ratings' && L[c.slug]);
  const roster = CARDS.filter((c) => c.group === 'roster' && L[c.slug]);
  const card = (c: (typeof CARDS)[number]) => <LeaderCard key={`${c.slug}-${c.list}`} title={c.title} l={L[c.slug]} list={c.list} slug={slug} fmt={metricFormatter(metrics.get(L[c.slug].metric_id), Math.abs(L[c.slug].top[0]?.value ?? 1))} />;
  const otherRatings = [...metrics.values()].filter((m) => (m.extensions as { cbb?: { group?: string } } | undefined)?.cbb?.group === 'ratings');
  return (
    <section className="cbbhome__sec" aria-labelledby="cb-np-h">
      <div className="phead">
        <h2 className="phead__t phead__t--serif" id="cb-np-h">National picture</h2>
        <span className="phead__sub">Straight from the published D-I rankings — nothing re-ranked or combined</span>
      </div>
      {ratings.length > 0 ? (
        <>
          <div className="eyebrow cbbhome__grp">Opponent-adjusted ratings <span className="ctag ctag--adj">adjusted</span></div>
          <div className="cldr">{ratings.map(card)}</div>
        </>
      ) : (
        <p className="cbbhome__note"><Icon name="info" size={13} /> Opponent-adjusted ratings ({otherRatings.length || 17} metrics) publish their national rankings with the first archived projections in November. Until then, the national picture is roster construction.</p>
      )}
      {roster.length > 0 && (
        <>
          <div className="eyebrow cbbhome__grp">Roster storylines <span className="ctag">roster truth · not opponent-adjusted</span></div>
          <div className="cldr">{roster.map(card)}</div>
        </>
      )}
      {!ratings.length && !roster.length && <p className="muted">No national ranking is published yet.</p>}
    </section>
  );
}

function LeaderCard({ title, l, list, slug, fmt }: { title: string; l: CbbLeaders; list: 'top' | 'bottom'; slug: string; fmt: (v: number | null) => string }) {
  const rows = l[list];
  const lead = rows[0];
  const vals = [...l.top, ...l.bottom].map((e) => e.value).filter((v): v is number => v != null);
  const lo = Math.min(...vals, 0);
  const hi = Math.max(...vals);
  const w = (v: number | null) => (v == null || hi === lo ? 0 : ((v - lo) / (hi - lo)) * 100);
  if (!lead) return null;
  return (
    <article className="cldr__c">
      <header className="cldr__h">
        <h3>{title}</h3>
        <Link to={routes.ranking(slug, l.ranking_id)} className="cldr__all">All {l.universe_size} <Icon name="arrowRight" size={12} /></Link>
      </header>
      <Link to={routes.team(slug, lead.entity_id)} className="cldr__lead">
        <TeamLogo pid={lead.entity_id} abbr={lead.short_name} size={44} />
        <span className="cldr__ln"><b>{identity(lead.entity_id)?.name ?? lead.display_name}</b><span>{l.name} · #{lead.rank}</span></span>
        <span className="cldr__lv num">{fmt(lead.value)}</span>
      </Link>
      <ol className="cldr__list">
        {rows.slice(1).map((e) => (
          <li key={e.entity_id}>
            <Link to={routes.team(slug, e.entity_id)} className="cldr__r">
              <span className="cldr__rk num">{e.rank}</span>
              <TeamLogo pid={e.entity_id} abbr={e.short_name} size={20} />
              <span className="cldr__nm">{identity(e.entity_id)?.name ?? e.display_name}</span>
              <span className="cldr__bar" aria-hidden="true"><i style={{ width: `${w(e.value)}%` }} /></span>
              <span className="cldr__v num">{fmt(e.value)}</span>
            </Link>
          </li>
        ))}
      </ol>
      {l.mean != null && <p className="cldr__mean">D-I mean {fmt(l.mean)}</p>}
    </article>
  );
}

// ------------------------------------------------------------------ conferences

function Conferences({ slug, events }: { slug: string; events: EventDoc[] }) {
  const confs = useMemo(() => {
    const by = new Map<string, { teams: string[]; games: number }>();
    for (const t of allTeams()) {
      const k = confShort(t.conference);
      if (!k) continue;
      const g = by.get(k) ?? { teams: [], games: 0 };
      g.teams.push(t.pid);
      by.set(k, g);
    }
    for (const e of events) for (const k of new Set([teamConf(e.home_participant), teamConf(e.away_participant)])) if (k && by.has(k)) by.get(k)!.games++;
    return [...by.entries()].sort((a, b) => b[1].games - a[1].games || a[0].localeCompare(b[0]));
  }, [events]);
  if (!confs.length) return null;
  return (
    <section className="cbbhome__sec" aria-labelledby="cb-cf-h">
      <div className="phead">
        <h2 className="phead__t phead__t--serif" id="cb-cf-h">Conferences</h2>
        <span className="phead__sub">{confs.length} D-I conferences · open one to see its games on the slate</span>
      </div>
      <ul className="cconfs">
        {confs.map(([k, g]) => (
          <li key={k}>
            <Link to={`${routes.slate(slug)}?conf=${encodeURIComponent(k)}`} className="cconfs__a">
              <span className="cconfs__logos" aria-hidden="true">{g.teams.slice(0, 3).map((pid) => <TeamLogo key={pid} pid={pid} size={20} />)}</span>
              <span className="cconfs__n">{k}</span>
              <span className="cconfs__c num">{g.teams.length} teams · {g.games} games</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ research status

function Models({ st }: { st: CbbStatus }) {
  return (
    <section className="panel" aria-labelledby="cb-md-h">
      <div className="phead"><h3 className="phead__t" id="cb-md-h">Model status</h3></div>
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
  const minN = st.prospective.min_n_for_inference;
  return (
    <section className="panel" aria-labelledby="cb-pr-h">
      <div className="phead"><h3 className="phead__t" id="cb-pr-h">Prospective evaluation</h3></div>
      <p className="cbbn"><b className="num">N = {g.N}</b> <span className="muted">game-1 observations</span></p>
      {minN > 0 && (
        <div className="cprog" role="img" aria-label={`${g.N} of the ${minN} games the protocol requires before inference`}>
          <span className="cprog__t"><i style={{ width: `${Math.min(100, (g.N / minN) * 100)}%` }} /></span>
          <span className="cprog__l muted small">{g.N} / {minN} games before any inference</span>
        </div>
      )}
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
          {!st.prospective.inference_allowed && <p className="muted small">{g.N} game-1 observations · insufficient sample for inference (the locked minimum is {minN} games over {st.prospective.min_days_for_inference} days). Not proof of anything.</p>}
        </>
      )}
      <p className="muted small">Protocol: {st.prospective.protocol ?? '—'}. Research transparency, not a track record.</p>
    </section>
  );
}

const CONF_CLS: Record<string, string> = { CONFIRMED: 'ok', LIKELY: 'mid', CONFLICTED: 'warn', STALE: 'warn2', UNKNOWN: 'unk' };

function Readiness({ st }: { st: CbbStatus }) {
  const c = st.roster_readiness.counts;
  const total = CONFIDENCE_ORDER.reduce((a, k) => a + (c[k] ?? 0), 0);
  return (
    <section className="panel" aria-labelledby="cb-rr-h">
      <div className="phead"><h3 className="phead__t" id="cb-rr-h">Roster readiness <TermInfo k="cbb_roster_confidence" /></h3></div>
      {total > 0 && (
        <div className="cready__bar" role="img" aria-label={CONFIDENCE_ORDER.map((k) => `${k.toLowerCase()} ${c[k] ?? 0}`).join(', ')}>
          {CONFIDENCE_ORDER.map((k) => (c[k] ? <span key={k} className={`cready__s cready__s--${CONF_CLS[k]}`} style={{ width: `${(100 * c[k]!) / total}%` }} /> : null))}
        </div>
      )}
      <ul className="cbbready">
        {CONFIDENCE_ORDER.map((k) => (
          <li key={k} title={CONFIDENCE_TEXT[k]}><ConfidenceChip c={k} /><b className="num">{c[k] ?? 0}</b></li>
        ))}
      </ul>
      <p className="muted small">Teams by roster confidence in roster-truth snapshot {st.roster_readiness.snapshot_at?.slice(0, 16).replace('T', ' ') ?? '—'} UTC. CONFIRMED: {CONFIDENCE_TEXT.CONFIRMED.toLowerCase()}</p>
    </section>
  );
}
