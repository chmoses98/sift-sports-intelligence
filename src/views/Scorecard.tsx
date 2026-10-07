// MODEL SCORECARD: is the model proving itself? Only the publication's own scorecard (lib/scorecard.ts:
// met_nfl.incumbent_fair_probability → extensions.scorecard). Bad results are shown as plainly as good ones.
// The compact panel sits on the sport home; the full view (calibration bands, market types) is one link away.
import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { TermInfo } from '../components/Gloss';
import { Icon } from '../components/Icon';
import { Notice, Skeleton } from '../components/ui';
import { routes } from '../lib/routes';
import { calibrationText, LEADER_WORD, readScorecard, SCORECARD_METRIC, verdictHeadline, verdictText, type Scorecard, type ScoreRow } from '../lib/scorecard';
import { useSport } from '../state/sport';
import { useVisit } from '../state/trail';
import { PanelHead, ViewAll } from './game/panels';

const f3 = (v: number) => v.toFixed(3);
const pctx = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;
const cents = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(1)}¢`;
const n0 = (v: number | null) => (v == null ? '—' : v.toLocaleString('en-US'));
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null);

export function useScorecard(): Scorecard | null {
  const { metrics, caps } = useSport();
  const def = metrics.get(SCORECARD_METRIC);
  return readScorecard(def, caps.get('calibration')?.limitations ?? []);
}

function Pair({ label, row, k, fmt = f3 }: { label: string; row: ScoreRow; k: string; fmt?: (v: number) => string }) {
  return (
    <div className="mscore__row" data-leader={row.leader}>
      <dt className="mscore__k">{label}<TermInfo k={k} /></dt>
      <dd className="mscore__v">
        <span className={row.leader === 'model' ? 'is-lead' : ''}><span className="mscore__who">Model</span> <b className="num">{fmt(row.model)}</b></span>
        <span className={row.leader === 'market' ? 'is-lead' : ''}><span className="mscore__who">Market</span> <b className="num">{fmt(row.market)}</b></span>
      </dd>
      <dd className="mscore__lead">{LEADER_WORD[row.leader]}<span className="mscore__dir"> · lower is better</span></dd>
    </div>
  );
}

function sampleLine(sc: Scorecard): string {
  return [sc.games != null ? `${sc.games} games` : null, sc.contracts != null ? `${n0(sc.contracts)} contracts` : null, sc.sampleUnit === 'latest_pregame' ? 'latest pregame prices' : sc.sampleUnit, day(sc.asOf) ? `scorecard of ${day(sc.asOf)}` : null]
    .filter(Boolean)
    .join(' · ');
}

/** The compact block for the sport home. */
export function ScorecardPanel({ slug, full }: { slug: string; full?: boolean }) {
  const sc = useScorecard();
  if (!sc) return null;
  return (
    <section className="panel mscore" aria-label="Model Scorecard">
      <PanelHead title="Model Scorecard" sub={sampleLine(sc)}>
        {!full && <ViewAll to={routes.scorecard(slug)}>Full scorecard</ViewAll>}
      </PanelHead>
      <p className={`mscore__verdict mscore__verdict--${sc.overall ?? 'none'}`}>
        <span className="mscore__vk">Model vs market</span>
        <b>{verdictHeadline(sc)}</b>
      </p>
      <dl className="mscore__rows">
        {sc.headToHead && <Pair label="Payout error, same contracts" row={sc.headToHead} k="payout_error" />}
        {sc.brier && <Pair label="Brier score" row={sc.brier} k="brier" />}
        {sc.logLoss && <Pair label="Log loss" row={sc.logLoss} k="log_loss" />}
        {sc.clv && (sc.clv.towardShare != null || sc.clv.meanExecutable != null) && (
          <div className="mscore__row">
            <dt className="mscore__k">CLV<TermInfo k="clv" extra={<span> The publication reports a signed average and the share of price moves toward the model; its sign convention isn’t documented in the published file, so Sift shows the numbers without calling them good or bad.</span>} /></dt>
            <dd className="mscore__v mscore__v--one">
              {sc.clv.towardShare != null && <span>Close moved toward the model on <b className="num">{pctx(sc.clv.towardShare, 1)}</b> of moves</span>}
              {sc.clv.meanExecutable != null && <span className="mscore__dim">avg signed CLV <b className="num">{cents(sc.clv.meanExecutable)}</b> per contract</span>}
            </dd>
          </div>
        )}
        {sc.calibration && (
          <div className="mscore__row">
            <dt className="mscore__k">Calibration<TermInfo k="calibration" /></dt>
            <dd className="mscore__v mscore__v--one"><span>{calibrationText(sc.calibration)}</span></dd>
          </div>
        )}
      </dl>
      <p className="mscore__read">{verdictText(sc)}</p>
      {sc.marketSubset && sc.brier && (
        <p className="mscore__note">Brier and log loss: the market is scored on the {n0(sc.brier.nMarket)} contracts where both price the same event; the model on all {n0(sc.brier.nModel)}. “Payout error” compares both on the same contracts.</p>
      )}
    </section>
  );
}

/** The full scorecard: everything the same published object contains, nothing more. */
/** The NHL scorecard (views/nhl): the learning report, its own chunk. */
const NhlScorecardView = lazy(() => import('./nhl/NhlScorecard').then((m) => ({ default: m.NhlScorecardView })));

export function ScorecardView() {
  const { sport } = useSport();
  if (sport.code === 'NHL') return <Suspense fallback={<div className="page"><Skeleton lines={8} tall /></div>}><NhlScorecardView /></Suspense>;
  return <PublishedScorecardView />;
}

function PublishedScorecardView() {
  const { sport, slug } = useSport();
  useVisit('Model scorecard', 'sport');
  const sc = useScorecard();
  return (
    <div className="page scview">
      <header className="pagehead">
        <div className="eyebrow"><Link to={routes.sport(slug)}>{sport.label}</Link> · Model</div>
        <h1 className="h-display">Model Scorecard</h1>
        <p className="lede">Is the model proving itself? Everything here is the {sport.label} publication’s own scorecard, shown as published.</p>
      </header>
      {!sc ? (
        <Notice title="No scorecard published">The {sport.label} publication does not include a model scorecard, so Sift shows none.</Notice>
      ) : (
        <>
          <ScorecardPanel slug={slug} full />

          {sc.families.length > 0 && (
            <section className="panel" aria-label="By market type">
              <PanelHead title="By market type" sub="Payout error (lower is better) on the same contracts · gaps under 1% read “about even”" />
              <div className="tscroll" tabIndex={0} role="region" aria-label="Payout error by market type (scrolls sideways)">
                <table className="dtable scfam">
                  <caption className="sr-only">Model and market payout error by market type</caption>
                  <thead><tr><th scope="col">Market type</th><th scope="col" className="r">Contracts</th><th scope="col" className="r">Model</th><th scope="col" className="r">Market</th><th scope="col">Reading</th></tr></thead>
                  <tbody>
                    {sc.families.map((f) => (
                      <tr key={f.family}><th scope="row">{f.label}</th><td className="r num">{n0(f.nModel)}</td><td className="r num">{f3(f.model)}</td><td className="r num">{f3(f.market)}</td><td>{LEADER_WORD[f.leader]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {sc.calibration && sc.calibration.bands.length > 0 && (
            <section className="panel" aria-label="Calibration">
              <PanelHead title="Calibration" sub={calibrationText(sc.calibration)} info={<TermInfo k="calibration" />} />
              <ol className="calib" aria-label="Predicted probability against how often it happened">
                {sc.calibration.bands.map((b) => (
                  <li key={b.band} className="calib__row">
                    <span className="calib__band">Said {b.band.split('-').map((x) => pctx(Number(x))).join('–')}</span>
                    <span className="calib__bars" aria-hidden="true">
                      <span className="calib__bar calib__bar--said" style={{ width: pctx(b.predicted) }} />
                      <span className="calib__bar calib__bar--was" style={{ width: pctx(b.actual) }} />
                    </span>
                    <span className="calib__v"><span className="num">{pctx(b.predicted, 1)}</span> → <b className="num">{pctx(b.actual, 1)}</b></span>
                    <span className="calib__n num">{n0(b.n)}</span>
                  </li>
                ))}
              </ol>
              <p className="mscore__note"><i className="calib__key calib__key--said" /> model’s average probability · <i className="calib__key calib__key--was" /> how often it happened · n = contracts</p>
            </section>
          )}

          {sc.clv && (
            <section className="panel" aria-label="Closing line value">
              <PanelHead title="Closing line value" sub={sc.clv.n != null ? `${n0(sc.clv.n)} contracts` : undefined} info={<TermInfo k="clv" />} />
              <dl className="facts">
                {sc.clv.towardShare != null && <div className="fact"><dt>Close moved toward the model</dt><dd className="num">{pctx(sc.clv.towardShare, 1)} of directional moves</dd></div>}
                {sc.clv.positiveShare != null && <div className="fact"><dt>Contracts with positive CLV</dt><dd className="num">{pctx(sc.clv.positiveShare, 1)}</dd></div>}
                {sc.clv.meanExecutable != null && <div className="fact"><dt>Average signed CLV (executable price)</dt><dd className="num">{cents(sc.clv.meanExecutable)}</dd></div>}
                {sc.clv.meanMid != null && <div className="fact"><dt>Average signed CLV (mid price)</dt><dd className="num">{cents(sc.clv.meanMid)}</dd></div>}
              </dl>
            </section>
          )}

          <section className="panel" aria-label="Source and caveats">
            <PanelHead title="Source and caveats" />
            <ul className="mscore__cav">
              {sc.caveats.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <p className="mscore__note">
              Source: {sc.source ?? 'the publication’s model scorecard'} (read from the publication's metric registry). Sift does not recompute or back-test anything here.
              This is model accuracy only; it is not anyone’s betting record.
            </p>
            <Link to={routes.metric(slug, SCORECARD_METRIC)} className="phead__more">Registry entry <Icon name="arrowRight" size={14} /></Link>
          </section>
        </>
      )}
    </div>
  );
}
