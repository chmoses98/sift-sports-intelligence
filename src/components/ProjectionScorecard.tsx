// Research Lab: how accurate SIFT's projections are, for one sport.
//   1. Live in SIFT — the stats whose approved engine is the Projection Foundation model: held-out historical test
//      (average miss, 80% range coverage) and the live record (settled pregame forecasts scored against final results).
//   2. Not changed — stats still on the established model, with a plain-words status (kept, waiting on live inputs, not
//      yet validated). No number from either engine is shown for those here: this card is accuracy, not projections.
// Historical and live results stay visibly separate. Accuracy is forecast quality, never betting value. Comparisons with
// the previous model are made internally (monitor.py, scorecards) and are not part of this page.
import { useFoundationSummary, useLiveScorecard } from '../data/projections';
import { fmtWhen } from '../lib/projections';
import { APPROVALS, engineFor, type Approval } from '../lib/projectionApprovals';
import type { ProjSport } from '../lib/projections';
import '../styles/intelligence.css';

const label = (f: string) => f.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const STATUS_WORD = { OK: 'On track', WATCH: 'Watch', ALERT: 'Drifting', INSUFFICIENT: 'Too few games' } as const;
const NOT_CHANGED_WORD: Record<Approval['decision'], string> = {
  PROMOTED: '',
  APPROVED_PENDING_LIVE_INPUTS: 'Validated; waiting on live availability data',
  RETAINED: 'Established model kept',
  HELD: 'Not yet validated for live use',
};

export function ProjectionScorecard({ sport }: { sport: string }) {
  const code = sport.toUpperCase() as ProjSport;
  const { summary } = useFoundationSummary(sport);
  const { card } = useLiveScorecard(sport);
  const rows = APPROVALS.filter((a) => a.sport === code);
  if (rows.length === 0 || (!summary && !card)) return null;
  // a promoted stat that does not yet meet the publication standard is not live: its number is withheld
  const notMet = (a: Approval) => a.publication?.standard === 'NOT_MET';
  const live = rows.filter((a) => engineFor(code, a.family) === 'foundation' && !notMet(a));
  const kept = rows.filter((a) => (engineFor(code, a.family) === 'legacy' && a.decision !== 'PROMOTED') || (engineFor(code, a.family) === 'foundation' && notMet(a)));
  const hist = new Map((summary?.families ?? []).map((f) => [f.family, f]));
  const liveFam = new Map((card?.families ?? []).map((f) => [f.family, f]));
  return (
    <section className="fx-card pfs" aria-labelledby="pfs-h" data-testid="projection-scorecard">
      <header className="fx-card__h"><h2 className="fx-card__t" id="pfs-h"><span>Projection accuracy</span></h2><small className="muted">{live.length} of {rows.length} stats on the new projection model</small></header>
      <p className="pf__muted pfs__sub">How close SIFT’s projections come to what actually happens. Accuracy is not betting value: no projection here has been shown to beat the market.</p>
      {live.length > 0 && (
        <>
          <h3 className="pfs__h">Live in SIFT{summary?.splits.holdout ? ` — historical test on held-out ${summary.splits.holdout}` : ''}</h3>
          <div className="pfs__tablewrap">
            <table className="pfs__table" data-testid="pfs-live-in-sift">
              <caption className="sr-only">Accuracy of the projections live in SIFT, {sport}</caption>
              <thead><tr><th scope="col">Stat</th><th scope="col">Historical miss</th><th scope="col">80% range caught</th><th scope="col">Live settled</th><th scope="col">Live miss</th><th scope="col">Live bias</th><th scope="col">Monitoring</th></tr></thead>
              <tbody>
                {live.map((a) => {
                  const h = hist.get(a.family)?.holdout ?? null;
                  const l = liveFam.get(a.family);
                  return (
                    <tr key={a.family}>
                      <th scope="row">{label(a.family)}</th>
                      <td className="num">{h?.mae != null ? h.mae.toFixed(2) : '—'}</td>
                      <td className="num">{h?.cover80 != null ? `${Math.round(h.cover80 * 100)}%` : '—'}</td>
                      <td className="num">{l ? l.n.toLocaleString() : '0'}</td>
                      <td className="num">{l ? l.mae.toFixed(2) : '—'}</td>
                      <td className="num">{l ? `${l.bias >= 0 ? '+' : '−'}${Math.abs(l.bias).toFixed(2)}` : '—'}</td>
                      <td>{l ? <span className={`pfs__st pfs__st--${l.status.toLowerCase()}`} title={l.note}>{STATUS_WORD[l.status]}</span> : <span className="pf__muted" data-testid="pfs-live-empty">Accuracy appears as games finish and settle</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="pf__muted" data-testid="pfs-live-note">
            {card ? `${card.archived.toLocaleString()} pregame forecasts archived, ${card.settled.toLocaleString()} settled${card.generatedAt ? ` · updated ${fmtWhen(card.generatedAt) ?? 'recently'}` : ''}.` : 'Live tracking has not published results for this sport yet.'}
          </p>
        </>
      )}
      {kept.length > 0 && (
        <>
          <h3 className="pfs__h">Not changed</h3>
          <ul className="pfs__list" data-testid="pfs-not-changed">
            {kept.map((a) => <li key={a.family} className="intel intel--line intel--compact"><strong>{label(a.family)}</strong> — {notMet(a) ? 'Withheld until it meets SIFT’s publication standard' : NOT_CHANGED_WORD[a.decision]}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}
