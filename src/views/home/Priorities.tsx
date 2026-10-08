// SLATE PRIORITIES — the NFL home's "where to look first" rail. Three to five items at most, each chosen by a
// documented rule in lib/priorities.ts from the week's real publication and live quotes, each linking into the
// game or market it is about. A section with nothing that qualifies is left out (the Top SIFT Edge says so in one
// line instead); nothing is filled in to keep the layout.
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { BoardItem, EventResearchDoc, Market, Recommendation } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { TeamMark } from '../../components/ui';
import { formatQuoteAgo, quoteAgeMs } from '../../live/freshness';
import { useLiveQuotes } from '../../live/hooks';
import { quoteView } from '../../live/overlay';
import { isFullGame } from '../../lib/period';
import { HOLDS_MIN_COVERAGE, HOLDS_MIN_GAP, isActionable, slatePriorities, type GameRef, type WatchPick } from '../../lib/priorities';
import { routes } from '../../lib/routes';
import { sharePct } from '../../lib/scripts';
import { Info } from '../game/panels';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const pct = (v: number) => `${Math.round(v * 100)}%`;
const cents = (v: number) => `${Math.round(v * 100)}¢`;
/** "The closest game of the week: decided by 6…" → "Decided by 6…" (the tag already names the signal). */
const terse = (reason: string) => {
  const t = reason.replace(/^The [^:]+: /, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function Matchup({ g, sport }: { g: GameRef; sport: string }) {
  return (
    <span className="prio__match">
      <span className="prio__logos" aria-hidden="true"><TeamMark sport={sport} abbr={g.away} size="sm" /><TeamMark sport={sport} abbr={g.home} size="sm" /></span>
      <span className="prio__teams">{g.awayName} <span className="prio__at">at</span> {g.homeName}</span>
      <span className="prio__when">{when(g.kickoff)}</span>
    </span>
  );
}

function Standout({ w, slug, sport, compact }: { w: WatchPick; slug: string; sport: string; compact?: boolean }) {
  return (
    <Link to={routes.game(slug, w.game.eventId)} className={`prio__a${compact ? ' prio__a--compact' : ''}`} aria-label={`${w.game.awayName} at ${w.game.homeName}: ${w.reason} Open game.`}>
      <Matchup g={w.game} sport={sport} />
      {compact ? <span className="prio__why"><b className="prio__tag">{w.tag}:</b> {terse(w.reason)}</span> : <span className="prio__why">{w.reason}</span>}
      {!compact && w.lead && <span className="prio__lead"><i className={`sdot sdot--s${w.lead.index}`} aria-hidden="true" />Most likely: {w.lead.name} <b className="num">{sharePct(w.lead.share)}</b></span>}
      <Icon name="chevronRight" size={16} className="prio__go" />
    </Link>
  );
}

const HOW = (
  <>
    Each item is picked by a fixed rule from this week’s NFL publication — nothing is hand-picked, and an empty
    section stays empty.
    <br /><br /><b>Top SIFT Edge</b> appears only when the publication itself recommends a market and its live price is fresh and
    still under SIFT’s limit. The NFL model is research-only until it beats the market, so most weeks this says so.
    <br /><br /><b>Holds up across scripts</b> is a moneyline or spread that wins in at least two of the four game scripts, covering
    at least {pct(HOLDS_MIN_COVERAGE)} of simulated games, priced 10–90¢ on a fresh quote, with SIFT’s model at least {Math.round(HOLDS_MIN_GAP * 100)} points
    above the market.
    <br /><br /><b>Game to watch</b> and <b>Worth a look</b> are the games that stand out most from the rest of the week — the likeliest
    blowout, the closest game, the highest- or lowest-scoring game, or where SIFT and the market disagree most on the
    spread or total. Unusual, not a bet.
  </>
);

export function SlatePriorities({ items, research, recommendations, recError, slug, sport, now, loading }: { items: BoardItem[]; research: Map<string, EventResearchDoc>; recommendations: Recommendation[] | undefined; recError: boolean; slug: string; sport: string; now: number; loading: boolean }) {
  // Live quotes for every full-game moneyline and spread on an upcoming game: the only markets the rail can price.
  const markets = useMemo(() => {
    const out: Market[] = [];
    for (const i of items) {
      if (!isActionable(i, now)) continue;
      for (const m of research.get(i.event_id)?.markets ?? []) if (isFullGame(m.period) && (m.market_family === 'game_winner' || m.market_family === 'spread')) out.push(m);
    }
    return out;
  }, [items, research, now]);
  const live = useLiveQuotes(markets.map((m) => m.kalshi_ticker), 'slate');
  const p = useMemo(
    () => slatePriorities({ items, research, recommendations: recError ? null : (recommendations ?? []), quote: (m) => quoteView(m, live.quote(m.kalshi_ticker)), now, sport }),
    [items, research, recommendations, recError, live, now, sport],
  );

  const waiting = loading || (!recError && recommendations === undefined);
  const nothingUpcoming = !loading && items.filter((i) => isActionable(i, now)).length === 0;

  return (
    <section className="prio" aria-labelledby="prio-h">
      <header className="prio__head">
        <span className="eyebrow">Slate priorities</span>
        <h2 className="prio__t" id="prio-h">Where to look first</h2>
        <Info label="How SIFT picks these" align="end">{HOW}</Info>
      </header>

      {waiting ? (
        <p className="prio__state">Reading this week’s research…</p>
      ) : nothingUpcoming ? (
        <p className="prio__state"><b>No upcoming games</b> Every game in this publication has kicked off or finished. Priorities return with the next slate.</p>
      ) : (
        <ol className="prio__l">
          <li className="prio__i prio__i--edge">
            <span className="prio__k"><Icon name="star" size={15} />Top SIFT edge</span>
            {p.edge.kind === 'edge' ? (
              <Link to={routes.market(slug, p.edge.item.market.market_id, p.edge.item.game.eventId)} className="prio__a">
                <span className="prio__mk"><b>{p.edge.item.label}</b><span className="prio__px num">{cents(p.edge.item.ask)}</span></span>
                <Matchup g={p.edge.item.game} sport={sport} />
                <span className="prio__why">SIFT prices it at {pct(p.edge.item.fair)}; the market asks {cents(p.edge.item.ask)}.</span>
                <Icon name="chevronRight" size={16} className="prio__go" />
              </Link>
            ) : (
              <p className={`prio__none prio__none--${p.edge.kind}`}><b>{p.edge.title}</b> {p.edge.text}</p>
            )}
          </li>

          {p.holds.kind === 'pick' && (
            <li className="prio__i prio__i--holds">
              <span className="prio__k"><Icon name="shield" size={15} />Holds up across scripts</span>
              <Link to={routes.market(slug, p.holds.item.market.market_id, p.holds.item.game.eventId)} className="prio__a" aria-label={`${p.holds.item.label}: holds up in ${p.holds.item.full} of ${p.holds.item.of} game scripts, ${pct(p.holds.item.coverage)} of simulated games. Open market.`}>
                <span className="prio__mk"><TeamMark sport={sport} abbr={p.holds.item.team} size="sm" /><b>{p.holds.item.label}</b><span className="prio__px num">{cents(p.holds.item.ask)}</span></span>
                <span className="prio__why">Holds up in {p.holds.item.full} of {p.holds.item.of} game scripts — {pct(p.holds.item.coverage)} of simulations.</span>
                <span className="prio__wins">{p.holds.item.wins.map((w) => <span key={w.name}><i className={`sdot sdot--s${w.index}`} aria-hidden="true" />{w.name}</span>)}</span>
                <span className="prio__meta"><span>{p.holds.item.game.awayName} at {p.holds.item.game.homeName} · {when(p.holds.item.game.kickoff)}</span><span>SIFT {pct(p.holds.item.model)} · price {formatQuoteAgo(quoteAgeMs(p.holds.item.quote.observedAt, now))}</span></span>
                <Icon name="chevronRight" size={16} className="prio__go" />
              </Link>
            </li>
          )}
          {p.holds.kind === 'stale' && (
            <li className="prio__i prio__i--holds">
              <span className="prio__k"><Icon name="shield" size={15} />Holds up across scripts</span>
              <p className="prio__none prio__none--stale"><b>Waiting for updated markets</b> Current quote data is stale, so no price is checked against the scripts.</p>
            </li>
          )}

          {p.watch && (
            <li className="prio__i prio__i--watch">
              <span className="prio__k"><Icon name="flame" size={15} />Game to watch</span>
              <Standout w={p.watch} slug={slug} sport={sport} />
            </li>
          )}

          {p.look.length > 0 && (
            <li className="prio__i prio__i--look">
              <span className="prio__k"><Icon name="eye" size={15} />Worth a look</span>
              <ul className="prio__sub">
                {p.look.map((w) => <li key={w.game.eventId}><Standout w={w} slug={slug} sport={sport} compact /></li>)}
              </ul>
            </li>
          )}

          {!p.watch && p.scriptsMissing > 0 && p.scriptsMissing === p.eligible && (
            <li className="prio__i">
              <p className="prio__none"><b>Scripts still processing</b> Game-by-game analysis will appear here when the simulations are published.</p>
            </li>
          )}
        </ol>
      )}
      <p className="prio__foot">Research evidence, not bets. Tap any item for the full analysis.</p>
    </section>
  );
}
