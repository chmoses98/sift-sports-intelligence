import { Link } from '../../routing';
import { ago } from '../model/format';
import type { Lens } from '../data/lens';
import { Icon } from './Icon';
import { useSheet } from './Sheet';

/** The Lens drawer (reference 02_home_lens): observation tag, headline, context table, counter-case, source age. Context, not a bet signal. */
export function LensDrawer({ lens, to, toLabel = 'Open game analysis' }: { lens: Lens; to: string; toLabel?: string }) {
  return (
    <div className="v3-lens">
      <span className="v3-lens__tag">{lens.tag}</span>
      <h3 className="v3-lens__h">{lens.headline}</h3>
      <p className="v3-lens__p">{lens.body}</p>
      <h4 className="v3-lens__k">Game context</h4>
      <dl className="v3-lens__rows">
        {lens.rows.map((r) => <div key={r.k}><dt>{r.k}</dt><dd>{r.v}</dd></div>)}
      </dl>
      <h4 className="v3-lens__k">Counter-case</h4>
      <p className="v3-note">{lens.counter}</p>
      <p className="v3-lens__src">{lens.demo ? 'Sample content · not a SIFT finding' : <>Source: SIFT research publication{lens.asOf ? ` · ${ago(lens.asOf)}` : ''}</>}</p>
      <p className="v3-lens__ctx">SIFT Lens is context, not a bet signal</p>
      {lens.statRoute && !lens.demo && <Link to={lens.statRoute} className="v3-lens__stat">Open the ranking behind this <Icon name="chevR" size={16} /></Link>}
      <Link to={to} className="v3-btn">{toLabel}<Icon name="chevR" size={18} /></Link>
    </div>
  );
}

export function useOpenLens() {
  const sheet = useSheet();
  return (lens: Lens, to: string) => sheet.open('SIFT Lens', <LensDrawer lens={lens} to={to} />, { tall: true });
}

/** The small two-line Lens card (chevron opens the drawer). */
export function LensCard({ lens, to, className }: { lens: Lens; to: string; className?: string }) {
  const open = useOpenLens();
  return (
    <button type="button" className={`v3-lenscard${className ? ` ${className}` : ''}`} onClick={() => open(lens, to)} aria-label={`SIFT Lens: ${lens.headline}. Open evidence`}>
      <Icon name="lens" size={40} />
      <span className="v3-lenscard__t"><b>SIFT Lens</b><span>{lens.headline}</span></span>
      <Icon name="chevR" size={22} className="v3-lenscard__c" />
    </button>
  );
}

/** A slot whose height is reserved from first paint: a skeleton while the research loads, then the Lens card, or a quiet "none" line. Nothing above a tappable control moves after first paint. */
export function LensSlot({ lens, loading, to, className }: { lens: Lens | null; loading: boolean; to: string; className?: string }) {
  if (lens) return <LensCard lens={lens} to={to} className={className} />;
  if (loading) return <div className={`v3-lenscard v3-lenscard--skel${className ? ` ${className}` : ''}`} role="status" aria-label="Loading SIFT Lens"><i className="v3-skel" /></div>;
  return <div className={`v3-lenscard v3-lenscard--none${className ? ` ${className}` : ''}`}><Icon name="lens" size={30} /><span className="v3-lenscard__t"><span>No SIFT Lens observation for this game yet.</span></span></div>;
}
