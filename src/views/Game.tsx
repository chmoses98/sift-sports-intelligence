import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { PriceHistory } from '../charts/PriceHistory';
import { RangeStrip, type RangeRow } from '../charts/RangeStrip';
import type { EventResearchDoc, MatchupRow, Observation } from '../contract/types';
import { useAsync } from '../data/hooks';
import { Icon } from '../components/Icon';
import { MarketBoard, latestPrices } from '../components/MarketBoard';
import { ErrorState, Notice, QualityBadge, Skeleton, Stratum, TeamMark } from '../components/ui';
import { kickoff, pct, signed } from '../lib/format';
import { categoryLabel, CATEGORY_ORDER, MATCHUP_AREAS } from '../lib/nfl';
import { routes } from '../lib/routes';
import { useDirectory } from '../state/directory';
import { capShown, useSport } from '../state/sport';
import { useVisit } from '../state/trail';
import { HistoricalGameView } from './HistoricalGame';
import { metricFormatter } from '../lib/format';
import { NewlyListed, RefreshQuotes, useQuoteViews } from '../components/LiveQuote';
import { injuryRows, marketLabel, modelRead, priceRow } from '../lib/gamedata';
import { gameScripts, scriptFit, type ScriptId } from '../lib/scripts';
import { GameHero, splitName } from './game/Hero';
import { FormPanel, H2HPanel, Info, InjuriesPanel, InjuryList, LineHistoryPanel, MarketsPanel, ModelReadPanel, PanelHead, ScriptsPanel, SurvivorsPanel } from './game/panels';
import { ScriptTab } from './game/ScriptTab';
import { liveStore, useLiveQuotes, useNow } from '../live/hooks';
import { newlyListed, overlayMarket } from '../live/overlay';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function GameRoute() {
  const { eventId = '' } = useParams();
  const [sp] = useSearchParams();
  const { repo } = useSport();
  const dir = useDirectory(repo);
  if (dir.loading) return <div className="page"><Skeleton lines={6} tall /></div>;
  if (!dir.data) return <div className="page"><ErrorState error={dir.error} what="the explorer index" /></div>;
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
            <th scope="col">Market-implied<span className="mm__sub">from Kalshi midpoints</span></th>
            <th scope="col">Model view<span className="mm__sub">research evidence</span></th>
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
      <div className="seg" role="tablist" aria-label="Metric categories">
        <button type="button" role="tab" aria-selected={cat === 'all'} className={`seg__b${cat === 'all' ? ' is-on' : ''}`} onClick={() => setCat('all')}>All metrics <span className="seg__n">{rows.length}</span></button>
        {cats.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={cat === c} className={`seg__b${cat === c ? ' is-on' : ''}`} onClick={() => setCat(c)}>
            {categoryLabel(c)}
          </button>
        ))}
      </div>
      <div className="mt__head" aria-hidden="true">
        <span className="mt__ta">{awayAbbr}</span>
        <span>league rank of 32 · longer bar = better · tap a metric for the full comparison</span>
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
                  <span className="num">{fmt(r.away?.value)}</span>
                  <span className="mt__rk">{r.away?.context?.rank != null ? `#${r.away.context.rank}` : ''}</span>
                </span>
                <span className="mt__bars">
                  <span className="mt__half mt__half--away"><span style={{ width: `${pa ?? 0}%` }} /></span>
                  <span className="mt__name">{def?.short_name ?? r.name}</span>
                  <span className="mt__half mt__half--home"><span style={{ width: `${ph ?? 0}%` }} /></span>
                </span>
                <span className="mt__v mt__v--home">
                  <span className="mt__rk">{r.home?.context?.rank != null ? `#${r.home.context.rank}` : ''}</span>
                  <span className="num">{fmt(r.home?.value)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {rows[0]?.note && <p className="muted small">{rows[0].note}. Window: {rows[0].home?.window.label ?? rows[0].away?.window.label}.</p>}
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

function Unusual({ r, ext, slug }: { r: EventResearchDoc; ext: any; slug: string }) {
  const questions = (r.context?.notes ?? []).filter((n) => n.startsWith('packet key question:')).map((n) => n.replace('packet key question: ', ''));
  const moves = (ext?.game_script_inputs?.market_baseline?.game_line_moves ?? []) as { family: string; move: number; ticker: string; player_name: string | null }[];
  if (!questions.length && !moves.length) return null;
  return (
    <div className="unusual">
      {questions.length > 0 && (
        <ol className="unusual__q">
          {questions.map((q) => (
            <li key={q}>{q}</li>
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
                  <span className="mrow__d">{m.ticker}</span>
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
                  {inj && inj.status !== 'ACTIVE' && <span className={`pl__inj pl__inj--${inj.status.toLowerCase()}`}>{inj.status}</span>}
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
          <span className={`pl__inj pl__inj--${i.status.toLowerCase()}`}>{i.status}</span>
          <span className="avail__d">{i.detail}</span>
          <span className="avail__src">{i.source} · {i.as_of?.slice(5, 16).replace('T', ' ')}</span>
        </li>
      ))}
    </ul>
  );
}

function Movement({ eventId, path, prices, kickoffIso }: { eventId: string; path: string | null; prices: Map<string, any>; kickoffIso: string }) {
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
        <span className="sr-only">Ticker</span>
        <select value={sel.kalshi_ticker} onChange={(e) => setTicker(e.target.value)}>
          {series.map((s) => (
            <option key={s.kalshi_ticker} value={s.kalshi_ticker}>{s.kalshi_ticker} ({s.points.length} captures)</option>
          ))}
        </select>
      </label>
      <PriceHistory points={sel.points} fair={prices.get(sel.market_id)?.fair_probability ?? null} kickoff={kickoffIso} title={`${sel.kalshi_ticker} price history`} />
      <p className="muted small">
        {hist.data.quality.coverage}. <QualityBadge quality={hist.data.quality} /> <Link to={routes.market(repo.sport.slug, sel.market_id, eventId)}>Open this contract →</Link>
      </p>
    </div>
  );
}

const TABS: [GameTab, string][] = [
  ['overview', 'Overview'], ['script', 'Game Script'], ['markets', 'Markets'], ['matchup', 'Matchup'], ['players', 'Players'], ['trends', 'Trends'], ['injuries', 'Injuries'],
];
type GameTab = 'overview' | 'script' | 'markets' | 'matchup' | 'players' | 'trends' | 'injuries';
const SCRIPT_IDS: ScriptId[] = ['fav-big', 'fav', 'close', 'dog'];

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
  const ev = r?.event;
  const short = (pid?: string | null) => ev?.participants.find((p) => p.participant_id === pid)?.short_name ?? '?';
  const label = ev ? `${short(awayP?.participant_id)} @ ${short(homeP?.participant_id)}` : null;
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
  const views = useQuoteViews(published ?? r?.markets ?? []);
  const listedLater = useMemo(() => newlyListed(tickers, liveStore().eventQuotes(events)), [tickers, events, live.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = useNow(15_000);
  const set = useMemo(() => (r ? gameScripts(r) : null), [r]);
  const rows = useMemo(() => {
    if (!homeP || !awayP) return [];
    const abbrOf = (pid: string | null) => (pid ? short(pid) : null);
    return quoted.map((m) => priceRow(m, prices, marketLabel(m, abbrOf, playerName), set ? scriptFit(m, set, homeP.participant_id, awayP.participant_id) : null));
  }, [quoted, prices, set, homeP, awayP, playerName]); // eslint-disable-line react-hooks/exhaustive-deps

  if (research.loading) return <div className="page"><Skeleton lines={8} tall /></div>;
  if (!r || !ev || !homeP || !awayP) return <div className="page"><ErrorState error={research.error} what="this game's research" /></div>;
  const ext = r.extensions as any;
  const homeAbbr = short(homeP.participant_id);
  const awayAbbr = short(awayP.participant_id);
  const href = (t: GameTab, script: ScriptId | null = selected) => routes.game(slug, eventId, { tab: t === 'overview' ? null : t, script });
  const hrefFor = (id: ScriptId | null) => href(tab, id);
  const injuries = injuryRows(r);
  const read = modelRead(r, splitName(homeP.display_name).nick, splitName(awayP.display_name).nick, homeProf.data, awayProf.data);
  const favAbbr = set ? (set.fav === 'home' ? homeAbbr : awayAbbr) : homeAbbr;
  const abbrOf = (id: string | null) => (id === homeP.participant_id ? homeAbbr : id === awayP.participant_id ? awayAbbr : '?');
  const hasMatchup = capShown(caps, 'matchup_metrics') && (r.matchup.length > 0 || (ext?.matchup_pairs ?? []).length > 0);
  const hasEnv = capShown(caps, 'projection_distributions') && Boolean(ext?.game_script_inputs?.game_environment);
  const notes = (r.context?.notes ?? []).filter((n) => !n.startsWith('packet key question:'));

  return (
    <div className="page page--hero game">
      <GameHero r={r} homeProf={homeProf.data} awayProf={awayProf.data} sportCode={sport.code} slug={slug} sportLabel={sport.label} views={views} now={now} label={label!} />

      <nav className="ptabs gtabs" aria-label="Game sections">
        {TABS.map(([k, l]) => (
          <Link key={k} to={href(k)} aria-current={tab === k ? 'page' : undefined}>{l}</Link>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="ov">
          <ModelReadPanel r={r} read={read} homeAbbr={homeAbbr} awayAbbr={awayAbbr} to={href('script')} />
          {set ? <ScriptsPanel set={set} selected={selected} hrefFor={hrefFor} /> : <section className="panel ov-scripts"><PanelHead title="Game Scripts" /><p className="muted small">The publication attached no simulation script summary for this game.</p></section>}
          {set ? <SurvivorsPanel rows={rows} set={set} selected={selected} slug={slug} eventId={eventId} now={now} to={href('script')} /> : <section className="panel ov-surv"><PanelHead title="Bets That Survive Multiple Scripts" /><p className="muted small">Needs the simulation's script summary.</p></section>}
          <MarketsPanel rows={rows} set={set} selected={selected} slug={slug} eventId={eventId} now={now} allHref={href('markets')} />
          <FormPanel homeProf={homeProf.data} awayProf={awayProf.data} homeAbbr={homeAbbr} awayAbbr={awayAbbr} sportCode={sport.code} before={ev.start_time_utc} slug={slug} to={href('trends')} />
          <LineHistoryPanel hist={hist.data} loading={hist.loading} rows={rows} favAbbr={favAbbr} to={href('trends')} />
          <H2HPanel homeProf={homeProf.data} homeId={homeP.participant_id} awayId={awayP.participant_id} abbrOf={abbrOf} sportCode={sport.code} before={ev.start_time_utc} slug={slug} to={href('trends')} />
          <InjuriesPanel rows={injuries} homeAbbr={homeAbbr} awayAbbr={awayAbbr} sportCode={sport.code} to={href('injuries')} />
        </div>
      )}

      {tab === 'script' && (
        <>
          {set ? (
            <ScriptTab r={r} set={set} selected={selected} hrefFor={hrefFor} rows={rows} slug={slug} eventId={eventId} homeProf={homeProf.data} awayProf={awayProf.data} sportCode={sport.code} />
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

      {tab === 'markets' && (
        <>
          {Boolean(ext?.market_implied || ext?.model_view) && (
            <Stratum id="g-market-vs-model" title="Market vs model" sub="What the prices imply next to what the model reconstructs.">
              <MarketModel ext={ext} homeAbbr={homeAbbr} awayAbbr={awayAbbr} />
            </Stratum>
          )}
          <Stratum id="g-markets" title="Markets" sub={`Every Kalshi contract on this game (${detail.data?.markets.length ?? '…'}). Prices are the current quote where Sift has one, otherwise the publication's capture.`} actions={tickers.length ? <RefreshQuotes tickers={tickers} /> : undefined}>
            {detail.loading && <Skeleton lines={6} />}
            {detail.error && <ErrorState error={detail.error} what="this game's markets" />}
            {detail.data && <MarketBoard markets={quoted} prices={prices} sportSlug={slug} playerName={playerName} />}
            <NewlyListed quotes={listedLater} now={now} />
          </Stratum>
          {(ext?.game_script_inputs?.market_baseline?.game_line_moves?.length > 0 || (r.context?.notes ?? []).some((n) => n.startsWith('packet key question:'))) && (
            <Stratum id="g-unusual" title="Open questions & price moves" sub="The publication's own questions for this game, and where prices moved.">
              <Unusual r={r} ext={ext} slug={slug} />
            </Stratum>
          )}
        </>
      )}

      {tab === 'matchup' && (
        hasMatchup ? (
          <Stratum id="g-matchup" title="How they match up" sub="Each offense against the defense it faces, then every published metric side by side.">
            <MatchupBoard ext={ext} r={r} slug={slug} homeId={homeP.participant_id} awayId={awayP.participant_id} homeAbbr={homeAbbr} awayAbbr={awayAbbr} sportCode={sport.code} />
            {r.matchup.length > 0 && <MatchupTable rows={r.matchup} metrics={metrics} slug={slug} homeId={homeP.participant_id} awayId={awayP.participant_id} homeAbbr={homeAbbr} awayAbbr={awayAbbr} eventId={eventId} />}
          </Stratum>
        ) : <Notice title="No matchup metrics published for this game" />
      )}

      {tab === 'players' && (
        r.players.length > 0 ? (
          <Stratum id="g-players" title="Players" sub="Everyone the simulation projected for this game. Open one for usage, distributions and markets.">
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
            <Stratum id="g-movement" title="Contract price history" sub="Game-level tickers, every capture since listing.">
              <Movement eventId={eventId} path={r.market_history_path} prices={prices} kickoffIso={ev.start_time_utc} />
            </Stratum>
          )}
        </div>
      )}

      {tab === 'injuries' && (
        <Stratum id="g-availability" title="Injuries & availability" sub="Every non-active designation captured for this game.">
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
        <summary>Publication notes & provenance</summary>
        {notes.length > 0 && <ul className="notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        <p className="small muted"><QualityBadge quality={r.quality} /> {r.quality.source} · generated {r.quality.generated_at} · {r.quality.limitations.join(' · ')}</p>
        {ext?.real_money_status && <p className="small muted">{ext.real_money_status}</p>}
      </details>
    </div>
  );
}
