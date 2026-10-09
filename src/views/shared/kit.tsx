// Small building blocks shared by the sport verticals that read the generic contract shapes (Soccer, Tennis, NBA):
// a sport header, a grouped market board with the model's probability beside the market's, a ranked matchup table,
// and a few chips. Every number shown comes from a published document; authority words come from the publication.
import { Link } from 'react-router';
import type { ReactNode } from 'react';
import type { Market, MatchupRow, MetricDef, ModelPrice, Projection } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { QuoteChip, QuoteSummaryChip, useQuoteViews } from '../../components/LiveQuote';
import { metricFormatter } from '../../lib/format';
import { routes } from '../../lib/routes';
import { useLiveQuotes } from '../../live/hooks';
import type { QuoteView } from '../../live/overlay';
import '../../styles/sportkit.css';

/** The sport's masthead: league mark, title, one line of facts, status chips on the right. */
export function SportHeader({ logo, title, sub, status, actions }: { logo?: string | null; title: string; sub?: ReactNode; status?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="skh">
      <div className="skh__title">
        <h1 className="skh__h">{logo && <img src={logo} alt="" aria-hidden="true" className="skh__logo" />}{title}</h1>
        {sub && <span className="skh__sub">{sub}</span>}
      </div>
      {(status || actions) && (
        <div className="skh__right">
          {status && <div className="skh__status" aria-label="Data status">{status}</div>}
          {actions && <div className="skh__actions">{actions}</div>}
        </div>
      )}
    </header>
  );
}

export function Pill({ tone = 'neutral', children, title }: { tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'research'; children: ReactNode; title?: string }) {
  return <span className={`skpill skpill--${tone}`} title={title}>{children}</span>;
}

/** The publication's authority word, always visible beside a model number. */
export function Authority({ value }: { value: string | null | undefined }) {
  const v = (value ?? 'RESEARCH_ONLY').toUpperCase();
  const tone = v === 'ACTIONABLE' || v === 'LIVE' ? 'ok' : 'research';
  return <Pill tone={tone} title="The publication's own authority for this number">{v.replace(/_/g, ' ').toLowerCase()}</Pill>;
}

export function KV({ rows }: { rows: { k: ReactNode; v: ReactNode }[] }) {
  return (
    <dl className="skkv">
      {rows.filter((r) => r.v != null && r.v !== '').map((r, i) => <div key={i}><dt>{r.k}</dt><dd>{r.v}</dd></div>)}
    </dl>
  );
}

