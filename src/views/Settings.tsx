// Settings: data source, the research path, and where the technical detail lives.
import { useState } from 'react';
import { Link } from 'react-router';
import { clearAsyncMemo } from '../data/hooks';
import { getSourcePreference, setSourcePreference, type SourcePreference } from '../data/source';
import { routes } from '../lib/routes';
import { useTrail, useVisit } from '../state/trail';
import { PanelHead } from './game/panels';

export function SettingsView() {
  useVisit('Settings', 'settings');
  const [pref, setPref] = useState<SourcePreference>(getSourcePreference());
  const { clear } = useTrail();
  return (
    <div className="page settings">
      <header className="shead"><div className="shead__t"><div className="eyebrow">Sift</div><h1 className="h-display shead__h">Settings</h1></div></header>
      <div className="stack settings__grid">
        <section className="panel" aria-labelledby="src-h">
          <PanelHead title="Research source" sub="Live publications first; the bundled NFL snapshot only where a live explorer is missing." />
          <div className="seg" role="radiogroup" aria-label="Data source">
            {(['auto', 'snapshot'] as const).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={pref === p} className={`seg__b${pref === p ? ' is-on' : ''}`}
                onClick={() => { setSourcePreference(p); clearAsyncMemo(); setPref(p); window.location.reload(); }}>
                {p === 'auto' ? 'Live first (recommended)' : 'Bundled NFL snapshot'}
              </button>
            ))}
          </div>
        </section>
        <section className="panel" aria-labelledby="path-h">
          <PanelHead title="Research path" sub="The breadcrumb resets at Home and at each sport's home." />
          <button type="button" className="btn btn--sm" onClick={clear}>Clear the current path</button>
        </section>
        <section className="panel" aria-labelledby="diag-h">
          <PanelHead title="Diagnostics" sub="Freshness states, provider chain, capabilities and photo credits." />
          <div className="cta-row">
            <Link to={routes.status()} className="btn btn--sm">Data & provenance</Link>
            <Link to={routes.design()} className="btn btn--sm btn--ghost">Design system</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
