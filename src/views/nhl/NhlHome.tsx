// The NHL home: a hockey dashboard. A compact header (the slate's day, game count, model / price / research status),
// the whole slate as scannable rows, the strongest research that survives the scripts across the slate (goal-scorer
// contracts are never featured), and the model's honest research status. Loads the board, then each listed game's
// event research on demand (never team, player, ranking or series documents).
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { BoardItem, EventResearchDoc } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { ErrorState, Skeleton, TeamMark } from '../../components/ui';
import { useAsync } from '../../data/hooks';
import { candidateTitle, evText, isNhlScripts, probText, readLearning, readNhl, type NhlCandidate } from '../../lib/nhl';
import { HIGH_VARIANCE_FAMILIES, gamePhase, modelFreshness, priceFreshness, type Fresh } from '../../lib/nhlStory';
import { routes } from '../../lib/routes';
import { useNow } from '../../live/hooks';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import { sides, useSlateResearch } from '../home/cards';
import { familyGlyph, Glyph } from './glyphs';
import { FreshPill, ResearchPill } from './kit';
import { TierChip, lowerLabel } from './parts';
import { SlateList, slateDay, slateItems } from './NhlSlate';

/* eslint-disable @typescript-eslint/no-explicit-any */

const RANK: Record<string, number> = { CURRENT: 0, AGING: 1, STALE: 2, UNKNOWN: 3, FROZEN: -1 };
const worst = (xs: Fresh[]): Fresh => xs.filter((x) => x !== 'FROZEN').reduce<Fresh>((a, b) => (RANK[b] > RANK[a] ? b : a), xs.some((x) => x !== 'FROZEN') ? 'CURRENT' : 'UNKNOWN');

