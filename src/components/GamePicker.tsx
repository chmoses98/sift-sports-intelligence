import { useId, useMemo, useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';
import { TeamMark } from './ui';
import { usePhone } from '../lib/useMediaQuery';
import '../styles/game-picker.css';

export interface PickGame {
  id: string;
  /** Sport code ("NFL"), for the logo lookup and the sport filter. */
  sport: string;
  away: { abbr: string; name?: string };
  home: { abbr: string; name?: string };
  startMs: number;
}

const dayKey = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const timeWord = (ms: number) => (Number.isFinite(ms) ? new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : 'TBC');

/** Pure: the games a search and sport filter keep, grouped by local day in start order. A query matches abbreviations, names and the sport. */
export function pickerGroups(games: PickGame[], query: string, sport: string | null): { day: string; games: PickGame[] }[] {
  const q = query.trim().toLowerCase();
  const keep = games.filter((g) => (!sport || g.sport === sport) && (!q || [g.away.abbr, g.home.abbr, g.away.name, g.home.name, g.sport].some((x) => x?.toLowerCase().includes(q))));
  const out: { day: string; games: PickGame[] }[] = [];
  for (const g of [...keep].sort((a, b) => (Number.isFinite(a.startMs) ? a.startMs : Infinity) - (Number.isFinite(b.startMs) ? b.startMs : Infinity))) {
    const day = Number.isFinite(g.startMs) ? dayKey(g.startMs) : 'Time to be confirmed';
    const last = out[out.length - 1];
    if (last && last.day === day) last.games.push(g); else out.push({ day, games: [g] });
  }
  return out;
}

const fullName = (g: PickGame) => `${g.away.name ?? g.away.abbr} at ${g.home.name ?? g.home.abbr}`;

/**
 * Chooses one game (or "All games"). Desktop keeps the native select (one tap target, full keyboard behaviour); a phone gets a
 * searchable sheet of two-column matchup tiles (both marks, abbreviations, kickoff) grouped by day, with sport chips when the slate
 * spans several sports. The chosen game stays marked; choosing closes the sheet.
 */
export function GamePicker({ games, value, onChange, label = 'Game' }: { games: PickGame[]; value: string; onChange: (id: string) => void; label?: string }) {
  const phone = usePhone();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sport, setSport] = useState<string | null>(null);
  const sports = useMemo(() => [...new Set(games.map((g) => g.sport))], [games]);
  const groups = useMemo(() => pickerGroups(games, q, sport), [games, q, sport]);
  const chosen = games.find((g) => g.id === value) ?? null;
  const allWord = `All games (${games.length})`;
  const pick = (id: string) => { onChange(id); setOpen(false); setQ(''); setSport(null); };
  const shown = groups.reduce((n, d) => n + d.games.length, 0);

  if (!phone) {
    return (
      <label className="term__sel"><span>{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{allWord}</option>
          {games.map((g) => <option key={g.id} value={g.id}>{g.away.abbr} @ {g.home.abbr} · {Number.isFinite(g.startMs) ? new Date(g.startMs).toLocaleDateString(undefined, { weekday: 'short' }) : 'TBC'}</option>)}
        </select>
      </label>
    );
  }
  return (
    <div className="gpick">
      <span className="gpick__l" id={`${uid}-l`}>{label}</span>
      <button type="button" className="gpick__btn" aria-haspopup="dialog" aria-expanded={open} aria-labelledby={`${uid}-l ${uid}-v`} onClick={() => setOpen(true)}>
        {chosen ? <span className="gpick__marks" aria-hidden="true"><TeamMark sport={chosen.sport} abbr={chosen.away.abbr} size="sm" /><TeamMark sport={chosen.sport} abbr={chosen.home.abbr} size="sm" /></span> : <Icon name="grid" size={18} />}
        <span className="gpick__v" id={`${uid}-v`}>{chosen ? `${chosen.away.abbr} @ ${chosen.home.abbr} · ${timeWord(chosen.startMs)}` : allWord}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Choose a game" className="gpick__sheet">
        <label className="gpick__search"><Icon name="search" size={16} /><span className="sr-only">Search games by team</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search team or abbreviation" data-autofocus /></label>
        {sports.length > 1 && (
          <div className="skchips gpick__sports" role="group" aria-label="Sport">
            <button type="button" className={`skchip${!sport ? ' is-on' : ''}`} aria-pressed={!sport} onClick={() => setSport(null)}>All sports</button>
            {sports.map((s) => <button key={s} type="button" className={`skchip${sport === s ? ' is-on' : ''}`} aria-pressed={sport === s} onClick={() => setSport(sport === s ? null : s)}>{s}</button>)}
          </div>
        )}
        {!q && !sport && (
          <button type="button" className={`gpick__all${!value ? ' is-on' : ''}`} aria-pressed={!value} onClick={() => pick('')}><Icon name="grid" size={18} /> {allWord}{!value && <Icon name="check" size={16} />}</button>
        )}
        <p className="sr-only" role="status" aria-live="polite">{shown} game{shown === 1 ? '' : 's'} shown</p>
        {groups.map((d) => (
          <section key={d.day} className="gpick__day" aria-label={d.day}>
            <h3>{d.day}</h3>
            <ul className="gpick__grid">
              {d.games.map((g) => {
                const on = g.id === value;
                return (
                  <li key={g.id}>
                    <button type="button" className={`gpick__tile${on ? ' is-on' : ''}`} aria-pressed={on} aria-label={`${fullName(g)}, ${timeWord(g.startMs)}`} onClick={() => pick(g.id)}>
                      <span className="gpick__teams" aria-hidden="true"><span><TeamMark sport={g.sport} abbr={g.away.abbr} size="sm" /><b>{g.away.abbr}</b></span><i>@</i><span><TeamMark sport={g.sport} abbr={g.home.abbr} size="sm" /><b>{g.home.abbr}</b></span></span>
                      <span className="gpick__when" aria-hidden="true">{timeWord(g.startMs)}{sports.length > 1 ? ` · ${g.sport}` : ''}</span>
                      {on && <Icon name="check" size={14} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {!groups.length && <p className="gpick__none">No game matches “{q.trim()}”{sport ? ` in ${sport}` : ''}. <button type="button" onClick={() => { setQ(''); setSport(null); }}>Clear search</button></p>}
      </BottomSheet>
    </div>
  );
}
