import { Link } from 'react-router';
import { NAV_SPORTS } from '../data/nav';
import { Icon } from '../components/Icon';
import { routes } from '../lib/routes';
import { useVisit } from '../state/trail';

/** A sport in the navigation with no Edge Finder publication yet: say so, invent nothing. */
export function PlannedSportView({ slug }: { slug: string }) {
  const n = NAV_SPORTS.find((s) => s.slug === slug)!;
  useVisit(n.label, 'sport');
  return (
    <div className="page">
      <header className="shead"><div className="shead__t"><div className="eyebrow">{n.fullName}</div><h1 className="h-display shead__h">{n.label}</h1></div></header>
      <section className="panel planned" style={{ ['--accent' as string]: n.accent }}>
        <Icon name={n.icon} size={34} />
        <h2 className="phead__t">{n.label} research isn't published yet</h2>
        <p className="muted">Sift opens a sport when its Edge Finder publication exists. There is no {n.label} publication in the registry today, so nothing is shown in its place.</p>
        <Link to={routes.sports()} className="btn btn--sm">All sports</Link>
      </section>
    </div>
  );
}
