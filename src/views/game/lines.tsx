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

/* eslint-disable @typescript-eslint/no-explicit-any */

const half = (v: number) => (Math.round(Math.abs(v) * 2) / 2).toFixed(1).replace(/\.0$/, '');

export function LinesPanel({ r, homeAbbr, awayAbbr, to, views, now }: { r: EventResearchDoc; homeAbbr: string; awayAbbr: string; to: string; views: QuoteView[]; now: number }) {
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
        <QuoteSummaryChip views={views} now={now} />
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


