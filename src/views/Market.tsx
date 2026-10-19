import { lazy, Suspense } from 'react';
import { modelVersionLabel } from '../lib/plainLabels';
import { Link, useParams, useSearchParams } from '../routing';
import { LadderChart } from '../charts/LadderChart';
import { PriceHistory } from '../charts/PriceHistory';
import type { Market } from '../contract/types';
import { useAsync } from '../data/hooks';
import { Icon } from '../components/Icon';
import { latestPrices } from '../components/MarketBoard';
import { describeMarket } from '../lib/marketLabel';
import { EntityLink, ErrorState, FreshnessChip, Notice, QualityBadge, SaveButton, Skeleton, Stratum } from '../components/ui';
import { cents, exactTime, familyLabel, kickoff, metricFormatter, signed } from '../lib/format';
import { STAT_LABEL, STAT_TO_SIM } from '../lib/nfl';
import { routes } from '../lib/routes';
import { capStatus, useSport } from '../state/sport';
import { useVisit } from '../state/trail';
import { quantilesOf } from './Player';
import { QuoteChip, RefreshQuotes, sourceLabel, useQuoteViews } from '../components/LiveQuote';
import { useLiveQuotes, useNow } from '../live/hooks';
import { overlayMarket } from '../live/overlay';
import { isFullGame, periodWords } from '../lib/period';
import { cfbMarketHeading } from '../lib/cfbMarkets';
import { isMlbTicker, mlbPlayerKey } from '../lib/mlb';
import { priceMove } from '../lib/priceMoves';
import { useAuthority } from '../data/projections';
import { simView, type SimView } from '../lib/simStat';
import '../styles/lane-d-markets.css';

/* eslint-disable @typescript-eslint/no-explicit-any */

const rungOf = (m: Market) => (m.threshold != null ? m.threshold : m.line);

function Px({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="px">
      <span className="px__k">{k}</span>
      <b className="px__v num">{v}</b>
      {sub && <span className="px__s">{sub}</span>}
    </div>
  );
}

/** The NHL research layer for a market (views/nhl): its own chunk. */
const NhlMarketResearch = lazy(() => import('./nhl/NhlMarket').then((x) => ({ default: x.NhlMarketResearch })));

