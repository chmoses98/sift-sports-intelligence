// v4 Board: the personal research workspace. It reads the same research tray as SIFT 2.0 (src/state/tray.tsx; one local store,
// no account), organises it by game with src/board/model.ts, and answers three questions: what have I saved, what has changed
// since I saved it, and what deserves another look. A price is compared only against a current quote of the SAME contract and
// the SAVED side; a stale, missing or closed quote is said as such, never compared and never zero. A move is a move: nothing
// here says a lower or higher ask is a profit. Nothing here prices, ranks or recommends.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from '../routing';
import { Icon } from './Icon';
import { ExitLink } from './ExitLink';
import { Crest } from './base';
import { useSheet } from './sheet';
import { useResearch } from './ResearchSheet';
import { useBoardUndo } from './undo';
import { entryView, gameState, lookAgain, type BoardCtx, type EntryView, type LookReason } from './boardModel';
import { STANDING_LABEL } from './signalsModel';
import { agoWord } from './words';
import { clock } from './model';
import { SportMark } from '../components/SportMark';
import { navSport } from '../data/nav';
import { useNow, useLiveQuotes } from '../live/hooks';
import { useAllOpportunities } from '../opportunity/load';
import { boardGroups, gameChanges, GROUP_WORD, type BoardGroupKey, type GameGroup } from '../board/model';
import { tickerOfMarketId, useTray } from '../state/tray';
import type { BoardItem } from '../contract/types';

const cents = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
const TYPE_ORDER: BoardGroupKey[] = ['thesis', 'players', 'props', 'markets', 'scripts', 'findings', 'other'];

/** Everything the Board and its item sheet read, in one place so both stay on the same clock and the same live quotes. */
export function useBoardState() {
  const tray = useTray();
  const now = useNow(30_000);
  const all = useAllOpportunities(now);
  const boards = useMemo(() => {
    const m = new Map<string, BoardItem>();
    for (const b of all.bundles) for (const i of b.board) m.set(i.event_id, i);
    return m;
  }, [all.bundles]);
  const groups = useMemo(() => boardGroups(tray.tray.items, tray.labels, boards, now), [tray.tray.items, tray.labels, boards, now]);
  const tickers = useMemo(() => [...new Set(tray.tray.items.filter((i) => i.ref_kind === 'MARKET').map((i) => tray.labels[i.item_id]?.market?.ticker ?? tickerOfMarketId(i.extra?.market_id ?? i.id)).filter((t): t is string => !!t))], [tray.tray.items, tray.labels]);
  const live = useLiveQuotes(tickers, 'slate');
  const loadingPubs = all.loading && all.bundles.length === 0;
  const unavailable = !!all.error || (!all.loading && all.bundles.length > 0 && all.bundles.every((b) => b.error != null));
  const ctx: BoardCtx = useMemo(() => ({
    now, quote: live.quote, opps: all.opportunities,
    sportRead: (sport: string) => { if (loadingPubs) return null; const b = all.bundles.find((x) => x.sport.code === sport.toUpperCase()); return b ? b.error == null : null; },
  }), [now, live.quote, live.version, all.opportunities, all.bundles, loadingPubs]); // eslint-disable-line react-hooks/exhaustive-deps
  const views = useMemo(() => {
    const m = new Map<string, EntryView>();
    for (const g of groups) for (const e of g.entries) m.set(e.item.item_id, entryView(e, g, g.eventId ? boards.get(g.eventId) : undefined, ctx));
    return m;
  }, [groups, boards, ctx]);
  return { tray, now, groups, boards, views, ctx, loadingPubs, unavailable };
}

// ------------------------------------------------------------------ price words (neutral, side-aware)

