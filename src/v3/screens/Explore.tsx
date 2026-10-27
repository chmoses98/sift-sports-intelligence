import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from '../../routing';
import { useQueryPatch } from '../state/url';
import { useSearchHits, type Hit } from '../data/useSearch';
import { useSlate } from '../data/useSlate';
import { clearRecents, pushRecent, useRecents, useVisits } from '../state/prefs';
import { Icon, type IconName } from '../ui/Icon';
import { ChipRail } from '../ui/ChipRail';
import { FollowStar } from '../ui/Controls';
import { TeamLogo } from '../ui/TeamLogo';
import { sportsIn } from './Games';
import type { V3Game } from '../model/types';
import { gameHref } from '../ui/gamebits';

type Cat = 'player' | 'team' | 'game' | 'stat';
const CATS: { k: Cat; label: string; icon: IconName }[] = [{ k: 'player', label: 'Players', icon: 'user' }, { k: 'team', label: 'Teams', icon: 'shield' }, { k: 'game', label: 'Games', icon: 'ball' }, { k: 'stat', label: 'Stats', icon: 'trend' }];
const GROUP: Record<Cat, string> = { player: 'Players', team: 'Teams', game: 'Games', stat: 'Statistics' };

function Avatar({ h }: { h: Hit }) {
  if (h.team) return <TeamLogo team={h.team} size={44} />;
  if (h.game) return <span className="v3-av v3-av--pair"><TeamLogo team={h.game.away} size={30} /><TeamLogo team={h.game.home} size={30} /></span>;
  return <span className="v3-av"><Icon name={h.kind === 'stat' ? 'trend' : 'user'} size={22} /></span>;
}

function HitRow({ h, q }: { h: Hit; q: string }) {
  return (
    <li className="v3-hit">
      <Link to={h.route} className="v3-hit__l" onClick={() => q && pushRecent(q, h.route)} aria-label={`${h.title}, ${h.subtitle}${h.unpriced ? ', no market needed' : ''}. Open`}>
        <Avatar h={h} />
        <span className="v3-hit__t"><b>{h.title}</b><small>{h.subtitle}</small></span>
        {h.kind !== 'player' && h.kind !== 'team' && <Icon name="chevR" size={20} />}
      </Link>
      {h.kind === 'player' && <FollowStar kind="players" id={h.key} label={h.title} />}
      {h.kind === 'team' && <FollowStar kind="teams" id={h.key} label={h.title} />}
      {h.kind === 'game' && h.game && <FollowStar kind="games" id={h.game.key} label={h.title} />}
    </li>
  );
}

