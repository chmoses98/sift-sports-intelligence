// The lines, quietly: the market's spread, total and win chance, with Sift's simulation as a small second
// number where it differs — context near the bottom of the game, not the argument the page opens with.
// Plus the scheme table (charted tendencies for both teams, rank first).
import { Link } from 'react-router';
import type { EventResearchDoc } from '../../contract/types';
import { QuoteSummaryChip } from '../../components/LiveQuote';
import { Icon } from '../../components/Icon';
import { TeamMark } from '../../components/ui';
import { SCHEMES, schemeFor } from '../../history/team';
import type { TeamHistoryDoc } from '../../history/types';
import type { GameSides } from '../../insights/game';
import { rankView } from '../../lib/rank';
import { RankBadge } from '../../components/insight';
import type { QuoteView } from '../../live/overlay';
import { PanelHead } from './panels';
import type { Market, MarketHistoryDoc } from '../../contract/types';
import type { PriceRow } from '../../lib/gamedata';
import { readableNote, tickerTitle } from '../../lib/marketLabel';
import { isFullGame } from '../../lib/period';
import { priceMove, sparkPath, type PricePoint } from '../../lib/priceMoves';
import { routes } from '../../lib/routes';
import { splitSentence } from '../../lib/scriptNames';
import '../../styles/lane-d-markets.css';

/* eslint-disable @typescript-eslint/no-explicit-any */

const half = (v: number) => (Math.round(Math.abs(v) * 2) / 2).toFixed(1).replace(/\.0$/, '');

export function LinesPanel({ r, homeAbbr, awayAbbr, to, views, now, chip = true }: { r: EventResearchDoc; homeAbbr: string; awayAbbr: string; to: string; views: QuoteView[]; now: number; chip?: boolean }) {
  const ext = r.extensions as any;
  const mi = ext?.market_implied;
  const mv = ext?.model_view;
  if (!mi && !mv) return null;
  const mSpread = mi?.implied_spread != null ? Number(mi.implied_spread) : null;
  const sSpread = mv?.model_spread != null ? Number(mv.model_spread) : null;
  const fav = (v: number | null) => (v == null ? null : v <= 0 ? homeAbbr : awayAbbr);
  const line = (v: number | null) => (v == null ? '—' : Math.abs(v) < 0.5 ? 'Pick’em' : `${fav(v)} −${half(v)}`);
  const mFav = fav(mSpread) ?? homeAbbr;
  const tiles = [
    { k: 'Spread', m: line(mSpread), s: line(sSpread), same: mSpread != null && sSpread != null && Math.abs(mSpread - sSpread) < 1 },
    { k: 'Total', m: mi?.implied_total_median != null ? half(mi.implied_total_median) : '—', s: mv?.model_total != null ? half(mv.model_total) : '—', same: mi?.implied_total_median != null && mv?.model_total != null && Math.abs(mi.implied_total_median - mv.model_total) < 1 },
    { k: `${mFav} win chance`, m: mi?.win_probability?.[mFav] != null ? `${Math.round(mi.win_probability[mFav] * 100)}%` : '—', s: mv?.model_win_probability?.[mFav] != null ? `${Math.round(mv.model_win_probability[mFav] * 100)}%` : '—', same: mi?.win_probability?.[mFav] != null && mv?.model_win_probability?.[mFav] != null && Math.abs(mi.win_probability[mFav] - mv.model_win_probability[mFav]) < 0.03 },
  ];
  return (
    <section className="panel lines" aria-labelledby="lines-h">
      <PanelHead title="The Lines" sub="What the market prices this game at">
        {chip && <span className="gquote"><QuoteSummaryChip views={views} now={now} /></span>}
      </PanelHead>
      <dl className="lines__t">
        {tiles.map((t) => (
          <div key={t.k} className="lines__c">
            <dt>{t.k}</dt>
            <dd className="lines__m num">{t.m}</dd>
            <dd className="lines__s">{t.same ? 'Sift sim agrees' : <>Sift sim <span className="num">{t.s}</span></>}</dd>
          </div>
        ))}
      </dl>
      <p className="lines__x"><Link to={to}>Every market, price and line move <Icon name="arrowRight" size={14} /></Link></p>
    </section>
  );
}

