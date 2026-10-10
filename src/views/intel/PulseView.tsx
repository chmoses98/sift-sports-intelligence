// PUBLIC MODEL PULSE and the ADVANCED MODEL LAB — how each sport's model has actually performed, from the
// publications' own evaluation records (src/intelligence/evidence.ts). No single overall "win percentage": each
// sport is scored on its own published metric, model beside market, with the sample size, the date and the source.
// A sport with no published record says why.
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAsync } from '../../data/hooks';
import { navSport } from '../../data/nav';
import { FxCard, StatStrip, type FxTone } from '../../components/fx';
import { HubMast, hubPhoto } from '../../components/HubMast';
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
  const c = e.headline;
  const fam = { model: e.families.filter((f) => f.leader === 'model').length, market: e.families.filter((f) => f.leader === 'market').length, even: e.families.filter((f) => f.leader === 'even').length };
  return (
    <article className={`fx-card pcard pcard--${c ? leaderTone(c.leader) : 'none'}`} aria-labelledby={`pc-${e.slug}`}>
      <header className="pcard__h">
        <h2 className="pcard__t" id={`pc-${e.slug}`}>{nav && <SportMark slug={e.slug} icon={nav.icon} size={22} />}{e.label}</h2>
        {c ? <span className={`tier tier--${leaderTone(c.leader)}`}>{LEADER_WORD[c.leader]}</span> : <span className="tier tier--none">{e.state === 'error' ? 'Unavailable' : 'No record published'}</span>}
      </header>
      {c ? (
        <>
          <p className="pcard__k">{c.label}</p>
          <dl className="pcard__nums">
            <div><dt>Model</dt><dd className="fx-num fx-num--lg">{fmt(c.model)}</dd></div>
            <div><dt>Market</dt><dd className="fx-num fx-num--lg pcard__mkt">{fmt(c.market)}</dd></div>
            <div><dt>Settled rows</dt><dd className="fx-num fx-num--lg">{c.n ? c.n.toLocaleString() : '—'}</dd></div>
          </dl>
          <CompareBars c={c} />
          {e.families.length > 0 && (
            <div className="pfam__sum" role="img" aria-label={`By market family: market leads in ${fam.market}, model in ${fam.model}, about even in ${fam.even}, of ${e.families.length}`}>
              {e.families.map((f) => <i key={f.label} className={`pfam__dot pfam__dot--${leaderTone(f.leader)}`} title={`${f.label}: ${f.leader === 'market' ? 'market leads' : f.leader === 'model' ? 'model leads' : 'about even'}`} />)}
              <span>{e.families.length} market families · market {fam.market} · model {fam.model}{fam.even ? ` · even ${fam.even}` : ''}</span>
            </div>
          )}
        </>
      ) : (
        <div className="pcard__cap"><Icon name="shield" size={20} /><span>No like-for-like model-versus-market record is published for {e.label}. Sift shows nothing in its place.</span></div>
      )}
      <p className="pcard__v">{e.verdict}</p>
      {e.families.length > 0 && (
        <div className="pfam" role="group" aria-label="By market family">
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
  const marketLeads = scored.filter((e) => e.headline!.leader === 'market').length;
  const modelLeads = scored.filter((e) => e.headline!.leader === 'model').length;
  const rows = scored.reduce((m, e) => m + (e.headline!.n ?? 0), 0);
  const fams = scored.reduce((m, e) => m + e.families.length, 0);
  return (
    <div className="page pulse pulsex">
      <IntelNav />
      <HubMast
        title="Model Pulse"
        eyebrow="Public model evidence"
        sub="How each sport’s model has actually done against the market, on its own published metric. No single overall win rate, by design."
        photo={hubPhoto('nfl-kc-arrowhead-stadium')}
        aside={ev.data ? <p className="hubm__stat"><b className="fx-num fx-num--xl">{marketLeads}<small>/{scored.length}</small></b><span>sports where<br />the market leads</span></p> : undefined}
      />
      {ev.data && (
        <StatStrip
          className="pulsex__strip"
          label="Model Pulse summary"
          items={[
            { label: 'Sports with a record', value: `${scored.length} of ${list.length}`, sub: 'like-for-like model vs market', bar: list.length ? scored.length / list.length : null },
            { label: 'Market leads', value: marketLeads, sub: 'sports, on the headline metric', tone: 'red', bar: scored.length ? marketLeads / scored.length : null },
            { label: 'Model leads', value: modelLeads, sub: 'sports, on the headline metric', tone: 'green', bar: scored.length ? modelLeads / scored.length : null },
            { label: 'Settled rows scored', value: rows.toLocaleString(), sub: 'headline samples, all sports' },
            { label: 'Market families', value: fams, sub: 'compared family by family' },
          ]}
        />
      )}
      <details className="fx-card pulse__intro">
        <summary><Icon name="info" size={15} /> How to read this</summary>
        <p>Each card scores a sport’s model against the market on that sport’s own published metric (Brier score, log loss or payout error — all lower-is-better), on the same settled contracts. A model that trails the market is research evidence, not a betting edge; SIFT never upgrades it because a screen looks good. These are model forecasts, not anyone’s betting results.</p>
      </details>
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
        <defs>
          <linearGradient id="calib-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3ec3ff" stopOpacity="0.28" /><stop offset="1" stopColor="#3ec3ff" stopOpacity="0" /></linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={y(0)} y2={y(1)} className="calib__grid" />
            <line x1={x(0)} x2={x(1)} y1={y(t)} y2={y(t)} className="calib__grid" />
            <text x={x(t)} y={W - 10} className="calib__tick" textAnchor="middle">{Math.round(t * 100)}%</text>
            <text x={12} y={y(t) + 4} className="calib__tick" textAnchor="middle">{Math.round(t * 100)}</text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} className="calib__diag" />
        <polygon points={`${x(bins[0].predicted)},${y(0)} ${bins.map((b) => `${x(b.predicted)},${y(b.observed)}`).join(' ')} ${x(bins[bins.length - 1].predicted)},${y(0)}`} fill="url(#calib-fill)" />
        <polyline points={bins.map((b) => `${x(b.predicted)},${y(b.observed)}`).join(' ')} className="calib__line" />
        {bins.map((b) => <circle key={b.lo} cx={x(b.predicted)} cy={y(b.observed)} r={3 + 6 * Math.sqrt(b.n / maxN)} className="calib__dot"><title>{`Predicted ${Math.round(b.predicted * 100)}% → observed ${Math.round(b.observed * 100)}% (n ${b.n})`}</title></circle>)}
      </svg>
      <figcaption>{label}. Horizontal: predicted probability; vertical: how often it happened. On the diagonal = well calibrated.</figcaption>
    </figure>
  );
}

/** One family's model and market scores on a shared scale (lower is better), the leader lit. */
function FamilyBars({ f, max }: { f: Comparison; max: number }) {
  return (
    <span className="famb" aria-hidden="true">
      <i className={`famb__m${f.leader === 'model' ? ' is-lead' : ''}`} style={{ width: `${(f.model / max) * 100}%` }} />
      <i className={`famb__k${f.leader === 'market' ? ' is-lead' : ''}`} style={{ width: `${(f.market / max) * 100}%` }} />
    </span>
  );
}

export function LabView() {
  useVisit('Advanced Model Lab', 'intel');
  const ev = useEvidence();
  const [sp, setSp] = useSearchParams();
  const withEv = (ev.data ?? []).filter((e) => e.state === 'evidence');
  const without = (ev.data ?? []).filter((e) => e.state !== 'evidence');
  const cur = withEv.find((e) => e.slug === sp.get('sport')) ?? withEv[0] ?? null;
  const famMax = cur ? Math.max(...cur.families.flatMap((f) => [f.model, f.market]), 0.0001) * 1.05 : 1;
  return (
    <div className="page lab labx">
      <IntelNav />
      <HubMast
        title="Advanced Model Lab"
        eyebrow="Reliability research"
        sub="Calibration, scoring rules, walk-forward studies and closing-line value — exactly as each publication reports them."
        photo={hubPhoto('nhl-tor-scotiabank-arena')}
      >
        {withEv.length > 0 && (
          <div className="tm-chips" role="group" aria-label="Sport">
            {withEv.map((e) => { const n = navSport(e.slug); return <button key={e.slug} type="button" className={`tm-chip${cur?.slug === e.slug ? ' is-on' : ''}`} aria-pressed={cur?.slug === e.slug} onClick={() => setSp({ sport: e.slug }, { replace: true })}>{n && <SportMark slug={e.slug} icon={n.icon} size={15} />}{e.label}</button>; })}
          </div>
        )}
      </HubMast>
      {ev.loading && <Skeleton lines={10} tall />}
      {cur && (
        <>
          <StatStrip
            className="pulsex__strip"
            label={`${cur.label} evaluation summary`}
            items={[
              ...(cur.headline ? [
                { label: `Model ${cur.headline.metric.toLowerCase()}`, value: fmt(cur.headline.model), sub: 'lower is better', tone: (cur.headline.leader === 'model' ? 'green' : 'cyan') as FxTone },
                { label: `Market ${cur.headline.metric.toLowerCase()}`, value: fmt(cur.headline.market), sub: 'same settled rows', tone: (cur.headline.leader === 'market' ? 'green' : 'cyan') as FxTone },
                { label: 'Settled rows', value: cur.headline.n ? cur.headline.n.toLocaleString() : '—', sub: cur.headline.label },
              ] : []),
              { label: 'Market families', value: cur.families.length || '—', sub: cur.families.length ? `market leads in ${cur.families.filter((f) => f.leader === 'market').length}` : 'none published' },
              ...(cur.clv ? [{ label: 'Closing-line value', value: `${cur.clv.mean >= 0 ? '+' : '−'}${Math.abs(cur.clv.mean * 100).toFixed(2)}`, sub: 'points, mean', tone: (cur.clv.mean >= 0 ? 'green' : 'red') as FxTone }] : []),
            ]}
          />
          <div className="fx-bento labx__grid">
            <FxCard title="Headline comparison" icon="bolt" id="lab-head" className="fx-span-6">
              <p className="tpanel__lead">{cur.verdict}</p>
              {cur.headline && <CompareBars c={cur.headline} />}
              {cur.headline?.note && <p className="tm-note">{cur.headline.note}</p>}
            </FxCard>
            {cur.bins && cur.bins.length > 2 ? (
              <FxCard title="Calibration" icon="chart" id="lab-cal" className="fx-span-6">
                <CalibrationChart bins={cur.bins} label={cur.binsLabel ?? 'Calibration'} />
              </FxCard>
            ) : (
              <FxCard title="Calibration" icon="chart" id="lab-cal" className="fx-span-6">
                <p className="tm-none"><Icon name="info" size={14} /> {cur.label}’s publication does not publish calibration bins, so no reliability curve is drawn.</p>
              </FxCard>
            )}
            {cur.families.length > 0 && (
              <FxCard title="By market family" icon="layers" id="lab-fam" className={cur.clv ? 'fx-span-8' : 'fx-span-12'}>
                <div className="lab__tw" tabIndex={0} role="region" aria-label="Market family scores">
                  <table className="lab__t labx__t">
                    <thead><tr><th scope="col">Family</th><th scope="col">Model</th><th scope="col">Market</th><th scope="col" className="labx__bars">Model · market (shorter is better)</th><th scope="col">n</th><th scope="col">Leader</th></tr></thead>
                    <tbody>{cur.families.map((f) => <tr key={f.label}><th scope="row">{f.label}</th><td className="fx-num">{fmt(f.model)}</td><td className="fx-num">{fmt(f.market)}</td><td className="labx__bars"><FamilyBars f={f} max={famMax} /></td><td className="fx-num">{f.n?.toLocaleString() ?? '—'}</td><td><span className={`tier tier--${leaderTone(f.leader)}`}>{f.leader === 'market' ? 'Market' : f.leader === 'model' ? 'Model' : 'Even'}</span></td></tr>)}</tbody>
                  </table>
                </div>
                <p className="tm-note">{cur.families[0].metric}, lower is better, same rows for model and market.</p>
              </FxCard>
            )}
            {cur.clv && (
              <FxCard title="Closing-line value" icon="clock" id="lab-clv" className={cur.families.length ? 'fx-span-4' : 'fx-span-6'}>
                <p className={`lab__big fx-num ${cur.clv.mean >= 0 ? 'is-pos' : 'is-neg'}`}>{cur.clv.mean >= 0 ? '+' : '−'}{Math.abs(cur.clv.mean * 100).toFixed(2)} pts</p>
                <p className="tm-note">{cur.clv.note}{cur.clv.n ? ` n = ${cur.clv.n.toLocaleString()}.` : ''} Positive means the price moved toward the model after it priced the contract.</p>
              </FxCard>
            )}
            {cur.studies.map((s) => (
              <FxCard key={s.title} title={<>{s.title} <small className="muted">· {s.kind === 'walk_forward' ? 'walk-forward' : s.kind}</small></>} icon="research" className="fx-span-12">
                <div className="lab__tw" tabIndex={0} role="region" aria-label={`${s.title} table`}>
                  <table className="lab__t">
                    <thead><tr><th scope="col">Sample</th><th scope="col">{s.rows[0]?.a}</th><th scope="col">{s.rows[0]?.b}</th><th scope="col">n</th><th scope="col">95% interval</th></tr></thead>
                    <tbody>{s.rows.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td className="fx-num">{r.aVal == null ? '—' : fmt(r.aVal)}</td><td className="fx-num">{r.bVal == null ? '—' : fmt(r.bVal)}</td><td className="fx-num">{r.n?.toLocaleString() ?? '—'}</td><td className="fx-num">{r.ci ? `${fmt(r.ci[0])} to ${fmt(r.ci[1])}` : '—'}</td></tr>)}</tbody>
                  </table>
                </div>
                {s.note && <p className="tm-note">{s.note}</p>}
              </FxCard>
            ))}
            <FxCard title="Source and limitations" icon="shield" id="lab-src" className="fx-span-12">
              <p className="tpanel__note">Source: <code>{cur.source}</code>{cur.modelVersion ? ` · model ${cur.modelVersion}` : ''}{cur.asOf ? ` · evaluated ${new Date(cur.asOf).toLocaleString()}` : ''}</p>
              {cur.limitations.length > 0 && <ul className="tpanel__list">{cur.limitations.slice(0, 8).map((l) => <li key={l}>{l}</li>)}</ul>}
              <p className="tpanel__note">Not shown, because no publication provides it yet: feature ablations and a time series of these scores. Model changes are promoted only by their publication after out-of-sample and prospective checks; SIFT never promotes one.</p>
            </FxCard>
          </div>
        </>
      )}
      {without.length > 0 && (
        <section className="labx__none" aria-labelledby="lab-none-h">
          <h2 className="bbx__fh" id="lab-none-h"><Icon name="info" size={18} /> No evaluation record published</h2>
          <ul className="labx__nl">
            {without.map((e) => { const n = navSport(e.slug); return <li key={e.slug} className="fx-card"><span className="labx__nt">{n && <SportMark slug={e.slug} icon={n.icon} size={18} />}{e.label}</span><span className="muted small">{e.verdict || 'No like-for-like model-versus-market record is published.'}</span></li>; })}
          </ul>
        </section>
      )}
    </div>
  );
}
