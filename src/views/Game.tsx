import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { PriceHistory } from '../charts/PriceHistory';
import { RangeStrip, type RangeRow } from '../charts/RangeStrip';
import type { EventResearchDoc, MatchupRow, Observation } from '../contract/types';
import { useAsync } from '../data/hooks';
import { Icon } from '../components/Icon';
import { MarketBoard, latestPrices } from '../components/MarketBoard';
import { ErrorState, Notice, QualityBadge, Skeleton, Stratum, TeamMark } from '../components/ui';
import { kickoff, pct, signed } from '../lib/format';
import { categoryLabel, CATEGORY_ORDER, MATCHUP_AREAS, windowName, statusWord } from '../lib/nfl';
import { glossLine, metricGloss } from '../lib/glossary';
import { routes } from '../lib/routes';
import { useDirectory } from '../state/directory';
import { MarketIconProvider } from '../components/MarketIcon';
import { capShown, useSport } from '../state/sport';
import { useVisit } from '../state/trail';
import { HistoricalGameView } from './HistoricalGame';
import { metricFormatter } from '../lib/format';
import { NewlyListed, QuoteSummaryChip, RefreshQuotes, useQuoteViews } from '../components/LiveQuote';
import { injuryRows, marketLabel, priceRow } from '../lib/gamedata';
import { gameScripts, scriptFit, type ScriptId } from '../lib/scripts';
import { GameHero } from './game/Hero';
import { FormPanel, H2HPanel, Info, InjuriesPanel, InjuryList, LineHistoryPanel, MarketsPanel, PanelHead, ScriptsPanel, SurvivorsPanel } from './game/panels';
import { ScriptTab } from './game/ScriptTab';
import { EngineConfidencePanel, EngineEdgesPanel, EngineMatchupTab, EngineReadPanel, EngineScriptTab, EngineScriptsPanel, EngineSurvivorsPanel } from './game/ScriptEngine';
import { GameReadV2Panel } from './game/GameReadV2';
import { CfbOverview } from './game/CfbOverview';
import { isEngine, readEngine } from '../lib/scriptEngine';
import { liveStore, useLiveQuotes, useNow } from '../live/hooks';
import { type ReactNode } from 'react';
import type { Market } from '../contract/types';
import { tickerTitle, readableNote } from '../lib/marketLabel';
import { useTeamHistory } from '../history/load';
import { qbStarts } from '../history/team';
import type { PlayerHistoryDoc, TeamHistoryDoc } from '../history/types';
import { contextNotes, nameKey, starters } from '../insights/context';
import { gameSides, type GameSides } from '../insights/game';
import { matchupInsights } from '../insights/matchups';
import { injuryNews, splitNews } from '../insights/news';
import { whatMatters } from '../insights/matters';
import { propCards, propsToWatch } from '../insights/props';
import { schemeInsights } from '../insights/scheme';
import { ContextCard, MatchupCard, SchemeCard, usePropHistories } from './game/matters';
import { CompactProps } from './game/CompactProps';
import { ScriptCompare } from './game/ScriptCompare';
import { PropsBoard } from './game/PropsBoard';
import { GameOpportunities } from './game/GameOpportunities';
import { LinesPanel, SchemeTable } from './game/lines';

import { newlyListed, overlayMarket } from '../live/overlay';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The NHL game page (views/nhl): its own chunk, so NFL never downloads it. */
const CbbGameView = lazy(() => import('./cbb/Game').then((m) => ({ default: m.CbbGameView })));
const NhlGameView = lazy(() => import('./nhl/NhlGame').then((m) => ({ default: m.NhlGameView })));
/** The MLB game page (views/mlb): the generic game parts over the board's event detail, plus Player Props. */
const MlbGameView = lazy(() => import('./mlb/MlbGame').then((m) => ({ default: m.MlbGameView })));
const SoccerMatchView = lazy(() => import('./soccer/SoccerMatch').then((m) => ({ default: m.SoccerMatchView })));
const TennisMatchView = lazy(() => import('./tennis/TennisMatch').then((m) => ({ default: m.TennisMatchView })));
const NbaGameView = lazy(() => import('./nba/NbaGame').then((m) => ({ default: m.NbaGameView })));

export function GameRoute() {
  const { eventId = '' } = useParams();
  const [sp] = useSearchParams();
  const { repo, sport } = useSport();
  const dir = useDirectory(repo);
  if (dir.loading) return <div className="page"><Skeleton lines={6} tall /></div>;
  if (!dir.data) return <div className="page"><ErrorState error={dir.error} what="the explorer index" /></div>;
  if (sport.code === 'NHL' && dir.data.hasEventResearch(eventId)) {
    return <Suspense fallback={<div className="page"><Skeleton lines={8} tall /></div>}><NhlGameView eventId={eventId} /></Suspense>;
  }
  if (sport.code === 'MLB') {
    // MLB publishes the board and each game's event detail (no football research layer): the generic game parts
    // over that detail; football-only tabs are not offered (views/mlb/MlbGame.tsx).
    return <Suspense fallback={<div className="page"><Skeleton lines={8} tall /></div>}><MlbGameView eventId={eventId} teamId={sp.get('team')} /></Suspense>;
  }
  if (sport.code === 'SOCCER' && dir.data.hasEventResearch(eventId)) {
    return <Suspense fallback={<div className="page"><Skeleton lines={8} tall /></div>}><SoccerMatchView eventId={eventId} /></Suspense>;
  }
  if (sport.code === 'TENNIS' && dir.data.hasEventResearch(eventId)) {
    return <Suspense fallback={<div className="page"><Skeleton lines={8} tall /></div>}><TennisMatchView eventId={eventId} /></Suspense>;
  }
  if (sport.code === 'NBA' && dir.data.hasEventResearch(eventId)) {
    return <Suspense fallback={<div className="page"><Skeleton lines={8} tall /></div>}><NbaGameView eventId={eventId} /></Suspense>;
  }
  if (sport.code === 'CBB') {
    if (!dir.data.hasEventResearch(eventId)) return <div className="page"><Notice title="This game has no research page">The CBB publication keeps research for games in its current window (recent results and the coming week). Nothing is reconstructed for older games.</Notice></div>;
    return <Suspense fallback={<div className="page"><Skeleton lines={8} tall /></div>}><CbbGameView eventId={eventId} /></Suspense>;
  }
  if (dir.data.hasEventResearch(eventId)) return <GameView eventId={eventId} />;
  return <HistoricalGameView eventId={eventId} teamId={sp.get('team')} />;
}

