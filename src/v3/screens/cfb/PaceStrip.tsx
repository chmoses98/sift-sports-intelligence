// The pace & efficiency strip: a handful of metrics for both teams side by side, every value labelled opponent-adjusted or raw, with the rank among FBS, the
// engine's own pace and scoring sentences when it states them, and the personnel context it published (quarterback, record, availability).
// Read from the payload's metric tables; when a trimmed event's tables are not on the page the strip says so instead of guessing.
import { useState } from 'react';
import type { Engine } from '../../../lib/scriptEngine';
import { paceClaims, paceStrip, personnel, stripUniverse } from '../../model/scriptStory';

export function PaceStrip({ engine }: { engine: Engine }) {
  const [unit, setUnit] = useState<'offense' | 'defense'>('offense');
  const rows = paceStrip(engine, unit);
  const claims = paceClaims(engine);
  const pers = personnel(engine);
  const away = engine.teams.away.name, home = engine.teams.home.name;
  const loading = engine.detail.state === 'loading';
  return (
    <section className="x-card cs-sec" aria-labelledby="cs-pace-h" data-testid="cfb-pace">
      <div className="cs-sh"><h2 id="cs-pace-h">Pace &amp; efficiency</h2></div>
      <div className="cs-seg" role="group" aria-label="Unit">
        {(['offense', 'defense'] as const).map((u) => <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}>{u === 'offense' ? 'Offense' : 'Defense'}</button>)}
      </div>
      {rows.length ? (
        <div className="cs-pace" role="table" aria-label={`${unit === 'offense' ? 'Offense' : 'Defense'} pace and efficiency, ${away} and ${home}`}>
          <div className="cs-pace__r cs-pace__h" role="row"><span role="columnheader">{unit === 'offense' ? 'Offense' : 'Defense'}</span><span role="columnheader">{away}</span><span role="columnheader">{home}</span></div>
          {rows.map((r) => (
            <div key={r.id} className="cs-pace__r" role="row" data-testid="cfb-pace-row">
              <span role="rowheader"><b>{r.name}</b><small>{r.hint}</small></span>
              {[r.away, r.home].map((c, i) => (
                <span key={i} role="cell" className="cs-pace__c">
                  {c ? <><b className="num">{c.value}</b><small><i className={`cs-basis cs-basis--${c.basis}`}>{c.basis === 'adjusted' ? 'adj' : 'raw'}</i>{c.rank ? ` #${c.rank}` : ' unranked'}</small></> : <b>—</b>}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : <p className="cs-empty">{loading ? 'Loading the opponent-adjusted metric tables.' : engine.detail.state === 'unavailable' ? `The metric tables are not available for this game: ${engine.detail.reason ?? 'not published'}.` : 'No metric tables are published for this game.'}</p>}
      <p className="cs-foot"><i className="cs-basis cs-basis--adjusted">adj</i> opponent-adjusted for who each team played; <i className="cs-basis cs-basis--raw">raw</i> is not adjusted (a tendency or a box-score total). Ranks are among {stripUniverse(engine) ?? 'all'} FBS teams, #1 best in the engine’s own direction for each metric.</p>
      {claims.length > 0 && <ul className="cs-pts">{claims.map((c) => <li key={c}>{c}</li>)}</ul>}
      <ul className="cs-pers" aria-label="Personnel context">
        {pers.map((p) => <li key={p.team}><b>{p.team}</b> {p.line}</li>)}
      </ul>
    </section>
  );
}
