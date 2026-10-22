// v4 Props: the player-first Prop Explorer over the app's own prop board. Sport, game, prop category and search narrow
// the list; the order is the app's (featured, projection vs line, last-10 history). Each row sets the Kalshi price beside
// the model figure and opens the player. Nothing here projects, prices or ranks on its own.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from '../routing';
import { Icon } from './Icon';
import { PlayerRowV4 } from './PropsUi';
import { Crest } from './base';
import { useSheet } from './sheet';
import { PROP_SPORTS, propSport, useGamePropSport, useNflPropsSlate, type PropSport } from './propsData';
import { familyCounts, filterRows, groupPlayers, orderRows, SORT_WORDS, type PropSort } from './propsModel';
import { agoWord } from './words';
import { PROP_FAMILY_LABEL, PROP_FAMILY_ORDER, type PropFamily } from '../insights/propBoard';
import { usePlayerHistories, histKey, hitFor } from '../views/props/useHits';
import { statDef } from '../history/stats';
import { quoteAgeMs, quoteFreshness } from '../live/freshness';
import { clock } from './model';
import { SportMark } from '../components/SportMark';
import type { BoardItem } from '../contract/types';
import type { HitRate } from '../history/hitRate';

const PAGE = 20;
const SORTS: PropSort[] = ['featured', 'gap', 'history'];
const SORT_WHY: Record<PropSort, string> = {
  featured: "The prop board's own order: featured roles, extreme matchups and projections away from the line.",
  gap: 'How far the published projection sits from the line, measured in its own middle-50% range. Props without a projection to compare follow, unranked. Not a probability and not an edge.',
  history: "How one-sided each player's last 10 games played were against today's line. History, not a probability. Needs game logs: players without five games follow, unranked.",
};

function gameSide(g: BoardItem, id: string | null) {
  const p = g.participants.find((x) => x.participant_id === id);
  return p;
}
const short = (g: BoardItem, id: string | null) => gameSide(g, id)?.short_name ?? '—';