/** Market-implied vs model view for the game, from the event research extensions. */
function MarketModel({ ext, homeAbbr, awayAbbr }: { ext: any; homeAbbr: string; awayAbbr: string }) {
  const mi = ext?.market_implied;
  const mv = ext?.model_view;
  if (!mi && !mv) return null;
  const row = (label: string, a: string, b: string) => (
    <tr>
      <th scope="row">{label}</th>
      <td className="num">{a}</td>
      <td className="num">{b}</td>
    </tr>
  );
  const wp = (o: any, t: string) => (o?.[t] != null ? pct(o[t], 1) : '—');
  return (
    <div className="mm">
      <table className="mm__t">
        <thead>
          <tr>
            <th />
            <th scope="col">Market<span className="mm__sub">from Kalshi midpoints</span></th>
            <th scope="col">Sift simulation<span className="mm__sub">research evidence</span></th>
          </tr>
        </thead>
        <tbody>
          {row(`${homeAbbr} win`, wp(mi?.win_probability, homeAbbr), wp(mv?.model_win_probability, homeAbbr))}
          {row(`${awayAbbr} win`, wp(mi?.win_probability, awayAbbr), wp(mv?.model_win_probability, awayAbbr))}
          {row(`${homeAbbr} spread`, mi?.implied_spread != null ? signed(mi.implied_spread, 2) : '—', mv?.model_spread != null ? signed(mv.model_spread, 2) : '—')}
          {row('Total', mi?.implied_total_median != null ? Number(mi.implied_total_median).toFixed(2) : '—', mv?.model_total != null ? Number(mv.model_total).toFixed(2) : '—')}
          {row('Score', mi?.implied_score ? `${awayAbbr} ${mi.implied_score[awayAbbr]} – ${homeAbbr} ${mi.implied_score[homeAbbr]}` : '—', mv?.model_score ? `${awayAbbr} ${mv.model_score[awayAbbr]} – ${homeAbbr} ${mv.model_score[homeAbbr]}` : '—')}
        </tbody>
      </table>
      <p className="mm__note">
        {mi?.label && <span>{mi.label}. </span>}
        {mv?.caveat && <span>{mv.caveat} </span>}
        {mv?.model_version && <span className="muted">Model {mv.model_version}, features to {mv.feature_cutoff?.slice(0, 16).replace('T', ' ')} UTC.</span>}
      </p>
      {ext?.real_money_status && <p className="mm__auth"><Icon name="info" size={14} /> {ext.real_money_status}</p>}
    </div>
  );
}

/**
 * Each offense against the defense it faces, from the publication's opponent-adjusted ratings. Every
 * team's bar sits under its own label and grows with its strength (league rank, direction-aware), so
 * the picture can never contradict the labels. No combined "advantage" number is drawn: the
 * publication's advantage_to_offense subtracts a defensive rating that is already "allowed above
 * average", which reverses the defense's effect (docs/MATCHUP_MATH.md). Ranks only, until it is fixed.
 */
