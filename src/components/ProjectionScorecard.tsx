// Research Lab: how far each projection family of one sport has been validated (Projection Foundation research summary).
// Shown only when the sport publishes a summary; readiness is about forecast accuracy, never betting value.
import { useFoundationSummary } from '../data/projections';
import { READINESS_WORDS, type Readiness } from '../lib/projections';
import '../styles/intelligence.css';

const TONE: Record<Readiness, string> = { READY: 'ok', 'SHADOW VALIDATION': 'caution', 'NEEDS IMPROVEMENT': 'caution', 'INSUFFICIENT DATA': 'caution' };
const label = (f: string) => f.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function ProjectionScorecard({ sport }: { sport: string }) {
  const { summary } = useFoundationSummary(sport);
  if (!summary || summary.families.length === 0) return null;
  return (
    <section className="fx-card pfs" aria-labelledby="pfs-h" data-testid="projection-scorecard">
      <header className="fx-card__h"><h2 className="fx-card__t" id="pfs-h"><span>Projection reliability</span></h2><small className="muted">{summary.families.length} families</small></header>
      <p className="pf__muted pfs__sub">Independent projections tested walk-forward on past seasons{summary.splits.holdout ? ` (held-out: ${summary.splits.holdout})` : ''}. Reliability describes forecast accuracy, not betting value.</p>
      <ul className="pfs__list">
        {summary.families.map((f) => (
          <li key={f.family} className={`intel intel--line intel--${TONE[f.readiness]} intel--compact`} data-readiness={f.readiness}>
            <span className="intel__tag">{f.readiness}</span> <strong>{label(f.family)}</strong>
            {f.holdout?.mae != null && <> · held-out error {f.holdout.mae.toFixed(2)}{f.holdout.cover80 != null ? `, 80% range caught ${Math.round(f.holdout.cover80 * 100)}%` : ''}</>}
            <span className="pfs__why" title={READINESS_WORDS[f.readiness]}>{f.reason ? ` — ${f.reason}` : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
