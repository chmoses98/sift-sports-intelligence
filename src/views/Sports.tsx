// Every sport in Sift with what it can honestly open today.
import { Link } from 'react-router';
import { NAV_SPORTS, STATUS_WORD } from '../data/nav';
import { SportMark } from '../components/SportMark';
import { HealthPill } from '../components/SourceBanner';
import { routes } from '../lib/routes';
import { useAllSports } from '../state/allSports';
import { useVisit } from '../state/trail';

export function SportsView() {
  useVisit('All sports', 'status');
  const all = useAllSports();
  const by = new Map((all.data ?? []).map((s) => [s.sport.slug, s]));
  return (
    <div className="page">
      <header className="shead"><div className="shead__t"><div className="eyebrow">Sift</div><h1 className="h-display shead__h">All Sports</h1><div className="shead__comp">Research screens open where a sport's publication supports them; the rest show their real health.</div></div></header>
      <ul className="sportcards">
        {NAV_SPORTS.map((n) => {
          const h = by.get(n.slug)?.source?.liveHealth;
          return (
            <li key={n.slug}>
              <Link to={routes.sport(n.slug)} className="panel sportcard2" style={{ ['--accent' as string]: n.accent }}>
                <SportMark slug={n.slug} icon={n.icon} size={30} />
                <span className="sportcard2__n">{n.label}</span>
                <span className="sportcard2__f">{n.fullName}</span>
                <span className={`sportl__st sportl__st--${n.status}`}>{STATUS_WORD[n.status]}</span>
                {h && <HealthPill status={h.overall_status} />}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="muted small">Health, freshness and capability manifests for every sport: <Link to={routes.status()}>Data & provenance</Link>.</p>
    </div>
  );
}

