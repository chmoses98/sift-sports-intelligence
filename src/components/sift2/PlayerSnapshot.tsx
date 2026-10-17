import { useMemo, useState } from 'react';
import { Link } from '../../routing';
import type { PropCard } from '../../insights/props';
import { broadcastPlayerPhoto as playerPhoto } from './playerArt';
import { routes } from '../../lib/routes';
import { formatQuoteAgo, quoteAgeMs } from '../../live/freshness';
import { PlayerArt } from './PlayerArt';
import { FoundationProjection } from '../FoundationProjection';

const cents = (v: number | null | undefined) => v == null ? '—' : `${Math.round(v * 100)}¢`;
const family = (s: string) => s.startsWith('passing') ? 'Pass' : s.startsWith('rushing') ? 'Rush' : 'Rec';
/** Compact player-first entry to the existing full prop research; captured asks stay labelled, never inferred. */
export function PlayerSnapshot({ cards, slug, eventId, now, loading = false, showNotes = true }: { cards: PropCard[]; slug: string; eventId: string; now: number; loading?: boolean; showNotes?: boolean }) {
  const [team, setTeam] = useState('');
  const [stat, setStat] = useState('All');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);
  const teams = [...new Set(cards.map((c) => c.team.abbr))];
  const families = [...new Set(cards.map((c) => family(c.stat)))];
  const players = useMemo(() => {
    const map = new Map<string, PropCard[]>();
    for (const c of cards) {
      if (team && c.team.abbr !== team || stat !== 'All' && family(c.stat) !== stat || search && !`${c.name} ${c.statLabel} ${c.team.abbr}`.toLowerCase().includes(search.toLowerCase())) continue;
      map.set(c.playerId, [...(map.get(c.playerId) ?? []), c]);
    }
    return [...map.values()].sort((a,b) => Number(!!playerPhoto(b[0].playerId,b[0].name,b[0].team.abbr)) - Number(!!playerPhoto(a[0].playerId,a[0].name,a[0].team.abbr)));
  }, [cards, team, stat, search]);
  const shown = expanded ? players : players.slice(0, 4);
  return <section className="s2-player-explorer" aria-labelledby="s2-player-title">
    <div className="s2-filter-strip" role="group" aria-label="Player team"><button aria-pressed={!team} onClick={() => setTeam('')}>Both teams</button>{teams.map((t) => <button key={t} aria-pressed={team === t} onClick={() => setTeam(t)}>{t}</button>)}</div>
    <header><h2 id="s2-player-title">Player Prop Explorer</h2><span>Published snapshots · research only</span></header>
    <label className="s2-player-search"><span className="sr-only">Search players, props or markets</span><input type="search" placeholder="Search players, props or markets…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
    <div className="s2-filter-strip" role="group" aria-label="Player stat"><button aria-pressed={stat === 'All'} onClick={() => setStat('All')}>All</button>{families.map((f) => <button key={f} aria-pressed={stat === f} onClick={() => setStat(f)}>{f}</button>)}<button aria-controls="s2-full-props" onClick={() => { const node = document.getElementById('s2-full-props'); if (node instanceof HTMLDetailsElement) { node.open = true; node.scrollIntoView({ block: 'start' }); } }}>Alt lines & full research ↓</button></div>
    <div className="s2-player-list">{shown.map((rows) => {
      const p = rows[0];
      return <article className="s2-player" key={p.playerId}>
        <div className="s2-player__photo"><PlayerArt id={p.playerId} name={p.name} team={p.team.abbr} surface="portrait" /></div>
        <div className="s2-player__body"><Link className="s2-player__name" to={routes.player(slug,p.playerId)}>{p.name}<span aria-hidden="true">›</span></Link><span className="s2-player__role">{p.team.abbr} · {p.role ?? 'Player'}</span>
          <div className="s2-player__markets">{rows.slice(0,3).map((c) => <Link key={c.id} to={`/design/sift2${routes.props(slug, { game: eventId, player: c.playerId, stat: c.stat })}`}>
            <span>{c.statLabel}</span><strong>{c.line ?? 'No line'}</strong><span className="s2-player__prices"><i>O {cents(c.market?.yes_ask)}</i><i>U {cents(c.market?.no_ask)}</i></span><small>{c.market?.captured_at ? `Captured ${formatQuoteAgo(quoteAgeMs(c.market.captured_at,now))}` : 'Quote time unavailable'}</small><FoundationProjection variant="micro" sport={slug.toUpperCase()} stat={c.stat} playerId={c.playerId} name={p.name} team={p.team.abbr} now={now} />
          </Link>)}</div>
        </div>
      </article>;
    })}</div>
    {loading ? <p className="s2-empty" role="status">Loading published player research…</p> : !shown.length && <p className="s2-empty">No published player snapshots match these filters. Full prop research remains below.</p>}
    {!expanded && players.length > shown.length && <button className="s2-control" onClick={() => setExpanded(true)}>Show all {players.length} players</button>}
    {showNotes && <PlayerSnapshotNotes />}
  </section>;
}

export function PlayerSnapshotNotes() { return <details className="s2-player-note"><summary>Quote sources & research restrictions</summary><p>Quotes above are the publication’s captured asks, before fees. Missing prices remain unavailable. Open a prop for live quote freshness, settlement, fees, matchup evidence and research restrictions.</p></details>; }
