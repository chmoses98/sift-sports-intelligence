// MARKET COMPARISON STUDIO (owner item 39) — the contracts a game's publication judged, side by side in one clean
// table: what each costs and how fresh that price is, the fee-aware break-even, the publication's own probability where
// it publishes one, the edge after the fee, its bet-up-to, its authority, the strongest reason it loses, and a
// correlation warning when two columns are one exposure or cannot both win. Auto-populated by the documented ranking
// (never by gap size alone); any column can be replaced. Every figure is the opportunity layer's — the executable ask,
// the fee, the break-even and the publication's fair and limit (src/opportunity) — and shared dependencies and
// contradictions come from the settlement rules (src/opportunity/correlation.ts). Nothing here re-prices anything.
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from '../../routing';
import { decisionOf } from '../../lib/decision';
import { betPhrase } from '../../lib/betWords';
import { contradicts } from '../../opportunity/correlation';
import { PRICE_STATE_WORD } from '../../opportunity/pricing';
import { compareOpportunities } from '../../opportunity/rank';
import type { Opportunity } from '../../opportunity/types';
import { FreshChip } from '../../components/fxResearch';
import { useNow } from '../../live/hooks';
import '../../styles/lane-d-compare.css';

const c = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
const pct = (v: number | null | undefined) => (v == null ? null : `${Math.round(v * 100)}%`);
const pts = (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v * 1000) / 10)}¢`);

/** One warning per column: contradiction first (no outcome pays both), then the same-game exposure. */
export function correlationWarning(o: Opportunity, others: Opportunity[]): { tone: 'bad' | 'warn' | 'ok'; text: string } {
  const opp = others.filter((x) => contradicts(o, x));
  if (opp.length) return { tone: 'bad', text: `Cannot win together with ${opp.map((x) => betPhrase(x.what.side, x.what.title).text).join(', ')}` };
  const same = others.filter((x) => x.eventId === o.eventId);
  if (same.length) return { tone: 'warn', text: 'Same game as the other columns: one exposure, not diversification' };
  return { tone: 'ok', text: others.length ? 'Different games' : '—' };
}

export function MarketCompare({ opps, title = 'Market Comparison Studio' }: { opps: Opportunity[]; title?: string }) {
  const now = useNow(30_000);
  const ranked = useMemo(() => [...opps].sort(compareOpportunities), [opps]);
  const [picks, setPicks] = useState<(string | null)[]>([null, null, null]);
  if (ranked.length < 2) return null;
  const auto = ranked.slice(0, 3).map((o) => o.id);
  const ids = [0, 1, 2].map((i) => picks[i] ?? auto[i] ?? null).filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
  const cols = ids.map((id) => ranked.find((o) => o.id === id)!).filter(Boolean);
  const anyQualifies = cols.some((o) => o.status === 'ACTIONABLE' || o.status === 'RESEARCH_CANDIDATE');
  const set = (i: number, id: string) => setPicks((p) => p.map((x, k) => (k === i ? id : x)));
  const rows: { k: string; hint?: string; v: (o: Opportunity) => ReactNode }[] = [
    { k: 'Price', hint: 'The executable ask for this side', v: (o) => <><b className="lsc__px">{c(o.price.ask)}</b> <small className="muted">{o.what.side}</small></> },
    { k: 'Freshness', v: (o) => <><FreshChip at={o.price.observedAt} now={now} label="Price" /> <small className={`lsc__st lsc__st--${o.price.state.toLowerCase()}`}>{PRICE_STATE_WORD[o.price.state] ?? o.price.state.toLowerCase().replace(/_/g, ' ')}</small></> },
    { k: 'Break-even after fee', hint: 'Ask plus the Kalshi fee: the probability it must have to break even', v: (o) => <>{pct(o.price.breakEven) ?? '—'} <small className="muted">fee {c(o.price.fee)}</small></> },
    { k: 'Model probability', hint: "The publication's own probability for this side", v: (o) => pct(o.price.fair) ?? <span className="muted">Not published</span> },
    { k: 'Edge after fee', v: (o) => (o.price.evPerContract == null ? <span className="muted">—</span> : <span className={o.price.evPerContract > 0 ? 'lsc__pos' : 'lsc__neg'}>{pts(o.price.evPerContract)} <small className="muted">per $1</small></span>) },
    { k: 'Bet up to', v: (o) => (o.price.betUpTo == null ? <span className="muted">Not published</span> : c(o.price.betUpTo)) },
    { k: 'Authority', v: (o) => { const d = decisionOf(o.status, o.confidence.calibration); return <><span className={`dword dword--${d.tone}`}>{d.word}</span> <small className="muted">{o.authority.replace(/_/g, ' ').toLowerCase()} · {d.basis}</small></>; } },
    { k: 'Model record', v: (o) => <small>{o.confidence.record?.line ?? o.confidence.note ?? '—'}</small> },
    { k: 'Strongest counterargument', v: (o) => <small>{o.risk ?? '—'}</small> },
    { k: 'Correlation', v: (o) => { const w = correlationWarning(o, cols.filter((x) => x.id !== o.id)); return <span className={`lsc__corr lsc__corr--${w.tone}`}>{w.tone !== 'ok' && <b aria-hidden="true">{w.tone === 'bad' ? '✕ ' : '! '}</b>}{w.text}</span>; } },
  ];
  return (
    <section className="glass mcmp lsc" aria-labelledby="mcmp-h" data-testid="market-compare">
      <h2 className="tpanel__h" id="mcmp-h">{title}</h2>
      <p className="tpanel__note">{anyQualifies ? 'The best-supported expression first (authority, a current price, the worst-case edge — never the biggest gap alone), then the strongest alternatives. Replace any column.' : 'Nothing here qualifies at the current price: research comparisons, not recommendations. Replace any column.'}</p>
      <div className="lsc__scroll">
        <table className="lsc__t" style={{ ['--n' as string]: cols.length }}>
          <caption className="sr-only">{cols.map((o) => betPhrase(o.what.side, o.what.title).text).join(' vs ')}</caption>
          <thead>
            <tr>
              <th scope="col" className="lsc__k"><span className="sr-only">Measure</span></th>
              {cols.map((o, i) => (
                <th key={o.id} scope="col" className={`lsc__h${i === 0 && anyQualifies ? ' is-lead' : ''}`}>
                  <label className="lsc__sel"><span>{i === 0 && anyQualifies ? 'Best supported' : i === 0 ? 'Comparison 1' : `Alternative ${i}`}</span>
                    <select value={o.id} onChange={(e) => set(i, e.target.value)} aria-label={`Column ${i + 1} contract`}>{ranked.map((x) => <option key={x.id} value={x.id}>{betPhrase(x.what.side, x.what.title).text}</option>)}</select>
                  </label>
                  <Link to={o.href} className="lsc__name" title={betPhrase(o.what.side, o.what.title).exact}>{betPhrase(o.what.side, o.what.title).text}</Link>
                  <small className="lsc__ev">{o.eventLabel}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k}>
                <th scope="row" className="lsc__k" title={r.hint}>{r.k}</th>
                {cols.map((o) => <td key={o.id}>{r.v(o)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