export function Explore() {
  const [sp] = useSearchParams();
  const setSp = useQueryPatch();
  const q = sp.get('q') ?? '';
  const sport = sp.get('sport') ?? 'all';
  const cat = (CATS.some((c) => c.k === sp.get('cat')) ? sp.get('cat') : 'all') as Cat | 'all';
  const set = (patch: Record<string, string | null>) => setSp((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); } return n; });
  const { games } = useSlate();
  const { hits, loading } = useSearchHits(q, sport, cat);
  const recents = useRecents();
  const visits = useVisits();
  const input = useRef<HTMLInputElement>(null);
  // The field keeps its own text (so typing is never fought by the router) and mirrors it into the address for Back and reload.
  const [text, setText] = useState(q);
  // Only an address change that did not come from typing (Back, a recent search, Clear) replaces the field: a late echo of an older keystroke must never overwrite newer text.
  const typed = useRef(new Set([q]));
  useEffect(() => { if (!typed.current.has(q)) { typed.current = new Set([q]); setText(q); } }, [q]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => { if (sp.get('focus') === '1') { input.current?.focus(); set({ focus: null }); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const sports = useMemo(() => sportsIn(games), [games]);
  const browsing = q.trim() !== '' || cat !== 'all';
  const groups = useMemo(() => (['player', 'team', 'game', 'stat'] as Cat[]).map((k) => ({ k, rows: hits.filter((h) => h.kind === k) })).filter((g) => g.rows.length), [hits]);
  // Worth a look: the publication's own busiest games (research signals, then priced contracts), never a duplicate of Recent research.
  const trending = useMemo(() => {
    const seen = new Set(visits.map((v) => v.route.split('?')[0]));
    const pool = (sport === 'all' ? games : games.filter((g) => g.slug === sport)).filter((g) => g.phase !== 'final');
    return [...pool].sort((a, b) => b.signals - a.signals || ((b.item?.markets_priced ?? b.lines.length) - (a.item?.markets_priced ?? a.lines.length)) || a.startMs - b.startMs).filter((g) => !seen.has(gameHref(g))).slice(0, 4);
  }, [games, sport, visits]);

  return (
    <div className="v3-page v3-explore">
      <h1 className="v3-pgtitle">Explore</h1>
      <label className="v3-search">
        <Icon name="search" size={22} />
        <input ref={input} type="search" value={text} onChange={(e) => { typed.current.add(e.target.value); setText(e.target.value); set({ q: e.target.value || null }); }} placeholder="Search players, teams, games, stats…" aria-label="Search players, teams, games and statistics" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false} />
        {text && <button type="button" aria-label="Clear search" onClick={() => { typed.current.add(''); setText(''); set({ q: null }); }}><Icon name="close" size={18} /></button>}
      </label>
      <div className="v3-rail v3-rail--box" role="tablist" aria-label="Sport">
        {[{ slug: 'all', label: 'All' }, ...sports].map((s) => <button key={s.slug} type="button" role="tab" aria-selected={sport === s.slug} className="v3-rail__t" onClick={() => set({ sport: s.slug === 'all' ? null : s.slug })}>{s.label}</button>)}
      </div>
      <div className="v3-cats" role="group" aria-label="Browse by type">
        {CATS.map((c) => <button key={c.k} type="button" className="v3-cat" aria-pressed={cat === c.k} onClick={() => set({ cat: cat === c.k ? null : c.k })}><Icon name={c.icon} size={26} /><span>{c.label}</span></button>)}
      </div>

      {browsing ? (
        <div aria-live="polite">
          {loading && !hits.length && <div className="v3-skel" style={{ height: 180 }} role="status" aria-label="Searching" />}
          {groups.map((g) => {
            const all = open[g.k] || cat === g.k;
            const rows = all ? g.rows.slice(0, 80) : g.rows.slice(0, 5);
            return (
              <section key={g.k} aria-label={GROUP[g.k]}>
                <div className="v3-sechead"><h2>{GROUP[g.k]}</h2>{g.rows.length > 5 && !all && <button type="button" onClick={() => setOpen({ ...open, [g.k]: true })}>Show all {g.rows.length}</button>}</div>
                <ul className="v3-hits">{rows.map((h) => <HitRow key={h.key} h={h} q={q.trim()} />)}</ul>
              </section>
            );
          })}
          {!loading && groups.length === 0 && (
            <div className="v3-state"><Icon name="search" size={20} /><div><b>No results{q ? ` for “${q}”` : ''}</b>Try a team, a player's last name or a statistic such as “offensive rebound rate”.<br />
              {q && <button type="button" onClick={() => set({ q: null })}>Clear search</button>}{' '}{cat !== 'all' && <button type="button" onClick={() => set({ cat: null })}>Show all types</button>}{' '}{sport !== 'all' && <button type="button" onClick={() => set({ sport: null })}>All sports</button>}</div></div>
          )}
        </div>
      ) : (
        <>
          {(visits.length > 0 || recents.length > 0) && (
            <section aria-label="Recent research">
              <div className="v3-sechead"><h2>Your Recent Research</h2>{recents.length > 0 && <button type="button" onClick={clearRecents}>Clear searches</button>}</div>
              {visits.length > 0 ? (
                <ul className="v3-hits">{visits.slice(0, 5).map((v) => (
                  <li key={v.route} className="v3-hit"><Link to={v.route} className="v3-hit__l"><span className="v3-av">{v.logo ? <img src={v.logo} alt="" width="40" height="40" /> : <Icon name={v.kind === 'stat' ? 'trend' : v.kind === 'game' ? 'ball' : 'user'} size={22} />}</span><span className="v3-hit__t"><b>{v.title}</b><small>{v.subtitle}</small></span><Icon name="chevR" size={20} /></Link></li>
                ))}</ul>
              ) : <p className="v3-note">Teams, players, games and statistics you open appear here.</p>}
              {recents.length > 0 && <ChipRail className="v3-chips v3-chips--recent" role="group" aria-label="Recent searches">{recents.slice(0, 6).map((r) => <button key={r.q} type="button" className="v3-chip" onClick={() => set({ q: r.q })}><Icon name="clock" size={14} />{r.q}</button>)}</ChipRail>}
            </section>
          )}
          {trending.length > 0 && (
            <section aria-label="What's trending">
              <div className="v3-sechead"><h2>What's Trending</h2><Link to="/v3/games">See games<Icon name="chevR" size={16} /></Link></div>
              <ul className="v3-hits">{trending.map((g: V3Game) => (
                <li key={g.key} className="v3-hit"><Link to={gameHref(g)} className="v3-hit__l"><span className="v3-av v3-av--pair"><TeamLogo team={g.away} size={30} /><TeamLogo team={g.home} size={30} /></span><span className="v3-hit__t"><b>{g.away.nick} at {g.home.nick}</b><small>{g.signals > 0 ? `${g.signals} published research signal${g.signals === 1 ? '' : 's'}` : `${g.item?.markets_priced ?? g.lines.length} priced contracts`}</small></span><Icon name="chevR" size={20} /></Link></li>
              ))}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
