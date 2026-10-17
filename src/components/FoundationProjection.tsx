// The independent Projection Foundation projection for one player-stat, as one quiet block inside existing surfaces
// (Player Prop Explorer, Game Command Center props). Same lookup and same display rules everywhere (src/lib/projections.ts):
//   - BLOCKed or incoherent: says it is withheld and why, never shows the number;
//   - otherwise: expected value, realistic range, opportunity, opponent adjustment, reliability, freshness, gate notes;
//   - beside an incumbent projection it is labelled a shadow challenger and only states agreement/disagreement.
// Nothing here is worded as a bet or an edge.
import { useProjections } from '../data/projections';
import { agreement, displayState, findProjection, fmtAge, isPrimary, READINESS_WORDS, type ProjSport } from '../lib/projections';
import '../styles/intelligence.css';

const fmt = (v: number) => (Math.abs(v) >= 20 ? v.toFixed(0) : v.toFixed(1));

export function FoundationProjection({ sport, stat, playerId, name, team, gameId, incumbent = null, compact = false, now = Date.now() }: {
  sport: string; stat: string; playerId?: string | null; name?: string | null; team?: string | null; gameId?: string | null;
  incumbent?: number | null; compact?: boolean; now?: number;
}) {
  const { doc, loading } = useProjections(sport);
  if (loading) return null;
  const st = displayState(doc, findProjection(doc, { playerId, name, team, stat, gameId }), now);
  if (st.kind === 'none') return null;
  if (st.kind === 'withheld') {
    return (
      <p className={`intel intel--line${compact ? ' intel--compact' : ''}`} role="note" data-testid="foundation-projection" data-state="withheld">
        <span className="intel__tag">Independent projection withheld</span> {st.reason}.
      </p>
    );
  }
  const { p } = st;
  const primary = isPrimary(sport.toUpperCase() as ProjSport, st);
  const agree = primary ? null : agreement(incumbent, p.mean);
  const range = p.p10 != null && p.p90 != null ? `${fmt(p.p10)}–${fmt(p.p90)}` : null;
  const opp = p.opportunity ? `${p.opportunity.family.replace(/_/g, ' ')} ${fmt(p.opportunity.mean)}` : null;
  const oa = p.opponentAdjustment && Math.abs(p.opponentAdjustment.factor - 1) >= 0.01
    ? `opponent ×${p.opponentAdjustment.factor.toFixed(2)}${p.opponentAdjustment.sampleGames != null ? ` (${p.opponentAdjustment.sampleGames} games)` : ''}` : null;
  const tone = st.stale || st.review.length || p.readiness !== 'READY' ? 'caution' : 'ok';
  return (
    <div className={`intel intel--line intel--${tone}${compact ? ' intel--compact' : ''} pf`} role="note" data-testid="foundation-projection" data-state={st.stale ? 'stale' : 'shown'} data-gate={p.gate.status}>
      <p className="pf__row">
        <span className="intel__tag">{primary ? 'SIFT projection' : 'Independent projection · shadow'}</span>{' '}
        <strong className="fx-num">{fmt(p.mean)}</strong>
        {range && <> · realistic range {range}</>}
        {opp && <> · {opp}</>}
        {oa && <> · {oa}</>}
      </p>
      {!compact && <p className="pf__row pf__muted">{READINESS_WORDS[p.readiness]}. Updated {fmtAge(st.ageHours)}{st.stale ? ' — stale, treat with caution' : ''}.</p>}
      {agree && <p className="pf__row pf__muted" data-testid="foundation-agreement">{agree.words}</p>}
      {st.review.length > 0 && <p className="pf__row pf__muted" data-testid="foundation-review">Review: {st.review.slice(0, 2).map((f) => f.what).join('; ')}.</p>}
      {!compact && p.adjustments.length > 0 && <p className="pf__row pf__muted">{p.adjustments.slice(0, 3).join(' · ')}</p>}
    </div>
  );
}
