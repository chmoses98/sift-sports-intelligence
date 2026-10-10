// PUBLIC MODEL PULSE and the ADVANCED MODEL LAB — how each sport's model has actually performed, from the
// publications' own evaluation records (src/intelligence/evidence.ts). No single overall "win percentage": each
// sport is scored on its own published metric, model beside market, with the sample size, the date and the source.
// A sport with no published record says why.
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAsync } from '../../data/hooks';
import { navSport } from '../../data/nav';
import { Icon } from '../../components/Icon';
import { SportMark } from '../../components/SportMark';
import { Skeleton } from '../../components/ui';
import { routes } from '../../lib/routes';
import { useVisit } from '../../state/trail';
import { fmt, loadEvidence, type Bin, type Comparison, type SportEvidence } from '../../intelligence/evidence';
import { IntelNav } from './IntelNav';

const LEADER_WORD = { market: 'Market leads', model: 'Model leads', even: 'About even' } as const;
const leaderTone = (l: Comparison['leader']) => (l === 'model' ? 'good' : l === 'even' ? 'mid' : 'bad');

export function useEvidence() {
  return useAsync('model-evidence:v1', loadEvidence);
}

/** Model and market on one lower-is-better scale, both labelled with their numbers. */
export function CompareBars({ c }: { c: Comparison }) {
  const max = Math.max(c.model, c.market) * 1.08 || 1;
  return (
    <div className="cbars" role="img" aria-label={`${c.label}: model ${fmt(c.model)}, market ${fmt(c.market)}; lower is better; ${LEADER_WORD[c.leader]}`}>
      <span className="cbars__row"><span className="cbars__k">Model</span><span className="cbars__t"><span className="cbars__f cbars__f--model" style={{ width: `${(c.model / max) * 100}%` }} /></span><b className="bnum">{fmt(c.model)}</b></span>
      <span className="cbars__row"><span className="cbars__k">Market</span><span className="cbars__t"><span className="cbars__f cbars__f--market" style={{ width: `${(c.market / max) * 100}%` }} /></span><b className="bnum">{fmt(c.market)}</b></span>
      <span className="cbars__foot">{c.metric} · lower is better{c.n ? ` · n = ${c.n.toLocaleString()}` : ''}</span>
    </div>
  );
}

