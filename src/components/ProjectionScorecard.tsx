// Research Lab: how accurate the independent projections are, for one sport.
//   1. Research progress — how many projection families are historically validated, in live shadow, need work.
//   2. Historical reliability — per family, from the walk-forward study (held-out seasons).
//   3. Live record — settled pregame forecasts scored against final results (prospective; grows every game day).
// Historical and live results are kept visibly separate. Reliability is forecast accuracy, never betting value.
import { useFoundationSummary, useLiveScorecard } from '../data/projections';
import { fmtWhen, liveVerdict, READINESS_WORDS, type Readiness } from '../lib/projections';
import '../styles/intelligence.css';

const TONE: Record<Readiness, string> = { READY: 'ok', 'SHADOW VALIDATION': 'caution', 'NEEDS IMPROVEMENT': 'caution', 'INSUFFICIENT DATA': 'caution' };
const label = (f: string) => f.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const STATUS_WORD = { OK: 'On track', WATCH: 'Watch', ALERT: 'Drifting', INSUFFICIENT: 'Too few games' } as const;

export function ProjectionScorecard({ sport }: { sport: string }) {
  const { summary } = useFoundationSummary(sport);
  const { card } = useLiveScorecard(sport);
  if ((!summary || summary.families.length === 0) && !card) return null;
  const count = (r: Readiness) => summary?.families.filter((f) => f.readiness === r).length ?? 0;
  return (
    <section className="fx-card pfs" aria-labelledby="pfs-h" data-testid="projection-scorecard">
      <header className="fx-card__h"><h2 className="fx-card__t" id="pfs-h"><span>Projection accuracy</span></h2>{summary && <small className="muted">{summary.families.length} stat families</small>}</header>
      <p className="pf__muted pfs__sub">How close SIFT’s independent projections come to what actually happens. Accuracy is not betting value: no projection here has been shown to beat the market.</p>
      {summary && (
        <p className="pfs__progress" data-testid="pfs-progress">
          <span><b className="num">{count('READY')}</b> validated on held-out seasons</span>
          <span><b className="num">{count('SHADOW VALIDATION')}</b> in shadow validation</span>
          <span><b className="num">{count('NEEDS IMPROVEMENT')}</b> need improvement</span>
          <span><b className="num">{count('INSUFFICIENT DATA')}</b> lack data</span>
        </p>
      )}
      {summary && summary.families.length > 0 && (
        <>
          <h3 className="pfs__h">Historical test{summary.splits.holdout ? ` — held-out ${summary.splits.holdout}` : ''}</h3>
          <ul className="pfs__list">
            {summary.families.map((f) => (
              <li key={f.family} className={`intel intel--line intel--${TONE[f.readiness]} intel--compact`} data-readiness={f.readiness}>
                <span className="intel__tag">{f.readiness}</span> <strong>{label(f.family)}</strong>
                {f.holdout?.mae != null && <> · average miss {f.holdout.mae.toFixed(2)}{f.holdout.cover80 != null ? `, 80% range caught ${Math.round(f.holdout.cover80 * 100)}%` : ''}</>}
                <span className="pfs__why" title={READINESS_WORDS[f.readiness]}>{f.reason ? ` — ${f.reason}` : ''}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className="pfs__h">Live record{card ? ` — updated ${fmtWhen(card.generatedAt) ?? 'recently'}` : ''}</h3>
      {!card || card.families.length === 0 ? (
        <p className="pf__muted" data-testid="pfs-live-empty">{card ? `${card.archived.toLocaleString()} pregame forecasts archived; accuracy appears as games finish and settle.` : 'Live tracking has not published results for this sport yet.'}</p>
      ) : (
        <div className="pfs__tablewrap">
          <table className="pfs__table" data-testid="pfs-live">
            <caption className="sr-only">Live accuracy of settled pregame projections, {sport}</caption>
            <thead><tr><th scope="col">Stat</th><th scope="col">Settled</th><th scope="col">Average miss</th><th scope="col">Bias</th><th scope="col">80% range caught</th><th scope="col">Versus production model</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {card.families.map((f) => (
                <tr key={f.family}>
                  <th scope="row">{label(f.family)}</th>
                  <td className="num">{f.n.toLocaleString()}</td>
                  <td className="num">{f.mae.toFixed(2)}</td>
                  <td className="num">{f.bias >= 0 ? '+' : '−'}{Math.abs(f.bias).toFixed(2)}</td>
                  <td className="num">{f.cover80 != null ? `${Math.round(f.cover80 * 100)}%` : '—'}</td>
                  <td>{liveVerdict(f)}</td>
                  <td><span className={`pfs__st pfs__st--${f.status.toLowerCase()}`} title={f.note}>{STATUS_WORD[f.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