export function Section({ id, title, sub, children, actions, className }: { id: string; title: ReactNode; sub?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`sksec${className ? ` ${className}` : ''}`} aria-labelledby={`${id}-h`}>
      <div className="sksec__h">
        <div><h2 id={`${id}-h`} className="sksec__t">{title}</h2>{sub && <p className="sksec__s">{sub}</p>}</div>
        {actions && <div className="sksec__x">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** A closed-by-default research layer: the viewer opens it when the headline is not enough. */
export function Deep({ summary, children, open }: { summary: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="skdeep" open={open}>
      <summary className="skdeep__s">{summary}<Icon name="chevronDown" size={14} /></summary>
      <div className="skdeep__b">{children}</div>
    </details>
  );
}

export const pct0 = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
export const pct1 = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
export const centsOf = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
export const signedPts = (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v * 1000) / 10)} pts`);

/** Mid of a two-sided quote, else the publication's implied probability. */
export function midOf(v: QuoteView, fallback: number | null): number | null {
  if (v.yesBid != null && v.yesAsk != null) return (v.yesBid + v.yesAsk) / 2;
  return v.yesAsk ?? fallback;
}

export interface FamilyGroup {
  family: string;
  label: string;
  rows: Market[];
}

export function groupByFamily(markets: Market[], order: string[], label: (f: string) => string): FamilyGroup[] {
  const m = new Map<string, Market[]>();
  for (const x of markets) m.set(x.market_family, [...(m.get(x.market_family) ?? []), x]);
  const idx = (f: string) => (order.indexOf(f) === -1 ? 999 : order.indexOf(f));
  return [...m.entries()].sort((a, b) => idx(a[0]) - idx(b[0]) || a[0].localeCompare(b[0])).map(([family, rows]) => ({
    family, label: label(family), rows: [...rows].sort((a, b) => (a.line ?? a.threshold ?? 0) - (b.line ?? b.threshold ?? 0) || a.yes_description.localeCompare(b.yes_description)),
  }));
}

/** The model's P(YES) for a market: the latest model price, else the research projection. */
export function fairFor(marketId: string, prices: Map<string, ModelPrice>, projections: Projection[]): { fair: number | null; authority: string | null; version: string | null; low: number | null; high: number | null } {
  const mp = prices.get(marketId);
  if (mp && mp.fair_probability != null) return { fair: mp.fair_probability, authority: ((mp.extensions as Record<string, unknown> | null)?.authority as string | undefined) ?? null, version: mp.model_version, low: mp.lower_bound, high: mp.upper_bound };
  const p = projections.find((x) => x.market_id === marketId && x.fair_probability != null);
  return { fair: p?.fair_probability ?? null, authority: p?.authority ?? null, version: p?.model_version ?? null, low: p?.lower_bound ?? null, high: p?.upper_bound ?? null };
}

/**
 * Every market on a game, grouped by family in the sport's own words. YES and NO asks (the price a buyer actually pays),
 * the model's P(YES) where the publication prices the contract, and the gap against the market mid — research
 * evidence beside an executable price, never a pick. Quotes refresh at game cadence while the screen is open.
 */
export function MarketFamilies({ markets, prices, projections, title, familyLabel, order, slug, eventId, now, authority, cadence = 'game' }: {
  markets: Market[]; prices: Map<string, ModelPrice>; projections: Projection[]; title: (m: Market) => string; familyLabel: (f: string) => string; order: string[];
  slug: string; eventId: string; now: number; authority?: string | null; cadence?: 'game' | 'detail' | 'slate' | 'background';
}) {
  useLiveQuotes(markets.map((m) => m.kalshi_ticker), cadence, [...new Set(markets.map((m) => m.kalshi_event_ticker).filter((e): e is string => !!e))]);
  const views = useQuoteViews(markets);
  const viewOf = new Map(markets.map((m, i) => [m.market_id, views[i]]));
  const groups = groupByFamily(markets, order, familyLabel);
  const priced = markets.filter((m) => fairFor(m.market_id, prices, projections).fair != null).length;
  if (!markets.length) return <p className="muted">No Kalshi contract is published for this game yet.</p>;
  return (
    <div className="skmk">
      <div className="skmk__bar">
        <QuoteSummaryChip views={views} now={now} />
        <span className="muted small">{priced ? <>{priced} of {markets.length} contracts carry a model probability{authority ? <> · <Authority value={authority} /></> : null}</> : <>The model prices none of these {markets.length} contracts: prices only, no edge is derived.</>}</span>
      </div>
      {groups.map((g) => (
        <div key={g.family} className="skmk__fam">
          <h3 className="skmk__ft">{g.label} <span className="skmk__n">{g.rows.length}</span></h3>
          <div className="tscroll">
            <table className="dtable skmk__t">
              <thead><tr><th scope="col">Contract</th><th scope="col" className="r">YES ask</th><th scope="col" className="r">NO ask</th><th scope="col" className="r">Model P(YES)</th><th scope="col" className="r">vs mid</th></tr></thead>
              <tbody>
                {g.rows.map((m) => {
                  const v = viewOf.get(m.market_id)!;
                  const f = fairFor(m.market_id, prices, projections);
                  const mid = midOf(v, m.market_probability);
                  const gap = f.fair != null && mid != null ? f.fair - mid : null;
                  return (
                    <tr key={m.market_id}>
                      <th scope="row"><Link to={routes.market(slug, m.market_id, eventId)} className="skmk__m">{title(m)}</Link>{v.availability !== 'OPEN' && v.availability !== 'UNKNOWN' && <span className="skmk__st">{v.availability.toLowerCase()}</span>}</th>
                      <td className="r num">{centsOf(v.yesAsk)}</td>
                      <td className="r num">{centsOf(v.noAsk ?? (v.yesBid != null ? 1 - v.yesBid : null))}</td>
                      <td className="r num">{f.fair != null ? pct0(f.fair) : <span className="muted">not priced</span>}</td>
                      <td className="r">{gap != null ? <span className={`gap ${Math.round(gap * 100) > 0 ? 'gap--pos' : Math.round(gap * 100) < 0 ? 'gap--neg' : 'gap--flat'}`}>{signedPts(gap)}</span> : <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="muted small">Asks are the current quote where Sift has one (live or the quote feed), otherwise the publication's capture; each chip carries its real age. "vs mid" is the model's P(YES) minus the market midpoint: a research gap, not a validated edge and not executable at the mid.</p>
    </div>
  );
}

/** One market's quote chip for a row that already knows its view. */
export function RowQuote({ view, now }: { view: QuoteView; now: number }) {
  return <QuoteChip view={view} now={now} />;
}

/**
 * Ranked matchup rows from the publication's event research: each side's value and its rank in the publication's
 * own universe ("of 20 Premier League teams"), with bars from rank. Higher-is-better comes from the metric registry.
 */
export function RankRows({ rows, metrics, left, right, leftId, rightId, slug, eventId, universeNoun }: {
  rows: MatchupRow[]; metrics: Map<string, MetricDef>; left: { label: string; side: 'home' | 'away' }; right: { label: string; side: 'home' | 'away' };
  leftId: string; rightId: string; slug: string; eventId: string; universeNoun?: string;
}) {
  const shown = rows.filter((r) => r.home || r.away);
  if (!shown.length) return <p className="muted">No matchup metrics published for this game.</p>;
  const strength = (c: { rank: number | null; universe_size: number | null } | null | undefined) => (c?.rank != null && c.universe_size ? ((c.universe_size - c.rank + 1) / c.universe_size) * 100 : null);
  const u = shown[0][left.side]?.context?.universe_size ?? shown[0][right.side]?.context?.universe_size ?? null;
  const ulabel = shown[0][left.side]?.context?.universe_label ?? shown[0][right.side]?.context?.universe_label ?? null;
  return (
    <div className="skrk">
      <div className="skrk__head" aria-hidden="true"><span>{left.label}</span><span>{u ? `rank of ${u}${universeNoun ? ` ${universeNoun}` : ulabel ? ` · ${ulabel}` : ''} · #1 is best` : 'published value'}</span><span>{right.label}</span></div>
      <ul className="skrk__rows">
        {shown.map((r) => {
          const def = metrics.get(r.metric_id);
          const a = r[left.side];
          const b = r[right.side];
          const scale = Math.max(Math.abs(a?.context?.best_value ?? 0), Math.abs(a?.context?.worst_value ?? 0), Math.abs(b?.context?.best_value ?? 0), Math.abs(b?.context?.worst_value ?? 0));
          const fmt = metricFormatter(def, scale);
          const pa = strength(a?.context);
          const pb = strength(b?.context);
          return (
            <li key={r.metric_id}>
              <Link to={routes.metric(slug, r.metric_id, { team: leftId, opp: rightId, event: eventId })} className="skrk__row">
                <span className="skrk__v"><span className="skrk__rank num">{a?.context?.rank != null ? `#${a.context.rank}` : ''}</span><span className="num skrk__raw">{a?.display_value ?? fmt(a?.value ?? null)}</span></span>
                <span className="skrk__bars">
                  <span className="skrk__half skrk__half--l"><span style={{ width: `${pa ?? 0}%` }} /></span>
                  <span className="skrk__name" title={def?.description}>{def?.short_name ?? r.name}</span>
                  <span className="skrk__half skrk__half--r"><span style={{ width: `${pb ?? 0}%` }} /></span>
                </span>
                <span className="skrk__v skrk__v--r"><span className="num skrk__raw">{b?.display_value ?? fmt(b?.value ?? null)}</span><span className="skrk__rank num">{b?.context?.rank != null ? `#${b.context.rank}` : ''}</span></span>
              </Link>
            </li>
          );
        })}
      </ul>
      {shown[0].note && <p className="muted small">{shown[0].note}</p>}
    </div>
  );
}

