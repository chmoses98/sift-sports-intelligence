import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from '../routing';
import { TrendChart } from '../charts/TrendChart';
import type { EntityProfileDoc, ModelPrice, Observation, SeriesDoc } from '../contract/types';
import { useAsync } from '../data/hooks';
import { Icon } from '../components/Icon';
import { MarketBoard } from '../components/MarketBoard';
import { MetricInfo } from '../components/Gloss';
import { ContextMeter, EntityLink, ErrorState, Notice, QualityBadge, RankPill, SaveButton, Skeleton, Stratum, TeamMark } from '../components/ui';
import { displayName, kickoff, metricFormatter, ordinal, shortDate } from '../lib/format';
import { categoryLabel, CATEGORY_ORDER, windowName, statusWord } from '../lib/nfl';
import { routes } from '../lib/routes';
import { teamColors } from '../lib/teams';
import { accentOnDark } from '../lib/hero/accent';
import { heroInputForTeam } from '../lib/hero/input';
import { resolveHero } from '../lib/hero/resolve';
import { HeroArt, heroVars } from '../components/HeroArt';
import { useDirectory } from '../state/directory';
import { capShown, useSport } from '../state/sport';
import { useVisit } from '../state/trail';
import { GameRowLink } from './HistoricalGame';
import { BasisTag, ModeToggle } from '../components/statviz';
import { basisOf, formatStat, unitLine } from '../insights/units';
import { useStatMode } from '../state/statMode';
import { TeamBasicsStratum, TeamDepthStratum, TeamSchemeStratum, CompareTeamPicker } from './stats/TeamSections';
import { footingOf, formatUnitValue, sportUnit } from '../insights/sportUnits';
import { qualityLabel } from '../lib/plainLabels';
import { FootTag, UnitWords } from '../components/StatUnit';
import { AdjRawStrength } from './stats/AdjRawStrength';

const CbbTeamView = lazy(() => import('./cbb/Team').then((m) => ({ default: m.CbbTeamView })));

/* eslint-disable @typescript-eslint/no-explicit-any */

export function nextGame(p: EntityProfileDoc) {
  return [...p.games].filter((g) => g.status === 'SCHEDULED' && g.path).sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc))[0] ?? null;
}

function scaleOf(o: Observation): number | null {
  const c = o.context;
  if (!c) return null;
  return Math.max(Math.abs(c.best_value ?? 0), Math.abs(c.worst_value ?? 0));
}

const SPORT_UNITS = new Set(['NHL', 'NBA', 'SOCCER', 'CBB']);

export function MetricRow({ o, slug, teamId, oppId, eventId, sportCode, teamLabel }: { o: Observation; slug: string; teamId: string; oppId?: string | null; eventId?: string | null; sportCode: string; teamLabel: string }) {
  const { metrics } = useSport();
  const def = metrics.get(o.metric_id);
  const ctx = o.context;
  // NHL, NBA, soccer, CBB: the publication's denominator and footing on the value (insights/sportUnits); NFL keeps its own.
  const su = SPORT_UNITS.has(sportCode) ? sportUnit(o.metric_id, def) : null;
  const fmt = su ? (v: number | null | undefined) => formatUnitValue(v, su) : metricFormatter(def, scaleOf(o));
  return (
    <li className="mrow2">
      <Link className="mrow2__main" to={routes.metric(slug, o.metric_id, { team: teamId, opp: oppId, event: eventId })}>
        <span className="mrow2__name">
          {def?.name ?? o.metric_id}
          <span className="mrow2__win">{sportCode === 'NFL' && basisOf(o) !== 'other' && <><BasisTag basis={basisOf(o) as 'adjusted' | 'raw' | 'season'} /> {unitLine(o.metric_id, def)} · </>}{su && <><FootTag f={footingOf(o.metric_id, def, o)} /> <UnitWords u={su} /> · </>}{windowName(o.window.label)}{o.split ? ` · ${o.split.value.replace(/_/g, ' ')}` : ''}</span>
        </span>
        <span className="mrow2__val num">{o.display_value ?? (sportCode === 'NFL' ? formatStat(o.metric_id, o.value, def) : fmt(o.value))}</span>
        <span className="mrow2__meter"><ContextMeter value={o.value} ctx={ctx} label={`${def?.name}: position among ${ctx?.universe_size} teams`} /></span>
        <span className="mrow2__rank">{ctx ? <RankPill rank={ctx.rank} size={ctx.universe_size} hib={ctx.higher_is_better} /> : <span className="muted small">no ranking</span>}</span>
        <span className="mrow2__q"><QualityBadge status={o.quality_status} compact /></span>
      </Link>
      <MetricInfo metricId={o.metric_id} def={def} align="end" />
      {ctx?.ranking_id && (
        <SaveButton
          compact ref_kind="RANKING" sport={sportCode} id={ctx.ranking_id}
          label={{ label: `${teamLabel} ${def?.short_name ?? o.metric_id}: ${ordinal(ctx.rank ?? 0)} of ${ctx.universe_size}`, sub: `${fmt(o.value)} · ${windowName(o.window.label)}`, href: routes.metric(slug, o.metric_id, { team: teamId, opp: oppId }) }}
        />
      )}
    </li>
  );
}

