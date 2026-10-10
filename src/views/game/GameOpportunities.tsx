// The verdict strip at the top of a game page: what the sport's own candidate layer says about THIS game, through
// the shared opportunity system. Opportunities render as the same cards the home shows; a game with none says so in
// one line with the sport's precise reason, so the page never implies a bet it does not have.
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useSportOpportunities } from '../../opportunity/load';
import { featureOpportunities, isLive } from '../../opportunity/rank';
import type { Opportunity } from '../../opportunity/types';
import { useSport } from '../../state/sport';
import { OpportunityCard } from '../home/Opportunities';

export function GameOpportunities({ eventId, now, children }: { eventId: string; now: number; children?: React.ReactNode }) {
  const { sport, repo, slug } = useSport();
  const o = useSportOpportunities(repo, now);
  const mine = useMemo(() => o.opportunities.filter((x: Opportunity) => x.eventId === eventId), [o.opportunities, eventId]);
  const live = useMemo(() => featureOpportunities(mine.filter(isLive)), [mine]);
  const passes = mine.filter((x) => x.status === 'PASS');
  if (o.loading) return null;
  return (
    <section className="gopp" aria-labelledby="gopp-h" data-testid="game-opportunities">
      <div className="gopp__h">
        <h2 id="gopp-h" className="gopp__t">Sift verdict</h2>
        <Link to={`/${slug}`} className="gopp__all">{sport.label} opportunities</Link>
      </div>
      {live.length > 0 && <div className="oppboard__grid">{live.slice(0, 2).map((f) => <OpportunityCard key={f.lead.id} f={f} now={now} showSport={false} compact />)}</div>}
      {live.length === 0 && (
        <p className="gopp__pass">
          <span className="dword dword--noedge">No Edge</span>{' '}<b>No published opportunity on this game.</b>{' '}
          {passes.length > 0
            ? `${passes.length} candidate${passes.length === 1 ? '' : 's'} judged and passed: ${passes[0].statusReason}`
            : o.verdict?.passReason ?? `The ${sport.label} publication flags nothing on this game.`}{' '}
          {children ?? 'The research below is for reading the game, not a pick.'}
        </p>
      )}
      {live.length > 2 && <p className="gopp__more muted small">{live.length - 2} more on this game in the {sport.label} opportunities.</p>}
    </section>
  );
}