/** A two-sided probability bar in words and numbers ("53% · draw 26% · 21%"). */
export function ThreeWay({ home, draw, away, homeLabel, awayLabel, label }: { home: number | null; draw: number | null; away: number | null; homeLabel: string; awayLabel: string; label: string }) {
  if (home == null || away == null) return null;
  const h = Math.round(home * 100);
  const d = draw == null ? 0 : Math.round(draw * 100);
  const a = Math.max(0, 100 - h - d);
  return (
    <div className="sk3w" role="img" aria-label={`${label}: ${homeLabel} ${h}%${draw != null ? `, draw ${d}%` : ''}, ${awayLabel} ${a}%`}>
      <span className="sk3w__v num">{h}%</span>
      <span className="sk3w__bar" aria-hidden="true"><i className="sk3w__h" style={{ width: `${h}%` }} />{draw != null && <i className="sk3w__d" style={{ width: `${d}%` }} />}<i className="sk3w__a" style={{ width: `${a}%` }} /></span>
      <span className="sk3w__v num">{a}%</span>
      {draw != null && <span className="sk3w__draw">draw <b className="num">{d}%</b></span>}
    </div>
  );
}

/** A text mark for a club or player with no committed logo: initials on a tile. Identity never depends on an image. */
export function TextMark({ text, size = 'md', color }: { text: string; size?: 'sm' | 'md' | 'lg' | 'xl'; color?: string | null }) {
  return <span className={`teammark teammark--text teammark--${size} skmark`} aria-hidden="true" style={color ? { ['--mk' as string]: color } : undefined}>{text}</span>;
}