function Standouts({ obs, slug, teamId, oppId }: { obs: Observation[]; slug: string; teamId: string; oppId: string | null }) {
  const { metrics } = useSport();
  const ranked = obs.filter((o) => o.context?.rank != null && o.context.universe_size && o.context.higher_is_better !== null);
  const best = [...ranked].sort((a, b) => a.context!.rank! - b.context!.rank!).slice(0, 4);
  const worst = [...ranked].sort((a, b) => b.context!.rank! - a.context!.rank!).slice(0, 4);
  const item = (o: Observation) => (
    <li key={o.observation_id}>
      <Link to={routes.metric(slug, o.metric_id, { team: teamId, opp: oppId })} className="stand">
        <span className="stand__rank">{ordinal(o.context!.rank!)}</span>
        <span className="stand__name">{metrics.get(o.metric_id)?.name ?? o.metric_id}<span className="muted"> · {windowName(o.window.label)}</span></span>
      </Link>
    </li>
  );
  if (!ranked.length) return null;
  return (
    <div className="standouts">
      <div><div className="eyebrow eyebrow--signal">Best in the league at</div><ol>{best.map(item)}</ol></div>
      <div><div className="eyebrow eyebrow--warn">Weakest at</div><ol>{worst.map(item)}</ol></div>
    </div>
  );
}