export function MarketView() {
  const { marketId = '' } = useParams();
  const [sp] = useSearchParams();
  const eventId = sp.get('event') ?? '';
  const { sport, repo, slug, caps, metrics } = useSport();
  const detail = useAsync(eventId ? `ed:${sport.code}:${eventId}` : null, () => repo.eventDetail(eventId));
  const published = detail.data?.markets.find((x) => x.market_id === marketId);
  const series0 = published?.kalshi_ticker.split('-')[0];
  const siblingTickers = published
    ? detail.data!.markets.filter((o) => o.kalshi_ticker.split('-')[0] === series0 && o.event_id === published.event_id).map((o) => o.kalshi_ticker)
    : [];
  // Two clocks: this contract refreshes at detail cadence, its ladder at game cadence; the research
  // documents above stay memoised.
  const live = useLiveQuotes(published ? [published.kalshi_ticker] : [], 'detail');
  useLiveQuotes(siblingTickers, 'game');
  const now = useNow(10_000);
  const m = published ? overlayMarket(published, live.quote(published.kalshi_ticker)) : undefined;
  const [view] = useQuoteViews(published ? [published] : []);
  const research = useAsync(eventId ? `er:${sport.code}:${eventId}` : null, () => repo.eventResearch(eventId));
  const hist = useAsync(research.data?.market_history_path ? `mh:${sport.code}:${eventId}` : null, () => repo.marketHistory(eventId));
  const player = useAsync(m?.player_id ? `prof:${sport.code}:${m.player_id}` : null, () => repo.profile(m!.player_id!));
  // the one projection per stat (NFL player stats): a promoted stat's probability and range are the projection's own, never the established model's
  const { authority: projAuthority, ready: projReady } = useAuthority(sport.code === 'NFL' ? 'NFL' : null, now);
  const team = useAsync(m?.participant_id ? `prof:${sport.code}:${m.participant_id}` : null, () => repo.profile(m!.participant_id!));
  const recs = useAsync(`recs:${sport.code}:${repo.source.root}`, () => repo.recommendations());
  const title = m ? describeMarket(m, { playerName: () => player.data?.entity.display_name ?? null, abbrOf: () => team.data?.entity.short_name ?? null }).title : null;
  // A market belongs to its game: the breadcrumb runs through that game.
  const rev = research.data?.event;
  const side = (ha: string) => rev?.participants.find((x) => x.participant_id === research.data?.participants.find((q) => q.home_away === ha)?.participant_id)?.short_name;
  const pair = rev && !research.data?.participants.some((q) => q.home_away) ? rev.participants.map((p) => p.display_name).join(' v ') : null;
  const parentStep = rev && side('AWAY') && side('HOME') ? { href: routes.game(slug, eventId), label: `${side('AWAY')} @ ${side('HOME')}`, kind: 'game' as const } : pair ? { href: routes.game(slug, eventId), label: pair, kind: 'game' as const } : research.loading ? undefined : null;
  useVisit(parentStep === undefined ? null : title, 'market', parentStep);

  if (!eventId) return <div className="page"><Notice tone="error" title="Which game is this market on?">Market links carry their event; open it from a game, player or team.</Notice></div>;
  if (detail.loading) return <div className="page"><Skeleton lines={8} tall /></div>;
  if (!detail.data) return <div className="page"><ErrorState error={detail.error} what="this game's markets" /></div>;
  if (!m) return <div className="page"><Notice tone="error" title="Market not in this publication">{marketId} is not among this game's {detail.data.markets.length} published markets (it may have closed or been delisted).</Notice></div>;

  const ev = detail.data.event;
  const evLabel = (() => {
    const s = (pid: string | null) => ev.participants.find((p) => p.participant_id === pid)?.short_name ?? '?';
    // An individual sport (tennis) has two participants and no home or away side: name them.
    if (!ev.home_participant || !ev.away_participant) return ev.participants.map((p) => p.display_name).join(' v ');
    return `${s(ev.away_participant)} @ ${s(ev.home_participant)}`;
  })();
  const prices = latestPrices(detail.data.model_prices);
  const mp = prices.get(m.market_id);
  const rec = recs.data?.items.find((r) => r.market_id === m.market_id);
  const authority = rec ? rec.authority : 'RESEARCH_ONLY';
  const authorityWord = authority.replace(/_/g, ' ').toLowerCase();
  const mid = m.yes_bid != null && m.yes_ask != null ? (m.yes_bid + m.yes_ask) / 2 : m.market_probability;
  const x = (m.extensions ?? {}) as any;
  const stat = (x.stat as string | undefined) ?? null;
  const simObs = stat && STAT_TO_SIM[stat] ? player.data?.metrics.find((o) => o.metric_id === STAT_TO_SIM[stat]) : undefined;
  const gsis = (player.data?.entity.source_ids?.gsis_id as string | undefined) ?? null;
  const teamAbbr = player.data?.team?.short_name ?? (player.data?.entity.metadata?.team as string | undefined) ?? null;
  const oppAbbr = ev.participants.find((pp) => pp.short_name && pp.short_name !== teamAbbr)?.short_name ?? null;
  const simStat = Boolean(stat && m.market_family === 'player_stat' && STAT_TO_SIM[stat] && sport.code === 'NFL');
  // the player profile and the projection feed both load asynchronously: until they have, no model number is shown (never a flash of the established one)
  const sv: SimView | null = simStat && !player.data ? { state: 'loading' } : stat && simStat ? simView(projAuthority, projReady, {
    stat, obs: simObs, playerId: gsis, name: player.data?.entity.display_name ?? null, team: teamAbbr, opponent: oppAbbr,
    designation: player.data?.availability.map((a) => a.status).find((st) => !/^(ACTIVE|PROBABLE|AVAILABLE)$/i.test(st)) ?? null, line: m.threshold != null ? Number(m.threshold) - 0.5 : null,
  }) : null;
  const q = sv ? (sv.state === 'shown' && sv.q ? { ...sv.q, mean: sv.value } : null) : quantilesOf(simObs);
  /** the model's probability for a line: the projection's own for a promoted stat (none off its ladder or when withheld), else the pricing model's fair price */
  const simLoading = sv?.state === 'loading';
  const promoted = sv?.state === 'withheld' || (sv?.state === 'shown' && sv.engine === 'projection');
  const modelP = (marketId: string, line: unknown): number | null => (simLoading ? null : promoted ? (sv!.state === 'shown' ? sv!.probAtLeast(Number(line)) ?? null : null) : prices.get(marketId)?.fair_probability ?? null);
  const series = m.kalshi_ticker.split('-')[0];
  const siblings = detail.data.markets
    .map((o) => overlayMarket(o, live.quote(o.kalshi_ticker)))
    .filter((o) => o.kalshi_ticker.split('-')[0] === series && o.period === m.period && (o.side ?? '') === (m.side ?? '') && (o.participant_id ?? '') === (m.participant_id ?? '') && (o.player_id ?? '') === (m.player_id ?? '') && (!isMlbTicker(m.kalshi_ticker) || mlbPlayerKey(o) === mlbPlayerKey(m)) && rungOf(o) != null)
    .sort((a, b) => Number(rungOf(a)) - Number(rungOf(b)));
  const hseries = hist.data?.series.find((s) => s.market_id === m.market_id);
  const thr = rungOf(m);
  const subject = player.data?.entity.display_name ?? team.data?.entity.display_name ?? x.subject ?? null;
  // NHL inserts its research stratum as 02; the rest renumber after it.
  const sn = (k: number) => String(sport.code === 'NHL' ? k + 1 : k).padStart(2, '0');

  return (
    <div className="page market">
      <header className="ehead ehead--metric">
        <div className="ehead__t">
          <div className="eyebrow">
            <EntityLink to={routes.sport(slug)} kind="sport" quiet>{sport.label}</EntityLink> · Market · {cfbMarketHeading(m) ?? `${familyLabel(m.market_family)}${m.period && !isFullGame(m.period) ? ` · ${periodWords(m.period)}` : ''}`}
          </div>
          <h1 className="h-display h-display--md">{title}</h1>
          <div className="ehead__meta">
            <EntityLink to={routes.game(slug, ev.event_id)} kind="game">{evLabel} · {kickoff(ev.start_time_utc)}</EntityLink>
            {player.data && <EntityLink to={routes.player(slug, player.data.entity.participant_id)} kind="player">{player.data.entity.display_name}</EntityLink>}
            {team.data && <EntityLink to={routes.team(slug, team.data.entity.participant_id)} kind="team">{team.data.entity.display_name}</EntityLink>}
            <span className={`chip chip--status-${(view?.availability ?? 'UNKNOWN').toLowerCase()}`}>{view?.availability ?? 'UNKNOWN'}</span>
            <span className="ticker-quiet" title="Kalshi contract ID, for reference">Kalshi ID <code className="ticker ticker--sm">{m.kalshi_ticker}</code></span>
          </div>
        </div>
        <div className="ehead__actions">
          <SaveButton ref_kind="MARKET" sport={sport.code} id={m.market_id} extra={{ market_id: m.market_id, event_id: ev.event_id }} kickoff={ev.start_time_utc} eventStatus={ev.status}
            label={{ label: title ?? 'Market', sub: `${cents(m.yes_bid)}/${cents(m.yes_ask)}`, href: routes.market(slug, m.market_id, ev.event_id) }} />
          <Link className="btn btn--ghost" to={routes.packet({ sport: slug, scope: 'GAME', event: ev.event_id })}><Icon name="copy" size={16} /> Game packet</Link>
        </div>
      </header>

      <section className="contract" aria-label="Contract semantics">
        <div className="contract__side contract__side--yes">
          <span className="contract__k">YES pays $1 if</span>
          <span className="contract__v">{title ? title.replace(/ moneyline$/, ' win the game') : m.yes_description.replace(/^YES iff /, '').replace(/_/g, ' ')}</span>
          {title && (
            <details className="contract__rule">
              <summary>Exact settlement rule</summary>
              <span>{m.yes_description.replace(/^YES iff /, '').replace(/_/g, ' ')}</span>
            </details>
          )}
        </div>
        <div className="contract__side contract__side--no">
          <span className="contract__k">NO pays $1 if</span>
          <span className="contract__v">{sport.code === 'NHL' ? `the YES condition is not met${title ? ` (not: ${title.charAt(0).toLowerCase()}${title.slice(1)})` : ''}` : m.no_description ?? 'the YES condition is not met'}</span>
        </div>
      </section>

      <Stratum n="01" title="Price" sub="The current Kalshi quote when Sift has a live one, otherwise the publication's capture — always with its real age. A quote older than 30 minutes is a reference, not an executable price." actions={<RefreshQuotes tickers={[m.kalshi_ticker]} />}>
        <div className="pxgrid">
          <Px k="YES bid / ask" v={`${cents(m.yes_bid)} / ${cents(m.yes_ask)}`} sub={m.yes_bid != null && m.yes_ask != null ? `width ${cents(m.yes_ask - m.yes_bid)}` : undefined} />
          <Px k="NO bid / ask" v={`${cents(m.no_bid)} / ${cents(m.no_ask)}`} />
          <Px k="Mid" v={cents(mid)} sub="market-implied P(YES)" />
          <Px k="Last" v={cents(m.last_price)} />
          <Px k="Volume" v={m.volume != null ? Math.round(m.volume).toLocaleString() : '—'} />
          <Px k="Open interest" v={m.open_interest != null ? Math.round(m.open_interest).toLocaleString() : '—'} />
        </div>
        <div className="chips">
          {view && <QuoteChip view={view} now={now} label="quote" />}
          {!view?.live && x.minutes_since_price_change != null && <span className="chip">price unchanged {Math.round(x.minutes_since_price_change)} min at capture</span>}
          {!view?.live && x.executable === false && <span className="chip chip--warn">not executable at capture</span>}
          {x.no_real_market && <span className="chip chip--warn">no real market at publication</span>}
        </div>
      </Stratum>

      {sport.code === 'NHL' && <Suspense fallback={null}><NhlMarketResearch r={research.data} m={m} slug={slug} /></Suspense>}

      <Stratum n={sn(2)} title="Model evidence" sub="What the repository's model says about this contract. Research evidence — not a recommendation, not a bet.">
        {mp ? (
          <div className="evid">
            <div className="pxgrid">
              <Px k={promoted ? 'Projected probability of YES' : 'Model fair P(YES)'} v={cents(modelP(m.market_id, rungOf(m)))} sub={promoted ? 'from the projection’s distribution' : modelVersionLabel(mp.model_version) ?? undefined} />
              <Px k="Market mid" v={cents(mid)} />
              <Px k="Model − market" v={modelP(m.market_id, rungOf(m)) != null && mid != null ? `${signed((modelP(m.market_id, rungOf(m))! - mid) * 100, 1)}¢` : '—'} sub="research signal, not an edge claim" />
              {promoted ? (sv!.state === 'shown' && <Px k="Projection" v={`${Math.round(sv!.value * 100) / 100} ${mp.projection_unit ?? ''}`} />)
                : mp.projection_value != null && <Px k="Projection" v={`${mp.projection_value} ${mp.projection_unit ?? ''}`} />}
            </div>
            <div className="chips">
              <FreshnessChip asOf={mp.generated_at} component="model" label="model" />
              <span className="chip">support {String(mp.support_status ?? x.incumbent_support_state ?? '—').replace(/_/g, ' ').toLowerCase()}</span>
              <span className="chip">data quality {mp.data_quality_status ?? '—'}</span>
              <span className="chip chip--research">{authorityWord}</span>
            </div>
            {rec && (
              <Notice tone="research" title={`The repository's own process flags this market: ${rec.selection} ${rec.status}`}>
                Fair {cents(rec.fair_probability)}, bet-up-to {cents(rec.bet_up_to_price)}, {rec.authority.replace(/_/g, ' ').toLowerCase()}{rec.research_only && rec.authority !== 'RESEARCH_ONLY' ? ', research only' : ''}. Evidence, not an instruction.
              </Notice>
            )}
          </div>
        ) : (
          <p className="muted">No model price is published for this contract (raw_projections: {capStatus(caps, 'raw_projections')}).</p>
        )}
      </Stratum>

      {(q || siblings.length >= 2) && (
        <Stratum n={sn(3)} title="Projection evidence" sub={stat && subject ? `${subject}'s ${STAT_LABEL[stat] ?? stat}: the whole ladder, this rung highlighted.` : 'The whole ladder, this rung highlighted.'}>
          {siblings.length >= 2 && (
            <LadderChart
              rungs={siblings.map((o) => ({ x: Number(rungOf(o)), bid: o.yes_bid, ask: o.yes_ask, fair: modelP(o.market_id, rungOf(o)), href: routes.market(slug, o.market_id, ev.event_id), ticker: o.kalshi_ticker }))}
              quantiles={q}
              unit={stat ? STAT_LABEL[stat] ?? stat : cfbMarketHeading(m) ?? familyLabel(m.market_family)}
              title={`${title} ladder`}
              selected={m.kalshi_ticker}
            />
          )}
          {q && thr != null && simObs && (
            <p className="evid__q">
              {sv?.state === 'shown' && sv.engine === 'projection' ? 'Projected' : 'Simulated'} {STAT_LABEL[stat!] ?? stat}: median <b className="num">{metricFormatter(metrics.get(simObs.metric_id))(q.p50)}</b>, 50% range{' '}
              <b className="num">{q.p25}–{q.p75}</b>, 90% range <b className="num">{q.p05}–{q.p95}</b>. This contract's line ({thr}) sits{' '}
              {thr <= q.p05 ? 'below almost every outcome (the lowest 5%)' : thr <= q.p25 ? 'in the lower quarter of outcomes' : thr <= q.p50 ? 'just below the middle of the outcomes' : thr <= q.p75 ? 'just above the middle of the outcomes' : thr <= q.p95 ? 'in the upper quarter of outcomes' : 'above almost every outcome (the highest 5%)'}. {!promoted && <QualityBadge status={simObs.quality_status} />}
            </p>
          )}
        </Stratum>
      )}

      <Stratum n={sn(4)} title="Price history" sub="Every capture of this ticker.">
        {hist.loading && <Skeleton lines={3} />}
        {hseries ? (
          <>
            {(() => { const mv = priceMove(hseries.points, { v: mid ?? null, at: view?.observedAt ?? m.captured_at ?? null }); return mv ? <p className="lsd-move__s" data-testid="market-move"><b>{mv.words}.</b> Range {Math.round(mv.lo * 100)}¢–{Math.round(mv.hi * 100)}¢. A move is the market changing its mind, not evidence for either side.</p> : null; })()}
            <PriceHistory points={hseries.points} fair={modelP(m.market_id, rungOf(m))} kickoff={ev.start_time_utc} title={`${title} price history`} />
          </>
        ) : (
          !hist.loading && (
            <p className="muted">
              No capture history is published for this ticker. {hist.data ? `The publication keeps history for ${hist.data.series.length} game-level tickers of this game (${hist.data.quality.coverage}).` : 'No market history document for this game.'}
            </p>
          )
        )}
      </Stratum>

      <Stratum n={sn(5)} title="Data quality & research status">
        <dl className="facts facts--slim">
          <div className="fact"><dt>Quote source</dt><dd>{view ? sourceLabel(view.source) : '—'}</dd></div>
          <div className="fact"><dt>Quote observed</dt><dd>{exactTime(view?.observedAt)}</dd></div>
          <div className="fact"><dt>Research row</dt><dd>{published?.source ?? '—'} · captured {exactTime(published?.captured_at)}</dd></div>
          <div className="fact"><dt>Analysis state</dt><dd>{String(x.analysis_state ?? '—').replace(/_/g, ' ').toLowerCase()}</dd></div>
          <div className="fact"><dt>Coverage bucket</dt><dd>{x.bucket ?? '—'}</dd></div>
          <div className="fact"><dt>Market prices</dt><dd><QualityBadge status={capStatus(caps, 'market_prices')} /></dd></div>
          <div className="fact"><dt>Price history</dt><dd><QualityBadge status={capStatus(caps, 'market_price_history')} /></dd></div>
          <div className="fact"><dt>Projections</dt><dd><QualityBadge status={capStatus(caps, 'raw_projections')} /></dd></div>
          <div className="fact"><dt>Bet authority</dt><dd>{authorityWord.replace(/^\w/, (x) => x.toUpperCase())}</dd></div>
        </dl>
        {mp && (
          <SaveButton text="Save projection" ref_kind="PROJECTION" sport={sport.code} id={mp.model_price_id} extra={{ market_id: m.market_id, event_id: ev.event_id }} kickoff={ev.start_time_utc} eventStatus={ev.status}
            label={{ label: `Projection · ${title}`, sub: `model ${cents(modelP(m.market_id, rungOf(m)))} vs ${cents(mid)}`, href: routes.market(slug, m.market_id, ev.event_id) }} />
        )}
      </Stratum>
    </div>
  );
}
