// The Trend chart's accessible twin: the same observations as a labelled list (newest first), each row 44 pt tall, reachable by keyboard
// and screen reader. Selecting a row selects the same observation as the chart does (the address's `obs=`, history replaced), and each
// row keeps the chart's exits: that completed game (the result is the link) and that opponent's team page.
import { useId } from 'react';
import { GameLink, TeamLink } from '../../nav/Targets';

export interface ObsRow {
  /** The observation's index in the series (the address's `obs=`). */
  i: number;
  /** "Oct 12". */
  date: string;
  /** "Week 6", "Playoffs" or null. */
  tag: string | null;
  /** The opponent's code, and whether the team was away. */
  opp: string | null;
  away: boolean;
  /** The game's value, formatted ("13", "+0.048"). */
  value: string;
  /** The final score from the team's side ("13–23") when the publication carries one. */
  final: string | null;
  eventId: string | null;
}

export interface ObsListProps {
  rows: ObsRow[];
  slug: string;
  /** The team's code, for the spoken names of the exits. */
  team: string;
  /** What the value is ("points scored"), for the spoken names. */
  noun: string;
  selected: number;
  onSelect: (i: number) => void;
  label: string;
}

const site = (r: ObsRow) => (r.opp ? `${r.away ? 'at' : 'vs'} ${r.opp}` : null);

export function ObsList({ rows, slug, team, noun, selected, onSelect, label }: ObsListProps) {
  const id = useId();
  return (
    <section className="st-card st-ol" aria-labelledby={`${id}h`} data-obs-list>
      <span className="st-eyebrow" id={`${id}h`}>Game by game</span>
      <p className="st-note st-ol__hint" id={`${id}d`}>Newest first. Select a game to show it in the chart above.</p>
      <ul role="list" aria-label={label} aria-describedby={`${id}d`}>
        {rows.map((r) => {
          const on = r.i === selected;
          const where = site(r);
          return (
            <li key={r.i} className={`st-olr${on ? ' is-on' : ''}`} data-obs-row={r.i}>
              <button type="button" className="st-olr__sel" aria-pressed={on} aria-label={`${r.tag ? `${r.tag}, ` : ''}${r.date}${where ? `, ${where}` : ''}, ${r.value} ${noun}`} onClick={() => onSelect(r.i)}>
                <span className="d"><b>{r.date}</b>{r.tag && <small>{r.tag}</small>}</span>
                <span className="v num">{r.value}</span>
              </button>
              {r.opp ? <TeamLink team={{ slug, id: r.opp }} className="st-olr__opp" label={`${r.opp}, team page`}>{where}</TeamLink> : <span className="st-olr__opp" aria-hidden="true" />}
              {r.eventId
                ? <GameLink game={{ slug, eventId: r.eventId }} className="st-olr__res" label={`${r.final ? `Final ${r.final}, ` : ''}${team}${where ? ` ${where}` : ''}: open Game Detail`}>{r.final ?? 'Game'}</GameLink>
                : <span className="st-olr__res" aria-label="No game page" role="img">—</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
