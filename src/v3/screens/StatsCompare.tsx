// Game Stats tab: a compact comparison instead of a 40-row table. Each statistic is one row of two mirrored rank bars (longer = better league rank) with the
// published value and rank at each end; the widest published rank gaps come first, a filter narrows to offense or defense, and the rest is behind one
// "Show all" control. Values and ranks are exactly as published; the bars are the published rank over the published universe.
import { useMemo, useState } from 'react';
import { Link } from '../../routing';
import { ordinal } from '../data/lens';
import type { StatPair } from '../data/matchup';
import { compareRows, groupOf, type CompareRow, type StatGroup } from '../model/statCompare';
import type { V3Game } from '../model/types';
import { Icon } from '../ui/Icon';

const FIRST = 8;
const FILTERS: { k: 'all' | StatGroup; label: string }[] = [{ k: 'all', label: 'All' }, { k: 'offense', label: 'Offense' }, { k: 'defense', label: 'Defense' }];

function Side({ s, side }: { s: CompareRow['away']; side: 'away' | 'home' }) {
  return (
    <span className={`sc-v sc-v--${side}`}><b className="num">{s.value}</b><small>{s.rank != null ? ordinal(s.rank) : ''}</small></span>
  );
}

function Row({ r }: { r: CompareRow }) {
  const name = r.route ? <Link to={r.route} className="sc-n">{r.name}</Link> : <span className="sc-n">{r.name}</span>;
  return (
    <li className="sc-r" data-edge={r.edge ?? undefined}>
      {name}
      <div className="sc-line">
        <Side s={r.away} side="away" />
        <span className="sc-bars" aria-hidden="true">
          <span className={`sc-b sc-b--a${r.edge === 'away' ? ' is-edge' : ''}`}>{r.away.pct != null && <i style={{ width: `${Math.max(4, r.away.pct)}%` }} />}</span>
          <span className={`sc-b sc-b--h${r.edge === 'home' ? ' is-edge' : ''}`}>{r.home.pct != null && <i style={{ width: `${Math.max(4, r.home.pct)}%` }} />}</span>
        </span>
        <Side s={r.home} side="home" />
      </div>
    </li>
  );
}

export function StatsCompare({ g, pairs }: { g: V3Game; pairs: readonly StatPair[] }) {
  const rows = useMemo(() => compareRows(pairs), [pairs]);
  const [f, setF] = useState<'all' | StatGroup>('all');
  const [all, setAll] = useState(false);
  const filtered = useMemo(() => (f === 'all' ? rows : rows.filter((r) => groupOf(r.name) === f)), [rows, f]);
  const shown = all ? filtered : filtered.slice(0, FIRST);
  const n = (rows[0]?.away.n ?? rows[0]?.home.n) ?? null;
  return (
    <section aria-label="Team statistics" className="sc">
      <div className="sc-hd">
        <h2 className="v3-h2">Team statistics</h2>
        <span className="sc-key"><i className="sc-dot sc-dot--a" />{g.away.abbr}<i className="sc-dot sc-dot--h" />{g.home.abbr}{n ? <em>league rank of {n}</em> : null}</span>
      </div>
      <div className="v3-chips sc-f" role="group" aria-label="Statistic group">
        {FILTERS.map((x) => <button key={x.k} type="button" className="v3-chip" aria-pressed={f === x.k} onClick={() => { setF(x.k); setAll(false); }}>{x.label}</button>)}
      </div>
      {shown.length > 0 ? <ul className="sc-list">{shown.map((r) => <Row key={r.id} r={r} />)}</ul> : <p className="v3-note">No published statistics in this group.</p>}
      {filtered.length > FIRST && (
        <button type="button" className="v3-more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${filtered.length} statistics`}</button>
      )}
      <p className="sc-foot"><Icon name="clock" size={14} />No box score: it needs a licensed stats feed that is not connected, so none is shown or estimated.</p>
    </section>
  );
}