function priceWords(v: EntryView): { text: string; age?: string; tone: 'ok' | 'muted' } | null {
  const p = v.price;
  const s = v.side;
  switch (p.state) {
    case 'compared': {
      const move = p.moveCents ?? 0;
      return { text: `${s} ask ${cents(p.savedAsk)} when saved → ${cents(p.nowAsk)} now${Math.abs(move) >= 2 ? ` (${move > 0 ? '+' : '−'}${Math.abs(move)}¢)` : ', unchanged'}`, age: p.ageMs != null ? agoWord(p.ageMs) : undefined, tone: 'ok' };
    }
    case 'stale': return { text: `${s} ask ${cents(p.savedAsk)} when saved. Latest quote ${cents(p.nowAsk)} is ${p.ageMs != null ? agoWord(p.ageMs).replace(' ago', '') : 'undated'} old: context only, not compared.`, tone: 'muted' };
    case 'closed': return { text: `${s} ask ${cents(p.savedAsk)} when saved. The contract is not open on the live market.`, tone: 'muted' };
    case 'noQuote': return { text: `${s} ask ${cents(p.savedAsk)} when saved. No current quote for this contract.`, tone: 'muted' };
    case 'noSaved': return { text: 'No quote was on screen when this was saved: there is no saved price to compare.', tone: 'muted' };
    default: return null;
  }
}

// ------------------------------------------------------------------ one saved item

function ItemRow({ v, now }: { v: EntryView; now: number }) {
  const sheet = useSheet();
  const undo = useBoardUndo();
  const e = v.entry;
  const main = useRef<HTMLButtonElement>(null);
  // Undo put this row back: focus returns to it, once.
  const restored = undo.restoredId === e.item.item_id;
  useEffect(() => { if (restored) main.current?.focus(); }, [restored]);
  const label = e.label?.label ?? e.item.id;
  const market = e.item.ref_kind === 'MARKET';
  const px = priceWords(v);
  const t = v.target;
  const openT = t.kind === 'none' ? null : t.kind === 'classic'
    ? <ExitLink to={t.to} className="v4-gbtn v4-bd__go"><Icon name="arrow-up-right" size="s" /><span className="sr">{`Open in SIFT 2.0: ${label}`}</span></ExitLink>
    : <Link to={t.to} className="v4-gbtn v4-bd__go" aria-label={`${t.label}: ${label}`}><Icon name="caret-right" size="s" /></Link>;
  return (
    <li className="v4-bd__row" data-side={v.side} data-kind={e.group} data-bd-item={e.item.item_id}>
      <button ref={main} type="button" className="v4-bd__main" aria-label={`Details: ${label}${market ? `, ${v.side} side` : ''}`}
        onClick={() => sheet.open(<ItemSheet id={e.item.item_id} />, { label: `Saved: ${label}` })}>
        <span className="v4-bd__t"><b>{label}</b>{market && <span className={`v4-sg__side v4-sg__side--${v.side.toLowerCase()}`}>{v.side}</span>}</span>
        {px && <span className={`v4-bd__px v4-bd__px--${px.tone}`}>{px.text}{px.age && <em> · {px.age}</em>}</span>}
        {e.item.note && <span className="v4-bd__nt"><b>Your note</b> {e.item.note}</span>}
        <span className="v4-bd__tags">
          <span className="v4-bd__saved">Saved {agoWord(Math.max(0, now - Date.parse(e.savedAt)))}</span>
          {v.frozen && <span className="v4-badge v4-badge--quiet"><Icon name="lock-simple" size="xs" />Frozen</span>}
          {v.standing && v.standing.kind !== 'stale' && <span className={`v4-badge${v.standing.kind === 'current' ? ' v4-badge--model' : ''}`}>{v.standing.kind === 'current' ? 'Current signal' : STANDING_LABEL[v.standing.kind]}</span>}
          {v.standing?.kind === 'stale' && <span className="v4-badge v4-badge--quiet">Signal no longer current</span>}
        </span>
      </button>
      {openT}
      <button type="button" className="v4-gbtn v4-bd__rm" aria-label={`Remove ${label} from My Board`} onClick={() => undo.removeItem(e.item.item_id)}><Icon name="trash" size="s" /></button>
    </li>
  );
}

// ------------------------------------------------------------------ one saved game

