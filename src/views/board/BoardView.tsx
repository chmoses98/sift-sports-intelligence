// MY BOARD — saved research, organised by game (approved reference 09). The contract research_tray underneath and the
// packet builder are unchanged. Local-first: everything lives in this browser's storage, and the page says so.
//   * a photo masthead (the next saved game's own venue photograph when the registry has one) with the item-type tabs;
//   * featured games: one card per saved game (logos, kickoff, how many items) that jumps to that game;
//   * each game card: its saved items with the price when saved against the same contract's latest quote, and what
//     changed since saved (src/board/model.ts — only evidence Sift has: same-ticker quotes, the game's lifecycle, a
//     newer research run);
//   * key updates since saved across every game, and the slate research packets ("Build NFL slate research packet").
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { BoardItem } from '../../contract/types';
import { navSport } from '../../data/nav';
import { HeroArt, heroVars } from '../../components/HeroArt';
import { HubMast, hubPhoto } from '../../components/HubMast';
import { Icon } from '../../components/Icon';
import { SportMark } from '../../components/SportMark';
import { REF_WORD } from '../../components/TrayDrawer';
import { FINDING_WORD, type FindingKind } from '../../research/findings';
import { ago, kickoff } from '../../lib/format';
import { heroInputFromBoard } from '../../lib/hero/input';
import { resolveHero } from '../../lib/hero/resolve';
import { routes } from '../../lib/routes';
import { formatQuoteAgo, quoteAgeMs, quoteFreshness } from '../../live/freshness';
import { useLiveQuotes, useNow } from '../../live/hooks';
import type { LiveQuote } from '../../live/types';
import { useAllOpportunities } from '../../opportunity/load';
import { useTray } from '../../state/tray';
import { isFrozen } from '../../lib/lifecycle';
import { useVisit } from '../../state/trail';
import { boardGroups, gameChanges, GROUP_WORD, marketChange, type BoardEntry, type BoardGroupKey, type Change, type GameGroup } from '../../board/model';
import { PMark } from '../broadcast/parts';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'started', label: 'In play' },
  { id: 'final', label: 'Final' },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]['id'];

const TYPE_FILTERS: { id: BoardGroupKey | 'all'; label: string; icon: string }[] = [
  { id: 'all', label: 'Games', icon: 'grid' },
  { id: 'players', label: 'Players', icon: 'star' },
  { id: 'props', label: 'Props', icon: 'sliders' },
  { id: 'markets', label: 'Markets', icon: 'chart' },
  { id: 'scripts', label: 'Game scripts', icon: 'layers' },
  { id: 'findings', label: 'Findings', icon: 'research' },
  { id: 'thesis', label: 'Game theses', icon: 'bookmark' },
];

const kindWord = (e: BoardEntry) => (e.label?.finding ? FINDING_WORD[e.label.finding as FindingKind] ?? e.label.finding : REF_WORD[e.item.ref_kind] ?? e.item.ref_kind);
const cents = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
type Quote = (ticker: string) => LiveQuote | undefined;

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

function sides(b: BoardItem | undefined) {
  if (!b) return { away: undefined, home: undefined };
  return { away: b.participants.find((p) => p.participant_id === b.away_participant), home: b.participants.find((p) => p.participant_id === b.home_participant) };
}

/** The saved price against the same contract's latest quote: cents then and now, the move, the quote's age. */
function PriceThenNow({ e, quote, now }: { e: BoardEntry; quote: Quote; now: number }) {
  const snap = e.label?.market;
  if (!snap) return <span className="bprice bprice--none">—</span>;
  const q = quote(snap.ticker);
  const d = snap.yesAsk != null && q?.yesAsk != null ? Math.round((q.yesAsk - snap.yesAsk) * 100) : null;
  return (
    <span className="bprice">
      <span className="bprice__pair">
        <span className="bprice__then" title="YES ask when you saved it">{cents(snap.yesAsk)}</span>
        <Icon name="arrowRight" size={12} />
        <b className="fx-num bprice__now" title="Latest YES ask for the same contract">{q?.yesAsk != null ? cents(q.yesAsk) : '—'}</b>
        {d != null && <span className={`bprice__d bprice__d--${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}`}>{d > 0 ? '+' : d < 0 ? '−' : '±'}{Math.abs(d)}¢</span>}
      </span>
      <span className={`tm-fresh tm-fresh--${quoteFreshness(q?.observedAt ?? null, now).toLowerCase()}`}>{q ? formatQuoteAgo(quoteAgeMs(q.observedAt, now)) : snap.yesAsk == null ? 'no quote when saved' : 'no current quote'}</span>
    </span>
  );
}