function PulseCard({ e }: { e: SportEvidence }) {
  const nav = navSport(e.slug);
  return (
    <article className="glass pcard" aria-labelledby={`pc-${e.slug}`}>
      <header className="pcard__h">
        <h2 className="pcard__t" id={`pc-${e.slug}`}>{nav && <SportMark slug={e.slug} icon={nav.icon} size={20} />}{e.label}</h2>
        {e.headline ? <span className={`tier tier--${leaderTone(e.headline.leader)}`}>{LEADER_WORD[e.headline.leader]}</span> : <span className="tier tier--none">{e.state === 'error' ? 'Unavailable' : 'No record published'}</span>}
      </header>
      {e.headline && <><p className="pcard__k">{e.headline.label}</p><CompareBars c={e.headline} /></>}
      <p className="pcard__v">{e.verdict}</p>
      {e.families.length > 0 && (
        <div className="pfam" aria-label="By market family">
          {e.families.slice(0, 6).map((f) => <span key={f.label} className={`pfam__c pfam__c--${leaderTone(f.leader)}`} title={`${f.label}: model ${fmt(f.model)} vs market ${fmt(f.market)} (${f.metric}, n ${f.n ?? '—'})`}>{f.label}</span>)}
        </div>
      )}
      <footer className="pcard__f">
        <span>{e.asOf ? `As of ${new Date(e.asOf).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'No evaluation date published'}</span>
        {e.state === 'evidence' && <Link to={routes.lab(e.slug)} className="bsec__more">Open in Model Lab <Icon name="arrowRight" size={14} /></Link>}
      </footer>
    </article>
  );
}

export function PulseView() {
  useVisit('Model Pulse', 'intel');
  const ev = useEvidence();
  const [sp] = useSearchParams();
  const focus = sp.get('sport');
  const list = useMemo(() => (ev.data ?? []).slice().sort((a, b) => (a.slug === focus ? -1 : b.slug === focus ? 1 : 0) || (a.state === 'evidence' ? 0 : 1) - (b.state === 'evidence' ? 0 : 1)), [ev.data, focus]);
  const scored = list.filter((e) => e.headline);
  return (
    <div className="page pulse">
      <IntelNav />
      <header className="bhome__mast">
        <div>
          <span className="eyebrow2">Public model evidence</span>
          <h1 className="bhome__h">Model Pulse</h1>
        </div>
        {ev.data && <p className="bhome__sum">The market leads in <b className="bnum">{scored.filter((e) => e.headline!.leader === 'market').length}</b> of <b className="bnum">{scored.length}</b> sports with a published comparison · no single overall win rate, by design</p>}
      </header>
      <div className="pulse__intro glass">
        <p><b>How to read this.</b> Each card scores a sport’s model against the market on that sport’s own published metric (Brier score, log loss or payout error — all lower-is-better), on the same settled contracts. A model that trails the market is research evidence, not a betting edge; SIFT never upgrades it because a screen looks good. These are model forecasts, not anyone’s betting results.</p>
      </div>
      {ev.loading && <Skeleton lines={8} tall />}
      <div className="pgrid">{list.map((e) => <PulseCard key={e.slug} e={e} />)}</div>
    </div>
  );
}

/** Predicted vs observed by probability bin: the diagonal is perfect calibration; dot size follows the sample. */
export function CalibrationChart({ bins, label }: { bins: Bin[]; label: string }) {
  const W = 320;
  const P = 30;
  const x = (v: number) => P + v * (W - 2 * P);
  const y = (v: number) => W - P - v * (W - 2 * P);
  const maxN = Math.max(...bins.map((b) => b.n));
  return (
    <figure className="calib">
      <svg viewBox={`0 0 ${W} ${W}`} role="img" aria-label={`${label}: ${bins.map((b) => `predicted ${Math.round(b.predicted * 100)}%, observed ${Math.round(b.observed * 100)}% (n ${b.n})`).join('; ')}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={y(0)} y2={y(1)} className="calib__grid" />
            <line x1={x(0)} x2={x(1)} y1={y(t)} y2={y(t)} className="calib__grid" />
            <text x={x(t)} y={W - 10} className="calib__tick" textAnchor="middle">{Math.round(t * 100)}%</text>
            <text x={12} y={y(t) + 4} className="calib__tick" textAnchor="middle">{Math.round(t * 100)}</text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} className="calib__diag" />
        <polyline points={bins.map((b) => `${x(b.predicted)},${y(b.observed)}`).join(' ')} className="calib__line" />
        {bins.map((b) => <circle key={b.lo} cx={x(b.predicted)} cy={y(b.observed)} r={3 + 6 * Math.sqrt(b.n / maxN)} className="calib__dot"><title>{`Predicted ${Math.round(b.predicted * 100)}% → observed ${Math.round(b.observed * 100)}% (n ${b.n})`}</title></circle>)}
      </svg>
      <figcaption>{label}. Horizontal: predicted probability; vertical: how often it happened. On the diagonal = well calibrated.</figcaption>
    </figure>
  );
}