const PHASE_WORD: Record<string, string> = { PREGAME: 'Pregame', NO_START: 'Start time to be confirmed', STARTED: 'Started', FINAL: 'Final', POSTPONED: 'Postponed', CANCELLED: 'Cancelled', SUSPENDED: 'Suspended' };

function GameCard({ g, board, views, ctx, type, focus }: { g: GameGroup; board: BoardItem | undefined; views: ReadonlyMap<string, EntryView>; ctx: BoardCtx; type: BoardGroupKey | null; focus: boolean }) {
  const entries = type ? g.entries.filter((e) => e.group === type) : g.entries;
  const oldest = g.entries.reduce((m, e) => (e.savedAt < m ? e.savedAt : m), g.entries[0]?.savedAt ?? new Date(0).toISOString());
  const changes = gameChanges(g, board, oldest);
  const state = gameState(g, board, ctx);
  const away = board?.participants.find((p) => p.participant_id === board.away_participant);
  const home = board?.participants.find((p) => p.participant_id === board.home_participant);
  const nav = navSport(g.sport.toLowerCase());
  const frozen = g.phase != null && g.phase !== 'PREGAME';
  const cats = TYPE_ORDER.filter((k) => entries.some((e) => e.group === k));
  const id = `bd-${g.key.replace(/[^A-Za-z0-9_-]/g, '-')}`;
  const title = g.eventId ? <Link to={`/v4/game/${g.sport.toLowerCase()}/${encodeURIComponent(g.eventId)}`} className="v4-bd__gt">{g.title}</Link> : <span className="v4-bd__gt">{g.title}</span>;
  return (
    <section id={id} className={`v4-bd${focus ? ' is-focus' : ''}`} aria-labelledby={`${id}-h`}>
      <header className="v4-bd__h">
        <span className="v4-bd__cr">{away && <Crest sport={g.sport} p={away} size="sm" />}{home && <Crest sport={g.sport} p={home} size="sm" />}{!away && !home && nav && <SportMark slug={nav.slug} icon={nav.icon} size={24} />}</span>
        <div className="v4-bd__hm">
          <h2 id={`${id}-h`}>{title}</h2>
          <p>{g.start && Number.isFinite(Date.parse(g.start)) ? clock(Date.parse(g.start)) : g.eventId ? 'Time not available' : 'Not tied to a game'}{g.phase ? ` · ${PHASE_WORD[g.phase] ?? g.phase}` : ''}</p>
        </div>
        {frozen && <span className="v4-badge v4-badge--quiet"><Icon name="lock-simple" size="xs" />Pregame frozen</span>}
      </header>
      {state.kind !== 'ok' && <p className={`v4-bd__note v4-bd__note--${state.kind}`} role="status"><Icon name={state.kind === 'unreadable' ? 'cloud-slash' : 'info'} size="xs" />{state.why}</p>}
      {changes.map((c, i) => <p key={i} className="v4-bd__note"><Icon name={c.kind === 'research' ? 'clock' : 'info'} size="xs" />{c.text}</p>)}
      {cats.map((k) => (
        <div key={k} className="v4-bd__cat">
          <h3>{GROUP_WORD[k]} <span>{entries.filter((e) => e.group === k).length}</span></h3>
          <ul>{entries.filter((e) => e.group === k).map((e) => <ItemRow key={e.item.item_id} v={views.get(e.item.item_id)!} now={ctx.now} />)}</ul>
        </div>
      ))}
    </section>
  );
}

// ------------------------------------------------------------------ the item sheet (live: it reads the Board's own state)

function Kv({ k, children, em }: { k: string; children: ReactNode; em?: ReactNode }) {
  return <div className="v4-kv"><span className="v4-kv__k">{k}</span><span className="v4-kv__v">{children}{em && <em>{em}</em>}</span></div>;
}

/**
 * Your note on a saved item. Writes through the tray's own setNote (the same call SIFT 2.0 uses), and only when the text was actually changed,
 * so opening the editor never rewrites a note that SIFT 2.0 or an earlier version saved. Closing the sheet with unsaved edits saves them
 * rather than losing them; Cancel is the one way to discard.
 */
