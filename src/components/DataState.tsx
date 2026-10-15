// A data-availability state that tells the reader what is missing, why it matters and when it may arrive — instead
// of a bare "partial", "unavailable" or "N/A". Detailed provenance stays on Data & provenance (Status).
import type { ReactNode } from 'react';
import { Link } from '../routing';
import { routes } from '../lib/routes';
import '../styles/lane-f-data.css';

export function DataState({ title, detail, provenance, children }: { title: ReactNode; detail?: ReactNode; provenance?: boolean; children?: ReactNode }) {
  return (
    <div className="dstate" role="status">
      <p className="dstate__t">{title}</p>
      {detail && <p className="dstate__d">{detail}</p>}
      {children}
      {provenance && <Link className="dstate__more" to={routes.status()}>Data & provenance →</Link>}
    </div>
  );
}
