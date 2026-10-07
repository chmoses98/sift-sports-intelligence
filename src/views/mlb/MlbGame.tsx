// The MLB game page: the generic Sift game page over the MLB publication — the board's event detail (every Kalshi
// contract, the model prices) and, when published, the event research document (model inputs, lineups, market
// history). Built from the same parts as every game: the game hero, the live market clock (relay / quote feed
// overlay), the market board, the price history, the market pages. What is MLB's own: baseball market language, an
// innings section, the model inputs side by side, and the Player Props section driven by the publisher's
// mlb.player_prop.v1 objects. Football-only tabs (scripts, players, injuries) are not offered; a deep link to one says
// plainly that MLB does not publish it. Nothing here computes a projection, a fair price or an edge.
import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { EventDoc, EventResearchDoc, Market, MatchupRow } from '../../contract/types';
import { useAsync } from '../../data/hooks';
import { Icon } from '../../components/Icon';
import { NewlyListed, QuoteSummaryChip, RefreshQuotes, useQuoteViews } from '../../components/LiveQuote';
import { MarketBoard, latestPrices } from '../../components/MarketBoard';
import { MarketIconProvider } from '../../components/MarketIcon';
import { ErrorState, Notice, QualityBadge, Skeleton, Stratum } from '../../components/ui';
import { cents, metricFormatter, pct } from '../../lib/format';
import { describeMlbMarket, isMlbPlayerMarket, mlbKind, mlbPeriod } from '../../lib/mlb';
import { routes } from '../../lib/routes';
import { liveStore, useLiveQuotes, useNow } from '../../live/hooks';
import { newlyListed, overlayMarket } from '../../live/overlay';
import { useDirectory } from '../../state/directory';
import { capStatus, useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import { HistoricalGameView } from '../HistoricalGame';
import { Movement } from '../Game';
import { GameHero } from '../game/Hero';
import { PanelHead } from '../game/panels';
import { marketImplied, MlbPlayerProps } from './PlayerProps';

type Tab = 'overview' | 'props' | 'matchup' | 'markets' | 'trends';
const ALL_TABS: [Tab, string][] = [['overview', 'Overview'], ['props', 'Player props'], ['matchup', 'Matchup'], ['markets', 'Markets'], ['trends', 'Trends']];
/** Tabs another sport's link may carry: MLB says it does not publish them instead of rendering NFL shapes. */
const UNAVAILABLE: Record<string, string> = {
  matchup: 'Matchup inputs', script: 'Scripts', players: 'Player simulations', injuries: 'Injuries', trends: 'Price histories',
};

/** The hero's view of a game with no research document: the event's own participants, home/away from the event. */
export function heroDoc(ev: EventDoc, r?: EventResearchDoc | null): EventResearchDoc {
  if (r) return r;
  const participants = ev.participants.map((p) => ({ ...p, path: null, home_away: p.participant_id === ev.home_participant ? 'HOME' : p.participant_id === ev.away_participant ? 'AWAY' : null }));
  return { event: ev, participants, context: { injuries: [], lineups: [], notes: [], venue: ev.venue ? { name: ev.venue } : null, weather: null }, extensions: {} } as unknown as EventResearchDoc;
}

export function MlbGameView({ eventId, teamId }: { eventId: string; teamId: string | null }) {
  const { sport, repo, slug, caps } = useSport();
  const [sp] = useSearchParams();
  const dir = useDirectory(repo);
  const detail = useAsync(`ed:${sport.code}:${eventId}`, () => repo.eventDetail(eventId));
  const hasResearch = dir.data?.hasEventResearch(eventId) ?? false;
  const research = useAsync(hasResearch ? `er:${sport.code}:${eventId}` : null, () => repo.eventResearch(eventId));
  const ev = detail.data?.event ?? research.data?.event ?? null;
  const homeId = ev?.home_participant ?? null;
  const awayId = ev?.away_participant ?? null;
  const homeProf = useAsync(homeId ? `prof:${sport.code}:${homeId}` : null, () => repo.profile(homeId!));
  const awayProf = useAsync(awayId ? `prof:${sport.code}:${awayId}` : null, () => repo.profile(awayId!));
  const short = (pid: string | null) => ev?.participants.find((p) => p.participant_id === pid)?.short_name ?? null;
  const homeAbbr = short(homeId);
  const awayAbbr = short(awayId);
  useVisit(ev ? `${awayAbbr ?? '?'} @ ${homeAbbr ?? '?'}` : null, 'game');

  // The market clock, exactly as on every game page: game cadence while open, inventory per Kalshi event.
  const published = detail.data?.markets;
  const now = useNow(15_000);
  const settledGame = ev?.status === 'FINAL' || (ev ? Date.parse(ev.start_time_utc) < Date.now() - 8 * 3600e3 : false);
  const tickers = useMemo(() => (published ?? []).map((m) => m.kalshi_ticker), [published]);
  const events = useMemo(() => (settledGame ? [] : [...new Set((published ?? []).map((m) => m.kalshi_event_ticker).filter((e): e is string => !!e))]), [published, settledGame]);
  const live = useLiveQuotes(tickers, settledGame ? 'background' : 'game', events);
  const quoted = useMemo(() => (published ?? []).map((m) => overlayMarket(m, live.quote(m.kalshi_ticker))), [published, live]);
  const views = useQuoteViews(published ?? []);
  const propViews = useQuoteViews(useMemo(() => (published ?? []).filter(isMlbPlayerMarket), [published]));
  const listedLater = useMemo(() => newlyListed(tickers, liveStore().eventQuotes(events)), [tickers, events, live.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const prices = useMemo(() => latestPrices(detail.data?.model_prices ?? []), [detail.data]);
  const playerName = useMemo(() => (id: string | null) => (id ? dir.data?.player(id)?.label ?? null : null), [dir.data]);
  const abbrOf = (pid: string | null) => (pid === homeId ? homeAbbr : pid === awayId ? awayAbbr : null);

  if (detail.loading || research.loading || dir.loading) return <div className="page"><Skeleton lines={8} tall /></div>;
  if (!ev) {
    // Not on the board and no research: a past game opened from a team's schedule.
    if (detail.error?.name === 'NotFoundError') return <HistoricalGameView eventId={eventId} teamId={teamId} />;
    return <div className="page"><ErrorState error={detail.error ?? research.error} what="this game" /></div>;
  }
  const r = research.data ?? null;
  const TABS = ALL_TABS.filter(([k]) => (k === 'matchup' ? (r?.matchup.length ?? 0) > 0 : k === 'trends' ? !!r?.market_history_path : true));
  const raw0 = sp.get('tab');
  // A tab this game cannot show (a football tab, or matchup/trends without research) is named as unavailable.
  const raw = raw0 && !TABS.some(([k]) => k === raw0) ? raw0 : null;
  const tab = (TABS.find(([k]) => k === raw0)?.[0] ?? 'overview') as Tab;
  const href = (t: Tab) => routes.game(slug, eventId, { tab: t === 'overview' ? null : t });
  const teamOrder = [awayAbbr, homeAbbr].filter((x): x is string => !!x);
  const canLink = (id: string | null) => !!(id && dir.data?.player(id));
  const iconCtx = { abbrOf, playerTeam: () => null, sport: 'MLB' };
  const noModel = (detail.data?.model_prices.length ?? 0) === 0;

  return (
    <MarketIconProvider value={iconCtx}>
      <div className="page game game--mlb">
        <GameHero r={heroDoc(ev, research.data)} homeProf={homeProf.data} awayProf={awayProf.data} sportCode="MLB" slug={slug} now={now} />
        <nav className="ptabs gtabs" aria-label="Game sections">
          {TABS.map(([k, l]) => <Link key={k} to={href(k)} aria-current={tab === k && !(raw && UNAVAILABLE[raw]) ? 'page' : undefined}>{l}</Link>)}
        </nav>

        {raw && UNAVAILABLE[raw] ? (
          <Notice title={`${UNAVAILABLE[raw]} are not published for MLB`}>
            The MLB publication carries the board, every Kalshi contract, the model inputs and the player-prop projections; it publishes no
            {` ${UNAVAILABLE[raw].toLowerCase()} `}for this game, so Sift shows none. <Link to={href('overview')}>Back to the game</Link>
          </Notice>
        ) : tab === 'overview' ? (
          <div className="gov">
            <GameLines markets={quoted} prices={prices} slug={slug} eventId={eventId} abbrOf={abbrOf} views={views} now={now} noModel={noModel} to={href('markets')} lineups={lineupLine(r)} />
            <Stratum id="g-mlb-pitchers" title="Starting pitchers" sub="Pitcher props: the market's price for each line and, where the publisher released one, its projection." actions={<Link to={href('props')} className="btn btn--sm">All player props</Link>}>
              <MlbPlayerProps markets={quoted} teamOrder={teamOrder} slug={slug} eventId={eventId} canLink={canLink} abbrOf={abbrOf} limit={{ role: 'PITCHER' }} />
            </Stratum>
          </div>
        ) : tab === 'props' ? (
          <Stratum id="g-mlb-props" title="Player props" sub={<>Pitchers, then hitters, by club. Market = Kalshi's price; Model only where a projection is published ({capStatus(caps, 'player_props')} in the capability manifest).</>} actions={<span className="gquote"><QuoteSummaryChip views={propViews} now={now} /></span>}>
            {detail.error ? <ErrorState error={detail.error} what="this game's markets" /> : <MlbPlayerProps markets={quoted} teamOrder={teamOrder} slug={slug} eventId={eventId} canLink={canLink} abbrOf={abbrOf} />}
          </Stratum>
        ) : tab === 'matchup' && r ? (
          <Stratum id="g-mlb-matchup" title="Model inputs, side by side" sub="The publication's slate values for both clubs: projections, offense, recent form and pitching. Research evidence, never a pick.">
            <MatchupInputs rows={r.matchup} slug={slug} eventId={eventId} awayAbbr={awayAbbr ?? 'Away'} homeAbbr={homeAbbr ?? 'Home'} homeId={homeId} awayId={awayId} />
          </Stratum>
        ) : tab === 'trends' && r ? (
          <Stratum id="g-movement" title="Contract price history" sub="Kalshi captures since listing, from the publication's market history.">
            <Movement eventId={eventId} path={r.market_history_path} prices={prices} kickoffIso={ev.start_time_utc} known={new Map((published ?? []).map((m) => [m.kalshi_ticker, m]))} />
          </Stratum>
        ) : (
          <Stratum id="g-markets" title="Markets" sub={`All Kalshi contracts on this game (${published?.length ?? '…'}). Prices are the current quote where Sift has one, otherwise the publication's capture.`} actions={<><span className="gquote"><QuoteSummaryChip views={views} now={now} /></span>{tickers.length ? <RefreshQuotes tickers={tickers} /> : null}</>}>
            {detail.error && <ErrorState error={detail.error} what="this game's markets" />}
            {detail.data && <MarketBoard markets={quoted} prices={prices} sportSlug={slug} playerName={playerName} />}
            <NewlyListed quotes={listedLater} now={now} />
          </Stratum>
        )}

        <details className="gnotes">
          <summary>Publication notes &amp; provenance</summary>
          <p className="small muted">
            {sport.label} publication {detail.data?.generated_at ? `generated ${detail.data.generated_at}` : ''}
            {detail.data ? ` · data ${String(detail.data.data_freshness).toLowerCase()}` : ''}
            {published?.length ? ` · market capture ${[...new Set(published.map((m) => m.captured_at).filter(Boolean))].sort().pop()}` : ''}
          </p>
          <p className="small muted">
            Player props <QualityBadge status={capStatus(caps, 'player_props')} /> · game markets <QualityBadge status={capStatus(caps, 'game_markets')} />
            {noModel ? ' · no model price is published for this game.' : ''}
            {research.data ? <> · research <QualityBadge quality={research.data.quality} /></> : ' · no event research document is published for this game.'}
          </p>
        </details>
      </div>
    </MarketIconProvider>
  );
}

/** "Lineups: LAD confirmed · ATL confirmed", from the research document's lineup status (no batting orders are published). */
function lineupLine(r: EventResearchDoc | null): string | null {
  const ls = (r?.context?.lineups ?? []) as { team?: string; status?: string; official?: boolean }[];
  if (!ls.length) return null;
  return `Lineups: ${ls.map((l) => `${l.team ?? '?'} ${(l.status ?? 'unknown').toLowerCase()}${l.official ? ' (official)' : ''}`).join(' · ')}`;
}

const CAT_ORDER = ['projection', 'offense', 'form', 'pitching', 'projection_input', 'adjustment'];
const CAT_WORD: Record<string, string> = { projection: 'Projection', offense: 'Offense', form: 'Recent form', pitching: 'Pitching', projection_input: 'Model input', adjustment: 'Adjustment' };

/** Both clubs on every published model input: raw values side by side (no rank is invented where none is published). */
function MatchupInputs({ rows, slug, eventId, awayAbbr, homeAbbr, homeId, awayId }: { rows: MatchupRow[]; slug: string; eventId: string; awayAbbr: string; homeAbbr: string; homeId: string | null; awayId: string | null }) {
  const { metrics } = useSport();
  const fmt = (metricId: string, v: number | null | undefined) => {
    const d = metrics.get(metricId);
    if (v == null) return '—';
    if (d?.unit === '%') return `${v.toFixed(1)}%`;
    if (d?.unit === 'runs' || d?.unit === 'runs/game' || d?.unit === 'runs/9') return v.toFixed(2);
    return metricFormatter(d)(v);
  };
  const cat = (id: string) => metrics.get(id)?.category ?? 'other';
  const sorted = [...rows].sort((a, b) => (CAT_ORDER.indexOf(cat(a.metric_id)) + 99) % 99 - ((CAT_ORDER.indexOf(cat(b.metric_id)) + 99) % 99));
  return (
    <div className="tscroll">
      <table className="dtable mmatch">
        <thead><tr><th scope="col">Input</th><th scope="col" className="r">{awayAbbr}</th><th scope="col" className="r">{homeAbbr}</th></tr></thead>
        <tbody>
          {sorted.map((row) => {
            const d = metrics.get(row.metric_id);
            return (
              <tr key={row.metric_id}>
                <th scope="row">
                  <Link to={routes.metric(slug, row.metric_id, { team: homeId, opp: awayId, event: eventId })}>{d?.name ?? row.name}</Link>
                  <span className="mmatch__cat">{CAT_WORD[cat(row.metric_id)] ?? cat(row.metric_id)}{d?.unit ? ` · ${d.unit}` : ''}</span>
                  {row.note && <span className="mmatch__note">{row.note}</span>}
                </th>
                <td className="r num">{fmt(row.metric_id, row.away?.value)}</td>
                <td className="r num">{fmt(row.metric_id, row.home?.value)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface LineRow { key: string; label: ReactNode; m: Market | null }

/** The game lines a baseball reader looks for first, each with the market's implied probability (and a model only if published). */
function GameLines({ markets, prices, slug, eventId, abbrOf, views, now, noModel, to, lineups }: {
  markets: Market[]; prices: ReturnType<typeof latestPrices>; slug: string; eventId: string; abbrOf: (pid: string | null) => string | null;
  views: ReturnType<typeof useQuoteViews>; now: number; noModel: boolean; to: string; lineups: string | null;
}) {
  const full = markets.filter((m) => !isMlbPlayerMarket(m));
  const pick = (f: (m: Market) => boolean) => full.filter(f);
  const label = (m: Market) => describeMlbMarket(m, { abbrOf }).title;
  const nearestEven = (ms: Market[]) => [...ms].filter((m) => marketImplied(m) != null).sort((a, b) => Math.abs(marketImplied(a)! - 0.5) - Math.abs(marketImplied(b)! - 0.5))[0] ?? null;
  const rows: LineRow[] = [
    ...pick((m) => mlbKind(m) === 'moneyline' && !mlbPeriod(m)).map((m) => ({ key: m.market_id, label: label(m), m })),
    ...pick((m) => mlbKind(m) === 'run_line' && !mlbPeriod(m) && Math.abs(Number(m.threshold) - 1.5) < 0.01).map((m) => ({ key: m.market_id, label: label(m), m })),
    { key: 'total', label: null, m: nearestEven(pick((m) => mlbKind(m) === 'total' && !mlbPeriod(m))) },
    ...pick((m) => mlbKind(m) === 'period_result' && mlbPeriod(m) === 'F5').map((m) => ({ key: m.market_id, label: label(m), m })),
    { key: 'yrfi', label: null, m: pick((m) => mlbKind(m) === 'yrfi')[0] ?? null },
  ].filter((r) => r.m).map((r) => ({ ...r, label: r.label ?? label(r.m!) }));
  return (
    <section className="panel mlines" aria-labelledby="mlines-h">
      <PanelHead title="Game Lines" sub="Moneyline, run line, total, first five innings and a run in the 1st: the market's implied probability (bid/ask midpoint)">
        <span className="gquote"><QuoteSummaryChip views={views} now={now} /></span>
      </PanelHead>
      {rows.length ? (
        <table className="mlines__t">
          <thead><tr><th scope="col">Market</th><th scope="col">Implied</th><th scope="col">Bid / ask</th>{!noModel && <th scope="col">◆ Model</th>}</tr></thead>
          <tbody>
            {rows.map((r) => {
              const mid = marketImplied(r.m!);
              const fair = prices.get(r.m!.market_id)?.fair_probability ?? null;
              return (
                <tr key={r.key}>
                  <th scope="row"><Link to={routes.market(slug, r.m!.market_id, eventId)}>{r.label}</Link></th>
                  <td className="num">{mid != null ? pct(mid, 0) : '—'}</td>
                  <td className="num">{cents(r.m!.yes_bid)} / {cents(r.m!.yes_ask)}</td>
                  {!noModel && <td className="num" aria-label={fair != null ? `model ${pct(fair, 0)}` : 'no model price'}>{fair != null ? `◆ ${pct(fair, 0)}` : '—'}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <p className="muted">No game line is published for this game.</p>}
      {noModel ? <p className="muted small">No model price is published for this game: market prices only.</p> : <p className="muted small">◆ Model = the publication's model P(YES) for that contract: research evidence, never a pick.</p>}
      {lineups && <p className="muted small">{lineups}.</p>}
      <p className="lines__x"><Link to={to}>Every market and inning line <Icon name="arrowRight" size={14} /></Link></p>
    </section>
  );
}
