// MY BOARD — saved research, organised by game (replaces the research tray as the consumer experience; the
// contract research_tray underneath and the packet builder are unchanged). Local-first: everything lives in this
// browser's storage, and the page says so. "What changed since saved" is computed only from evidence Sift has
// (src/board/model.ts).
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { BoardItem } from '../../contract/types';
import { navSport } from '../../data/nav';
import { Icon } from '../../components/Icon';
import { SportMark } from '../../components/SportMark';
import { REF_WORD } from '../../components/TrayDrawer';
import { FINDING_WORD, type FindingKind } from '../../research/findings';
import { ago, kickoff } from '../../lib/format';
import { routes } from '../../lib/routes';
import { useLiveQuotes, useNow } from '../../live/hooks';
import { useAllOpportunities } from '../../opportunity/load';
import { useTray } from '../../state/tray';
import { isFrozen } from '../../lib/lifecycle';
import { useVisit } from '../../state/trail';
import { boardGroups, gameChanges, GROUP_WORD, marketChange, type BoardEntry, type BoardGroupKey, type GameGroup } from '../../board/model';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'started', label: 'In play' },
  { id: 'final', label: 'Final' },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]['id'];

const TYPE_FILTERS: { id: BoardGroupKey | 'all'; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'thesis', label: 'Games' },
  { id: 'players', label: 'Players' },
  { id: 'props', label: 'Props' },
  { id: 'markets', label: 'Markets' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'findings', label: 'Findings' },
];

const kindWord = (e: BoardEntry) => (e.label?.finding ? FINDING_WORD[e.label.finding as FindingKind] ?? e.label.finding : REF_WORD[e.item.ref_kind] ?? e.item.ref_kind);

/** Board lookups for every saved game, from the boards the opportunity layer already loads. */
export function useBoardIndex() {
  const now = useNow(60_000);
  const all = useAllOpportunities(now);
  return useMemo(() => {
    const m = new Map<string, BoardItem>();
    for (const b of all.bundles) for (const i of b.board) m.set(i.event_id, i);
    return { boards: m, loading: all.loading, now };
  }, [all.bundles, all.loading, now]);
}

