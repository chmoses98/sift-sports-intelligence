// PD2 and PD3: the list. Search, sort, filters, the hide-out toggle and compare mode are all in the address (replace, never a history
// entry per keystroke or tap), and so are the expanded row and its rung, which is why Back restores them exactly. The list is windowed:
// only the rows near the viewport exist, prices are read for those rows only, and a player's game log is fetched only for a row that is
// on screen, expanded, or when the viewer asks History to rank or filter the whole list.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from '../../../routing';
import { historyBank, logRefOf, useHistoryBank } from '../../data/props/bank';
import { historyStateOf, ranksPending, useEnsureAvailability, useEnsureRanks, useQueryCtx, usePropPrices, useVisibleHistory, type UniverseState } from '../../data/props/hooks';
import { useBankVersion } from '../../data/props/lazyBank';
import {
  histClassOf, historyFilterOn, histSummary, listProps, listTitle, parseRef, passesBase, PRESET_LABEL, refToken, rungFor, SORT_LABEL, sortOf, type HistClass, type ListState,
} from '../../data/props/query';
import { rankBank, rankKeysFor, type ChipState } from '../../data/props/ranks';
import type { Prop, Universe } from '../../data/props/types';
import { findSaved } from '../../model/saved';
import { routes } from '../../nav/routes';
import { PropsLink } from '../../nav/Targets';
import { removeSaved, saveResearch, useSaved } from '../../state/prefs';
import { ChipRail } from '../../ui/ChipRail';
import { Icon } from '../../ui/Icon';
import { useSheet } from '../../ui/Sheet';
import { useQueryPatch } from '../../state/url';
import { usePublishContracts } from './contracts';
import { FilterSheet } from './FilterSheet';
import { HorizonBar } from './HorizonBar';
import { chipBeside, columnWidth, GROUP_H, PEEK_EST, resetMeasure, rowHeight } from './layout';
import { Peek, type PeekBits } from './Peek';
import { availWord, Avatar, chipText, lanesFor, LaneLine, Mark, NameLine, OppChip, playerRef, PricePill, statText, type Lanes } from './parts';
import { VirtualList } from './VirtualList';

export type SetState = (patch: Partial<ListState>, o?: { push?: boolean }) => void;

interface RowItem { kind: 'row'; p: Prop; wrap: boolean; chip: ChipState }
/** A label between groups of rows when the order is History: ranked rows, then rows that were never evaluated (kept apart so the order cannot read as a complete ranking). */
interface HeadItem { kind: 'head'; id: HistClass; title: string; sub: string; ranked: boolean }
type Item = RowItem | HeadItem;

/** Logs are fetched automatically for a History sort or filter only when this few are missing; more asks first (a download the viewer chose). */
const AUTO_LOGS = 30;
/** Approximate size of one player's log document, for the one-line cost the viewer is shown before a bulk load (NFL history file, NHL profile). */
const LOG_KB: Record<string, number> = { nfl: 8, nhl: 28 };