function NoteEditor({ id, note, label }: { id: string; note: string | null; label: string }) {
  const { setNote } = useTray();
  const field = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  // What setNote would store: blank text is no note. Compared this way so whitespace alone is never a change.
  const kept = (t: string | null) => (t && t.trim() ? t : '');
  const latest = useRef({ draft, note });
  useEffect(() => { latest.current = { draft, note }; });
  // Dismissing the sheet (Escape, scrim, swipe) while a note is being edited keeps the text instead of losing it.
  useEffect(() => () => {
    const { draft: d, note: n } = latest.current;
    if (d !== null && kept(d) !== kept(n)) setNote(id, d);
  }, [id, setNote]);
  const editing = draft !== null;
  const save = () => {
    if (draft === null) return;
    const changed = kept(draft) !== kept(note);
    if (changed) setNote(id, draft);
    setSaid(!changed ? 'No changes to the note.' : kept(draft) ? 'Note saved.' : 'Note removed.');
    setDraft(null);
  };
  return (
    <div className="v4-ned">
      {!editing && (note
        ? <p className="v4-ned__text">{note}</p>
        : <p className="v4-pstat">No note yet. A note stays on this device and shows in SIFT 2.0 too.</p>)}
      {editing && (
        <>
          <label className="v4-ned__lab" htmlFor={field}>Note for {label}</label>
          <textarea id={field} className="v4-ned__ta" rows={4} autoFocus value={draft} onChange={(ev) => setDraft(ev.target.value)} />
          <p className="meta">Closing this sheet saves your changes. Cancel discards them.</p>
        </>
      )}
      <div className="v4-ned__acts">
        {!editing && <button type="button" className="v4-btn v4-btn--sec" onClick={() => { setSaid(''); setDraft(note ?? ''); }}>{note ? 'Edit note' : 'Add a note'}</button>}
        {editing && (
          <>
            <button type="button" className="v4-btn" onClick={save}>Save note</button>
            <button type="button" className="v4-btn v4-btn--sec" onClick={() => { setDraft(null); setSaid('Changes discarded.'); }}>Cancel</button>
          </>
        )}
      </div>
      <p className="v4-ned__said" role="status">{said}</p>
    </div>
  );
}

