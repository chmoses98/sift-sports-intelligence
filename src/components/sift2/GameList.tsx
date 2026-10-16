import { useMemo, useState } from 'react';
import { Link } from '../../routing';
import { Icon } from '../Icon';
import { NAV_SPORTS } from '../../data/nav';
import { PMark } from '../../views/broadcast/parts';
import { phaseWord, type GameRow } from '../../views/broadcast/games';
import { heroInputFor } from '../../lib/hero/input';
import { resolveHero } from '../../lib/hero/resolve';
import { routes } from '../../lib/routes';
import { broadcastHeroSpec, broadcastArtVars } from './heroArt';
import { VenueArt } from './VenueArt';

export const gameKey = (g: GameRow) => `${g.slug}:${g.item.event_id}`;
export const gameHref = (g: GameRow, tab?: string) => `/design/sift2${routes.game(g.slug, g.item.event_id, tab ? { tab } : undefined)}`;

/** The venue and artwork a board row can resolve WITHOUT fetching its research document (so a 100-game list stays cheap). */
function useRowVenue(g: GameRow) {
  return useMemo(() => {
    try { return resolveHero(heroInputFor(g.item, null, g.sport)); } catch { return null; }
  }, [g]);
}

/** A board's display name as a row shows it. Some publications repeat the nickname ("New York Jets Jets"): the repeat is dropped. */
export function teamName(p: GameRow['away']): string {
  const n = (p?.display_name ?? p?.short_name ?? 'TBD').trim();
  return n.replace(/\b(\p{L}+)\s+\1$/iu, '$1');
}

/**
 * One game as a compact row: both marks and names (the short name stands in for a long one on a narrow row), the start
 * time or phase, the verified venue when the registry has one, one research link. The whole row is that single link, so a
 * list never repeats a navigation button per game. `art` adds the venue's artwork as a quiet backdrop (Home's preview of at
 * most six games; the Games page leaves it off so a hundred-game slate paints no hundred photographs).
 */
export function GameRowItem({ game: g, art = false, current = false, showSport = false }: { game: GameRow; art?: boolean; current?: boolean; showSport?: boolean }) {
  const spec = useRowVenue(g);
  const cardArt = useMemo(() => (art && spec ? broadcastHeroSpec(spec, 'card') : null), [art, spec]);
  const venue = spec?.venue?.name ?? null;
  const when = phaseWord(g);
  const live = g.phase === 'STARTED' && !g.stale;
  const label = `${teamName(g.away)} ${spec?.context === 'home' || spec?.context === 'home-elsewhere' ? 'at' : 'versus'} ${teamName(g.home)}`;
  return (
    <li className={`s2-gr${current ? ' is-current' : ''}${live ? ' is-live' : ''}${cardArt ? ' has-art' : ''}`} style={cardArt ? broadcastArtVars(cardArt, 'card') : undefined}>
      {cardArt && <div className="s2-gr__art"><VenueArt key={cardArt.photo?.id ?? cardArt.reason} spec={cardArt} surface="card" /></div>}
      <Link to={gameHref(g)} className="s2-gr__link" aria-current={current ? 'true' : undefined} aria-label={`${label}, ${when}. Open game research`}>
        <span className="s2-gr__time"><b>{when}</b>{showSport ? <small>{g.sport}</small> : live ? <small>Live</small> : null}</span>
        <span className="s2-gr__teams">
          <span className="s2-gr__team"><PMark sport={g.sport} p={g.away} size="sm" /><span className="s2-gr__name" title={teamName(g.away)}>{teamName(g.away)}</span></span>
          <span className="s2-gr__team"><PMark sport={g.sport} p={g.home} size="sm" /><span className="s2-gr__name" title={teamName(g.home)}>{teamName(g.home)}</span></span>
        </span>
        {(venue || g.candidates > 0) && <span className="s2-gr__meta">
          {venue && <span className="s2-gr__venue" title={venue}>{venue}</span>}
          {g.candidates > 0 && <span className="s2-gr__chip">{g.candidates} research candidate{g.candidates === 1 ? '' : 's'}</span>}
        </span>}
        <span className="s2-gr__go" aria-hidden="true"><span>Research</span><Icon name="chevronRight" size={16} /></span>
      </Link>
    </li>
  );
}

const SPORT_ORDER = NAV_SPORTS.map((s) => s.slug);
const sportRank = (slug: string) => { const i = SPORT_ORDER.indexOf(slug); return i < 0 ? 99 : i; };
/** The local hour a game starts in, as a heading ("7 PM"); a game with no usable start sorts last as "Time TBC". */
const hourOf = (ms: number) => (Number.isFinite(ms) ? new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric' }) : 'Time TBC');

export interface GameGroup { slug: string; sport: string; games: GameRow[]; slots: { label: string; games: GameRow[] }[] }

/** Games grouped by sport (the navigation's order), then by local start hour, each in start order. Pure: the list's whole structure. */
export function groupGames(games: GameRow[]): GameGroup[] {
  const by = new Map<string, GameRow[]>();
  for (const g of games) by.set(g.slug, [...(by.get(g.slug) ?? []), g]);
  return [...by.entries()]
    .sort(([a], [b]) => sportRank(a) - sportRank(b) || a.localeCompare(b))
    .map(([slug, gs]) => {
      const ordered = [...gs].sort((a, b) => (Number.isFinite(a.startMs) ? a.startMs : Infinity) - (Number.isFinite(b.startMs) ? b.startMs : Infinity));
      const slots: GameGroup['slots'] = [];
      for (const g of ordered) {
        const label = hourOf(g.startMs);
        const last = slots[slots.length - 1];
        if (last && last.label === label) last.games.push(g); else slots.push({ label, games: [g] });
      }
      return { slug, sport: gs[0].sport, games: ordered, slots };
    });
}

/** Rows a sport shows before "Show all": a long slate stays scannable, and a sport filter lifts the cap. */
export const GROUP_CAP = 20;

/** A whole slate: one section per sport, start-hour sub-headings inside, no nested scrolling. */
export function GameGroups({ games, currentKey, uncapped = false }: { games: GameRow[]; currentKey?: string; uncapped?: boolean }) {
  const groups = useMemo(() => groupGames(games), [games]);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  return (
    <div className="s2-gg">
      {groups.map((grp) => {
        const nav = NAV_SPORTS.find((s) => s.slug === grp.slug);
        const all = uncapped || open.has(grp.slug) || grp.games.length <= GROUP_CAP + 4;
        let budget = all ? Infinity : GROUP_CAP;
        return (
          <section key={grp.slug} className="s2-gg__sport" aria-labelledby={`s2-gg-${grp.slug}`}>
            <h3 className="s2-gg__h" id={`s2-gg-${grp.slug}`}>{nav?.label ?? grp.sport} <span>{grp.games.length} game{grp.games.length === 1 ? '' : 's'}</span></h3>
            {grp.slots.map((slot) => {
              if (budget <= 0) return null;
              const rows = slot.games.slice(0, budget);
              budget -= rows.length;
              return (
                <div key={slot.label} className="s2-gg__slot">
                  <h4 className="s2-gg__t">{slot.label}</h4>
                  <ul className="s2-gg__list">{rows.map((g) => <GameRowItem key={gameKey(g)} game={g} current={gameKey(g) === currentKey} />)}</ul>
                </div>
              );
            })}
            {!all && <button type="button" className="s2-gg__more" onClick={() => setOpen((p) => new Set(p).add(grp.slug))}>Show all {grp.games.length} {nav?.label ?? grp.sport} games</button>}
          </section>
        );
      })}
    </div>
  );
}