/** The phone column's width and a counter that moves when the web fonts arrive (row layout is decided from measured text). */
export function useRowMetrics(): { colW: number; fonts: number } {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 390 : columnWidth(window.innerWidth)));
  const [fonts, setFonts] = useState(0);
  useEffect(() => { const on = () => setW(columnWidth(window.innerWidth)); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  useEffect(() => {
    let live = true;
    const ready = (document as Document & { fonts?: { ready: Promise<unknown>; addEventListener?: (t: string, f: () => void) => void } }).fonts;
    ready?.ready.then(() => { if (live) { resetMeasure(); setFonts((n) => n + 1); } }, () => undefined);
    const again = () => { resetMeasure(); setFonts((n) => n + 1); };
    ready?.addEventListener?.('loadingdone', again);
    return () => { live = false; };
  }, []);
  return { colW: w, fonts };
}

function ActiveChips({ st, set, hiddenN, game }: { st: ListState; set: SetState; hiddenN: number; game: Prop | null }) {
  const chips: [string, string, () => void][] = [];
  if (st.hide) chips.push(['hide', `Hide out · ${hiddenN} hidden`, () => set({ hide: false })]);
  if (st.sport && st.sport !== 'all') chips.push(['sport', st.sport.toUpperCase(), () => set({ sport: 'all' })]);
  if (st.fam) chips.push(['fam', st.fam.replace(/_/g, ' '), () => set({ fam: null })]);
  if (st.team) chips.push(['team', st.team, () => set({ team: null })]);
  if (st.game) chips.push(['game', game ? `${game.away.abbr} at ${game.home.abbr}` : 'This game', () => set({ game: null })]);
  if (st.player) chips.push(['player', 'This player', () => set({ player: null })]);
  if (st.preset) chips.push(['preset', PRESET_LABEL[st.preset] ?? st.preset, () => set({ preset: null })]);
  if (st.range) chips.push(['range', `${st.range.replace('-', '¢ to ')}¢`, () => set({ range: null })]);
  if (st.hmin) chips.push(['hmin', `${st.hmin}+ of ${st.hwin === 'L5' ? 5 : 10} history`, () => set({ hmin: null })]);
  if (st.orank) chips.push(['orank', st.orank === 'bottom10' ? 'Bottom-10 opponent' : 'Top-10 opponent', () => set({ orank: null })]);
  if (st.model) chips.push(['model', 'SIFT model published', () => set({ model: false })]);
  if (st.q) chips.push(['q', `“${st.q}”`, () => set({ q: null })]);
  if (!chips.length) return null;
  return (
    <ChipRail className="pd-act" role="group" aria-label="Active filters">
      {chips.map(([k, label, clear]) => <button key={k} type="button" onClick={clear} aria-label={`Remove ${label}`}>{label}<Icon name="close" size={12} /></button>)}
    </ChipRail>
  );
}

function PropRow({ it, k, open, cmpMode, ticked, onToggle, onTick, bits, histNotLoaded }: { it: RowItem; k: number; open: boolean; cmpMode: boolean; ticked: boolean; onToggle: () => void; onTick: () => void; bits: PeekBits; histNotLoaded: boolean }) {
  const { p, wrap, chip } = it;
  const r = rungFor(p, k);
  const price = bits.reader.priceOf(p, r);
  const hs = historyStateOf(p, bits.get);
  const lanes: Lanes = lanesFor(p, r.k, price, hs);
  const ref = playerRef(p);
  return (
    <div className={`pd-row${wrap ? ' is-wrap' : ''}${open ? ' is-open' : ''}`} data-prop={p.id} data-open={open ? '1' : undefined}>
      <button type="button" className="pd-row__hit" aria-expanded={open} aria-pressed={cmpMode ? ticked : undefined} aria-label={cmpMode ? `${ticked ? 'Remove' : 'Select'} ${p.name} ${statText(p, r.k)} for comparison${availWord(p)}` : `${open ? 'Collapse' : 'Expand'} ${p.name}, ${statText(p, r.k)}${availWord(p)}`} onClick={cmpMode ? onTick : onToggle} />
      <span className="pd-avwrap" style={{ ['--s' as string]: '40px' }}>
        <Avatar p={p} size={40} link={!cmpMode} k={r.k} />
        {cmpMode && <i className={`pd-tick${ticked ? ' is-on' : ''}`} aria-hidden="true">{ticked && <Icon name="check" size={13} strokeWidth={3} />}</i>}
      </span>
      <div className="pd-pb">
        <NameLine p={p} k={r.k} plain={cmpMode || !ref} />
        <div className="pd-ps"><span>{p.label} <b>{r.k}+</b></span><OppChip m={chip.state === 'ready' ? chip.m : null} loading={chip.state === 'loading'} p={p} wrap={wrap} /></div>
        <LaneLine l={lanes} histNotLoaded={histNotLoaded && hs.state === 'idle'} />
      </div>
      <PricePill p={p} r={r} price={price} />
    </div>
  );
}

function useSavedRoute(route: string) {
  const list = useSaved();
  return findSaved(list, route);
}

function Header({ st, title, count, partial, onBack, onSearch, set, universe }: { st: ListState; title: string; count: number; partial: boolean; onBack: () => void; onSearch: () => void; set: SetState; universe: Universe }) {
  void set;
  const route = routes.props({ ...st, view: 'list' });
  const saved = useSavedRoute(route);
  const chips = [`Sort: ${SORT_LABEL[sortOf(st)]}`, st.sport && st.sport !== 'all' ? st.sport.toUpperCase() : null, st.fam ? st.fam.replace(/_/g, ' ') : null, st.preset ? PRESET_LABEL[st.preset] ?? st.preset : null].filter((x): x is string => !!x);
  const toggle = () => {
    if (saved) removeSaved(saved.id);
    else saveResearch({ title: `Props · ${title}`, subtitle: `${count} props${universe.demo ? ' (sample data)' : ''}`, route, chips, kind: 'props', sport: st.sport && st.sport !== 'all' ? st.sport : null });
  };
  return (
    <header className="pd-hs">
      <div className="pd-hs__tt">
        <button type="button" className="v3-iconbtn" aria-label="Back" onClick={onBack}><Icon name="back" size={24} /></button>
        <h1>{title}</h1>
        <span className="pd-hs__cnt" aria-label={`${count} props${partial ? ' so far, more games are still being read' : ''}`}>{count}{partial ? '+' : ''}</span>
        <span className="pd-hs__tr">
          <button type="button" className="v3-iconbtn" aria-label="Search props" onClick={onSearch}><Icon name="search" size={22} /></button>
          <button type="button" className="v3-iconbtn" aria-label={saved ? 'Remove this view from saved research' : 'Save this view'} aria-pressed={!!saved} onClick={toggle}><Icon name="bookmark" size={22} fill={!!saved} /></button>
        </span>
      </div>
    </header>
  );
}

export function PropsList({ st, set, us }: { st: ListState; set: SetState; us: UniverseState }) {
  const universe = us.universe as Universe;
  const loc = useLocation();
  const nav = useNavigate();
  const patch = useQueryPatch();
  const sheet = useSheet();
  const bank = useHistoryBank();
  const { ctx, chipOf } = useQueryCtx(universe);
  useBankVersion(rankBank);
  const { colW, fonts } = useRowMetrics();
  const inputRef = useRef<HTMLInputElement>(null);
  const sort = sortOf(st);

  // ---- the search field keeps its own text (typing is never fought by the router) and mirrors it into the address by replacing it
  const q = st.q ?? '';
  const [text, setText] = useState(q);
  const typed = useRef(new Set([q]));
  useEffect(() => { if (!typed.current.has(q)) { typed.current = new Set([q]); setText(q); } }, [q]);
  const onText = (v: string) => { typed.current.add(v); setText(v); set({ q: v.trim() ? v : null }); };

  // `focus=1` (from the home's search field) puts the cursor in the field; `filters=1` (the home's sliders) opens the sheet. Both are consumed.
  const qp = new URLSearchParams(loc.search);
  const wantFocus = qp.get('focus') === '1', wantFilters = qp.get('filters') === '1';
  const openFilters = useCallback(() => sheet.open('Sort and filter', <FilterSheet initial={st} set={set} />, { tall: true, locked: true }), [sheet, st, set]);
  useEffect(() => {
    if (wantFocus) { inputRef.current?.focus({ preventScroll: true }); patch({ focus: null }); }
    if (wantFilters) { patch({ filters: null }); openFilters(); }
  }, [wantFocus, wantFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the list
  // The list depends on the filter and sort fields only: opening a row, ticking a comparison or typing the cursor into the field changes `st`
  // but not the list, so those taps must not filter, sort and measure a thousand rows again.
  const listSig = [st.sport, st.fam, st.sort, st.q, st.hide, st.team, st.player, st.game, st.preset, st.range, st.hmin, st.hwin, st.orank, st.model, st.pin ? st.exp : ''].join('|');
  const listSt = useMemo(() => st, [listSig]); // eslint-disable-line react-hooks/exhaustive-deps -- `listSig` names every field the list reads
  const base = useMemo(() => universe.props.filter((p) => passesBase(p, listSt, ctx)), [universe, listSt, ctx]);
  const list = useMemo(() => listProps(universe.props, listSt, ctx), [universe, listSt, ctx]);
  const sortHist = sort === 'hist' && !historyFilterOn(st);
  const items = useMemo<Item[]>(() => {
    const rows = list.map((p): RowItem => { const chip = chipOf(p); return { kind: 'row', p, chip, wrap: !chipBeside(p.label, `${p.featured}+`, chipText(p, chip), colW) }; });
    if (!sortHist) return rows;
    // History order: ranked rows first, then the rows that were never evaluated, each group labelled and in start order (see query.ts comparator).
    const out: Item[] = [];
    const counts: Record<HistClass, number> = { evaluated: 0, pending: 0, none: 0 };
    const cls = list.map((p) => { const c = histClassOf(p, ctx); counts[c]++; return c; });
    const HEAD: Record<HistClass, (n: number) => Omit<HeadItem, 'kind' | 'id'>> = {
      evaluated: (n) => ({ title: 'Evaluated · ranked by History', sub: `${n} prop${n === 1 ? '' : 's'} with History computed from a loaded game log`, ranked: true }),
      pending: (n) => ({ title: 'History not loaded', sub: `${n} prop${n === 1 ? '' : 's'} not evaluated · listed by start time, not ranked`, ranked: false }),
      none: (n) => ({ title: 'No game log published', sub: `${n} prop${n === 1 ? '' : 's'} · listed by start time, not ranked`, ranked: false }),
    };
    let last: HistClass | null = null;
    rows.forEach((r, i) => {
      if (cls[i] !== last) { last = cls[i]; out.push({ kind: 'head', id: last, ...HEAD[last](counts[last]) }); }
      out.push(r);
    });
    return out;
  }, [list, ctx, chipOf, colW, fonts, sortHist]); // eslint-disable-line react-hooks/exhaustive-deps -- `fonts` re-measures when a web font arrives
  const expRef = parseRef(st.exp);
  const expProp = expRef ? universe.byId.get(expRef.id) ?? null : null;

  // ---- History: ranked or filtered over the whole list only when asked; otherwise lazily for the rows on screen
  const needsHist = sort === 'hist' || historyFilterOn(st);
  const histRefs = useMemo(() => (needsHist ? base.map(logRefOf).filter((r): r is NonNullable<typeof r> => !!r) : []), [needsHist, base]);
  const histSum = useMemo(() => (needsHist ? histSummary(base, ctx) : null), [needsHist, base, ctx]);
  const missing = bank.missing(histRefs);
  const pending = bank.pending(histRefs);
  const histPlayers = new Set(histRefs.map((r) => r.key)).size;
  // Only once every game is read: on a partial universe the count of missing logs grows, and a few at a time would add up past the stated limit.
  useEffect(() => { if (needsHist && universe.complete && missing > 0 && missing <= AUTO_LOGS) historyBank.ensure(histRefs); }, [needsHist, universe.complete, missing, histRefs]);
  const costKb = useMemo(() => { const seen = new Map<string, number>(); for (const r of histRefs) if (!bank.get(r.key)) seen.set(r.key, LOG_KB[r.slug] ?? 20); return [...seen.values()].reduce((a, b) => a + b, 0); }, [histRefs, bank.getVersion()]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- what is on screen
  const [vis, setVis] = useState<[number, number]>([0, 10]);
  const onVisible = useCallback((a: number, b: number) => setVis((c) => (c[0] === a && c[1] === b ? c : [a, b])), []);
  const rowsOf = useCallback((a: number, b: number) => items.slice(a, b).flatMap((it) => (it.kind === 'row' ? [it.p] : [])), [items]);
  const visible = useMemo(() => rowsOf(vis[0], vis[1]), [rowsOf, vis]);
  // A few rows ahead of the screen: their availability and opponent rankings are read before they scroll in, so "Checking availability" is rarely seen.
  const ahead = useMemo(() => rowsOf(vis[1], vis[1] + 24), [rowsOf, vis]);
  // While History orders or filters the list, rows that scroll into view are NOT loaded behind the viewer's back (a row that gains History would
  // jump between the groups under his thumb): loading is the explicit control below, plus the expanded row.
  useVisibleHistory(visible, !needsHist);
  useVisibleHistory(useMemo(() => (expProp ? [expProp] : []), [expProp]));
  useEnsureAvailability(useMemo(() => (expProp ? [...visible, ...ahead, expProp] : [...visible, ...ahead]), [visible, ahead, expProp]));
  const needsRanks = st.preset === 'bottom3' || !!st.orank || sort === 'match';
  useEnsureRanks(universe.props, needsRanks);
  useEnsureRanks(useMemo(() => (expProp ? [...visible, ...ahead, expProp] : [...visible, ...ahead]), [visible, ahead, expProp]), !needsRanks);
  const ranksWait = needsRanks && ranksPending(rankKeysFor(universe.props));
  const reader = usePropPrices(visible, expProp);
  const cmpForSheet = st.cmp.map((t) => universe.byId.get(parseRef(t)?.id ?? '') ?? null);
  usePublishContracts([...visible, expProp, ...cmpForSheet], bank.get, bank.getVersion());
  const bits: PeekBits = { reader, get: bank.get };

  // ---- selections (compare): at most three, in the address
  const cmp = st.cmp;
  const [notice, setNotice] = useState<string | null>(null);
  const tick = (p: Prop, k: number) => {
    const has = cmp.findIndex((t) => parseRef(t)?.id === p.id);
    if (has >= 0) { set({ cmp: cmp.filter((_, i) => i !== has) }); return; }
    if (cmp.length >= 3) { setNotice('Compare up to three props'); setTimeout(() => setNotice(null), 2400); return; }
    set({ cmp: [...cmp, refToken(p, k)] });
  };
  const cmpProps = cmp.map((t) => { const r = parseRef(t); const p = r ? universe.byId.get(r.id) : undefined; return p ? { p, k: r!.k ?? p.featured } : null; }).filter((x): x is { p: Prop; k: number } => !!x);

  const toggle = (p: Prop) => set(st.exp && parseRef(st.exp)?.id === p.id ? { exp: null, pin: false } : { exp: p.id });
  const onRung = (p: Prop, k: number) => set({ exp: refToken(p, k) });

  const render = useCallback((it: Item) => {
    if (it.kind === 'head') return <div className={`pd-grp${it.ranked ? '' : ' is-unranked'}`} data-group={it.id}><h2>{it.title}</h2><p>{it.sub}</p></div>;
    const open = expRef?.id === it.p.id;
    const k = open ? expRef!.k ?? it.p.featured : it.p.featured;
    const ticked = cmp.some((t) => parseRef(t)?.id === it.p.id);
    const m = it.chip.state === 'ready' ? it.chip.m : null;
    return (
      <>
        <PropRow it={open && k !== it.p.featured ? { ...it, wrap: !chipBeside(it.p.label, `${k}+`, chipText(it.p, it.chip), colW) } : it} k={k} open={open} cmpMode={st.cmpm} ticked={ticked} onToggle={() => toggle(it.p)} onTick={() => tick(it.p, k)} bits={bits} histNotLoaded={needsHist} />
        {open && <Peek p={it.p} k={rungFor(it.p, k).k} m={m} bits={bits} onRung={(kk) => onRung(it.p, kk)} />}
      </>
    );
  }, [expRef?.id, expRef?.k, cmp, st.cmpm, bits.reader, bank.getVersion(), colW, fonts, needsHist]); // eslint-disable-line react-hooks/exhaustive-deps

  const heightOf = useCallback((it: Item) => (it.kind === 'head' ? GROUP_H : rowHeight(it.wrap) + (expRef?.id === it.p.id ? PEEK_EST : 0)), [expRef?.id]);
  const dynamic = useCallback((it: Item) => it.kind === 'row' && expRef?.id === it.p.id, [expRef?.id]);
  const keyOf = useCallback((it: Item) => (it.kind === 'head' ? `~${it.id}` : it.p.id), []);

  const back = () => { if (loc.key !== 'default') nav(-1); else nav(routes.props(), { replace: true }); };
  const gameProp = st.game ? universe.props.find((p) => p.eventId === st.game) ?? null : null;
  const title = listTitle(st, { player: st.player ? universe.props.find((p) => p.playerId === st.player || p.name === st.player) ?? null : null, game: gameProp });
  const nFilters = [st.range, st.hmin, st.orank, st.model || null, st.preset].filter(Boolean).length;
  const published = universe.props.filter((p) => p.model.state === 'published').length;
  const hiddenN = universe.props.filter((p) => p.out).length;

  return (
    <div className="pd pd-listpage" data-view="list">
      <Header st={st} title={title} count={list.length} partial={!universe.complete} onBack={back} onSearch={() => inputRef.current?.focus()} set={set} universe={universe} />
      <label className="pd-search">
        <Icon name="search" size={18} />
        <input ref={inputRef} type="search" value={text} onChange={(e) => onText(e.target.value)} placeholder="Search player, stat or team" aria-label="Search player, stat or team" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false} />
        {text && <button type="button" aria-label="Clear search" onClick={() => onText('')}><Icon name="close" size={16} /></button>}
      </label>
      <HorizonBar state={us} onChange={(hz) => set({ hz })} />
      <ChipRail className="pd-ctrl" role="group" aria-label="Sort, filters and compare">
        <button type="button" className="pd-btn pd-btn--sort" onClick={openFilters} aria-label={`Sort: ${SORT_LABEL[sort]}. Open sort and filters`}><Icon name="sliders" size={13} />Sort: {SORT_LABEL[sort]}<b>▾</b></button>
        <button type="button" className="pd-btn" onClick={openFilters} aria-label={`Filters${nFilters ? `, ${nFilters} applied` : ''}`}>Filters{nFilters > 0 && <i className="pd-badge">{nFilters}</i>}</button>
        <button type="button" className="pd-btn" aria-pressed={st.cmpm} onClick={() => set({ cmpm: !st.cmpm })}>Compare{cmp.length ? ` · ${cmp.length}` : ''}</button>
      </ChipRail>
      <ActiveChips st={st} set={set} hiddenN={hiddenN} game={gameProp} />
      <div className="pd-leg" aria-label="Lane key"><span>Market <Mark lane="m" /> pre-fee implied</span><span>History <Mark lane="h" /> last 10</span><span>SIFT model <Mark lane="z" /></span></div>
      <div className="pd-note"><Icon name="info" size={13} /><p>SIFT model shows “—” where no approved estimate exists: {published} of {universe.props.length} props today.</p></div>
      {needsHist && histSum && (histSum.total > 0 || universe.complete) && (
        <div className="pd-hbar" role="status" data-evaluated={histSum.evaluated} data-total={histSum.total}>
          <p className="pd-hbar__t"><b>Evaluated {histSum.evaluated} of {histSum.total}</b> props</p>
          <p className="pd-hbar__d">
            {historyFilterOn(st)
              ? `The ${st.hmin}+ of ${st.hwin === 'L5' ? 5 : 10} History threshold applies to evaluated props only: those whose last games are computed from a loaded game log. ${histSum.total - histSum.evaluated} not evaluated ${histSum.total - histSum.evaluated === 1 ? 'is' : 'are'} not shown.`
              : 'History ranks evaluated props only: those whose last games are computed from a loaded game log. The rest follow below in start order, labelled, and are not ranked.'}
            {histSum.none > 0 ? ` ${histSum.none} ${histSum.none === 1 ? 'has' : 'have'} no published game log.` : ''}
          </p>
          {pending > 0 ? <p className="pd-hbar__d">Loading history for {pending} of {histPlayers} players…</p>
            : missing > 0 ? <button type="button" onClick={() => historyBank.ensure(histRefs)}>Load history for {missing} more player{missing === 1 ? '' : 's'} (about {costKb >= 1024 ? `${(costKb / 1024).toFixed(1)} MB` : `${costKb} KB`})</button>
              : <p className="pd-hbar__d">{`History is loaded for all ${histPlayers} players in this list.`}</p>}
        </div>
      )}
      {notice && <div className="pd-note" role="status"><p>{notice}</p></div>}
      {universe.unreadable.length > 0 && <div className="pd-note"><Icon name="info" size={13} /><p>No player props could be read for {universe.unreadable.join(', ')}.</p></div>}
      {ranksWait || (items.length === 0 && !universe.complete) ? (
        <div className="pd-skel" role="status" aria-label={ranksWait ? 'Reading opponent rankings' : 'Reading games'}><div className="v3-skel" style={{ height: 96 }} /><div className="v3-skel" style={{ height: 96 }} /><div className="v3-skel" style={{ height: 96 }} /></div>
      ) : items.length ? (
        <VirtualList className="pd-list" label="Props" items={items} keyOf={keyOf} heightOf={heightOf} dynamic={dynamic} render={render} onVisible={onVisible} />
      ) : (
        <div className="v3-state pd-empty"><Icon name="info" size={20} /><div><b>No props match</b>Loosen a filter. There are {universe.props.length} props today.<br /><button type="button" onClick={() => set({ sport: 'all', fam: null, q: null, team: null, game: null, player: null, preset: null, range: null, hmin: null, orank: null, model: false, hide: true })}>Clear filters</button></div></div>
      )}
      {cmpProps.length > 0 && (
        <div className="pd-tray" role="region" aria-label="Comparison tray">
          <span className="pd-tray__stack">{cmpProps.map(({ p, k }) => <i key={p.id}><Avatar p={p} size={26} link={false} k={k} /></i>)}</span>
          <span className="pd-tray__t"><b>{cmpProps.length} selected</b><small>{cmpProps.map(({ p, k }) => `${p.name.split(' ').slice(-1)[0]} ${p.abbr} ${k}+`).join(' · ')}</small></span>
          {cmpProps.length >= 2
            ? <PropsLink state={{ view: 'compare', cmp }} className="pd-abtn pd-abtn--pri">Compare<Icon name="chevR" size={13} /></PropsLink>
            : <button type="button" className="pd-abtn" onClick={() => set({ cmp: [] })}>Clear</button>}
        </div>
      )}
    </div>
  );
}