function ItemSheet({ id }: { id: string }) {
  const { close } = useSheet();
  const open = useResearch();
  const undo = useBoardUndo();
  const s = useBoardState();
  const v = s.views.get(id);
  if (!v) {
    return (
      <>
        <div className="v4-shead"><div className="v4-shead__t"><h2 data-autofocus tabIndex={-1}>Removed from My Board</h2></div><button type="button" className="v4-gbtn" onClick={close} aria-label="Close"><Icon name="x" /></button></div>
        <div className="v4-sbody" tabIndex={0}><p>This item is no longer saved.</p></div>
      </>
    );
  }
  const e = v.entry;
  const g = s.groups.find((x) => x.entries.some((y) => y.item.item_id === id))!;
  const board = g.eventId ? s.boards.get(g.eventId) : undefined;
  const label = e.label?.label ?? e.item.id;
  const p = v.price;
  const market = e.item.ref_kind === 'MARKET';
  const state = gameState(g, board, s.ctx);
  const changes = gameChanges(g, board, e.savedAt);
  const opp = v.signal && v.signal.kind !== 'none' && v.signal.kind !== 'oppositeSide' ? v.signal.opp : null;
  const t = v.target;
  return (
    <>
      <div className="v4-shead">
        <div className="v4-shead__t">
          <h2 data-autofocus tabIndex={-1}>{label}</h2>
          <p className="v4-shead__m">{g.title}{g.start ? ` · ${clock(Date.parse(g.start))}` : ''}</p>
        </div>
        <button type="button" className="v4-gbtn" onClick={close} aria-label="Close saved item"><Icon name="x" /></button>
      </div>
      <div className="v4-sbody" tabIndex={0}>
        <span className={`v4-auth${v.frozen ? ' v4-auth--frozen' : ''}`}><Icon name={v.frozen ? 'lock-simple' : 'bookmark-simple'} />{v.frozen ? 'Pregame research · frozen at kickoff' : `${GROUP_WORD[e.group]} · saved on this device`}</span>

        <section className="v4-sblock"><h3>Saved</h3>
          {market && <Kv k="Side" em={v.sideRecorded ? undefined : 'Saved before sides were recorded: read as YES'}>{v.side}</Kv>}
          <Kv k="Saved">{agoWord(Math.max(0, s.now - Date.parse(e.savedAt)))}<em>{new Date(e.savedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</em></Kv>
          {e.label?.sub && <Kv k="Original context">{e.label.sub}</Kv>}
        </section>

        <section className="v4-sblock"><h3>Your note</h3>
          <NoteEditor id={id} note={e.item.note} label={label} />
        </section>

        <section className="v4-sblock"><h3>What changed since you saved it</h3>
          {market && p.state !== 'none' && (
            <>
              <Kv k={`${v.side} ask when saved`} em={p.savedAt ? `Quote captured ${agoWord(Math.max(0, s.now - Date.parse(p.savedAt)))}` : undefined}>{cents(p.savedAsk)}</Kv>
              <Kv k={`Latest ${v.side} ask`} em={p.state === 'compared' ? `${agoWord(p.ageMs)} · current` : p.state === 'stale' ? `Quote is ${p.ageMs != null ? agoWord(p.ageMs).replace(' ago', '') : 'undated'} old: context only, not compared` : p.state === 'closed' ? 'The contract is not open on the live market' : p.state === 'noSaved' ? 'No saved price to compare' : 'No current quote'}>{p.nowAsk != null && (p.state === 'compared' || p.state === 'stale') ? cents(p.nowAsk) : '—'}</Kv>
              {p.state === 'compared' && p.moveCents != null && <Kv k="Move" em="A price move is not a profit or a loss on the position.">{p.moveCents === 0 ? 'Unchanged' : `${p.moveCents > 0 ? '+' : '−'}${Math.abs(p.moveCents)}¢`}</Kv>}
            </>
          )}
          {state.kind !== 'ok' && <p className="v4-bd__note" role="status"><Icon name="info" size="xs" />{state.why}</p>}
          {changes.map((c, i) => <p key={i} className="v4-bd__note"><Icon name="info" size="xs" />{c.text}</p>)}
          {changes.length === 0 && state.kind === 'ok' && (!market || p.state === 'none') && <p className="v4-pstat">Nothing has changed that SIFT can see: no game-status change and no newer research run.</p>}
        </section>

        {market && (
          <section className="v4-sblock"><h3>The publication now</h3>
            {v.signal?.kind === 'valid' && <p>A published research signal currently covers this contract on the {v.side} side{opp ? ` (${opp.status === 'ACTIONABLE' ? 'actionable' : 'research candidate'})` : ''}.</p>}
            {v.signal?.kind === 'ineligible' && <p>A published signal names this contract and side but no longer qualifies: {v.signal.why}</p>}
            {v.signal?.kind === 'passed' && <p>The publication reviewed this contract and passed: {v.signal.opp.statusReason}</p>}
            {v.signal?.kind === 'watch' && <p>The publication lists a game-level watch, not a priced signal for this contract.</p>}
            {v.signal?.kind === 'oppositeSide' && <p>The publication’s signal on this market is for the {v.signal.has} side, not the {v.side} side you saved.</p>}
            {(!v.signal || v.signal.kind === 'none') && <p className="v4-pstat">The publication holds no signal for this contract and side. Saved research stays as it was.</p>}
          </section>
        )}
        <p className="meta" style={{ marginTop: 18 }}>Research only. SIFT reports what the publication states and does not recommend a bet. Your Board is stored on this device and shared with SIFT 2.0 here.</p>
      </div>
      <div className="v4-sfoot v4-bd__foot">
        {t.kind !== 'none' && (t.kind === 'classic'
          ? <ExitLink to={t.to} className="v4-btn">Open in SIFT 2.0</ExitLink>
          : <Link to={t.to} className="v4-btn" onClick={close}>{t.label}</Link>)}
        {opp && <button type="button" className="v4-btn v4-btn--sec" onClick={() => open(opp, undefined, { signalsLink: true })}>Research</button>}
        <button type="button" className="v4-btn v4-btn--sec" onClick={() => { undo.removeItem(id); close(); }}><Icon name="trash" size="s" />Remove</button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ clearing the whole Board

function ClearSheet({ n }: { n: number }) {
  const { close } = useSheet();
  const tray = useTray();
  return (
    <>
      <div className="v4-shead"><div className="v4-shead__t"><h2 data-autofocus tabIndex={-1}>Clear My Board?</h2></div><button type="button" className="v4-gbtn" onClick={close} aria-label="Cancel"><Icon name="x" /></button></div>
      <div className="v4-sbody" tabIndex={0}>
        <p>This removes all {n} saved item{n === 1 ? '' : 's'} from this device. It cannot be undone.</p>
        <p className="meta" style={{ marginTop: 10 }}>The Board is one store on this device: clearing it here clears it in SIFT 2.0 too. Nothing is kept anywhere else.</p>
      </div>
      <div className="v4-sfoot">
        <button type="button" className="v4-btn v4-btn--sec" onClick={close}>Keep my Board</button>
        <button type="button" className="v4-btn v4-btn--danger" onClick={() => { tray.clear(); close(); }}>Remove all {n}</button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ the screen

function Reasons({ reasons, open }: { reasons: LookReason[]; open: (r: LookReason) => void }) {
  if (!reasons.length) return null;
  return (
    <section className="v4-sec" aria-label="Worth another look">
      <header className="v4-sechead"><h2>Worth another look</h2><span className="v4-sechead__n">{reasons.length}</span></header>
      <p className="meta v4-sg__gnote">Changes since you saved, from what the publications and live quotes show. Nothing here says to act.</p>
      <ul className="v4-sg__list">
        {reasons.slice(0, 6).map((r) => (
          <li key={r.key} className="v4-sg">
            <button type="button" className="v4-sg__main v4-bd__why" onClick={() => open(r)} aria-label={`Details: ${r.entry.label?.label ?? r.entry.item.id}. ${r.text}`}>
              <span className="v4-sg__top"><span className="v4-sg__game">{r.game.title}</span></span>
              <span className="v4-sg__t"><b>{r.kind === 'game' ? 'Game update' : r.entry.label?.label ?? r.entry.item.id}</b></span>
              <span className="v4-sg__why v4-bd__whytext">{r.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function V4Board() {
  const s = useBoardState();
  const sheet = useSheet();
  const [sp, setSp] = useSearchParams();
  const sport = sp.get('sport');
  const type = (TYPE_ORDER.includes(sp.get('type') as BoardGroupKey) ? sp.get('type') : null) as BoardGroupKey | null;
  const focusGame = sp.get('game');
  const set = (patch: Record<string, string | null>) => setSp((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); } return n; }, { replace: true });
  const n = s.tray.tray.items.length;
  const sports = [...new Set(s.groups.map((g) => g.sport))];
  const typeCount = (k: BoardGroupKey) => s.groups.reduce((m, g) => m + g.entries.filter((e) => (!sport || g.sport === sport) && e.group === k).length, 0);
  const shown = s.groups.filter((g) => (!sport || g.sport === sport) && (!type || g.entries.some((e) => e.group === type)));
  const reasons = useMemo(() => lookAgain(s.groups, s.views, s.boards).filter((r) => !sport || r.game.sport === sport), [s.groups, s.views, s.boards, sport]);
  const openItem = (r: LookReason) => sheet.open(<ItemSheet id={r.entry.item.item_id} />, { label: `Saved: ${r.entry.label?.label ?? r.entry.item.id}` });
  const games = s.groups.filter((g) => g.eventId).length;
  return (
    <div>
      <div className="v4-stage">
        <header className="v4-top" style={{ alignItems: 'flex-start', paddingBottom: 0 }}>
          <div style={{ minWidth: 0 }}>
            <h1 className="v4-h1">Board</h1>
            <p className="v4-sub">Your saved research, and what changed since. Kept on this device.</p>
          </div>
        </header>
        {n > 0 && (
          <>
            <div className="v4-chips" role="group" aria-label="Sport" style={{ paddingTop: 14 }}>
              <button type="button" className="v4-chip" aria-pressed={!sport} onClick={() => set({ sport: null })}>All sports</button>
              {sports.map((sp2) => { const nv = navSport(sp2.toLowerCase()); return <button key={sp2} type="button" className="v4-chip" aria-pressed={sport === sp2} onClick={() => set({ sport: sport === sp2 ? null : sp2 })}>{nv && <SportMark slug={nv.slug} icon={nv.icon} size={20} />}{nv?.label ?? sp2}</button>; })}
            </div>
            <div className="v4-chips" role="group" aria-label="Item type" style={{ paddingTop: 8 }}>
              <button type="button" className="v4-chip" aria-pressed={!type} onClick={() => set({ type: null })}>All<i>{n}</i></button>
              {TYPE_ORDER.filter((k) => typeCount(k) > 0).map((k) => <button key={k} type="button" className="v4-chip" aria-pressed={type === k} onClick={() => set({ type: type === k ? null : k })}>{GROUP_WORD[k]}<i>{typeCount(k)}</i></button>)}
            </div>
          </>
        )}
      </div>
      <div className="v4-body">
        {n === 0 ? (
          <div className="v4-note v4-bd__empty"><Icon name="bookmark-simple" /><div><b>Nothing saved yet</b>Save a prop, a market or a published signal and it lives here, with what changed since you saved it. Nothing leaves this device.<br />
            <Link to="/v4/signals" className="v4-btn v4-btn--sec">Browse signals</Link> <Link to="/v4/props" className="v4-btn v4-btn--sec">Browse props</Link></div></div>
        ) : (
          <>
            {s.unavailable && <div className="v4-note v4-note--risk" role="alert" style={{ marginBottom: 16 }}><Icon name="cloud-slash" /><div><b>Publications are unavailable</b>Your saved research is shown as saved. Prices, game status and research updates could not be read, so nothing here says anything changed.</div></div>}
            <p className="meta v4-sg__sum" role="status">{n} saved item{n === 1 ? '' : 's'}{games ? ` · ${games} game${games === 1 ? '' : 's'}` : ''} · stored on this device</p>
            <Reasons reasons={reasons} open={openItem} />
            <div className="v4-bd__games">
              {shown.length === 0 && <div className="v4-note"><Icon name="funnel-simple" /><div><b>Nothing matches these filters</b>Clear a filter to see the rest of your Board.</div></div>}
              {shown.map((g) => <GameCard key={g.key} g={g} board={g.eventId ? s.boards.get(g.eventId) : undefined} views={s.views} ctx={s.ctx} type={type} focus={!!focusGame && g.eventId === focusGame} />)}
            </div>
          </>
        )}
        {n > 0 && <p style={{ padding: '0 16px', marginTop: 20 }}><button type="button" className="v4-btn v4-btn--sec" onClick={() => sheet.open(<ClearSheet n={n} />, { label: 'Clear My Board' })}><Icon name="trash" size="s" />Clear Board</button></p>}
        <p className="v4-foot">Research only. A saved price against a later one is a move in an ask, not a profit or a loss. SIFT does not recommend a bet. This is the same Board as in SIFT 2.0 on this device.</p>
        <p style={{ padding: '0 16px', marginTop: 12 }}><ExitLink to="/design/sift2/board" className="v4-textlink">Open in SIFT 2.0</ExitLink></p>
      </div>
    </div>
  );
}
