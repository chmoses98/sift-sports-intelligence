// The opportunities panel every sport home opens with: the sport's own candidate layer through the shared opportunity
// system (src/opportunity), featured one per thesis, or an honest PASS with the missing prerequisite.
import { useMemo } from 'react';
import { Link } from 'react-router';
import { Skeleton } from '../../components/ui';
import { useSportOpportunities } from '../../opportunity/load';
import { featureOpportunities, isLive } from '../../opportunity/rank';
import { useSport } from '../../state/sport';
import { Section } from '../shared/kit';
import { OpportunityBoard, StaleNote } from './Opportunities';

export function SportOpportunities({ now, title = 'Opportunities', max = 6 }: { now: number; title?: string; max?: number }) {
  const { sport, repo } = useSport();
  const o = useSportOpportunities(repo, now);
  const featured = useMemo(() => featureOpportunities(o.opportunities.filter(isLive)), [o.opportunities]);
  const shown = featured.slice(0, max);
  return (
    <Section
      id="sopp"
      title={title}
      sub={<>What the {sport.label} publication itself flags right now, with its price, the fee-aware break-even, its own bet-up-to and what beats it. Research candidates are research only; a PASS is a result. <Link to="/">All sports</Link>.</>}
      actions={featured.length > max ? <span className="ghome__count">{featured.length - max} more on the games below</span> : undefined}
    >
      {o.loading && <Skeleton lines={4} tall />}
      {!o.loading && o.verdict && shown.length > 0 && <StaleNote v={o.verdict} />}
      {!o.loading && <OpportunityBoard featured={shown} verdicts={o.verdict ? [o.verdict] : []} now={now} loading={o.loading} showSport={false} />}
    </Section>
  );
}
