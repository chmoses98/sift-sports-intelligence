// SIFT INTELLIGENCE TERMINAL — a multi-panel research environment over today's discoveries
// (src/intelligence/discoveries.ts). Desktop: the Discovery Board (sport chips, type chips for the kinds the
// publications actually produce, an importance column) beside the selected matchup's hero card, then connected
// panels that all follow the selection: opponent-adjusted matchup, projection vs market, game scripts, relevant
// markets with quote ages, context & risks, model evidence, more on the same game (src/views/intel/TerminalPanels).
// Layout presets (Discovery · Matchups · Markets) reorder the panels; the preset lives in the address and in this
// browser, as do pins. Phones: the discovery cards, then one focused discovery with a way back.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { EventResearchDoc } from '../../contract/types';
import { useAsync } from '../../data/hooks';
import { SportRepo } from '../../data/repo';
import { resolveSource } from '../../data/source';
import { sportByCode } from '../../data/sports';
import { navSport } from '../../data/nav';
import { HubMast, hubPhoto } from '../../components/HubMast';
import { Icon } from '../../components/Icon';
import { SportMark } from '../../components/SportMark';
import { Skeleton } from '../../components/ui';
import { heroInputFor } from '../../lib/hero/input';
import { resolveHero } from '../../lib/hero/resolve';
import { useLiveQuotes, useNow } from '../../live/hooks';
import { useAllOpportunities } from '../../opportunity/load';
import { useVisit } from '../../state/trail';
import { buildDiscoveries, type Discovery, type DiscoveryKind } from '../../intelligence/discoveries';
import { gameRows, type GameRow } from '../broadcast/games';
import { PMark, useGameResearch } from '../broadcast/parts';
import { IntelNav } from './IntelNav';
import { ComparePanel, ContextPanel, EvidencePanel, Importance, KindChip, MarketsPanel, MatchupPanel, ProjectionPanel, SamePanel, ScriptsPanel, SelectedHero } from './TerminalPanels';
import { isLayout, kindCounts, LAYOUT_PANELS, LAYOUTS, layoutFromWorkspace, mainLines, TYPE_FILTERS, type Layout, type PanelId } from './terminalModel';

const PREF_KEY = 'sift.terminal.v2';
interface Prefs { layout: Layout; pins: string[] }
function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null') as Partial<Prefs> | null;
    if (p && Array.isArray(p.pins)) return { layout: isLayout(p.layout) ? p.layout : 'discovery', pins: p.pins.filter((x) => typeof x === 'string').slice(0, 12) };
  } catch { /* private mode or corrupt: defaults */ }
  return { layout: 'discovery', pins: [] };
}
function savePrefs(p: Prefs) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* not persisted */ }
}

/** NFL event research for the coming week's games (the matchup mismatches), read once and memoised. */
function useNflResearch(eventIds: string[]) {
  const key = eventIds.join(',');
  return useAsync(key ? `terminal:nfl:${key}` : null, async () => {
    const sport = sportByCode('NFL');
    if (!sport) return [] as EventResearchDoc[];
    const repo = new SportRepo(await resolveSource(sport));
    if (!repo.hasExplorer) return [];
    const out = await Promise.allSettled(eventIds.map((id) => repo.eventResearch(id)));
    return out.flatMap((o) => (o.status === 'fulfilled' ? [o.value] : []));
  });
}

/** "Sun 5:00 PM": weekday and local time, compact enough for a board row. */
const shortWhen = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const sep = (sport: string) => (sport === 'SOCCER' || sport === 'TENNIS' ? 'v' : '@');

/** One discovery as a board row (desktop: a dense table row; phones: a card). */
function BoardRow({ d, g, active, onSelect }: { d: Discovery; g: GameRow | undefined; active: boolean; onSelect: () => void }) {
  const nav = navSport(d.slug);
  const label = g ? `${g.away?.short_name ?? g.away?.display_name ?? '?'} ${sep(d.sport)} ${g.home?.short_name ?? g.home?.display_name ?? '?'}` : d.opportunity?.eventLabel ?? `${nav?.label ?? d.sport} publication`;
  return (
    <button type="button" className={`trow trow--${d.kind}${active ? ' is-on' : ''}`} aria-pressed={active} onClick={onSelect}>
      <span className="trow__sport">{nav && <SportMark slug={d.slug} icon={nav.icon} size={16} />}<span>{nav?.label ?? d.sport}</span></span>
      <span className="trow__game">
        <span className="trow__marks" aria-hidden="true">{g ? <><PMark sport={d.sport} p={g.away} size="sm" /><PMark sport={d.sport} p={g.home} size="sm" /></> : nav ? <SportMark slug={d.slug} icon={nav.icon} size={22} /> : null}</span>
        <span className="trow__gl"><b>{label}</b><small>{g ? shortWhen(g.item.start_time_utc) : d.opportunity ? shortWhen(d.opportunity.startTime) : 'Publication health'}</small></span>
      </span>
      <span className="trow__type"><KindChip d={d} /></span>
      <span className="trow__ins"><b>{d.title}</b><small>{d.evidence ? <><span className={`dword dword--${d.evidence.tone}`}>{d.evidence.word}</span> {d.evidence.basis}</> : 'Not a betting signal'}</small></span>
      <span className="trow__imp"><Importance sig={d.significance} /></span>
    </button>
  );
}