function SortSheet({ sort, onPick }: { sort: PropSort; onPick: (s: PropSort) => void }) {
  const { close } = useSheet();
  return (
    <>
      <div className="v4-shead">
        <div className="v4-shead__t"><h2 data-autofocus tabIndex={-1}>Rank props by</h2><p className="v4-shead__m">The app's research orderings. Research only.</p></div>
        <button type="button" className="v4-gbtn" onClick={close} aria-label="Close ranking options"><Icon name="x" /></button>
      </div>
      <div className="v4-sbody">
        <ul className="v4-grp" style={{ margin: 0 }} role="radiogroup" aria-label="Rank by">
          {SORTS.map((s) => (
            <li key={s}>
              <button type="button" role="radio" aria-checked={sort === s} className="v4-opt" onClick={() => { onPick(s); close(); }}>
                <span className="v4-opt__t"><b>{SORT_WORDS[s]}</b><span>{SORT_WHY[s]}</span></span>
                <span className="v4-opt__r" aria-hidden="true">{sort === s && <Icon name="check" />}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export function V4Props() {
  const [sp, setSp] = useSearchParams();
  const sport = propSport(sp.get('sport'));
  const set = (patch: Record<string, string | null>) => setSp((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); } return n; }, { replace: true });
  const [searching, setSearching] = useState(!!sp.get('q'));
  const sheet = useSheet();
  const sort = (SORTS.includes(sp.get('sort') as PropSort) ? sp.get('sort') : 'featured') as PropSort;
  return (
    <div>
      <div className="v4-stage">
        <header className="v4-top" style={{ alignItems: 'flex-start', paddingBottom: 0 }}>
          <div style={{ minWidth: 0 }}>
            <h1 className="v4-h1">Props</h1>
            <p className="v4-sub">Kalshi prices beside the pregame model, player by player. Research only.</p>
          </div>
          <span className="v4-spacer" />
          {sport.mode === 'explorer' && (
            <>
              <button type="button" className={`v4-gbtn${searching ? ' v4-gbtn--on' : ''}`} aria-label="Search players" aria-expanded={searching} onClick={() => { setSearching((s) => !s); if (searching) set({ q: null }); }}><Icon name="magnifying-glass" /></button>
              <button type="button" className={`v4-gbtn${sort !== 'featured' ? ' v4-gbtn--on' : ''}`} aria-label={`Rank props by: ${SORT_WORDS[sort]}`} onClick={() => sheet.open(<SortSheet sort={sort} onPick={(s) => set({ sort: s === 'featured' ? null : s })} />, { label: 'Rank props' })}><Icon name="sliders-horizontal" /></button>
            </>
          )}
        </header>
        <div className="v4-chips" role="group" aria-label="Sport" style={{ paddingTop: 14 }}>
          {PROP_SPORTS.map((s) => (
            <button key={s.slug} type="button" className="v4-chip" aria-pressed={s.slug === sport.slug} onClick={() => set({ sport: s.slug === 'nfl' ? null : s.slug, game: null, cat: null, q: null })}>
              <SportMark slug={s.slug} icon={s.icon} size={20} />{s.label}
            </button>
          ))}
        </div>
      </div>
      {sport.mode === 'explorer' ? <NflExplorer searching={searching} sort={sort} /> : <GamePropsList s={sport} />}
    </div>
  );
}

function NflExplorer({ searching, sort }: { searching: boolean; sort: PropSort }) {
  const [sp, setSp] = useSearchParams();
  const slate = useNflPropsSlate();
  const [limit, setLimit] = useState(PAGE);
  const game = sp.get('game');
  const cat = (PROP_FAMILY_ORDER.includes(sp.get('cat') as PropFamily) ? sp.get('cat') : null) as PropFamily | null;
  const q = sp.get('q') ?? '';
  const set = (patch: Record<string, string | null>) => { setLimit(PAGE); setSp((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); } return n; }, { replace: true }); };

  const priced = useMemo(() => slate.rows.filter((d) => d.row.main), [slate.rows]);
  const inGame = useMemo(() => filterRows(priced, { game, q }), [priced, game, q]);
  const families = useMemo(() => familyCounts(inGame, PROP_FAMILY_ORDER), [inGame]);
  const filtered = useMemo(() => filterRows(priced, { game, family: cat, q }), [priced, game, cat, q]);

  // History is read only when the viewer asks for that ranking (one game log per player).
  const histPlayers = useMemo(() => {
    if (sort !== 'history') return [];
    const m = new Map<string, { name: string; team: string }>();
    for (const d of filtered) if (statDef(d.row.def.stat)) m.set(histKey(d.row.name, d.row.team.abbr), { name: d.row.name, team: d.row.team.abbr });
    return [...m.values()];
  }, [filtered, sort]);
  const hist = usePlayerHistories('NFL', histPlayers);
  const { ordered, unranked } = useMemo(
    () => orderRows(filtered, sort, sort === 'history' ? (d): HitRate | null => hitFor(hist.docs.get(histKey(d.row.name, d.row.team.abbr)), d.row, d.kickoff, 'last10') : undefined),
    [filtered, sort, hist.docs],
  );
  const players = useMemo(() => groupPlayers(ordered), [ordered]);
  const shown = players.slice(0, limit);

  const gameChips = useMemo(() => slate.games.filter((g) => priced.some((d) => d.eventId === g.event_id)), [slate.games, priced]);
  const playersIn = (id: string) => new Set(priced.filter((d) => d.eventId === id).map((d) => d.row.playerId)).size;
  const quotes = useMemo(() => priced.map((d) => d.row.main!.market.captured_at).filter((x): x is string => !!x), [priced]);
  const newestQuote = quotes.length ? quotes.reduce((a, b) => (a > b ? a : b)) : null;
  const fresh = newestQuote ? quoteFreshness(newestQuote, slate.now) : null;

  if (slate.error && !slate.rows.length) {
    return <div className="v4-body"><div className="v4-note v4-note--risk" role="alert"><Icon name="cloud-slash" /><div><b>NFL props are unavailable right now</b>The NFL publication could not be read, so the available props cannot be verified. This is not a no-props verdict.</div></div></div>;
  }
  if (slate.loading) {
    return <div className="v4-body" role="status" aria-label="Loading player props"><div className="v4-grp" style={{ marginTop: 8 }}>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="v4-skel v4-skelrow" style={{ height: 104 }} />)}</div></div>;
  }
  if (!slate.games.length) {
    return <div className="v4-body"><div className="v4-note"><Icon name="calendar-dots" /><div><b>No upcoming NFL games are listed</b>The explorer reads the coming week's games that have not kicked off. Pregame research is frozen once a game starts.</div></div></div>;
  }
  return (
    <div className="v4-body">
      {searching && (
        <div className="v4-search">
          <Icon name="magnifying-glass" size="s" />
          <label className="sr" htmlFor="v4-psearch">Search players, positions or teams</label>
          <input id="v4-psearch" type="search" placeholder="Search players…" value={q} autoFocus enterKeyHint="search" autoComplete="off" onChange={(e) => set({ q: e.target.value || null })} />
          {q && <button type="button" className="v4-search__x" aria-label="Clear search" onClick={() => set({ q: null })}><Icon name="x" size="s" /></button>}
        </div>
      )}
      <div className="v4-chips v4-chips--games" role="group" aria-label="Game">
        <button type="button" className="v4-gchip" aria-pressed={!game} onClick={() => set({ game: null })}><b>All games</b><span>{new Set(priced.map((d) => `${d.eventId}|${d.row.playerId}`)).size} players</span></button>
        {gameChips.map((g) => (
          <button key={g.event_id} type="button" className="v4-gchip" aria-pressed={game === g.event_id} onClick={() => set({ game: game === g.event_id ? null : g.event_id })}>
            <span className="v4-gchip__c"><Crest sport="NFL" p={gameSide(g, g.away_participant)} size="sm" /><Crest sport="NFL" p={gameSide(g, g.home_participant)} size="sm" /></span>
            <span><b>{short(g, g.away_participant)} @ {short(g, g.home_participant)}</b><span>{clock(Date.parse(g.start_time_utc))} · {playersIn(g.event_id)}</span></span>
          </button>
        ))}
      </div>
      <div className="v4-chips" role="group" aria-label="Prop category" style={{ paddingTop: 0 }}>
        <button type="button" className="v4-chip" aria-pressed={!cat} onClick={() => set({ cat: null })}>All <i>{inGame.length}</i></button>
        {families.map(({ family, n }) => <button key={family} type="button" className="v4-chip" aria-pressed={cat === family} onClick={() => set({ cat: cat === family ? null : family })}>{PROP_FAMILY_LABEL[family]} <i>{n}</i></button>)}
      </div>

      <p className="v4-status" role="status">
        <span><i className={`v4-dot${fresh === 'FRESH' ? '' : fresh == null ? ' v4-dot--off' : ' v4-dot--stale'}`} />{fresh == null ? 'No quote times published' : fresh === 'FRESH' || fresh === 'AGING' ? `Kalshi quotes ${agoWord(quoteAgeMs(newestQuote, slate.now))}` : `Kalshi quotes stale (${agoWord(quoteAgeMs(newestQuote, slate.now))}): shown as context, not executable`}</span>
        <span><i className="v4-dot v4-dot--frozen" />{slate.publishedAt ? `Research published ${agoWord(quoteAgeMs(slate.publishedAt, slate.now))}` : 'Research publish time not stated'}</span>
      </p>

      {players.length === 0 ? (
        <div className="v4-note"><Icon name="magnifying-glass" /><div><b>No props match</b>{q ? `Nothing matches "${q}" in this selection.` : 'No priced prop is listed for this selection.'}{(q || cat || game) && <><br /><button type="button" className="v4-btn v4-btn--sec" onClick={() => set({ q: null, cat: null, game: null })}>Clear filters</button></>}</div></div>
      ) : (
        <>
          <ul className="v4-grp v4-plist" aria-label={`${players.length} players, ${filtered.length} props`}>
            {shown.map((e) => <PlayerRowV4 key={e.key} e={e} now={slate.now} />)}
          </ul>
          {players.length > limit && <div style={{ padding: '10px 16px 0' }}><button type="button" className="v4-btn v4-btn--sec" style={{ width: '100%' }} onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, players.length - limit)} more of {players.length - limit}</button></div>}
          {sort !== 'featured' && (hist.loading && sort === 'history' ? <p className="v4-foot" role="status">Reading game logs…</p> : unranked > 0 && <p className="v4-foot">{unranked} prop{unranked === 1 ? '' : 's'} cannot be placed by this ranking and follow the ranked ones.</p>)}
        </>
      )}
      {slate.unreadable > 0 && <div className="v4-note" style={{ marginTop: 16 }}><Icon name="info" /><div><b>{slate.unreadable} game{slate.unreadable === 1 ? '' : 's'} not shown</b>Research for {slate.unreadable === 1 ? 'that game' : 'those games'} could not be read. Missing props are not evidence that none exist.</div></div>}
      <p className="v4-foot">Priced lines only. The NFL publication rates its prop pricing research only: nothing here is a validated edge or a recommendation.</p>
    </div>
  );
}