/** Research that survives the scripts, across the slate: robust first, never a goal-scorer contract. */
function StrongestResearch({ games, slug, started }: { games: { item: BoardItem; r: EventResearchDoc }[]; slug: string; started: boolean }) {
  const rows = games.flatMap(({ item, r }) => {
    const s = readNhl(r);
    if (!isNhlScripts(s)) return [];
    return s.candidates
      .filter((c) => c.governance.status !== 'REJECTED' && !c.duplicate_of && !HIGH_VARIANCE_FAMILIES.has(c.family) && (c.robustness === 'ROBUST' || c.robustness === 'MODERATE'))
      .map((c) => ({ c, item, r, fail: c.survival.failure_script ? s.byId.get(c.survival.failure_script)?.label ?? null : null }));
  }).sort((a, b) => (a.c.robustness === b.c.robustness ? b.c.research_score - a.c.research_score : a.c.robustness === 'ROBUST' ? -1 : 1)).slice(0, 6);
  return (
    <section className="nhx__sec" aria-labelledby="n-strong-h">
      <div className="nhx__sech">
        <h2 id="n-strong-h" className="nhx__h2">Research that survives the scripts</h2>
        <p className="nhx__sechs">Robust and moderate research candidates across the slate. Goal-scorer contracts are never featured. Research only: nothing is placed.</p>
      </div>
      {rows.length === 0 ? <p className="nsl__muted">{started ? 'Every game on this slate has started: pregame research is frozen on each game page and is not refreshed by live prices.' : 'No robust or moderate research candidate on the games the model has simulated. That is a valid result.'}</p> : (
        <ol className="nsr">
          {rows.map(({ c, item, r, fail }: { c: NhlCandidate; item: BoardItem; r: EventResearchDoc; fail: string | null }) => {
            const m = r.markets.find((x) => x.kalshi_ticker === c.ticker);
            const { away, home } = sides(item);
            const to = m ? routes.market(slug, m.market_id, item.event_id) : routes.game(slug, item.event_id, { tab: 'markets' });
            return (
              <li key={c.bet_id}>
                <Link to={to} className="nsr__a">
                  <span className="nsr__ic"><Glyph name={familyGlyph(c.family)} size={18} /></span>
                  <span className="nsr__main">
                    <span className="nsr__t">{candidateTitle(c, m as any)}</span>
                    <span className="nsr__g"><TeamMark sport="NHL" abbr={away?.short_name} size="sm" />{away?.short_name} at <TeamMark sport="NHL" abbr={home?.short_name} size="sm" />{home?.short_name}{fail ? <> · fails mainly if {lowerLabel(fail)}</> : null}</span>
                  </span>
                  <span className="nsr__n">
                    <TierChip tier={c.robustness} />
                    <span className="nsr__v"><b className="num">{probText(c.survival.mass_survived)}</b> of sims</span>
                    <span className="nsr__v nsr__v--q">edge <b className="num">{evText(c.ev_adjusted)}</b></span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function ResearchStatus({ slug }: { slug: string }) {
  const { metrics } = useSport();
  const l = readLearning(metrics);
  const c = l?.counts ?? {};
  const pr = l?.probability;
  return (
    <section className="nhx__sec nstatusbox" aria-labelledby="n-learn-h">
      <div className="nhx__sech">
        <h2 id="n-learn-h" className="nhx__h2">Research status</h2>
        <p className="nhx__sechs">NHL is a research model under prospective tracking. Every projection is logged before puck drop and scored after the final. Nothing here claims an edge.</p>
      </div>
      <dl className="nkv">
        <div><dt>Stage</dt><dd><ResearchPill learning={l} slug={slug} bare /></dd></div>
        {c.games_projected != null && <div><dt>Tracked</dt><dd><b className="num">{Number(c.games_projected).toLocaleString('en-US')}</b> games projected · <b className="num">{Number(c.games_settled ?? 0).toLocaleString('en-US')}</b> settled</dd></div>}
        {c.script_forecasts != null && <div><dt>Script forecasts</dt><dd><b className="num">{Number(c.script_forecasts_settled ?? 0).toLocaleString('en-US')}</b> of {Number(c.script_forecasts).toLocaleString('en-US')} settled</dd></div>}
        {pr?.n ? <div><dt>Calibration</dt><dd>Brier <b className="num">{pr.model?.brier}</b> model vs <b className="num">{pr.market?.brier}</b> market on {Number(pr.n).toLocaleString('en-US')} settled contracts (lower is better)</dd></div> : null}
        {l?.generated_at_utc && <div><dt>Latest evaluation</dt><dd>{new Date(l.generated_at_utc).toLocaleString()}</dd></div>}
        {l?.versions && <div><dt>Versions</dt><dd className="small">{Object.values(l.versions).slice(0, 4).join(' · ')}</dd></div>}
      </dl>
      <Link to={routes.scorecard(slug)} className="nlink">Open the scorecard <Icon name="arrowRight" size={14} /></Link>
    </section>
  );
}

export function NhlHomeView() {
  const { sport, repo, slug, metrics } = useSport();
  const board = useAsync(`board:${sport.code}:${repo.source.root}`, () => repo.board());
  useVisit(sport.label, 'sport');
  const now = useNow(30_000);
  const items = useMemo(() => slateItems(board.data?.items ?? [], now), [board.data, now]);
  const research = useSlateResearch(repo, sport.code, items);
  const learning = readLearning(metrics);
  if (board.loading) return <div className="page"><Skeleton lines={6} tall /></div>;
  if (!board.data) return <div className="page"><ErrorState error={board.error} what="NHL board" /></div>;
  const rmap = research.data ?? new Map<string, EventResearchDoc>();
  const games = items.map((item) => ({ item, r: rmap.get(item.event_id) })).filter((x): x is { item: BoardItem; r: EventResearchDoc } => !!x.r);
  const upcoming = items.filter((i) => gamePhase({ status: i.status, start_time_utc: i.start_time_utc }, now).phase === 'UPCOMING');
  const live = items.filter((i) => gamePhase({ status: i.status, start_time_utc: i.start_time_utc }, now).phase === 'LIVE').length;
  const final = items.length - upcoming.length - live;
  const runAt = games.map(({ r }) => { const s = readNhl(r); return isNhlScripts(s) && !s.frozen ? s.generatedAt : null; }).filter((x): x is string => !!x).sort().pop() ?? null;
  const priced = upcoming.filter((i) => i.markets_available > 0);
  const lastCapture = priced.map((i) => i.market_captured_at).filter((x): x is string => !!x).sort().pop() ?? null;
  const modelState: Fresh = upcoming.length ? (runAt ? modelFreshness(runAt, 'UPCOMING', now) : 'UNKNOWN') : runAt ? 'FROZEN' : 'UNKNOWN';
  const priceState: Fresh = priced.length ? worst(priced.map((i) => priceFreshness(i.market_captured_at, now))) : 'UNKNOWN';
  const day = items[0] ? slateDay(items.find((i) => gamePhase({ status: i.status, start_time_utc: i.start_time_utc }, now).phase !== 'FINAL')?.start_time_utc ?? items[0].start_time_utc) : null;
  return (
    <div className="page nhx">
      <header className="nhx__head">
        <div className="nhx__title">
          <h1 className="nhx__h"><img src={`${import.meta.env.BASE_URL}leagues/nhl.webp`} alt="" aria-hidden="true" className="nhx__league" />NHL</h1>
          <span className="nhx__sub">{day ?? 'No games'}{items.length ? <> · <b>{items.length}</b> game{items.length === 1 ? '' : 's'}</> : null}{live ? <> · {live} live</> : null}{final ? <> · {final} final</> : null}</span>
        </div>
        <div className="nhx__status" aria-label="Data status">
          {upcoming.length > 0 && <FreshPill label="Model" state={modelState} at={runAt} now={now} glyph="chances" />}
          {upcoming.length > 0 && <FreshPill label="Prices" state={priceState} at={lastCapture} now={now} glyph="moneyline" />}
          <ResearchPill learning={learning} slug={slug} />
        </div>
      </header>
      {modelState === 'STALE' && <p className="nstale" role="alert"><Glyph name="alert" size={16} /> The latest NHL simulation is more than six hours old. Projections below may not reflect current goalies or lines.</p>}

      <SlateList items={items} research={research.data ?? null} slug={slug} now={now} loading={research.loading} />

      <div className="nhx__grid">
        <StrongestResearch games={games.filter(({ item }) => gamePhase({ status: item.status, start_time_utc: item.start_time_utc }, now).phase === 'UPCOMING')} slug={slug} started={items.length > 0 && upcoming.length === 0} />
        <ResearchStatus slug={slug} />
      </div>
    </div>
  );
}