function EntryRow({ e, quote, now }: { e: BoardEntry; quote: Quote; now: number }) {
  const tray = useTray();
  const l = e.label;
  return (
    <li className={`bentry bentry--${e.group}`}>
      <span className={`bentry__kind bentry__kind--${e.group}`}>{kindWord(e)}</span>
      <div className="bentry__body">
        {l ? <Link to={l.href} className="bentry__t">{l.label}</Link> : <span className="bentry__t">{e.item.id}</span>}
        {l?.sub && <span className="bentry__sub">{l.sub}</span>}
        {l?.kickoff && isFrozen(l.kickoff, Date.now()) && <span className="bentry__pre" title="Saved before kickoff: it stays pregame research, never a live view.">Pregame · saved before kickoff</span>}
        <input className="bentry__note" defaultValue={e.item.note ?? ''} placeholder="Add a note (kept with the packet)" aria-label={`Note for ${l?.label ?? e.item.id}`} onBlur={(ev) => tray.setNote(e.item.item_id, ev.target.value)} />
      </div>
      <PriceThenNow e={e} quote={quote} now={now} />
      <span className="bentry__when">Saved {ago(e.savedAt)}</span>
      <span className="bentry__acts">
        {l && <Link to={l.href} className="btn btn--sm btn--glass">View</Link>}
        <button type="button" className="iconbtn" onClick={() => tray.remove(e.item.item_id)} aria-label={`Remove ${l?.label ?? e.item.id} from My Board`}><Icon name="close" size={16} /></button>
      </span>
    </li>
  );
}

interface GameUpdate { key: string; game: GameGroup; change: Change; dir: 'up' | 'down' | 'status' | 'research'; at: string | null }

function updatesFor(g: GameGroup, board: BoardItem | undefined, quote: Quote): GameUpdate[] {
  const oldest = g.entries.reduce((m, e) => (e.savedAt < m ? e.savedAt : m), g.entries[0]?.savedAt ?? new Date().toISOString());
  const out: GameUpdate[] = gameChanges(g, board, oldest).map((c, i) => ({ key: `${g.key}:g${i}`, game: g, change: c, dir: c.kind === 'research' ? 'research' : 'status', at: c.kind === 'research' ? board?.model_generated_at ?? null : null }));
  for (const e of g.entries) {
    const snap = e.label?.market;
    if (!snap) continue;
    const q = quote(snap.ticker);
    const c = marketChange(snap, q);
    if (!c || c.kind !== 'price' || !/ up | down /.test(` ${c.text} `)) continue;
    out.push({ key: `${g.key}:${e.item.item_id}`, game: g, change: { ...c, text: `${e.label?.label ?? 'Saved market'}: ${c.text}` }, dir: /\bup\b/.test(c.text) ? 'up' : 'down', at: q?.observedAt ?? null });
  }
  return out;
}