function GamePropsList({ s }: { s: PropSport }) {
  const d = useGamePropSport(s.slug as 'mlb' | 'nhl');
  return (
    <div className="v4-body">
      <div className="v4-note"><Icon name="info" /><div><b>{s.label} props live on each game</b>{s.note} Open a game for its Kalshi player markets, with their capture times.</div></div>
      {d.error ? <div className="v4-note v4-note--risk" role="alert" style={{ marginTop: 12 }}><Icon name="cloud-slash" /><div><b>{s.label} games are unavailable</b>Missing games are not evidence that no player markets exist.</div></div>
        : d.loading ? <div role="status" aria-label="Loading games" className="v4-grp" style={{ marginTop: 12 }}>{[0, 1, 2].map((i) => <div key={i} className="v4-skel v4-skelrow" />)}</div>
        : d.games.length === 0 ? <div className="v4-note" style={{ marginTop: 12 }}><Icon name="calendar-dots" /><div><b>No upcoming {s.label} games listed</b>The list covers the next {s.horizonDays} days of games that have not started.</div></div>
        : (
          <ul className="v4-grp" style={{ marginTop: 12 }} aria-label={`${s.label} games with player markets`}>
            {d.games.map((g) => {
              const n = d.counts?.get(g.event_id);
              return (
                <li key={g.event_id}>
                  <Link to={`/v4/game/${s.slug}/${encodeURIComponent(g.event_id)}?tab=markets`} className="v4-link" style={{ margin: 0, width: '100%', borderRadius: 0, boxShadow: 'none', background: 'none' }}>
                    <span className="v4-link__t"><b>{short(g, g.away_participant)} @ {short(g, g.home_participant)}</b><span>{clock(Date.parse(g.start_time_utc))} · {d.countsLoading ? 'Counting player markets…' : n == null ? 'Markets could not be read' : n ? `${n} player market${n === 1 ? '' : 's'}` : 'No player markets listed'}</span></span>
                    <Icon name="caret-right" size="s" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
}
