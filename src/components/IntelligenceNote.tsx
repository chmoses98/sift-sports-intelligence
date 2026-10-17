// Two small, quiet statements that sit inside existing SIFT surfaces (no new page, no new navigation):
//   <ValidationState/>   the honest answer to "is any of this a validated opportunity?" (Top Props, Home)
//   <ReliabilityLine stat/>  how far the projection can be trusted for the selected prop's stat (Player Prop Explorer)
import { useIntelligence } from '../data/intelligence';
import { hasValidatedOpportunities, NO_VALIDATED_WORDS, reliabilityFor } from '../lib/intelligence';
import '../styles/intelligence.css';

export function ValidationState({ compact = false }: { compact?: boolean }) {
  const { status, loading } = useIntelligence();
  if (loading) return null;
  const ok = hasValidatedOpportunities(status);
  return (
    <p className={`intel${compact ? ' intel--compact' : ''}${ok ? ' intel--ok' : ''}`} role="note" data-testid="validation-state">
      <span className="intel__tag">{ok ? 'Validated' : 'No validated opportunities'}</span>{' '}
      {ok ? `${status!.validated.length} segment(s) passed out-of-sample tests at executable prices. Research authority only.` : (status?.message || NO_VALIDATED_WORDS).replace(/^No validated opportunities\.\s*/i, '')}
    </p>
  );
}

export function ReliabilityLine({ stat }: { stat: string }) {
  const { status } = useIntelligence();
  const r = reliabilityFor(status, stat);
  if (!r) return null;
  return <p className={`intel intel--line intel--${r.tone}`} data-testid="projection-reliability"><span className="intel__tag">Projection reliability</span> {r.line}</p>;
}