function SeriesBlock({ s, slug, teamId, games }: { s: SeriesDoc; slug: string; teamId: string; games: EntityProfileDoc['games'] }) {
  const { metrics, repo, sport } = useSport();
  const dir = useDirectory(repo);
  const def = metrics.get(s.metric_id);
  const fmt = metricFormatter(def);
  const byEvent = new Map(games.map((g) => [g.event_id, g]));
  return (
    <div className="seriesblock">
      <div className="seriesblock__h">
        <Link to={routes.metric(slug, s.metric_id, { team: teamId })} className="seriesblock__t">{def?.name ?? s.metric_id}</Link>
        <QualityBadge quality={s.quality} />
      </div>
      <TrendChart
        points={s.points}
        format={fmt}
        unit={s.unit ?? ''}
        rollingWindow={s.rolling_window}
        title={`${def?.name ?? ''}, game by game`}
        opponentLabel={(id) => dir.data?.team(id)?.abbr ?? '?'}
        outcome={(p) => (byEvent.get(p.event_id ?? '')?.result?.outcome as 'W' | 'L' | 'T' | null) ?? null}
        renderDetail={(p) => {
          const g = byEvent.get(p.event_id ?? '');
          const opp = dir.data?.team(p.opponent_id);
          return (
            <div className="pointdetail">
              <div className="pointdetail__h">
                <b>{shortDate(p.t)}</b> · {g?.home_away === 'AWAY' ? '@' : 'vs'} {opp?.name ?? '?'} · {g?.result ? `${g.result.outcome} ${g.result.for}–${g.result.against}` : ''}
              </div>
              <div className="pointdetail__v">
                <span>{def?.short_name}: <b className="num">{fmt(p.value)}</b></span>
                <span>trailing {s.rolling_window}: <b className="num">{fmt(p.rolling_value)}</b></span>
              </div>
              <div className="pointdetail__a">
                {p.event_id && <Link className="btn btn--ghost btn--sm" to={routes.game(slug, p.event_id, { team: teamId })}>Open game <Icon name="arrowRight" size={14} /></Link>}
                {p.opponent_id && <Link className="btn btn--ghost btn--sm" to={routes.team(slug, p.opponent_id)}>{opp?.abbr} profile</Link>}
                <SaveButton
                  ref_kind="CHART_POINT" sport={sport.code} id={s.series_id}
                  extra={{ series_id: s.series_id, x: p.x, metric_id: s.metric_id, event_id: p.event_id }}
                  label={{ label: `${def?.short_name} ${fmt(p.value)} · ${p.x}`, sub: 'chart point', href: routes.game(slug, p.event_id ?? '', { team: teamId }) }}
                />
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}

const TABS = ['overview', 'metrics', 'results', 'schedule', 'players', 'markets'] as const;

/** "3–1" this season from the profile's own game references (OT/SO losses are losses; the profile carries no OTL flag). */
function seasonRecord(p: EntityProfileDoc): string | null {
  const start = `${(p.season ?? '').slice(0, 4)}-09-01`;
  const gs = p.games.filter((g) => g.start_time_utc >= start && g.result?.outcome);
  if (!gs.length) return null;
  return `${gs.filter((g) => g.result!.outcome === 'W').length}–${gs.filter((g) => g.result!.outcome === 'L').length}`;
}

export function TeamView() {
  const { sport } = useSport();
  const { teamId = '' } = useParams();
  // CBB has its own presentation adapter over the same generic profile document
  return sport.code === 'CBB' ? <Suspense fallback={<div className="page"><Skeleton lines={8} tall /></div>}><CbbTeamView teamId={teamId} /></Suspense> : <GenericTeamView teamId={teamId} />;
}

function GenericTeamView({ teamId }: { teamId: string }) {
  const [sp, setSp] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(sp.get('tab') ?? '') ? (sp.get('tab') as (typeof TABS)[number]) : 'overview';
  const { sport, repo, slug, caps, metrics } = useSport();
  const prof = useAsync(`prof:${sport.code}:${teamId}`, () => repo.profile(teamId));
  const p = prof.data;
  useVisit(p?.entity.display_name, 'team');
  const series = useAsync(p ? `series:${sport.code}:${teamId}` : null, () => Promise.all(p!.series.map((s) => repo.series(s.series_id))));
  const [mode] = useStatMode();
  const [catPick, setCat] = useState<string | null>(null);
  const cat = catPick ?? (mode === 'raw' ? 'offense' : 'opponent-adjusted');
  const [season, setSeason] = useState<string | null>(null);

  // The club's identity behind the header: its colours as light, livery and logo watermark (or its verified home-venue
  // photo), with its colour as an accent lifted only as far as 3:1 on the dark frame needs. Text never sits on raw colour.
  const heroSpec = useMemo(() => (p ? resolveHero(heroInputForTeam(sport.code, p.entity.short_name, p.entity.display_name, new Date().toISOString())) : null), [p, sport.code]);

  const prices = useMemo(() => {
    const m = new Map<string, ModelPrice>();
    for (const pr of p?.projections ?? []) {
      if (pr.market_id && pr.fair_probability != null) m.set(pr.market_id, { fair_probability: pr.fair_probability, generated_at: pr.generated_at ?? '' } as ModelPrice);
    }
    return m;
  }, [p]);

  if (prof.loading) return <div className="page"><Skeleton lines={8} tall /></div>;
  if (!p) return <div className="page"><ErrorState error={prof.error} what="this team profile" /></div>;

  const abbr = p.entity.short_name ?? '';
  const nick = displayName(p.entity.display_name).split(' ').pop() ?? abbr;
  const rec = (p.extensions as any)?.record;
  const nxt = nextGame(p);
  const oppId = nxt?.opponent_id ?? null;
  const obs = [...p.metrics, ...Object.values(p.splits ?? {}).flat()];
  const cats = [...new Set(obs.map((o) => metrics.get(o.metric_id)?.category ?? 'other'))].sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));
  const activeCat = cats.includes(cat) ? cat : cats[0];
  const seasons = [...new Set(p.games.map((g) => g.competition?.slice(0, 4) ?? ''))].sort().reverse();
  const curSeason = season ?? seasons[0];
  const basis = (p.extensions as any)?.profile_basis;
  const setTab = (t: string) => setSp((prev) => { const n = new URLSearchParams(prev); n.set('tab', t); return n; }, { replace: true });

  return (
    <div className="page team" style={{ ['--team' as string]: accentOnDark(teamColors(sport.code, abbr)) }}>
      <header className={`ehead ehead--art${heroSpec ? ` ehead--${heroSpec.kind}` : ''}`} style={heroSpec ? heroVars(heroSpec) : undefined} data-hero-kind={heroSpec?.kind}>
        {heroSpec && <div className="ehead__art" aria-hidden="true"><HeroArt spec={heroSpec} /></div>}
        <TeamMark sport={sport.code} abbr={abbr} size="lg" />
        <div className="ehead__t">
          <div className="eyebrow">
            <EntityLink to={routes.sport(slug)} kind="sport" quiet>{sport.label}</EntityLink> · Team · {p.season}
          </div>
          <h1 className="h-display">{displayName(p.entity.display_name)}</h1>
          <div className="ehead__meta">
            {rec && <span className="ehead__rec num">{rec.wins}–{rec.losses}{rec.ties ? `–${rec.ties}` : ''}</span>}
            {!rec && sport.code === 'NHL' && seasonRecord(p) && <span className="ehead__rec num" title="Wins–losses this season (overtime and shootout losses count as losses here)">{seasonRecord(p)}</span>}
            {nxt && (
              <EntityLink to={routes.game(slug, nxt.event_id)} kind="game">
                Next: {nxt.home_away === 'AWAY' ? '@' : 'vs'} {displayName(nxt.opponent_name)} · {kickoff(nxt.start_time_utc)}
              </EntityLink>
            )}
            <QualityBadge quality={p.quality} />
          </div>
        </div>
        <div className="ehead__actions">
          {sport.code === 'NFL' && <CompareTeamPicker teamId={teamId} />}
          <SaveButton ref_kind="TEAM" sport={sport.code} id={teamId} label={{ label: p.entity.display_name, sub: `${sport.label} team`, href: routes.team(slug, teamId) }} />
        </div>
        {heroSpec?.photo && (
          <Link to={`${routes.status()}#photo-credits`} className="ehead__credit">
            Photo: {heroSpec.photo.credit.artist.slice(0, 40)} · {heroSpec.photo.credit.license}
          </Link>
        )}
      </header>

      <nav className="tabs" role="tablist" aria-label="Team sections">
        {TABS.filter((t) => t !== 'markets' || p.markets.length).filter((t) => t !== 'players' || p.players.length).map((t) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} className={`tabs__b${tab === t ? ' is-on' : ''}`} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <>
          {(sport.code === 'NHL' || sport.code === 'NBA') && <AdjRawStrength sport={sport.code} p={p} slug={slug} metrics={metrics} />}
          {sport.code === 'NFL' && <TeamBasicsStratum abbr={abbr} nick={nick} />}
          <Stratum title="Where they stand out" sub={`Ranks among ${obs.find((o) => o.context)?.context?.universe_size ?? ''} teams on every published, directional metric.`}>
            <Standouts obs={obs} slug={slug} teamId={teamId} oppId={oppId} />
            {basis && (
              <p className="muted small">
                Profile basis: {basis.basis?.replace('_', ' ')} {basis.basis_season}; {basis.n_games?.season_split} games this season, {basis.n_games?.long_baseline}-game long baseline (L34).
              </p>
            )}
          </Stratum>
          {nxt && (
            <Stratum title={`${sport.code === 'NHL' ? 'Next game' : 'This week'}: ${nxt.home_away === 'AWAY' ? '@' : 'vs'} ${displayName(nxt.opponent_name)}`} sub={sport.code === 'NHL' ? 'The game page compares opponent-adjusted 5v5 strength, goaltending and the simulated game scripts.' : 'The matchup board compares both units on every adjusted rating.'}>
              <div className="cta-row">
                <Link className="btn btn--primary" to={routes.game(slug, nxt.event_id, { tab: 'matchup' })}>Open the matchup <Icon name="arrowRight" size={16} /></Link>
                {oppId && <Link className="btn btn--ghost" to={routes.team(slug, oppId)}>{displayName(nxt.opponent_name)} profile</Link>}
              </div>
            </Stratum>
          )}
          {sport.code === 'NFL' && <TeamSchemeStratum abbr={abbr} nick={nick} profile={p} />}
          {capShown(caps, 'time_series') && series.data?.[0] && (
            <Stratum title="Recent form" sub={sport.code === 'NHL' ? 'Expected-goals share by game (raw MoneyPuck, all situations), with its trailing 10-game mean. Tap a game to open it.' : 'Point margin in each of the last 40 games (points scored minus allowed), with its trailing mean. Tap a game to open it.'}>
              <SeriesBlock s={series.data.find((s) => s.metric_id.endsWith('point_margin')) ?? series.data[0]} slug={slug} teamId={teamId} games={p.games} />
            </Stratum>
          )}
          {capShown(caps, 'injuries') && p.availability.filter((a) => a.status !== 'ACTIVE').length > 0 && (
            <Stratum title="Availability" sub="Current injury designations.">
              <ul className="avail">
                {p.availability.filter((a) => a.status !== 'ACTIVE').map((a, i) => (
                  <li key={i} className="avail__row"><span className={`pl__inj pl__inj--${a.status.toLowerCase()}`}>{statusWord(a.status)}</span><span className="avail__d">{a.detail}</span></li>
                ))}
              </ul>
            </Stratum>
          )}
        </>
      )}

      {tab === 'metrics' && (
        <Stratum title="Metrics" sub="Every published observation with its comparison universe. Tap one for the full ranking and what it means.">
          {sport.code === 'NFL' && <ModeToggle className="team__mode" note={mode === 'adjusted' ? 'Opponent-adjusted ratings open first; the raw measures (last 34 games) are under Offense, Defense and Style.' : 'Raw measures open first (last 34 games); opponent-adjusted ratings have their own tab.'} />}
          <div className="seg" role="tablist" aria-label="Metric categories">
            {cats.map((c) => (
              <button key={c} type="button" role="tab" aria-selected={activeCat === c} className={`seg__b${activeCat === c ? ' is-on' : ''}`} onClick={() => setCat(c)}>
                {categoryLabel(c)} <span className="seg__n">{obs.filter((o) => (metrics.get(o.metric_id)?.category ?? 'other') === c).length}</span>
              </button>
            ))}
          </div>
          <div className="mrow2__head" aria-hidden="true"><span>Metric · window</span><span>Value</span><span>worst ← league → best</span><span>Rank</span><span /></div>
          <ul className="mrow2__list">
            {obs.filter((o) => (metrics.get(o.metric_id)?.category ?? 'other') === activeCat).map((o) => (
              <MetricRow key={o.observation_id} o={o} slug={slug} teamId={teamId} oppId={oppId} eventId={nxt?.event_id} sportCode={sport.code} teamLabel={abbr} />
            ))}
          </ul>
          <p className="muted small">Meter: the team's value placed between the league's worst and best, with ticks at the league mean (│) and median (┊).</p>
        </Stratum>
      )}

      {tab === 'results' && (
        <Stratum title="Results by game" sub="Per-game series from the nflverse schedule. Every column is a game: tap it to open that game.">
          {!capShown(caps, 'time_series') && <Notice title="Time series are not published for this sport" />}
          {series.loading && <Skeleton lines={4} tall />}
          {series.data?.map((s) => <SeriesBlock key={s.series_id} s={s} slug={slug} teamId={teamId} games={p.games} />)}
        </Stratum>
      )}

      {tab === 'schedule' && (
        <Stratum title="Schedule & results" sub={`${p.games.length} games across the last ${seasons.length} seasons.${caps.get('historical_results')?.status ? ` Results history: ${qualityLabel(caps.get('historical_results')!.status).word.toLowerCase()}.` : ''}`}>
          <div className="seg" role="tablist" aria-label="Seasons">
            {seasons.map((s) => (
              <button key={s} type="button" role="tab" aria-selected={curSeason === s} className={`seg__b${curSeason === s ? ' is-on' : ''}`} onClick={() => setSeason(s)}>{s}</button>
            ))}
          </div>
          <ol className="sched">
            {[...p.games].filter((g) => g.competition?.startsWith(curSeason)).sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc)).map((g) => (
              <li key={g.event_id}><GameRowLink g={g} slug={slug} teamId={teamId} /></li>
            ))}
          </ol>
        </Stratum>
      )}

      {tab === 'players' && sport.code === 'NFL' && <TeamDepthStratum teamId={teamId} eventId={nxt?.event_id ?? null} nick={nick} />}
      {tab === 'players' && (
        <Stratum title="Players" sub="Players the current simulation projects for this team.">
          <ul className="roster">
            {p.players.map((pl) => (
              <li key={pl.participant_id}>
                <Link to={routes.player(slug, pl.participant_id)} className="roster__row">
                  <span className="pl__pos">{pl.role}</span>
                  <span>{pl.display_name}</span>
                  <Icon name="chevronRight" size={16} />
                </Link>
              </li>
            ))}
          </ul>
          {(p.extensions as any)?.quarterbacks && (
            <p className="muted small">
              Quarterback room: {((p.extensions as any).quarterbacks as any[]).map((q) => `${q.player} (${q.status ?? 'status not listed'}, depth ${q.depth_chart_order})`).join(' · ')}
            </p>
          )}
        </Stratum>
      )}

      {tab === 'markets' && (
        <Stratum title={`${abbr} markets`} sub="Team-level contracts in the current publication. ◆ = model fair price, research evidence.">
          <MarketBoard markets={p.markets} prices={prices} sportSlug={slug} playerName={() => null} />
        </Stratum>
      )}
    </div>
  );
}
