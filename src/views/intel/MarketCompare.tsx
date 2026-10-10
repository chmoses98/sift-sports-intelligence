// MARKET COMPARISON STUDIO — the contracts a game's publication judged, compared side by side so a viewer can see
// which one best expresses the thesis and why the others do not. Auto-populated: the best-supported expression (by
// the documented ranking, never by gap size alone), then the strongest alternatives; when nothing qualifies, the
// columns are labelled research comparisons, not recommendations. Any column can be replaced. Every figure is the
// opportunity layer's (the publication's fair and limit, the executable ask, the fee-aware break-even); shared
// dependencies and contradictions come from the settlement rules (src/opportunity/correlation.ts).
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { decisionOf } from '../../lib/decision';
import { betPhrase } from '../../lib/betWords';
import { contradicts } from '../../opportunity/correlation';
import { compareOpportunities } from '../../opportunity/rank';
import type { Opportunity } from '../../opportunity/types';

const c = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
const pct = (v: number | null | undefined) => (v == null ? 'Not published' : `${Math.round(v * 100)}%`);
const pts = (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v * 1000) / 10)} pts`);

export function MarketCompare({ opps, title = 'Market Comparison Studio' }: { opps: Opportunity[]; title?: string }) {
  const ranked = useMemo(() => [...opps].sort(compareOpportunities), [opps]);
  const [picks, setPicks] = useState<(string | null)[]>([null, null, null]);
  if (ranked.length < 2) return null;
  const auto = ranked.slice(0, 3).map((o) => o.id);
  const ids = [0, 1, 2].map((i) => picks[i] ?? auto[i] ?? null).filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
  const cols = ids.map((id) => ranked.find((o) => o.id === id)!).filter(Boolean);
  const anyQualifies = cols.some((o) => o.status === 'ACTIONABLE' || o.status === 'RESEARCH_CANDIDATE');
  const set = (i: number, id: string) => setPicks((p) => p.map((x, k) => (k === i ? id : x)));
  const rows: { k: string; v: (o: Opportunity) => React.ReactNode }[] = [
    { k: 'Evidence', v: (o) => { const d = decisionOf(o.status, o.confidence.calibration); return <><span className={`dword dword--${d.tone}`}>{d.word}</span> <small className="muted">{d.basis}</small></>; } },
    { k: 'Exact position', v: (o) => betPhrase(o.what.side, o.what.title).exact },
    { k: 'Executable ask', v: (o) => <>{o.what.side} {c(o.price.ask)} <small className="muted">{o.price.state.toLowerCase().replace(/_/g, ' ')}</small></> },
    { k: 'Break-even after fee', v: (o) => c(o.price.breakEven) },
    { k: 'Publication fair', v: (o) => pct(o.price.fair) },
    { k: 'Edge after fee', v: (o) => <>{pts(o.price.evPerContract)} <small className="muted">{o.price.evSource === 'derived' ? 'fair − break-even' : o.price.evSource ?? ''}</small></> },
    { k: 'Bet up to', v: (o) => (o.price.betUpTo == null ? 'Not published' : c(o.price.betUpTo)) },
    { k: 'Model reliability', v: (o) => o.confidence.record?.line ?? o.confidence.note ?? '—' },
    { k: 'Strongest counterargument', v: (o) => o.risk ?? '—' },
    { k: 'Shared exposure', v: (o) => { const others = cols.filter((x) => x.id !== o.id); const opp = others.filter((x) => contradicts(o, x)); return opp.length ? `Cannot win with ${opp.map((x) => x.what.title).join(', ')}` : others.length ? 'Same game: one exposure, not independent edges' : '—'; } },
  ];
  return (
    <section className="glass mcmp" aria-labelledby="mcmp-h">
      <h2 className="tpanel__h" id="mcmp-h">{title}</h2>
      <p className="tpanel__note">{anyQualifies ? 'Auto-filled with the best-supported expression first (the documented ranking: authority, current price, worst-case edge — never the biggest gap alone), then the strongest alternatives. Replace any column.' : 'Nothing on this game qualifies at the current price: these are research comparisons, not recommendations. Replace any column.'}</p>
      <div className="mcmp__cols" style={{ ['--n' as string]: cols.length }}>
        {cols.map((o, i) => (
          <article key={o.id} className={`mcmp__col${i === 0 && anyQualifies ? ' is-lead' : ''}`} aria-label={betPhrase(o.what.side, o.what.title).exact}>
            <label className="term__sel"><span>{i === 0 && anyQualifies ? 'Best supported' : i === 0 ? 'Comparison 1' : `Alternative ${i}`}</span>
              <select value={o.id} onChange={(e) => set(i, e.target.value)}>{ranked.map((x) => <option key={x.id} value={x.id}>{betPhrase(x.what.side, x.what.title).text}</option>)}</select>
            </label>
            <h3 className="mcmp__t" title={betPhrase(o.what.side, o.what.title).exact}><Link to={o.href}>{betPhrase(o.what.side, o.what.title).text}</Link></h3>
            <dl className="mcmp__dl">{rows.map((r) => <div key={r.k}><dt>{r.k}</dt><dd>{r.v(o)}</dd></div>)}</dl>
          </article>
        ))}
      </div>
    </section>
  );
}