/** Both teams' charted scheme tendencies, rank first (games before this week). */
export function SchemeTable({ doc, g }: { doc: TeamHistoryDoc; g: GameSides }) {
  if (g.week == null) return null;
  const pct = (v: number | null, key: string) => (v == null ? '—' : key === 'epa_vs_blitz' ? `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} EPA` : `${Math.round(v * 100)}%`);
  return (
    <section className="stratum" aria-labelledby="g-scheme-h">
      <header className="stratum__head"><div className="stratum__titles"><h2 className="stratum__title" id="g-scheme-h">Scheme tendencies</h2><p className="stratum__sub">FTN charting via nflverse, weeks before this game. Tendencies are ranked highest-first; "vs the blitz" is ranked best-first. Man/zone coverage is not published for 2026.</p></div></header>
      <div className="tscroll">
        <table className="dtable schemet">
          <thead><tr><th scope="col">Measure</th>{[g.away, g.home].map((t) => <th key={t.abbr} scope="col"><TeamMark sport="NFL" abbr={t.abbr} size="sm" /> {t.abbr}</th>)}</tr></thead>
          <tbody>
            {SCHEMES.map((d) => (
              <tr key={d.key}>
                <th scope="row">{d.label}<span className="schemet__side">{d.side === 'def' ? 'defense' : 'offense'}</span></th>
                {[g.away, g.home].map((t) => {
                  const v = schemeFor(doc, d.key, t.abbr, g.week!);
                  const rv = v?.rank != null ? rankView({ rank: v.rank, universe_size: v.of, higher_is_better: d.quality ? true : null }) : null;
                  return (
                    <td key={t.abbr}>
                      {rv ? <RankBadge rank={rv} raw={`${pct(v!.value, d.key)} · n=${v!.n}`} compact /> : <span className="muted small">{v && v.n ? `n=${v.n}, too few to rank` : '—'}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}



// ------------------------------------------------------------------ price moves and unresolved questions (owner item 41)

export function Spark({ points, label }: { points: PricePoint[]; label: string }) {
  const w = 140;
  const h = 40;
  const p = sparkPath(points, w, h);
  return (
    <svg className="lsd-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path className="a" d={p.area} />
      <path className="l" d={p.line} />
      <circle className="o" cx={p.first[0]} cy={p.first[1]} r={2.5} />
      <circle cx={p.last[0]} cy={p.last[1]} r={3} />
    </svg>
  );
}

/** The contracts whose movement is worth a line: the publication's own biggest movers, then the main game lines. */
export function moveCandidates(r: EventResearchDoc, hist: MarketHistoryDoc | undefined, rows: PriceRow[]): string[] {
  if (!hist) return [];
  const have = new Set(hist.series.map((x) => x.kalshi_ticker));
  const pub = (((r.extensions as any)?.game_script_inputs?.market_baseline?.game_line_moves ?? []) as { ticker: string }[]).map((m) => m.ticker);
  const main = (fams: string[]) => rows
    .filter((x) => fams.includes(x.m.market_family) && isFullGame(x.m.period) && have.has(x.m.kalshi_ticker) && x.mid != null)
    .sort((a, b) => Math.abs((a.mid ?? 0) - 0.5) - Math.abs((b.mid ?? 0) - 0.5))[0]?.m.kalshi_ticker;
  const fav = rows.filter((x) => x.m.market_family === 'game_winner' && isFullGame(x.m.period) && have.has(x.m.kalshi_ticker) && x.mid != null).sort((a, b) => (b.mid ?? 0) - (a.mid ?? 0))[0]?.m.kalshi_ticker;
  return [...new Set([...pub, fav, main(['spread']), main(['total'])].filter((t): t is string => !!t && have.has(t)))].slice(0, 6);
}

export function PriceMovesPanel({ r, hist, loading, rows, known, slug }: { r: EventResearchDoc; hist: MarketHistoryDoc | undefined; loading: boolean; rows: PriceRow[]; known: Map<string, Market>; slug: string }) {
  const questions = (r.context?.notes ?? []).filter((n) => n.startsWith('packet key question:')).map((n) => readableNote(n.replace('packet key question: ', ''), known));
  const tickers = moveCandidates(r, hist, rows);
  const moves = tickers.map((t) => {
    const series = hist!.series.find((x) => x.kalshi_ticker === t)!;
    const row = rows.find((x) => x.m.kalshi_ticker === t);
    const mv = priceMove(series.points, row ? { v: row.mid, at: row.m.captured_at ?? null } : null);
    return mv ? { t, mv, label: row?.label ?? tickerTitle(t, known), id: row?.m.market_id ?? series.market_id } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  if (!loading && !moves.length && !questions.length) return null;
  return (
    <section className="fx-card" id="g-moves" aria-labelledby="g-moves-h" data-testid="price-moves">
      <h2 className="fx-card__t" id="g-moves-h"><Icon name="trend" size={17} /> How prices moved</h2>
      <p className="fx-card__sub">The YES price since the contract was first captured: where it opened, where it is now and when. A move is the market changing its mind, not evidence for either side.</p>
      {loading && <p className="lsd-note">Loading price history…</p>}
      {!loading && !moves.length && <p className="lsd-note">No capture history is published for this game’s main lines.</p>}
      <div className="lsd-moves">
        {moves.map(({ t, mv, label, id }) => {
          const d = Math.round(mv.change * 100);
          return (
            <Link key={t} to={routes.market(slug, id, r.event.event_id)} className="lsd-move" data-testid="price-move">
              <span><span className="lsd-move__t">{label}</span><span className="lsd-move__s">{mv.words}</span></span>
              <Spark points={mv.points} label={`${label}: ${mv.words}`} />
              <span className="lsd-move__v"><b className="num">{Math.round(mv.now * 100)}¢</b><small className={`num lsd-move__d--${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}`}>{d > 0 ? '▲' : d < 0 ? '▼' : '±'} {Math.abs(d)}¢</small></span>
            </Link>
          );
        })}
      </div>
      {questions.length > 0 && (
        <>
          <h3 className="fx-card__t" style={{ marginTop: 18 }}><Icon name="research" size={16} /> What would change the read</h3>
          <ol className="lsd-q" data-testid="open-questions">
            {questions.map((q, i) => {
              const sp = splitSentence(q);
              return (
                <li key={q}>
                  <span className="lsd-q__n" aria-hidden="true">{i + 1}</span>
                  <div><span className="lsd-q__t">{sp.lead}</span>{sp.rest && <details><summary>Why it matters</summary>{sp.rest}</details>}</div>
                </li>
              );
            })}
          </ol>
          <p className="lsd-note">Open questions written by the publication’s handicap packet; unresolved until the news or the price answers them.</p>
        </>
      )}
    </section>
  );
}