function MatchupBoard({ ext, r, slug, homeId, awayId, homeAbbr, awayAbbr, sportCode }: { ext: any; r: EventResearchDoc; slug: string; homeId: string; awayId: string; homeAbbr: string; awayAbbr: string; sportCode: string }) {
  const pairs = (ext?.matchup_pairs ?? []) as { matchup: string; offense: string; defense: string; offense_rating: number; defense_rating: number }[];
  if (!pairs.length) return null;
  const obs = new Map<string, Observation>();
  for (const m of r.matchup) {
    if (m.home) obs.set(`${m.metric_id}|${homeAbbr}`, m.home);
    if (m.away) obs.set(`${m.metric_id}|${awayAbbr}`, m.away);
  }
  const idOf = (abbr: string) => (abbr === homeAbbr ? homeId : awayId);
  const strength = (o: Observation | undefined) => (o?.context?.rank != null && o.context.universe_size ? (o.context.universe_size - o.context.rank + 1) / o.context.universe_size : 0);
  const block = (off: string, def: string) => (
    <div className="mb__block" key={off}>
      <div className="mb__bh">
        <span className={`mb__side mb__side--off mb__side--${off === homeAbbr ? 'home' : 'away'}`}><TeamMark sport={sportCode} abbr={off} size="sm" /> {off} offense</span>
        <span className="mb__vs">vs</span>
        <span className={`mb__side mb__side--def mb__side--${def === homeAbbr ? 'home' : 'away'}`}>{def} defense <TeamMark sport={sportCode} abbr={def} size="sm" /></span>
      </div>
      <ol className="mb__rows">
        {MATCHUP_AREAS.map((a) => {
          const p = pairs.find((x) => x.matchup === a.name && x.offense === off);
          if (!p) return null;
          const oo = obs.get(`${a.offense}|${off}`);
          const dd = obs.get(`${a.defense}|${def}`);
          const so = strength(oo);
          const sd = strength(dd);
          const rk = (o: Observation | undefined) => (o?.context?.rank != null ? `#${o.context.rank}` : '—');
          return (
            <li key={a.name} className="mb__row">
              <Link className="mb__cell mb__cell--off" to={routes.metric(slug, a.offense, { team: idOf(off), opp: idOf(def), event: r.event.event_id })} aria-label={`${off} ${a.label.toLowerCase()} offense: ranked ${rk(oo)} of 32, rating ${signed(p.offense_rating, 3)}`}>
                <span className="mb__rank num">{rk(oo)}</span>
                <span className="mb__val num">{signed(p.offense_rating, 3)}</span>
                <span className={`mb__bar mb__bar--off mb__bar--${off === homeAbbr ? 'home' : 'away'}`} aria-hidden="true"><span style={{ width: `${Math.round(so * 100)}%` }} /></span>
              </Link>
              <span className="mb__area">{a.label}</span>
              <Link className="mb__cell mb__cell--def" to={routes.metric(slug, a.defense, { team: idOf(def), opp: idOf(off), event: r.event.event_id })} aria-label={`${def} ${a.label.toLowerCase()} defense: ranked ${rk(dd)} of 32, rating ${signed(p.defense_rating, 3)}`}>
                <span className={`mb__bar mb__bar--def mb__bar--${def === homeAbbr ? 'home' : 'away'}`} aria-hidden="true"><span style={{ width: `${Math.round(sd * 100)}%` }} /></span>
                <span className="mb__val num">{signed(p.defense_rating, 3)}</span>
                <span className="mb__rank num">{rk(dd)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
  return (
    <div className="mb">
      <p className="mb__key">
        League rank of 32 for each unit, opponent-adjusted. A longer bar is a stronger unit — on its own side.
        Ratings are deviations from the league mean; for defenses they are what the unit allows, so lower is better.
        <Info label="Why there is no single edge number">
          The publication's <b>advantage_to_offense</b> is offense − defense. Its defensive ratings are already &ldquo;allowed above average&rdquo;
          (lower is better), so subtracting them rewards the offense for facing a <i>good</i> defense. Under the rating model
          (y = league mean + offense + defense allowed) the two would add. Sift shows the ranks and leaves the combined figure out until
          the publication corrects it.
        </Info>
      </p>
      <div className="mb__grid">
        {block(awayAbbr, homeAbbr)}
        {block(homeAbbr, awayAbbr)}
      </div>
    </div>
  );
}

/** Both teams on every published matchup metric, side by side by league rank. */
function MatchupTable({ rows, metrics, slug, homeId, awayId, homeAbbr, awayAbbr, eventId }: { rows: MatchupRow[]; metrics: Map<string, any>; slug: string; homeId: string; awayId: string; homeAbbr: string; awayAbbr: string; eventId: string }) {
  const [cat, setCat] = useState<string>('all');
  const cats = [...new Set(rows.map((r) => metrics.get(r.metric_id)?.category ?? 'other'))].sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));
  const shown = rows.filter((r) => cat === 'all' || (metrics.get(r.metric_id)?.category ?? 'other') === cat);
  return (
    <div className="mt">
      <div className="mt__bar">
        <div className="seg" role="tablist" aria-label="Metric categories">
          <button type="button" role="tab" aria-selected={cat === 'all'} className={`seg__b${cat === 'all' ? ' is-on' : ''}`} onClick={() => setCat('all')}>All metrics <span className="seg__n">{rows.length}</span></button>
          {cats.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={cat === c} className={`seg__b${cat === c ? ' is-on' : ''}`} onClick={() => setCat(c)}>
              {categoryLabel(c)}
            </button>
          ))}
        </div>
        <Info label="What these metrics mean" align="end">
          {shown.map((r) => {
            const line = glossLine(metricGloss(r.metric_id, metrics.get(r.metric_id)));
            return line ? <span key={r.metric_id}><b>{metrics.get(r.metric_id)?.short_name ?? r.name}:</b> {line}</span> : null;
          })}
        </Info>
      </div>
      <div className="mt__head" aria-hidden="true">
        <span className="mt__ta">{awayAbbr}</span>
        <span>league rank of 32 (#1 = best for that job) · raw value beside it · tap a metric for the full comparison</span>
        <span className="mt__th">{homeAbbr}</span>
      </div>
      <ul className="mt__rows">
        {shown.map((r) => {
          const def = metrics.get(r.metric_id);
          const scale = Math.max(Math.abs(r.home?.context?.best_value ?? 0), Math.abs(r.home?.context?.worst_value ?? 0));
          const fmt = metricFormatter(def, scale);
          const strength = (c: { rank: number | null; universe_size: number | null; higher_is_better: boolean | null } | null | undefined) =>
            c?.rank != null && c.universe_size && c.higher_is_better !== null ? ((c.universe_size - c.rank + 1) / c.universe_size) * 100 : null;
          const pa = strength(r.away?.context);
          const ph = strength(r.home?.context);
          return (
            <li key={r.metric_id}>
              <Link to={routes.metric(slug, r.metric_id, { team: homeId, opp: awayId, event: eventId })} className="mt__row">
                <span className="mt__v mt__v--away">
                  <span className="mt__rk mt__rk--big num">{r.away?.context?.rank != null ? `#${r.away.context.rank}` : '—'}</span>
                  <span className="num mt__raw">{fmt(r.away?.value)}</span>
                </span>
                <span className="mt__bars">
                  <span className="mt__half mt__half--away"><span style={{ width: `${pa ?? 0}%` }} /></span>
                  <span className="mt__name" title={glossLine(metricGloss(r.metric_id, def)) ?? undefined}>{def?.short_name ?? r.name}</span>
                  <span className="mt__half mt__half--home"><span style={{ width: `${ph ?? 0}%` }} /></span>
                </span>
                <span className="mt__v mt__v--home">
                  <span className="num mt__raw">{fmt(r.home?.value)}</span>
                  <span className="mt__rk mt__rk--big num">{r.home?.context?.rank != null ? `#${r.home.context.rank}` : '—'}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {rows[0]?.note && <p className="muted small">{rows[0].note}. Window: {windowName(rows[0].home?.window.label ?? rows[0].away?.window.label)}.</p>}
    </div>
  );
}

function Environment({ ext, homeAbbr, awayAbbr }: { ext: any; homeAbbr: string; awayAbbr: string }) {
  const gsi = ext?.game_script_inputs;
  const ge = gsi?.game_environment;
  if (!ge) return null;
  const f1 = (v: number) => v.toFixed(1);
  const fs = (v: number) => signed(v, 1);
  const rows: RangeRow[] = [
    { label: 'Total points', mean: ge.total?.mean ?? null, r50: ge.total?.range_50 ?? null, r90: ge.total?.range_90 ?? null, market: ge.centre?.total ?? null, format: f1 },
    { label: `${homeAbbr} margin`, mean: ge.home_margin?.mean ?? null, r50: ge.home_margin?.range_50 ?? null, r90: ge.home_margin?.range_90 ?? null, market: ge.centre?.home_margin ?? null, format: fs },
    { label: `${homeAbbr} points`, mean: ge.home_points?.mean ?? null, r50: ge.home_points?.range_50 ?? null, r90: ge.home_points?.range_90 ?? null, market: gsi?.market_baseline?.score?.[homeAbbr] ?? null, format: f1 },
    { label: `${awayAbbr} points`, mean: ge.away_points?.mean ?? null, r50: ge.away_points?.range_50 ?? null, r90: ge.away_points?.range_90 ?? null, market: gsi?.market_baseline?.score?.[awayAbbr] ?? null, format: f1 },
  ];
  const tv = gsi?.team_volume ?? {};
  const vol = (t: string, k: string) => tv?.[t]?.[k];
  return (
    <div className="env">
      <RangeStrip rows={rows} caption="Simulated game environment versus the market centre" />
      <div className="env__probs">
        {ge.p_home_win != null && <span><b className="num">{pct(ge.p_home_win, 1)}</b> {homeAbbr} win (sim)</span>}
        {ge.p_one_score != null && <span><b className="num">{pct(ge.p_one_score, 1)}</b> one-score game</span>}
        {ge.p_blowout_17plus != null && <span><b className="num">{pct(ge.p_blowout_17plus, 1)}</b> 17+ blowout</span>}
      </div>
      <table className="dtable env__vol">
        <caption>Simulated team volume (mean, 50% range)</caption>
        <thead><tr><th /><th scope="col">{awayAbbr}</th><th scope="col">{homeAbbr}</th></tr></thead>
        <tbody>
          {[['plays', 'Plays'], ['dropbacks', 'Dropbacks'], ['pass_att', 'Pass attempts'], ['designed_rush', 'Designed rushes'], ['pass_rate', 'Pass rate']].map(([k, l]) => (
            <tr key={k}>
              <th scope="row">{l}</th>
              {[awayAbbr, homeAbbr].map((t) => {
                const v = vol(t, k);
                return (
                  <td key={t} className="num">
                    {v?.mean != null ? (k === 'pass_rate' ? pct(v.mean, 1) : v.mean.toFixed(1)) : '—'}
                    {v?.range_50 && <span className="muted"> ({k === 'pass_rate' ? v.range_50.map((x: number) => pct(x, 0)).join('–') : v.range_50.join('–')})</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        {gsi?.authority} Source: {gsi?.script_source}. Not simulated: {(gsi?.not_simulated ?? []).join(', ')}.
      </p>
    </div>
  );
}

function Unusual({ r, ext, slug, known }: { r: EventResearchDoc; ext: any; slug: string; known: Map<string, Market> }) {
  const questions = (r.context?.notes ?? []).filter((n) => n.startsWith('packet key question:')).map((n) => n.replace('packet key question: ', ''));
  const moves = (ext?.game_script_inputs?.market_baseline?.game_line_moves ?? []) as { family: string; move: number; ticker: string; player_name: string | null }[];
  if (!questions.length && !moves.length) return null;
  return (
    <div className="unusual">
      {questions.length > 0 && (
        <ol className="unusual__q">
          {questions.map((q) => (
            <li key={q}>{readableNote(q, known)}</li>
          ))}
        </ol>
      )}
      {moves.length > 0 && (
        <div className="unusual__moves">
          <div className="eyebrow">Largest price moves since first capture</div>
          <ul>
            {moves.map((m) => (
              <li key={m.ticker}>
                <Link to={routes.market(slug, `mkt_kalshi_${m.ticker}`, r.event.event_id)} className="mrow">
                  <span className="mrow__d">{tickerTitle(m.ticker, known)}</span>
                  <span className={`mrow__p num ${m.move > 0 ? 'up' : 'down'}`}>{m.move > 0 ? '▲' : '▼'} {Math.abs(Math.round(m.move * 1000) / 10)}¢</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted small">Questions and moves are written by the repository's handicap packet; Sift links them to the evidence.</p>
    </div>
  );
}

function Players({ r, slug, sportCode, homeAbbr, awayAbbr, homeId }: { r: EventResearchDoc; slug: string; sportCode: string; homeAbbr: string; awayAbbr: string; homeId: string }) {
  const lineups = r.context?.lineups ?? [];
  const injuries = r.context?.injuries ?? [];
  const keyDist = (pid: string) => {
    const ds = r.distributions.filter((d) => d.entity_id === pid && d.metric_id);
    const pref = ['met_nfl.sim_passing_yards', 'met_nfl.sim_rushing_yards', 'met_nfl.sim_receiving_yards', 'met_nfl.sim_receptions'];
    return ds.sort((a, b) => (pref.indexOf(a.metric_id) + 99) % 99 - ((pref.indexOf(b.metric_id) + 99) % 99))[0];
  };
  const team = (tid: string, abbr: string) => {
    const ps = r.players.filter((p) => p.team_id === tid);
    const order = ['QB', 'RB', 'WR', 'TE'];
    ps.sort((a, b) => order.indexOf(a.role ?? '') - order.indexOf(b.role ?? '') || a.display_name.localeCompare(b.display_name));
    return (
      <div className="pl__team">
        <div className="pl__th"><TeamMark sport={sportCode} abbr={abbr} size="sm" /> {abbr}</div>
        <ul className="pl__list">
          {ps.map((p) => {
            const d = keyDist(p.participant_id);
            const depth = lineups.find((l: any) => l.player === p.display_name) as any;
            const inj = injuries.find((i) => i.detail?.startsWith(p.display_name + ' ('));
            return (
              <li key={p.participant_id}>
                <Link to={routes.player(slug, p.participant_id)} className="pl__row">
                  <span className="pl__pos">{p.role}</span>
                  <span className="pl__name">{p.display_name}</span>
                  {inj && inj.status !== 'ACTIVE' && <span className={`pl__inj pl__inj--${inj.status.toLowerCase()}`}>{statusWord(inj.status)}</span>}
                  {depth?.depth_chart_order != null && <span className="pl__depth">{depth.slot ?? depth.position}{depth.depth_chart_order}</span>}
                  {d && <span className="pl__proj"><span className="num">{d.mean?.toFixed(1)}</span> {d.label.split(' ').slice(-2).join(' ')}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };
  const awayId = r.participants.find((p) => p.home_away === 'AWAY')?.participant_id ?? '';
  const qbs = r.players.filter((p) => p.role === 'QB');
  return (
    <div className="pl">
      <div className="pl__grid">
        {team(awayId, awayAbbr)}
        {team(homeId, homeAbbr)}
      </div>
      {qbs.length === 2 && (
        <Link className="btn btn--ghost btn--sm" to={routes.compare(slug, qbs[0].participant_id, qbs[1].participant_id)}>
          <Icon name="compare" size={14} /> Compare {qbs[0].display_name} and {qbs[1].display_name}
        </Link>
      )}
      <p className="muted small">Projections are the repository's coherent simulation (RESEARCH: projectable, not yet validated). Depth order is the Sleeper depth chart — a stated intention, not measured snaps.</p>
    </div>
  );
}

function Availability({ r }: { r: EventResearchDoc }) {
  const inj = (r.context?.injuries ?? []).filter((i) => i.status !== 'ACTIVE');
  if (!inj.length) return <p className="muted">No non-active availability records for this game.</p>;
  const order = ['OUT', 'DOUBTFUL', 'QUESTIONABLE', 'PROBABLE'];
  inj.sort((a, b) => (order.indexOf(a.status) + 9) % 9 - ((order.indexOf(b.status) + 9) % 9));
  return (
    <ul className="avail">
      {inj.map((i, k) => (
        <li key={k} className="avail__row">
          <span className={`pl__inj pl__inj--${i.status.toLowerCase()}`}>{statusWord(i.status)}</span>
          <span className="avail__d">{i.detail}</span>
          <span className="avail__src">{i.source} · {i.as_of?.slice(5, 16).replace('T', ' ')}</span>
        </li>
      ))}
    </ul>
  );
}

export function Movement({ eventId, path, prices, kickoffIso, known }: { eventId: string; path: string | null; prices: Map<string, any>; kickoffIso: string; known: Map<string, Market> }) {
  const { repo } = useSport();
  const hist = useAsync(path ? `mh:${repo.sport.code}:${eventId}` : null, () => repo.marketHistory(eventId));
  const [ticker, setTicker] = useState<string | null>(null);
  if (!path) return <p className="muted">No market history published for this game.</p>;
  if (hist.loading) return <Skeleton lines={3} />;
  if (!hist.data) return <ErrorState error={hist.error} what="market history" />;
  const series = hist.data.series;
  const sel = series.find((s) => s.kalshi_ticker === ticker) ?? series[0];
  if (!sel) return null;
  return (
    <div className="mov">
      <label className="mov__pick">
        <span className="sr-only">Contract</span>
        <select value={sel.kalshi_ticker} onChange={(e) => setTicker(e.target.value)}>
          {series.map((s) => (
            <option key={s.kalshi_ticker} value={s.kalshi_ticker}>{tickerTitle(s.kalshi_ticker, known)} ({s.points.length} captures)</option>
          ))}
        </select>
      </label>
      <PriceHistory points={sel.points} fair={prices.get(sel.market_id)?.fair_probability ?? null} kickoff={kickoffIso} title={`${tickerTitle(sel.kalshi_ticker, known)} price history`} />
      <p className="muted small">
        {hist.data.quality.coverage}. <QualityBadge quality={hist.data.quality} /> <Link to={routes.market(repo.sport.slug, sel.market_id, eventId)}>Open this contract →</Link>
      </p>
    </div>
  );
}

const TABS: [GameTab, string][] = [
  ['overview', 'Overview'], ['matchup', 'Matchups'], ['script', 'Scripts'], ['props', 'Props'], ['players', 'Players'], ['markets', 'Markets'], ['trends', 'Trends'], ['injuries', 'Injuries'],
];
type GameTab = 'overview' | 'script' | 'markets' | 'matchup' | 'props' | 'players' | 'trends' | 'injuries';
const SCRIPT_IDS: ScriptId[] = ['fav-big', 'fav', 'close', 'dog'];
/** Script-engine games (CFB) carry no player projections, player props research or published injury lists:
 * those tabs are not offered. */
const ENGINE_TABS = TABS.filter(([k]) => k !== 'players' && k !== 'injuries' && k !== 'props');

export function GameView({ eventId }: { eventId: string }) {
  const { sport, repo, slug, metrics, caps } = useSport();
  const [sp] = useSearchParams();
  const tab = (TABS.find(([k]) => k === sp.get('tab'))?.[0] ?? 'overview') as GameTab;
  const selected = (SCRIPT_IDS.find((x) => x === sp.get('script')) ?? null) as ScriptId | null;
  const research = useAsync(`er:${sport.code}:${eventId}`, () => repo.eventResearch(eventId));
  const detail = useAsync(`ed:${sport.code}:${eventId}`, () => repo.eventDetail(eventId));
  const dir = useDirectory(repo);
  const r = research.data;
  const homeP = r?.participants.find((p) => p.home_away === 'HOME');
  const awayP = r?.participants.find((p) => p.home_away === 'AWAY');
  const homeProf = useAsync(homeP ? `prof:${sport.code}:${homeP.participant_id}` : null, () => repo.profile(homeP!.participant_id));
  const awayProf = useAsync(awayP ? `prof:${sport.code}:${awayP.participant_id}` : null, () => repo.profile(awayP!.participant_id));
  const wantsHistory = tab === 'overview' || tab === 'trends';
  const hist = useAsync(r?.market_history_path && wantsHistory ? `mh:${sport.code}:${eventId}` : null, () => repo.marketHistory(eventId));
  const teamHist = useTeamHistory(sport.code);
  const ev = r?.event;
  const short = (pid?: string | null) => ev?.participants.find((p) => p.participant_id === pid)?.short_name ?? '?';
  // The breadcrumb names the game. CFB says each school by its canonical name (the CFB data layer already set
  // display_name: "Washington State @ Utah State"), never the contract codes; other sports keep their short codes.
  const named = (pid?: string | null) => ev?.participants.find((p) => p.participant_id === pid)?.display_name ?? short(pid);
  const label = ev ? (sport.code === 'CFB' ? `${named(awayP?.participant_id)} @ ${named(homeP?.participant_id)}` : `${short(awayP?.participant_id)} @ ${short(homeP?.participant_id)}`) : null;
  useVisit(label, 'game');
  const prices = useMemo(() => latestPrices(detail.data?.model_prices ?? []), [detail.data]);
  const playerName = useMemo(() => (id: string | null) => (id ? dir.data?.player(id)?.label ?? null : null), [dir.data]);

  // The market clock: every contract on this game is refreshed at game cadence while the screen is
  // open, and the game's Kalshi events are re-listed at inventory cadence (new rungs, closed
  // contracts). A finished game is only checked at the slow cadence.
  const published = detail.data?.markets;
  const settledGame = r?.event.status === 'FINAL' || (r ? Date.parse(r.event.start_time_utc) < Date.now() - 8 * 3600e3 : false);
  const tickers = useMemo(() => (published ?? []).map((m) => m.kalshi_ticker), [published]);
  const events = useMemo(() => (settledGame ? [] : [...new Set((published ?? []).map((m) => m.kalshi_event_ticker).filter((e): e is string => !!e))]), [published, settledGame]);
  const live = useLiveQuotes(tickers, settledGame ? 'background' : 'game', events);
  const quoted = useMemo(() => (published ?? []).map((m) => overlayMarket(m, live.quote(m.kalshi_ticker))), [published, live]);
  const known = useMemo(() => new Map((published ?? r?.markets ?? []).map((m) => [m.kalshi_ticker, m as Market])), [published, r]);
  const views = useQuoteViews(published ?? r?.markets ?? []);
  const listedLater = useMemo(() => newlyListed(tickers, liveStore().eventQuotes(events)), [tickers, events, live.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = useNow(15_000);
  const set = useMemo(() => (r ? gameScripts(r) : null), [r]);
  const engine = useMemo(() => readEngine(r), [r]);
  const marketsByTicker = useMemo(() => new Map(quoted.map((m) => [m.kalshi_ticker, m])), [quoted]);
  const g = useMemo(() => (r ? gameSides(r) : null), [r]);
  const rows = useMemo(() => {
    if (!homeP || !awayP) return [];
    const abbrOf = (pid: string | null) => (pid ? short(pid) : null);
    return quoted.map((m) => priceRow(m, prices, marketLabel(m, abbrOf, playerName), set ? scriptFit(m, set, homeP.participant_id, awayP.participant_id) : null));
  }, [quoted, prices, set, homeP, awayP, playerName]); // eslint-disable-line react-hooks/exhaustive-deps

  // The insight layer (pure functions over the documents above; memoised per document).
  const profiles = useMemo(() => ({ home: homeProf.data, away: awayProf.data }), [homeProf.data, awayProf.data]);
  const insights = useMemo(() => (r && g ? matchupInsights(r, profiles, g) : []), [r, g, profiles]);
  const keyPlayers = useMemo(() => (r && g ? keyPlayerList(r, g) : []), [r, g]);
  const keyHist = usePropHistories(sport.code, keyPlayers);
  const context = useMemo(() => (r && g ? contextNotes(r, teamHist.data ?? null, keyHist, g) : []), [r, g, teamHist.data, keyHist]);
  const scheme = useMemo(() => schemeInsights(teamHist.data ?? null, g), [teamHist.data, g]);
  const allProps = useMemo(() => (r && detail.data ? propCards(r, detail.data.markets, g) : []), [r, detail.data, g]);
  const watch = useMemo(() => propsToWatch(allProps, 4), [allProps]);

  if (research.loading) return <div className="page"><Skeleton lines={8} tall /></div>;
  if (!r || !ev || !homeP || !awayP || !g) return <div className="page"><ErrorState error={research.error} what="this game's research" /></div>;
  const ext = r.extensions as any;
  const homeAbbr = short(homeP.participant_id);
  const awayAbbr = short(awayP.participant_id);
  const href = (t: GameTab, script: ScriptId | null = selected) => routes.game(slug, eventId, { tab: t === 'overview' ? null : t, script });
  const hrefFor = (id: ScriptId | null) => href(tab, id);
  const injuries = injuryRows(r);
  const favAbbr = set ? (set.fav === 'home' ? homeAbbr : awayAbbr) : homeAbbr;
  const abbrOf = (id: string | null) => (id === homeP.participant_id ? homeAbbr : id === awayP.participant_id ? awayAbbr : '?');
  const hasMatchup = capShown(caps, 'matchup_metrics') && (r.matchup.length > 0 || (ext?.matchup_pairs ?? []).length > 0);
  const hasEnv = capShown(caps, 'projection_distributions') && Boolean(ext?.game_script_inputs?.game_environment);
  const notes = (r.context?.notes ?? []).filter((n) => !n.startsWith('packet key question:'));
  const ctx = { r, g, slug, sport: sport.code, profiles, label: `${label}, ${kickoff(ev.start_time_utc)}` };
  // What matters: matchup edges and context notes compete on one importance scale (whatMatters), with at
  // most one scheme note; never more than five cards.
  const matters: ReactNode[] = whatMatters(insights, context, scheme).map((x) =>
    x.kind === 'context' ? <ContextCard key={x.item.id} note={x.item} ctx={ctx} /> : x.kind === 'scheme' ? <SchemeCard key={x.item.id} s={x.item} ctx={ctx} /> : <MatchupCard key={x.item.id} ins={x.item} ctx={ctx} />,
  );

  if (isEngine(engine)) {
    const engineSelected = engine.scripts.some((x) => x.script_id === sp.get('script')) ? sp.get('script') : null;
    const ehref = (t: GameTab, script: string | null = engineSelected) => routes.game(slug, eventId, { tab: t === 'overview' ? null : t, script });
    const ehrefFor = (id: string | null) => ehref(tab, id);
    const etab = ENGINE_TABS.some(([k]) => k === tab) ? tab : 'overview';
    return (
      <div className="page page--hero game game--engine">
        <GameHero r={r} homeProf={homeProf.data} awayProf={awayProf.data} sportCode={sport.code} slug={slug} now={now} />
        <nav className="ptabs gtabs" aria-label="Game sections">
          {ENGINE_TABS.map(([k, l]) => (
            <Link key={k} to={ehref(k)} aria-current={etab === k ? 'page' : undefined}>{l}</Link>
          ))}
        </nav>
        {etab === 'overview' && engine.claimsV2 && (
          // V2 games: a five-second Quick Read, the best research, and every panel below in a closed Deep Dive.
          <CfbOverview
            engine={engine} eventId={eventId} markets={quoted} participants={{ home: homeP.participant_id, away: awayP.participant_id }}
            signalsUrl={sport.researchSignalsUrl} now={now} marketsHref={ehref('markets')}
            deep={{
              read: <EngineReadPanel engine={engine} to={ehref('script')} />,
              scripts: <EngineScriptsPanel engine={engine} selected={engineSelected} hrefFor={ehrefFor} />,
              v2: <GameReadV2Panel engine={engine} />,
              survivors: <EngineSurvivorsPanel engine={engine} marketsByTicker={marketsByTicker} slug={slug} eventId={eventId} now={now} selected={engineSelected} to={ehref('script')} />,
              edges: <EngineEdgesPanel engine={engine} homeAbbr={homeAbbr} awayAbbr={awayAbbr} to={ehref('matchup')} />,
              confidence: <EngineConfidencePanel engine={engine} />,
            }}
          />
        )}
        {etab === 'overview' && !engine.claimsV2 && (
          <div className="ov ov--engine">
            <EngineReadPanel engine={engine} to={ehref('script')} />
            <EngineScriptsPanel engine={engine} selected={engineSelected} hrefFor={ehrefFor} />
            <EngineSurvivorsPanel engine={engine} marketsByTicker={marketsByTicker} slug={slug} eventId={eventId} now={now} selected={engineSelected} to={ehref('script')} />
            <EngineEdgesPanel engine={engine} homeAbbr={homeAbbr} awayAbbr={awayAbbr} to={ehref('matchup')} />
            <EngineConfidencePanel engine={engine} />
          </div>
        )}
        {etab === 'script' && (
          <EngineScriptTab engine={engine} selected={engineSelected} hrefFor={ehrefFor} marketsByTicker={marketsByTicker} slug={slug} eventId={eventId} now={now} />
        )}
        {etab === 'markets' && (
          <>
            <Stratum id="g-engine-survivors" title="Script survival" sub="Every best and multi-script expression, with the scripts it survives. Compatibility, not a probability.">
              <EngineSurvivorsPanel engine={engine} marketsByTicker={marketsByTicker} slug={slug} eventId={eventId} now={now} selected={engineSelected} limit={40} />
            </Stratum>
            <Stratum id="g-markets" title="Markets" sub={`Every Kalshi contract on this game (${detail.data?.markets.length ?? '…'}). Prices are the current quote where Sift has one, otherwise the publication's capture.`} actions={tickers.length ? <RefreshQuotes tickers={tickers} /> : undefined}>
              {detail.loading && <Skeleton lines={6} />}
              {detail.error && <ErrorState error={detail.error} what="this game's markets" />}
              {detail.data && <MarketBoard markets={quoted} prices={prices} sportSlug={slug} playerName={playerName} />}
              <NewlyListed quotes={listedLater} now={now} />
            </Stratum>
          </>
        )}
        {etab === 'matchup' && <EngineMatchupTab engine={engine} homeAbbr={homeAbbr} awayAbbr={awayAbbr} />}
        {etab === 'trends' && (
          <div className="trends">
            <LineHistoryPanel hist={hist.data} loading={hist.loading} rows={rows} favAbbr={homeAbbr} to={ehref('markets')} />
            {capShown(caps, 'market_price_history') && r.market_history_path && (
              <Stratum id="g-movement" title="Contract price history" sub="Game-level tickers, every capture since listing.">
                <Movement eventId={eventId} path={r.market_history_path} prices={prices} kickoffIso={ev.start_time_utc} known={known} />
              </Stratum>
            )}
          </div>
        )}
        <details className="gnotes">
          <summary>Publication notes & provenance</summary>
          {notes.length > 0 && <ul className="notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          <p className="small muted"><QualityBadge quality={r.quality} /> {r.quality.source} · generated {r.quality.generated_at} · {r.quality.limitations.join(' · ')}</p>
        </details>
      </div>
    );
  }

  const iconCtx = {
    abbrOf: (id: string | null) => (id === homeP.participant_id ? homeAbbr : id === awayP.participant_id ? awayAbbr : null),
    playerTeam: (id: string | null) => (id ? dir.data?.player(id)?.context.team ?? null : null),
    sport: sport.code,
  };
  const newsLead = splitNews(injuryNews(r, qbStartersFrom(teamHist.data ?? null, g), playedFn(keyHist, g.week))).lead;
  // An absence What Matters calls out (a player with a real role this season) is an injury that matters too.
  const importantInjuries = [
    ...newsLead,
    ...context
      .filter((c) => c.kind === 'key-absence' && !newsLead.some((n) => n.headline.includes(c.headline.replace(/^.+? without (QB|RB|WR|TE) /, ''))))
      .map((c) => ({ id: c.id, kind: 'injury' as const, level: 'high' as const, score: 4, team: c.team.abbr, headline: c.headline, detail: c.detail, eventId: r.event.event_id, asOf: null })),
  ];

  return (
    <MarketIconProvider value={iconCtx}>
    <div className="page game">
      <GameHero r={r} homeProf={homeProf.data} awayProf={awayProf.data} sportCode={sport.code} slug={slug} now={now} />

      <nav className="ptabs gtabs" aria-label="Game sections">
        {TABS.map(([k, l]) => (
          <Link key={k} to={href(k)} aria-current={tab === k ? 'page' : undefined}>{l}</Link>
        ))}
      </nav>

      {engine && !isEngine(engine) && (
        <Notice tone="research" title="No script engine read for this game">
          {engine.reason ?? 'The publication could not build a football matchup for this game.'} Sift shows the markets only.
        </Notice>
      )}
      {tab === 'overview' && (
        <div className="gov">
          <GameOpportunities eventId={eventId} now={now} />
          <section className="gsec" aria-labelledby="g-matters-h">
            <div className="gsec__h">
              <h2 id="g-matters-h" className="gsec__t">What Matters</h2>
              <p className="gsec__sub">The biggest matchup edges and the context behind them. Tap any card for the numbers.</p>
            </div>
            {matters.length ? <div className="mgrid">{matters}</div> : <p className="muted">No unit in this game holds a clear ranked edge over the unit it faces — an evenly matched game on the published ratings. <Link to={href('matchup')}>See every matchup →</Link></p>}
            {insights.length > 3 || matters.length >= 5 ? <p className="gsec__more"><Link to={href('matchup')}>Every matchup, scheme and metric →</Link></p> : null}
          </section>

          {set ? (
            <ScriptsPanel set={set} selected={selected} hrefFor={hrefFor} r={r} slug={slug} />
          ) : (
            <section className="panel ov-scripts"><PanelHead title="How It Could Play Out" /><p className="muted small">The publication attached no simulation script summary for this game.</p></section>
          )}

          {watch.length > 0 && <CompactProps all={allProps} ctx={ctx} slug={slug} eventId={eventId} propsHref={href('props')} />}

          <div className="gov__pair">
            <FormPanel homeProf={homeProf.data} awayProf={awayProf.data} homeAbbr={homeAbbr} awayAbbr={awayAbbr} sportCode={sport.code} before={ev.start_time_utc} slug={slug} to={href('trends')} />
            <InjuriesPanel rows={injuries} important={importantInjuries} homeAbbr={homeAbbr} awayAbbr={awayAbbr} sportCode={sport.code} to={href('injuries')} />
          </div>

          <div className="gov__pair">
            <LinesPanel r={r} homeAbbr={homeAbbr} awayAbbr={awayAbbr} to={href('markets')} views={views} now={now} />
            <LineHistoryPanel hist={hist.data} loading={hist.loading} rows={rows} favAbbr={favAbbr} to={href('trends')} />
          </div>
        </div>
      )}

      {tab === 'matchup' && (
        hasMatchup ? (
          <>
            {(insights.length > 0 || context.length > 0 || scheme.length > 0) && (
              <Stratum id="g-edges" title="Where this game tilts" sub="Every clear edge, strongest first, with the context that changes how to read it.">
                <div className="mgrid">
                  {context.map((c) => <ContextCard key={c.id} note={c} ctx={ctx} />)}
                  {insights.map((x) => <MatchupCard key={x.id} ins={x} ctx={ctx} />)}
                  {scheme.map((x) => <SchemeCard key={x.id} s={x} ctx={ctx} />)}
                </div>
              </Stratum>
            )}
            <Stratum id="g-matchup" title="Unit by unit" sub="Each offense against the defense it faces, then every published metric side by side.">
              <MatchupBoard ext={ext} r={r} slug={slug} homeId={homeP.participant_id} awayId={awayP.participant_id} homeAbbr={homeAbbr} awayAbbr={awayAbbr} sportCode={sport.code} />
              {r.matchup.length > 0 && <MatchupTable rows={r.matchup} metrics={metrics} slug={slug} homeId={homeP.participant_id} awayId={awayP.participant_id} homeAbbr={homeAbbr} awayAbbr={awayAbbr} eventId={eventId} />}
            </Stratum>
            {teamHist.data && <SchemeTable doc={teamHist.data} g={g} />}
          </>
        ) : <Notice title="No matchup metrics published for this game" />
      )}

      {tab === 'script' && (
        <>
          {set ? (
            <>
              <ScriptTab r={r} set={set} selected={selected} hrefFor={hrefFor} rows={rows} slug={slug} eventId={eventId} homeProf={homeProf.data} awayProf={awayProf.data} sportCode={sport.code} />
              <ScriptCompare set={set} rows={rows} />
              <SurvivorsPanel rows={rows} set={set} selected={selected} slug={slug} eventId={eventId} now={now} to={href('markets')} />
              {context.some((c) => c.kind === 'qb-change') && (
                <p className="gsec__note"><b>Context:</b> {context.filter((c) => c.kind === 'qb-change').map((c) => c.headline).join('; ')}. The simulation's scripts are its own; season numbers behind the matchups include those games.</p>
              )}
            </>
          ) : (
            <Notice title="No script summary for this game">The publication attached no simulation script summary, so Sift shows no scripts rather than inventing them.</Notice>
          )}
          {hasEnv && (
            <Stratum id="g-environment" title="Simulated game environment" sub="The simulation's range of outcomes against the market's centre.">
              <Environment ext={ext} homeAbbr={homeAbbr} awayAbbr={awayAbbr} />
            </Stratum>
          )}
        </>
      )}

      {tab === 'props' && (
        <PropsBoard r={r} g={g} detail={detail.data} slug={slug} sport={sport.code} label={ctx.label} loading={detail.loading} />
      )}

      {tab === 'markets' && (
        <>
          <MarketsPanel rows={rows} set={set} selected={selected} slug={slug} eventId={eventId} now={now} allHref={href('markets')} />
          {Boolean(ext?.market_implied || ext?.model_view) && (
            <Stratum id="g-market-vs-model" title="Market and simulation" sub="What the prices imply next to what Sift's simulation reconstructs.">
              <MarketModel ext={ext} homeAbbr={homeAbbr} awayAbbr={awayAbbr} />
            </Stratum>
          )}
          <Stratum id="g-markets" title="Markets" sub={`All Kalshi contracts on this game (${detail.data?.markets.length ?? '…'}). Prices are the current quote where Sift has one, otherwise the publication's capture.`} actions={<><span className="gquote"><QuoteSummaryChip views={views} now={now} /></span>{tickers.length ? <RefreshQuotes tickers={tickers} /> : null}</>}>
            {detail.loading && <Skeleton lines={6} />}
            {detail.error && <ErrorState error={detail.error} what="this game's markets" />}
            {detail.data && <MarketBoard markets={quoted} prices={prices} sportSlug={slug} playerName={playerName} />}
            <NewlyListed quotes={listedLater} now={now} />
          </Stratum>
          {(ext?.game_script_inputs?.market_baseline?.game_line_moves?.length > 0 || (r.context?.notes ?? []).some((n) => n.startsWith('packet key question:'))) && (
            <Stratum id="g-unusual" title="Open questions & price moves" sub="The publication's own questions for this game, and where prices moved.">
              <Unusual r={r} ext={ext} slug={slug} known={known} />
            </Stratum>
          )}
        </>
      )}

      {tab === 'players' && (
        r.players.length > 0 ? (
          <Stratum id="g-players" title="Players" sub="Everyone the simulation projected for this game. Open one for game-by-game history, usage and projections.">
            <Players r={r} slug={slug} sportCode={sport.code} homeAbbr={homeAbbr} awayAbbr={awayAbbr} homeId={homeP.participant_id} />
          </Stratum>
        ) : <Notice title="No player projections published for this game" />
      )}

      {tab === 'trends' && (
        <div className="trends">
          <div className="trends__grid">
            <FormPanel homeProf={homeProf.data} awayProf={awayProf.data} homeAbbr={homeAbbr} awayAbbr={awayAbbr} sportCode={sport.code} before={ev.start_time_utc} slug={slug} to={routes.team(slug, homeP.participant_id, 'results')} />
            <H2HPanel homeProf={homeProf.data} homeId={homeP.participant_id} awayId={awayP.participant_id} abbrOf={abbrOf} sportCode={sport.code} before={ev.start_time_utc} slug={slug} n={10} />
          </div>
          <LineHistoryPanel hist={hist.data} loading={hist.loading} rows={rows} favAbbr={favAbbr} to={href('markets')} />
          {capShown(caps, 'market_price_history') && r.market_history_path && (
            <Stratum id="g-movement" title="Contract price history" sub="Game-level contracts, every capture since listing.">
              <Movement eventId={eventId} path={r.market_history_path} prices={prices} kickoffIso={ev.start_time_utc} known={known} />
            </Stratum>
          )}
        </div>
      )}

      {tab === 'injuries' && (
        <Stratum id="g-availability" title="Injuries & availability" sub="What matters first; every designation below.">
          {importantInjuries.length > 0 && (
            <ul className="newsl newsl--game">
              {importantInjuries.map((n) => <li key={n.id} className={`newsl__i newsl__i--${n.level}`}><b>{n.headline}</b><span>{n.detail}</span></li>)}
            </ul>
          )}
          <div className="injcols injcols--full">
            {[awayAbbr, homeAbbr].map((t) => (
              <div key={t} className="panel injcol">
                <div className="injcol__h"><TeamMark sport={sport.code} abbr={t} size="sm" /> {t}</div>
                <InjuryList rows={injuries.filter((x) => x.team === t)} />
              </div>
            ))}
          </div>
          {injuries.some((x) => !x.team) && <Availability r={r} />}
          {injuries[0]?.asOf && <p className="muted small">Designations as of {kickoff(injuries[0].asOf)} (ESPN via the publication). They resolve at the inactive release, 90 minutes before kickoff.</p>}
        </Stratum>
      )}

      <details className="gnotes">
        <summary>Publication notes, provenance & full-game export</summary>
        {notes.length > 0 && <ul className="notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        <p className="small muted"><QualityBadge quality={r.quality} /> {r.quality.source} · generated {r.quality.generated_at} · {r.quality.limitations.join(' · ')}</p>
        {ext?.real_money_status && <p className="small muted">{ext.real_money_status}</p>}
        <p className="small"><Link to={routes.packet({ sport: slug, scope: 'GAME', event: ev.event_id })}>Export this game's full handicap packet →</Link> <span className="muted">(for specific questions, save findings with Dig deeper instead)</span></p>
      </details>
    </div>
    </MarketIconProvider>
  );
}

/** Depth-chart starters and injured skill players: the logs the context notes need. */
function keyPlayerList(r: EventResearchDoc, g: GameSides): { name: string; team: string }[] {
  const out = new Map<string, { name: string; team: string }>();
  for (const t of [g.away, g.home]) for (const s of starters(r, t.abbr)) if (s.player) out.set(`${s.player}|${t.abbr}`, { name: s.player, team: t.abbr });
  for (const i of r.context?.injuries ?? []) {
    const m = /^(.+?) \(([^,]+), ([A-Z]{2,3})\)/.exec(i.detail ?? '');
    if (m && ['QB', 'RB', 'WR', 'TE'].includes(m[2]) && i.status !== 'ACTIVE') out.set(`${m[1]}|${m[3]}`, { name: m[1], team: m[3] });
  }
  return [...out.values()];
}

/** Quarterbacks who started a game this season (team history), by name key. */
function qbStartersFrom(doc: TeamHistoryDoc | null, g: GameSides): Set<string> {
  const out = new Set<string>();
  if (!doc || g.week == null) return out;
  for (const t of [g.away, g.home]) for (const q of qbStarts(doc.teams[t.abbr]?.weeks ?? [], g.week)) out.add(nameKey(q.name));
  return out;
}

function playedFn(logs: Map<string, PlayerHistoryDoc | null>, week: number | null) {
  return (name: string, team: string | null) => {
    const l = logs.get(`${nameKey(name)}|${team}`);
    return l ? l.games.filter((x) => week == null || x.week < week).length : null;
  };
}