export function LabView() {
  useVisit('Advanced Model Lab', 'intel');
  const ev = useEvidence();
  const [sp, setSp] = useSearchParams();
  const withEv = (ev.data ?? []).filter((e) => e.state === 'evidence');
  const cur = withEv.find((e) => e.slug === sp.get('sport')) ?? withEv[0] ?? null;
  return (
    <div className="page lab">
      <IntelNav />
      <header className="bhome__mast">
        <div>
          <span className="eyebrow2">Reliability research</span>
          <h1 className="bhome__h">Advanced Model Lab</h1>
        </div>
        <p className="bhome__sum">Calibration, scoring rules, walk-forward studies and closing-line value, exactly as each publication reports them</p>
      </header>
      {ev.loading && <Skeleton lines={10} tall />}
      {withEv.length > 0 && (
        <div className="gtabs2" role="group" aria-label="Sport">
          {withEv.map((e) => { const n = navSport(e.slug); return <button key={e.slug} type="button" className={`gtab${cur?.slug === e.slug ? ' is-on' : ''}`} aria-pressed={cur?.slug === e.slug} onClick={() => setSp({ sport: e.slug }, { replace: true })}>{n && <SportMark slug={e.slug} icon={n.icon} size={14} />}{e.label}</button>; })}
        </div>
      )}
      {cur && (
        <div className="lab__grid">
          <section className="glass lab__panel lab__panel--wide" aria-labelledby="lab-head">
            <h2 className="tpanel__h" id="lab-head">Headline comparison</h2>
            <p className="tpanel__lead">{cur.verdict}</p>
            {cur.headline && <CompareBars c={cur.headline} />}
            {cur.headline?.note && <p className="tpanel__note">{cur.headline.note}</p>}
          </section>
          {cur.bins && cur.bins.length > 2 && (
            <section className="glass lab__panel" aria-labelledby="lab-cal">
              <h2 className="tpanel__h" id="lab-cal">Calibration</h2>
              <CalibrationChart bins={cur.bins} label={cur.binsLabel ?? 'Calibration'} />
            </section>
          )}
          {cur.families.length > 0 && (
            <section className="glass lab__panel lab__panel--fam" aria-labelledby="lab-fam">
              <h2 className="tpanel__h" id="lab-fam">By market family</h2>
              <div className="lab__tw">
                <table className="lab__t">
                  <thead><tr><th scope="col">Family</th><th scope="col">Model</th><th scope="col">Market</th><th scope="col">n</th><th scope="col">Leader</th></tr></thead>
                  <tbody>{cur.families.map((f) => <tr key={f.label}><th scope="row">{f.label}</th><td className="bnum">{fmt(f.model)}</td><td className="bnum">{fmt(f.market)}</td><td className="bnum">{f.n?.toLocaleString() ?? '—'}</td><td><span className={`tier tier--${leaderTone(f.leader)}`}>{f.leader === 'market' ? 'Market' : f.leader === 'model' ? 'Model' : 'Even'}</span></td></tr>)}</tbody>
                </table>
              </div>
              <p className="tpanel__note">{cur.families[0].metric}, lower is better, same rows for model and market.</p>
            </section>
          )}
          {cur.clv && (
            <section className="glass lab__panel" aria-labelledby="lab-clv">
              <h2 className="tpanel__h" id="lab-clv">Closing-line value</h2>
              <p className={`lab__big bnum ${cur.clv.mean >= 0 ? 'is-pos' : 'is-neg'}`}>{cur.clv.mean >= 0 ? '+' : '−'}{Math.abs(cur.clv.mean * 100).toFixed(2)} pts</p>
              <p className="tpanel__note">{cur.clv.note}{cur.clv.n ? ` n = ${cur.clv.n.toLocaleString()}.` : ''} Positive means the price moved toward the model after it priced the contract.</p>
            </section>
          )}
          {cur.studies.map((s) => (
            <section key={s.title} className="glass lab__panel lab__panel--wide" aria-label={s.title}>
              <h2 className="tpanel__h">{s.title} <small className="muted">· {s.kind === 'walk_forward' ? 'walk-forward' : s.kind}</small></h2>
              <div className="lab__tw">
                <table className="lab__t">
                  <thead><tr><th scope="col">Sample</th><th scope="col">{s.rows[0]?.a}</th><th scope="col">{s.rows[0]?.b}</th><th scope="col">n</th><th scope="col">95% interval</th></tr></thead>
                  <tbody>{s.rows.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td className="bnum">{r.aVal == null ? '—' : fmt(r.aVal)}</td><td className="bnum">{r.bVal == null ? '—' : fmt(r.bVal)}</td><td className="bnum">{r.n?.toLocaleString() ?? '—'}</td><td className="bnum">{r.ci ? `${fmt(r.ci[0])} to ${fmt(r.ci[1])}` : '—'}</td></tr>)}</tbody>
                </table>
              </div>
              {s.note && <p className="tpanel__note">{s.note}</p>}
            </section>
          ))}
          <section className="glass lab__panel lab__panel--wide" aria-labelledby="lab-src">
            <h2 className="tpanel__h" id="lab-src">Source and limitations</h2>
            <p className="tpanel__note">Source: <code>{cur.source}</code>{cur.modelVersion ? ` · model ${cur.modelVersion}` : ''}{cur.asOf ? ` · evaluated ${new Date(cur.asOf).toLocaleString()}` : ''}</p>
            {cur.limitations.length > 0 && <ul className="tpanel__list">{cur.limitations.slice(0, 8).map((l) => <li key={l}>{l}</li>)}</ul>}
            <p className="tpanel__note">Not shown, because no publication provides it yet: feature ablations and a time series of these scores. Model changes are promoted only by their publication after out-of-sample and prospective checks; SIFT never promotes one.</p>
          </section>
        </div>
      )}
    </div>
  );
}
