// The injury list's provenance in one strip: the provider, when it was captured, whether that is still fresh for an
// injury list, and what the official designations mean. Used wherever a sport's injuries are listed.
import { Icon } from './Icon';
import { exactTime } from '../lib/format';
import { designation, designationTiming, injuryCadence, injurySource, spanWords } from '../lib/injurySource';
import '../styles/lane-f-data.css';

export function InjurySource({ rows, sport, now, compact }: { rows: { source?: string | null; as_of?: string | null; asOf?: string | null }[]; sport: string; now: number; compact?: boolean }) {
  const s = injurySource(rows, now, sport);
  const timing = designationTiming(sport);
  const c = injuryCadence(sport);
  const ageRule = `Fresh within ${spanWords(c.freshMs)} of capture, stale after ${spanWords(c.staleMs)}.`;
  const note = [s.caveat, 'Designations are each team’s official game status as the source lists them; Sift does not grade them.', timing, `${c.cadence} ${ageRule}`, s.age === 'stale' ? `This capture is more than ${spanWords(c.staleMs)} old: designations may have changed since.` : null].filter(Boolean).join(' ');
  return (
    <div className={`injsrc injsrc--${s.age}${compact ? ' injsrc--compact' : ''}`} role="note" aria-label="Injury list source" data-injury-age={s.age}>
      <div className="injsrc__top">
        <Icon name="medic" size={16} className="injsrc__ic" />
        <span className="injsrc__name">{s.name}</span>
        <span className="injsrc__when" title={s.asOf ? exactTime(s.asOf) : undefined}>{s.ageText}</span>
        <span className={`injsrc__age injsrc__age--${s.age}`} title={ageRule}>{s.ageWord}</span>
      </div>
      {!compact && <p className="injsrc__note">{note}</p>}
    </div>
  );
}

/** The designations present on a list, each with what it means ("Out — will not play"). */
export function DesignationKey({ statuses }: { statuses: (string | null | undefined)[] }) {
  const seen = new Map<string, ReturnType<typeof designation>>();
  for (const st of statuses) {
    const d = designation(st);
    if (d.code && d.code !== 'ACTIVE' && d.meaning && !seen.has(d.code)) seen.set(d.code, d);
  }
  if (!seen.size) return null;
  return (
    <ul className="injkey" aria-label="What the designations mean">
      {[...seen.values()].map((d) => <li key={d.code}><b className={`is-${d.code.toLowerCase()}`}>{d.word}</b><span>{d.meaning}</span></li>)}
    </ul>
  );
}