function GameCard({ g, board, quote, typeFilter, now, focus }: { g: GameGroup; board: BoardItem | undefined; quote: Quote; typeFilter: BoardGroupKey | 'all'; now: number; focus: boolean }) {
  const nav = navSport(g.sport.toLowerCase());
  const entries = typeFilter === 'all' ? g.entries : g.entries.filter((e) => e.group === typeFilter);
  const updates = updatesFor(g, board, quote);
  const reassess = updates.some((u) => u.change.reassess);
  const spec = useMemo(() => (board ? resolveHero(heroInputFromBoard(board, g.sport)) : null), [board, g.sport]);
  const { away, home } = sides(board);
  if (!entries.length) return null;
  const groups = [...new Set(entries.map((e) => e.group))];
  return (
    <article className={`fx-card bgame bgcard${focus ? ' is-focus' : ''}`} id={`bg-${g.key.replace(/[^A-Za-z0-9_-]/g, '-')}`} aria-labelledby={`bgt-${g.key.replace(/[^A-Za-z0-9_-]/g, '-')}`} style={spec ? heroVars(spec) : undefined}>
      <header className="bgcard__h">
        {spec && <span className="bgcard__art" aria-hidden="true"><HeroArt spec={spec} variant="card" /></span>}
        <span className="bgcard__shade" aria-hidden="true" />
        <div className="bgcard__id">
          <span className="bgame__sport">{nav && <SportMark slug={nav.slug} icon={nav.icon} size={14} />}{nav?.label ?? g.sport}</span>
          <div className="bgcard__match">
            {away && <PMark sport={g.sport} p={away} size="md" />}
            <h2 className="bgame__t" id={`bgt-${g.key.replace(/[^A-Za-z0-9_-]/g, '-')}`}>{g.href ? <Link to={g.href}>{g.title}</Link> : g.title}</h2>
            {home && <PMark sport={g.sport} p={home} size="md" />}
          </div>
          <span className="bgame__when">{g.start ? kickoff(g.start) : 'No game attached'}{g.phase && g.phase !== 'PREGAME' ? ` · ${g.phase === 'STARTED' ? 'in play' : g.phase.toLowerCase()}` : ''}{spec?.venue?.name ? ` · ${spec.venue.name}` : ''}</span>
        </div>
        <div className="bgame__acts">
          {reassess && <span className="dword dword--watch">Reassess</span>}
          <span className="bgcard__n"><b className="fx-num">{g.entries.length}</b> saved</span>
          {g.eventId && <Link className="btn btn--sm btn--glass" to={routes.packet({ sport: g.sport.toLowerCase(), scope: 'CUSTOM', items: g.entries.map((e) => e.item.item_id) })}><Icon name="bolt" size={14} /> Analysis packet</Link>}
        </div>
      </header>
      <div className="bgcard__body">
        <aside className="bgame__chg bgcard__chg" aria-label="What changed since you saved">
          <span className="fx-eyebrow"><Icon name="clock" size={13} /> What changed since saved</span>
          {updates.length ? (
            <ul>{updates.map((u) => <li key={u.key} className={`bupd bupd--${u.dir}${u.change.reassess ? ' is-alert' : ''}`}><span className="bupd__ic" aria-hidden="true">{u.dir === 'up' ? '▲' : u.dir === 'down' ? '▼' : u.dir === 'research' ? '↻' : '•'}</span><span>{u.change.text}{u.at ? <small> · {ago(u.at)}</small> : null}</span></li>)}</ul>
          ) : <p className="muted small">Nothing has changed that Sift can see: no price move on a saved contract, no game-status change and no newer research run.</p>}
        </aside>
        <div className="bgcard__items">
          {groups.map((k) => (
            <section key={k} className="bgame__grp" aria-label={GROUP_WORD[k]}>
              <h3 className="bgame__gh">{GROUP_WORD[k]} <small>{entries.filter((e) => e.group === k).length}</small></h3>
              <ol className="bentries">{entries.filter((e) => e.group === k).map((e) => <EntryRow key={e.item.item_id} e={e} quote={quote} now={now} />)}</ol>
            </section>
          ))}
        </div>
      </div>
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
        <li><Icon name="bolt" size={14} /> Build a current <b>research packet</b> per game</li>
      </ul>
      <Link to={routes.games()} className="btn btn--primary">Browse today’s games <Icon name="arrowRight" size={16} /></Link>
    </div>
  );
}

/**
 * The slate research packet, one tap per sport: the sport's current slate packet (the same handicap packet contract)
 * after refreshing its markets. It gathers research for a person or an assistant to read; it is not a complete
 * betting analysis, not a handicap of every script, and never a pick.
 */