function EntryRow({ e, quote }: { e: BoardEntry; quote: ReturnType<typeof useLiveQuotes>['quote'] }) {
  const tray = useTray();
  const l = e.label;
  const ch = l?.market ? marketChange(l.market, quote(l.market.ticker)) : null;
  return (
    <li className={`bentry bentry--${e.group}`}>
      <span className="bentry__kind">{kindWord(e)}</span>
      <div className="bentry__body">
        {l ? <Link to={l.href} className="bentry__t">{l.label}</Link> : <span className="bentry__t">{e.item.id}</span>}
        {l?.sub && <span className="bentry__sub">{l.sub}</span>}
        {l?.market && (
          <span className="bentry__mkt">
            <code>{l.market.ticker}</code>
            {l.market.yesAsk != null ? <> · saved at YES {Math.round(l.market.yesAsk * 100)}¢{l.market.observedAt ? `, quote observed ${new Date(l.market.observedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}</> : ' · no quote on screen when saved'}
          </span>
        )}
        {l?.kickoff && isFrozen(l.kickoff, Date.now()) && <span className="bentry__pre" title="Saved before kickoff: it stays pregame research, never a live view.">Pregame · saved before kickoff</span>}
        {ch && <span className={`bentry__chg${ch.reassess ? ' is-alert' : ''}`}><Icon name="clock" size={13} /> {ch.text}</span>}
        <input className="bentry__note" defaultValue={e.item.note ?? ''} placeholder="Add a note (kept with the packet)" aria-label={`Note for ${l?.label ?? e.item.id}`} onBlur={(ev) => tray.setNote(e.item.item_id, ev.target.value)} />
      </div>
      <span className="bentry__when">Saved {ago(e.savedAt)}</span>
      <button type="button" className="iconbtn" onClick={() => tray.remove(e.item.item_id)} aria-label={`Remove ${l?.label ?? e.item.id} from My Board`}><Icon name="close" size={16} /></button>
    </li>
  );
}

function GameCard({ g, board, quote, typeFilter }: { g: GameGroup; board: BoardItem | undefined; quote: ReturnType<typeof useLiveQuotes>['quote']; typeFilter: BoardGroupKey | 'all' }) {
  const nav = navSport(g.sport.toLowerCase());
  const entries = typeFilter === 'all' ? g.entries : g.entries.filter((e) => e.group === typeFilter);
  const oldest = g.entries.reduce((m, e) => (e.savedAt < m ? e.savedAt : m), g.entries[0]?.savedAt ?? new Date().toISOString());
  const changes = gameChanges(g, board, oldest);
  const priceMoves = g.entries.map((e) => (e.label?.market ? marketChange(e.label.market, quote(e.label.market.ticker)) : null)).filter((c) => c && c.kind === 'price' && /up|down/.test(c.text));
  const reassess = changes.some((c) => c.reassess) || priceMoves.some((c) => c!.reassess);
  const groups = [...new Set(entries.map((e) => e.group))];
  if (!entries.length) return null;
  return (
    <article className="glass bgame" aria-labelledby={`bg-${g.key}`}>
      <header className="bgame__h">
        <div className="bgame__id">
          <span className="bgame__sport">{nav && <SportMark slug={nav.slug} icon={nav.icon} size={14} />}{nav?.label ?? g.sport}</span>
          <h2 className="bgame__t" id={`bg-${g.key}`}>{g.href ? <Link to={g.href}>{g.title}</Link> : g.title}</h2>
          <span className="bgame__when">{g.start ? kickoff(g.start) : 'No game attached'}{g.phase && g.phase !== 'PREGAME' ? ` · ${g.phase === 'STARTED' ? 'in play' : g.phase.toLowerCase()}` : ''}</span>
        </div>
        <div className="bgame__acts">
          {reassess && <span className="dword dword--watch">Reassess</span>}
          {g.eventId && <Link className="btn btn--sm" to={routes.packet({ sport: g.sport.toLowerCase(), scope: 'CUSTOM', items: g.entries.map((e) => e.item.item_id) })}><Icon name="bolt" size={14} /> Analysis packet</Link>}
        </div>
      </header>
      {(changes.length > 0 || priceMoves.length > 0) && (
        <div className="bgame__chg" role="note" aria-label="What changed since you saved">
          <span className="eyebrow2">What changed since saved</span>
          <ul>
            {changes.map((c, i) => <li key={i} className={c.reassess ? 'is-alert' : undefined}>{c.text}</li>)}
            {priceMoves.length > 0 && <li>{priceMoves.length} saved {priceMoves.length === 1 ? 'market has' : 'markets have'} moved — details on each below.</li>}
          </ul>
        </div>
      )}
      {groups.map((k) => (
        <section key={k} className="bgame__grp" aria-label={GROUP_WORD[k]}>
          <h3 className="bgame__gh">{GROUP_WORD[k]} <small>{entries.filter((e) => e.group === k).length}</small></h3>
          <ol className="bentries">{entries.filter((e) => e.group === k).map((e) => <EntryRow key={e.item.item_id} e={e} quote={quote} />)}</ol>
        </section>
      ))}
    </article>
  );
}

export function BoardEmpty() {
  return (
    <div className="bempty bempty--board">
      <h3>Your board is empty</h3>
      <p>Save anything you want to come back to — a game, a player, a prop, a market, a game script or a single matchup finding. SIFT organises it by game and tells you what changed since you saved it: price moves on the same contract, games that started, and newer research runs.</p>
      <ul className="bempty__how">
        <li><Icon name="plus" size={14} /> Tap <b>Save</b> or <b>Dig deeper</b> on any card</li>
        <li><Icon name="clock" size={14} /> Come back for <b>what changed</b></li>
        <li><Icon name="bolt" size={14} /> Build a current <b>analysis packet</b> per game</li>
      </ul>
      <Link to={routes.games()} className="btn btn--primary">Browse today’s games <Icon name="arrowRight" size={16} /></Link>
    </div>
  );
}

/**
 * "Run NFL", "Run MLB"…: the analysis the owner runs by hand, reproduced as one tap. Each builds the sport's current
 * slate packet (the same handicap packet contract) after refreshing its markets; nothing about it is a pick.
 */
export function RunAnalysis() {
  const runnable = ['nfl', 'mlb', 'nhl', 'cfb', 'soccer', 'tennis', 'nba', 'cbb'];
  return (
    <section className="glass brun" aria-labelledby="brun-h">
      <div>
        <h2 className="tpanel__h" id="brun-h"><Icon name="bolt" size={15} /> Run a full analysis</h2>
        <p className="tpanel__note">Builds the sport’s current slate packet — every game, the publication’s research and freshly refreshed markets — ready to copy into ChatGPT. The same packet contract as before; one tap instead of a typed command.</p>
      </div>
      <div className="brun__btns">
        {runnable.map((s) => { const n = navSport(s); return n ? <Link key={s} className="btn btn--sm" to={routes.packet({ sport: s, scope: 'SLATE' })}><SportMark slug={s} icon={n.icon} size={14} /> Run {n.label}</Link> : null; })}
      </div>
    </section>
  );
}

export function BoardView() {
  useVisit('My Board', 'board');
  const tray = useTray();
  const idx = useBoardIndex();
  const [sport, setSport] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [type, setType] = useState<BoardGroupKey | 'all'>('all');
  const groups = useMemo(() => boardGroups(tray.tray.items, tray.labels, idx.boards, idx.now), [tray.tray.items, tray.labels, idx.boards, idx.now]);
  const tickers = useMemo(() => Object.values(tray.labels).map((l) => l.market?.ticker).filter((t): t is string => !!t), [tray.labels]);
  const live = useLiveQuotes(tickers, 'slate');
  const sports = [...new Set(groups.map((g) => g.sport))];
  const shown = groups.filter((g) => (!sport || g.sport === sport) && (status === 'all' || (status === 'upcoming' ? g.phase === 'PREGAME' || g.phase === null : status === 'started' ? g.phase === 'STARTED' : g.phase === 'FINAL')));
  const n = tray.tray.items.length;
  return (
    <div className="page bboard">
      <header className="bhome__mast">
        <div>
          <span className="eyebrow2">Saved on this device</span>
          <h1 className="bhome__h">My Board</h1>
        </div>
        <p className="bhome__sum"><b className="bnum">{n}</b> saved {n === 1 ? 'item' : 'items'} across <b className="bnum">{groups.length}</b> {groups.length === 1 ? 'game' : 'games'} · stored in this browser only (no account, no cross-device sync)</p>
      </header>
      <RunAnalysis />
      {n === 0 ? <BoardEmpty /> : (
        <>
          <div className="bboard__filters">
            <div className="gtabs2" role="group" aria-label="Sport">
              <button type="button" className={`gtab${!sport ? ' is-on' : ''}`} aria-pressed={!sport} onClick={() => setSport(null)}>All sports</button>
              {sports.map((s) => <button key={s} type="button" className={`gtab${sport === s ? ' is-on' : ''}`} aria-pressed={sport === s} onClick={() => setSport(sport === s ? null : s)}>{navSport(s.toLowerCase())?.label ?? s}</button>)}
            </div>
            <div className="gtabs2" role="group" aria-label="Game status">
              {STATUS_FILTERS.map((f) => <button key={f.id} type="button" className={`gtab${status === f.id ? ' is-on' : ''}`} aria-pressed={status === f.id} onClick={() => setStatus(f.id)}>{f.label}</button>)}
            </div>
            <div className="gtabs2" role="group" aria-label="Item type">
              {TYPE_FILTERS.map((f) => <button key={f.id} type="button" className={`gtab${type === f.id ? ' is-on' : ''}`} aria-pressed={type === f.id} onClick={() => setType(f.id)}>{f.label}</button>)}
            </div>
          </div>
          {shown.length === 0 && <div className="bempty"><h3>Nothing matches these filters</h3><p>Clear a filter to see the rest of your board.</p></div>}
          <div className="bboard__games">
            {shown.map((g) => <GameCard key={g.key} g={g} board={g.eventId ? idx.boards.get(g.eventId) : undefined} quote={live.quote} typeFilter={type} />)}
          </div>
          <div className="bboard__foot">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.confirm('Remove every saved item from My Board?') && tray.clear()}><Icon name="trash" size={14} /> Clear board</button>
            <span className="muted">Packets resolve your saved items against the latest publication and refresh their markets first.</span>
          </div>
        </>
      )}
    </div>
  );
}