export function TerminalView() {
  useVisit('Intelligence Terminal', 'intel');
  const now = useNow(30_000);
  const all = useAllOpportunities(now);
  const [sp, setSp] = useSearchParams();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  useEffect(() => savePrefs(prefs), [prefs]);
  const urlLayout = sp.get('layout');
  const layout: Layout = isLayout(urlLayout) ? urlLayout : layoutFromWorkspace(sp.get('ws')) ?? prefs.layout;
  const sport = sp.get('sport');
  const kind = (sp.get('kind') as DiscoveryKind | null) ?? null;
  const selectedId = sp.get('d');
  const nflIds = useMemo(() => {
    const b = all.bundles.find((x) => x.sport.code === 'NFL');
    return (b?.board ?? []).filter((i) => Date.parse(i.start_time_utc) > now - 3 * 3600_000 && Date.parse(i.start_time_utc) < now + 8 * 86_400_000).map((i) => i.event_id).sort();
  }, [all.bundles, now]);
  const nfl = useNflResearch(nflIds);
  const discoveries = useMemo(() => buildDiscoveries({ opportunities: all.opportunities, verdicts: all.verdicts, research: (nfl.data ?? []).map((r) => ({ r, slug: 'nfl' })), now }), [all.opportunities, all.verdicts, nfl.data, now]);
  const games = useMemo(() => new Map(gameRows(all.bundles, all.opportunities, now).map((g) => [g.item.event_id, g])), [all.bundles, all.opportunities, now]);
  const sportScoped = discoveries.filter((d) => !sport || d.slug === sport);
  const counts = kindCounts(sportScoped);
  const shown = sportScoped.filter((d) => !kind || d.kind === kind);
  const selected = discoveries.find((d) => d.id === selectedId) ?? (selectedId ? null : shown[0] ?? null);
  const set = (k: string, v: string | null) => setSp((prev) => { const n = new URLSearchParams(prev); if (v) n.set(k, v); else n.delete(k); if (k === 'layout') n.delete('ws'); return n; }, { replace: k !== 'd' });
  const setLayout = (l: Layout) => { setPrefs((p) => ({ ...p, layout: l })); set('layout', l === 'discovery' ? null : l); };
  const togglePin = (id: string) => setPrefs((p) => ({ ...p, pins: p.pins.includes(id) ? p.pins.filter((x) => x !== id) : [id, ...p.pins].slice(0, 12) }));
  const pinned = prefs.pins.map((id) => discoveries.find((d) => d.id === id)).filter((d): d is Discovery => !!d);
  const sports = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of discoveries) m.set(d.slug, (m.get(d.slug) ?? 0) + 1);
    return [...m.entries()];
  }, [discoveries]);
  const loading = all.loading || (nflIds.length > 0 && nfl.loading && !nfl.data);

  // The selected discovery's game: its board row, its research document, its hero art and its live main lines.
  const game = selected?.eventId ? games.get(selected.eventId) : undefined;
  const research = useGameResearch(selected?.eventId ? selected.slug : null, selected?.eventId ?? null);
  const r = research.data ?? null;
  const spec = useMemo(() => (game ? resolveHero(heroInputFor(game.item, r, game.sport)) : null), [game, r]);
  const opps = useMemo(() => (selected?.eventId ? all.opportunities.filter((o) => o.eventId === selected.eventId) : []), [all.opportunities, selected?.eventId]);
  const tickers = useMemo(() => mainLines(r).map((m) => m.kalshi_ticker), [r]);
  const live = useLiveQuotes(tickers, 'slate');
  const sel = (id: string) => set('d', id);

  const panel = (id: PanelId) => {
    if (!selected) return null;
    switch (id) {
      case 'matchup': return <MatchupPanel key={`mu:${selected.id}`} d={selected} r={r} loading={research.loading} />;
      case 'projection': return <ProjectionPanel key={`pm:${selected.id}`} d={selected} r={r} />;
      case 'scripts': return <ScriptsPanel d={selected} r={r} loading={research.loading} />;
      case 'markets': return <MarketsPanel d={selected} r={r} opps={opps} quote={live.quote} now={now} />;
      case 'context': return <ContextPanel d={selected} r={r} spec={spec} />;
      case 'evidence': return <EvidencePanel d={selected} />;
      case 'same': return <SamePanel d={selected} all={discoveries} onSelect={sel} />;
      case 'compare': return selected.opportunity && opps.length >= 2 ? <ComparePanel d={selected} opps={opps} /> : null;
    }
  };
  const panels = LAYOUT_PANELS[layout].map((p) => ({ ...p, node: panel(p.id) })).filter((p) => p.node);

  return (
    <div className={`page term term--${layout}${selectedId ? ' term--focused' : ''}`}>
      <IntelNav />
      <HubMast
        className="term__mast"
        brand="SIFT"
        title="Terminal"
        eyebrow="SIFT Intelligence"
        sub="Advanced research over today’s published data. Significance and betting evidence are rated separately."
        photo={hubPhoto('nfl-chi-soldier-field')}
        aside={<p className="hubm__stat"><b className="fx-num fx-num--xl">{discoveries.length}</b><span>discoveries today<br />{sports.length} sports reporting</span></p>}
      >
        <div className="hubm__presets" role="group" aria-label="Layout preset">
          {LAYOUTS.map((l) => <button key={l.id} type="button" className={`hubm__preset${layout === l.id ? ' is-on' : ''}`} aria-pressed={layout === l.id} onClick={() => setLayout(l.id)} title={l.sub}><Icon name={l.icon} size={16} />{l.label}</button>)}
        </div>
      </HubMast>
      <div className="term__bar">
        <div className="tm-chips" role="group" aria-label="Sport">
          <button type="button" className={`tm-chip${!sport ? ' is-on' : ''}`} aria-pressed={!sport} onClick={() => set('sport', null)}><Icon name="grid" size={15} />All <small>{discoveries.length}</small></button>
          {sports.map(([s, n]) => { const nv = navSport(s); return <button key={s} type="button" className={`tm-chip${sport === s ? ' is-on' : ''}`} aria-pressed={sport === s} onClick={() => set('sport', sport === s ? null : s)}>{nv && <SportMark slug={s} icon={nv.icon} size={15} />}{nv?.label ?? s} <small>{n}</small></button>; })}
        </div>
      </div>
      {pinned.length > 0 && (
        <div className="term__pins" role="group" aria-label="Pinned discoveries">
          <span className="eyebrow2"><Icon name="pin" size={12} /> Pinned</span>
          {pinned.map((p) => <button key={p.id} type="button" className={`term__pin${selected?.id === p.id ? ' is-on' : ''}`} onClick={() => sel(p.id)}>{p.title}</button>)}
        </div>
      )}
      <div className="term__top">
        <section className="fx-card tboard term__board" aria-labelledby="tboard-h">
          <header className="fx-card__h">
            <h2 className="fx-card__t" id="tboard-h"><Icon name="layers" size={17} /><span>Discovery Board</span></h2>
            <span className="muted small">{shown.length} shown</span>
          </header>
          <div className="tm-tabs" role="group" aria-label="Discovery type">
            <button type="button" className={!kind ? 'is-on' : undefined} aria-pressed={!kind} onClick={() => set('kind', null)}>All</button>
            {TYPE_FILTERS.filter((t) => counts.get(t.kind)).map((t) => <button key={t.kind} type="button" className={kind === t.kind ? 'is-on' : undefined} aria-pressed={kind === t.kind} onClick={() => set('kind', kind === t.kind ? null : t.kind)}>{t.label} <small>{counts.get(t.kind)}</small></button>)}
          </div>
          <div className="tboard__head" aria-hidden="true"><span>Sport</span><span>Matchup</span><span>Type</span><span>Insight</span><span>Importance</span></div>
          {loading && !discoveries.length ? <Skeleton lines={6} /> : shown.length ? (
            <div className="tboard__scroll" role="region" aria-label="Discoveries">
              <ol className="term__list">{shown.slice(0, 80).map((d) => <li key={d.id}><BoardRow d={d} g={d.eventId ? games.get(d.eventId) : undefined} active={selected?.id === d.id} onSelect={() => sel(d.id)} /></li>)}</ol>
            </div>
          ) : <div className="bempty"><h3>No discoveries match</h3><p>Change the sport or type. An empty board is an honest result on a quiet day.</p></div>}
          {nfl.loading && <p className="muted term__loading">Reading NFL matchup research…</p>}
          {shown.length > 80 && <p className="muted small term__loading">Showing the 80 most significant of {shown.length}.</p>}
        </section>
        <div className="term__main">
          {selected ? <SelectedHero d={selected} game={game ?? null} spec={spec} pinned={prefs.pins.includes(selected.id)} onPin={() => togglePin(selected.id)} onBack={() => set('d', null)} /> : selectedId && !loading ? (
            <div className="bempty"><h3>That discovery is no longer on the board</h3><p>It may have expired, started, or been repriced away. <button type="button" className="linkbtn" onClick={() => set('d', null)}>Back to today’s discoveries</button></p></div>
          ) : loading ? <Skeleton lines={8} tall /> : null}
        </div>
      </div>
      {selected && (
        <div className="fx-bento term__panels">
          {panels.map((p) => <div key={p.id} className={`fx-span-${p.span} term__cell term__cell--${p.id}`}>{p.node}</div>)}
        </div>
      )}
    </div>
  );
}