export function RunAnalysis() {
  const runnable = ['nfl', 'mlb', 'nhl', 'cfb', 'soccer', 'tennis', 'nba', 'cbb'];
  return (
    <section className="fx-card brun" aria-labelledby="brun-h">
      <header className="fx-card__h"><h2 className="fx-card__t" id="brun-h"><Icon name="bolt" size={17} /><span>Slate research packets</span></h2></header>
      <p className="tm-note brun__note">Builds the sport’s current slate research packet — every listed game, the publication’s research and freshly refreshed market quotes — ready to copy into an assistant. It collects evidence; it is not a complete betting analysis or a pick.</p>
      <div className="brun__btns">
        {runnable.map((s) => { const n = navSport(s); return n ? <Link key={s} className="btn btn--sm" to={routes.packet({ sport: s, scope: 'SLATE' })} aria-label={`Build ${n.label} slate research packet`}><SportMark slug={s} icon={n.icon} size={14} /> {n.label} slate packet</Link> : null; })}
      </div>
    </section>
  );
}

export function BoardView() {
  useVisit('My Board', 'board');
  const tray = useTray();
  const idx = useBoardIndex();
  const now = useNow(30_000);
  const [sp] = useSearchParams();
  const focusGame = sp.get('game');
  const [sport, setSport] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [type, setType] = useState<BoardGroupKey | 'all'>('all');
  const groups = useMemo(() => boardGroups(tray.tray.items, tray.labels, idx.boards, idx.now), [tray.tray.items, tray.labels, idx.boards, idx.now]);
  const tickers = useMemo(() => Object.values(tray.labels).map((l) => l.market?.ticker).filter((t): t is string => !!t), [tray.labels]);
  const live = useLiveQuotes(tickers, 'slate');
  const sports = [...new Set(groups.map((g) => g.sport))];
  const shown = groups.filter((g) => (!sport || g.sport === sport) && (status === 'all' || (status === 'upcoming' ? g.phase === 'PREGAME' || g.phase === null : status === 'started' ? g.phase === 'STARTED' : g.phase === 'FINAL')) && (type === 'all' || g.entries.some((e) => e.group === type)));
  const n = tray.tray.items.length;
  const featured = groups.find((g) => g.eventId && g.phase !== 'FINAL') ?? groups.find((g) => g.eventId) ?? null;
  // The masthead: the first saved game (soonest first) whose venue has an approved photograph, else Sift's default.
  const photo = useMemo(() => {
    for (const g of groups) {
      const b = g.eventId ? idx.boards.get(g.eventId) : undefined;
      const p = b ? resolveHero(heroInputFromBoard(b, g.sport)).photo : null;
      if (p) return p;
    }
    return null;
  }, [groups, idx.boards]);
  const updates = useMemo(() => groups.flatMap((g) => updatesFor(g, g.eventId ? idx.boards.get(g.eventId) : undefined, live.quote)), [groups, idx.boards, live.quote]);
  const typeCount = (k: BoardGroupKey | 'all') => (k === 'all' ? groups.length : tray.tray.items.length ? groups.reduce((m, g) => m + g.entries.filter((e) => e.group === k).length, 0) : 0);
  const anchor = (g: GameGroup) => `bg-${g.key.replace(/[^A-Za-z0-9_-]/g, '-')}`;
  useEffect(() => {
    if (!focusGame) return;
    const g = groups.find((x) => x.eventId === focusGame);
    if (g) document.getElementById(anchor(g))?.scrollIntoView({ block: 'start' });
  }, [focusGame, groups]);
  return (
    <div className="page bboard bbx">
      <HubMast
        title="My Board"
        eyebrow="Saved on this device"
        sub="Your saved research, organised by game — with what changed since you saved it. Stored in this browser only (no account, no cross-device sync)."
        photo={photo ?? hubPhoto('nfl-lar-sofi-stadium')}
        aside={<p className="hubm__stat"><b className="fx-num fx-num--xl">{n}</b><span>saved {n === 1 ? 'item' : 'items'}<br />across {groups.length} {groups.length === 1 ? 'game' : 'games'}</span></p>}
      >
        {n > 0 && (
          <div className="hubm__presets" role="group" aria-label="Item type">
            {TYPE_FILTERS.filter((f) => f.id === 'all' || typeCount(f.id) > 0).map((f) => <button key={f.id} type="button" className={`hubm__preset${type === f.id ? ' is-on' : ''}`} aria-pressed={type === f.id} onClick={() => setType(f.id)}><Icon name={f.icon} size={16} />{f.label} <small className="hubm__cnt">{typeCount(f.id)}</small></button>)}
          </div>
        )}
      </HubMast>
      {n === 0 ? (
        <div className="bbx__empty">
          <BoardEmpty />
          <RunAnalysis />
        </div>
      ) : (
        <>
          <section className="bbx__feat" aria-labelledby="bfeat-h">
            <h2 className="bbx__fh" id="bfeat-h"><Icon name="flame" size={18} /> Featured games</h2>
            <ul className="bbx__rail">
              {groups.filter((g) => g.eventId).slice(0, 8).map((g) => {
                const b = g.eventId ? idx.boards.get(g.eventId) : undefined;
                const { away, home } = sides(b);
                const on = focusGame ? g.eventId === focusGame : g === featured;
                return (
                  <li key={g.key}>
                    <a href={`#${anchor(g)}`} className={`bfeat${on ? ' is-on' : ''}`} onClick={(e) => { e.preventDefault(); document.getElementById(anchor(g))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                      <span className="bfeat__m">{away && <PMark sport={g.sport} p={away} size="md" />}<b>{g.title}</b>{home && <PMark sport={g.sport} p={home} size="md" />}</span>
                      <span className="bfeat__w">{g.start ? kickoff(g.start) : '—'}{g.phase && g.phase !== 'PREGAME' ? ` · ${g.phase === 'STARTED' ? 'in play' : g.phase.toLowerCase()}` : ''}</span>
                      <span className="bfeat__n"><Icon name="bookmark" size={13} /> {g.entries.length} saved {g.entries.length === 1 ? 'item' : 'items'}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
          <div className="bboard__filters bbx__filters">
            <div className="tm-chips" role="group" aria-label="Sport">
              <button type="button" className={`tm-chip${!sport ? ' is-on' : ''}`} aria-pressed={!sport} onClick={() => setSport(null)}>All sports</button>
              {sports.map((s) => { const nv = navSport(s.toLowerCase()); return <button key={s} type="button" className={`tm-chip${sport === s ? ' is-on' : ''}`} aria-pressed={sport === s} onClick={() => setSport(sport === s ? null : s)}>{nv && <SportMark slug={nv.slug} icon={nv.icon} size={14} />}{nv?.label ?? s}</button>; })}
            </div>
            <div className="tm-seg" role="group" aria-label="Game status">
              {STATUS_FILTERS.map((f) => <button key={f.id} type="button" className={status === f.id ? 'is-on' : undefined} aria-pressed={status === f.id} onClick={() => setStatus(f.id)}>{f.label}</button>)}
            </div>
          </div>
          <div className="bbx__grid">
            <div className="bboard__games">
              {shown.length === 0 && <div className="bempty"><h3>Nothing matches these filters</h3><p>Clear a filter to see the rest of your board.</p></div>}
              {shown.map((g) => <GameCard key={g.key} g={g} board={g.eventId ? idx.boards.get(g.eventId) : undefined} quote={live.quote} typeFilter={type} now={now} focus={!!focusGame && g.eventId === focusGame} />)}
            </div>
            <aside className="bbx__side">
              <section className="fx-card bkey" aria-labelledby="bkey-h">
                <header className="fx-card__h"><h2 className="fx-card__t" id="bkey-h"><Icon name="clock" size={17} /><span>Key updates since saved</span></h2></header>
                {updates.length ? (
                  <ul className="bkey__list">{updates.slice(0, 8).map((u) => <li key={u.key} className={`bupd bupd--${u.dir}${u.change.reassess ? ' is-alert' : ''}`}><span className="bupd__ic" aria-hidden="true">{u.dir === 'up' ? '▲' : u.dir === 'down' ? '▼' : u.dir === 'research' ? '↻' : '•'}</span><span><b>{u.game.title}</b> {u.change.text}{u.at ? <small> · {ago(u.at)}</small> : null}</span></li>)}</ul>
                ) : <p className="muted small">No updates yet. Sift reports a price move on a saved contract (same ticker only), a game starting or finishing, and a newer research run — nothing else.</p>}
              </section>
              <RunAnalysis />
              <div className="bboard__foot">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.confirm('Remove every saved item from My Board?') && tray.clear()}><Icon name="trash" size={14} /> Clear board</button>
                <span className="muted small">Packets resolve your saved items against the latest publication and refresh their markets first.</span>
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
