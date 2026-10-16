// The Market board (Intelligence → Markets; the global Home before the 2026-10-10 rebuild): the most complete
// market screen in the app. In seconds a viewer sees whether any evidence-supported
// opportunity exists today across all eight sports (or an honest PASS per sport, with the missing prerequisite),
// then today's games across sports in one list they can narrow by sport, day, status and name. Everything shown
// comes from a publication's own candidate layer (src/opportunity); nothing is ranked by a hidden score.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from '../routing';
import type { BoardItem, EventResearchDoc } from '../contract/types';
import { useAsync } from '../data/hooks';
import { NAV_SPORTS, navSport } from '../data/nav';
import { Icon } from '../components/Icon';
import { PlayerFace, RangeBar } from '../components/insight';
import { SportMark } from '../components/SportMark';
import { Skeleton } from '../components/ui';
import { dayLabel, timeLabel } from '../lib/format';
import { routes } from '../lib/routes';
import { playerPhoto } from '../lib/players';
import { propCards, propsToWatch, valueText } from '../insights/props';
import { useTrail, useVisit } from '../state/trail';
import { useTray } from '../state/tray';
import { useNow } from '../live/hooks';
import { useAllOpportunities } from '../opportunity/load';
import { featureOpportunities, isLive } from '../opportunity/rank';
import { eventPhase } from '../opportunity/lifecycle';
import { eventLabel } from '../opportunity/sources';
import type { Opportunity } from '../opportunity/types';
import { useSport } from '../state/sport';
import { PanelHead, ViewAll } from './game/panels';
import { sides } from './home/cards';
import { OpportunityBoard, PassCard } from './home/Opportunities';
import { FreshChip } from '../components/fxResearch';
import { decisionOf } from '../lib/decision';
import { eventCards, hasBackedBet, KIND_ORDER, KIND_WORD, kindCounts, type MarketKind } from '../lib/marketBrowse';
import { tierWord, type Featured } from '../opportunity/rank';
import type { SportVerdict } from '../opportunity/types';
import '../styles/lane-d-markets.css';
import { Pill } from './shared/kit';
import { BottomSheet } from '../components/BottomSheet';
import { usePhone } from '../lib/useMediaQuery';
import '../styles/market-controls.css';
import { betPhrase } from '../lib/betWords';

function YourResearch() {
  const tray = useTray();
  const { recent } = useTrail();
  const n = tray.tray.items.length;
  if (!n && !recent.length) return null;
  return (
    <section className="panel yrp" aria-labelledby="yr-h">
      <PanelHead title="Your Research" sub={n ? `${n} saved ${n === 1 ? 'finding' : 'findings'} on this device` : 'Pick up where you left off'}>
        {n > 0 && <button type="button" className="btn btn--sm" onClick={() => tray.setOpen(true)}>Open</button>}
      </PanelHead>
      {recent.length > 0 && (
        <ol className="recentl">
          {recent.slice(0, 4).map((s) => <li key={s.href}><Link to={s.href}>{s.label}<Icon name="chevronRight" size={14} /></Link></li>)}
        </ol>
      )}
    </section>
  );
}

/** The NFL home's Props to Watch for the featured game (kept here for views/SportHome.tsx). */
export function FeaturedProps({ item, r, slug }: { item: BoardItem; r: EventResearchDoc | undefined; slug: string }) {
  const { repo } = useSport();
  const detail = useAsync(r ? `ed:NFL:${item.event_id}` : null, () => repo.eventDetail(item.event_id));
  const cards = useMemo(() => (r && detail.data ? propsToWatch(propCards(r, detail.data.markets), 3) : []), [r, detail.data]);
  if (!cards.length) return null;
  return (
    <section className="panel" aria-labelledby="hprops-h">
      <PanelHead title="Props to Watch" sub={`${sides(item).away?.short_name} at ${sides(item).home?.short_name} · projection, typical range and the line`}>
        <ViewAll to={routes.game(slug, item.event_id, { tab: 'props' })}>All props</ViewAll>
      </PanelHead>
      <ul className="hprops">
        {cards.map((c) => (
          <li key={c.id}>
            <Link to={routes.player(slug, c.playerId)} className="hprop">
              <PlayerFace photo={playerPhoto(c.playerId, c.name, c.team.abbr)} team={c.team.abbr} size="sm" />
              <span className="hprop__b">
                <span className="hprop__n">{c.name} <span className="hprop__s">{c.statLabel}</span></span>
                <span className="hprop__v">Projection <b className="num">{valueText(c.projection, c.unit)}</b>{c.line != null && <> · line <b className="num">{c.line}</b></>}</span>
                <RangeBar typical={c.range.typical} full={c.range.full} projection={c.projection} line={c.line} format={(v) => (c.unit === 'rec' ? (Math.round(v * 10) / 10).toString() : String(Math.round(v)))} label={`${c.name} ${c.statLabel.toLowerCase()}`} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ filters

type Window = 'today' | 'tomorrow' | 'week';
type StatusFilter = 'live' | 'all';
const WINDOW_WORD: Record<Window, string> = { today: 'Today', tomorrow: 'Tomorrow', week: 'This week' };

/** Local calendar window for a start time: today, tomorrow, or within seven days. */
export function inWindow(startIso: string, now: number, w: Window): boolean {
  const t = Date.parse(startIso);
  if (!Number.isFinite(t)) return false;
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const dayStart = d0.getTime();
  const DAY = 86_400_000;
  if (w === 'today') return t >= Math.min(now - 3 * 3600_000, dayStart) && t < dayStart + DAY;
  if (w === 'tomorrow') return t >= dayStart + DAY && t < dayStart + 2 * DAY;
  return t >= Math.min(now - 3 * 3600_000, dayStart) && t < dayStart + 7 * DAY;
}

const matches = (hay: string, q: string) => !q || hay.toLowerCase().includes(q.toLowerCase());

/** A started, postponed, cancelled or suspended game says so on its row instead of counting candidates or markets. */
function phaseWord(item: BoardItem, now: number) {
  const p = eventPhase(item, now);
  if (p.phase === 'STARTED') return <Pill tone="neutral" title={p.reason}>{p.staleStatus ? 'Started · board not refreshed' : 'In play'}</Pill>;
  if (p.phase === 'POSTPONED' || p.phase === 'CANCELLED' || p.phase === 'SUSPENDED') return <Pill tone="warn" title={p.reason}>{p.phase.charAt(0) + p.phase.slice(1).toLowerCase()}</Pill>;
  return null;
}

interface GameRow {
  sport: string;
  slug: string;
  item: BoardItem;
  label: string;
  opps: number;
  best: Opportunity | null;
}

const cents = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
const pctw = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

/**
 * KALSHI-STYLE BROWSING: one card per game, its featured contracts as rows in conventional betting words with the
 * executable price of the side, the fee-aware break-even, the decision word and the price's age. Games keep the
 * documented ranking; a game's contracts are one exposure. Sports with nothing to feature keep their PASS card.
 */
export function BrowseBoard({ featured, verdicts, now, loading, emptyText }: { featured: Featured[]; verdicts: SportVerdict[]; now: number; loading: boolean; emptyText?: string }) {
  const all = eventCards(featured, null);
  const [more, setMore] = useState(false);
  const CAP = 12;
  const cards = more ? all : all.slice(0, CAP);
  const passing = verdicts.filter((v) => !v.loaded || v.opportunities === 0);
  return (
    <div className="lmb" data-testid="browse-board">
      {featured.length > 0 && !hasBackedBet(featured) && <p className="oppboard__lede" role="note"><b>No validated or research-backed bet right now.</b> What follows are signals to read, not edges to take.</p>}
      {cards.length > 0 && (
        <div className="lmb__grid">
          {cards.map((c) => {
            const nav = navSport(c.slug);
            return (
              <article key={c.key} className="lmb__card" data-testid="event-card">
                <header className="lmb__h">
                  <span className="lmb__sport" style={{ ['--accent' as string]: nav?.accent }}>{nav && <SportMark slug={c.slug} icon={nav.icon} size={14} />}{nav?.label ?? c.sport}</span>
                  <span className="lmb__when num">{dayLabel(c.startTime)} · {timeLabel(c.startTime)}</span>
                </header>
                <Link to={c.gameHref} className="lmb__ev">{c.eventLabel}</Link>
                {c.competition && <span className="lmb__comp">{c.competition}</span>}
                <ul className="lmb__rows">
                  {c.items.slice(0, 3).map((f) => {
                    const o = f.lead;
                    const words = betPhrase(o.what.side, o.what.title);
                    const d = decisionOf(o.status, o.confidence.calibration);
                    return (
                      <li key={o.id}>
                        <Link to={o.href} className="lmb__row" title={words.exact}>
                          <span className="lmb__rt">
                            <b>{words.text}</b>
                            <small><span className={`dword dword--${d.tone}`}>{d.word}</span> {tierWord(o.rank.tier, o.status)}{f.related.length ? ` · +${f.related.length} related` : ''}</small>
                          </span>
                          <span className="lmb__px">
                            <span className={`lmb__btn lmb__btn--${o.what.side.toLowerCase()}`}><small>{o.what.side === 'YES' ? 'Yes' : 'No'}</small>{cents(o.price.ask)}</span>
                            <small className="lmb__be">break-even {pctw(o.price.breakEven)}{o.price.fair != null ? ` · model ${pctw(o.price.fair)}` : ''}</small>
                            <FreshChip at={o.price.observedAt} now={now} label="Price" />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <footer className="lmb__f">
                  {c.items.length > 1 && <span className="lmb__exp" role="note">{c.items.length} contracts on one game: one exposure, not diversification.</span>}
                  {c.items.length > 3 && <Link to={c.gameHref}>+{c.items.length - 3} more on this game</Link>}
                  <Link to={c.gameHref} className="lmb__open">Open game <Icon name="arrowRight" size={14} /></Link>
                </footer>
              </article>
            );
          })}
        </div>
      )}
      {!more && all.length > CAP && <button type="button" className="btn btn--sm lmb__all" onClick={() => setMore(true)}>Show all {all.length} games with an opportunity</button>}
      {cards.length === 0 && !loading && (
        <div className="oppboard__none">
          <h3 className="oppboard__nt">No opportunity clears the bar right now.</h3>
          <p className="muted">{emptyText ?? 'Every publication Sift reads either recommends nothing, marks its candidates research-only and past their validity window, or prices nothing at all. A pass is a result, not a failure.'}</p>
        </div>
      )}
      {passing.length > 0 && <div className="oppboard__passes lmb__passes">{passing.map((v) => <PassCard key={v.slug} v={v} />)}</div>}
    </div>
  );
}

export function MarketsView() {
  useVisit('Market board', 'intel');
  const now = useNow(30_000);
  const all = useAllOpportunities(now);
  const [sp, setSp] = useSearchParams();
  const sportFilter = sp.get('sport');
  const win = (['today', 'tomorrow', 'week'].includes(sp.get('when') ?? '') ? sp.get('when') : 'today') as Window;
  const status = (sp.get('status') === 'all' ? 'all' : 'live') as StatusFilter;
  const [q, setQ] = useState('');
  const view = sp.get('view') === 'cards' ? 'cards' : 'browse';
  const kind = (KIND_ORDER.includes(sp.get('type') as MarketKind) ? sp.get('type') : null) as MarketKind | null;
  const set = (k: string, v: string | null) => {
    // Functional update: quick successive taps build on each other's params (see views/game/PropsBoard.tsx).
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      if (v) next.set(k, v); else next.delete(k);
      return next;
    }, { replace: true });
  };

  const games = useMemo<GameRow[]>(() => {
    const byEvent = new Map<string, Opportunity[]>();
    for (const o of all.opportunities) byEvent.set(o.eventId, [...(byEvent.get(o.eventId) ?? []), o]);
    return all.bundles.flatMap((b) => b.board.filter((i) => i.status !== 'FINAL').map((item) => {
      const os = (byEvent.get(item.event_id) ?? []).filter(isLive);
      return { sport: b.sport.code, slug: b.sport.slug, item, label: eventLabel(item, b.sport.code), opps: os.length, best: os[0] ?? null };
    }));
  }, [all.bundles, all.opportunities]);

  const shownOpps = useMemo(() => all.opportunities.filter((o) => (!sportFilter || o.slug === sportFilter) && inWindow(o.startTime, now, win) && (status === 'all' || isLive(o)) && matches(`${o.eventLabel} ${o.what.title} ${o.competition ?? ''}`, q)), [all.opportunities, sportFilter, win, status, q, now]);
  const featuredAll = useMemo(() => featureOpportunities(shownOpps.filter(isLive)), [shownOpps]);
  const counts = useMemo(() => kindCounts(featuredAll), [featuredAll]);
  const featured = useMemo(() => (kind ? featuredAll.filter((f) => eventCards([f], kind).length > 0) : featuredAll), [featuredAll, kind]);
  const passes = useMemo(() => shownOpps.filter((o) => !isLive(o)), [shownOpps]);
  const shownGames = useMemo(() => games.filter((g) => (!sportFilter || g.slug === sportFilter) && inWindow(g.item.start_time_utc, now, win) && matches(`${g.label} ${g.item.competition ?? ''}`, q)).sort((a, b) => (b.opps > 0 ? 1 : 0) - (a.opps > 0 ? 1 : 0) || a.item.start_time_utc.localeCompare(b.item.start_time_utc)), [games, sportFilter, win, q, now]);
  const byDay = useMemo(() => {
    const m = new Map<string, GameRow[]>();
    for (const g of [...shownGames].sort((a, b) => a.item.start_time_utc.localeCompare(b.item.start_time_utc))) m.set(dayLabel(g.item.start_time_utc), [...(m.get(dayLabel(g.item.start_time_utc)) ?? []), g]);
    return [...m.entries()];
  }, [shownGames]);
  const phone = usePhone();
  const [showAll, setShowAll] = useState(false);
  const GAME_CAP = 24;
  const verdicts = useMemo(() => all.verdicts.filter((v) => !sportFilter || v.slug === sportFilter).map((v) => ({ ...v, opportunities: featured.filter((f) => f.lead.slug === v.slug).length })), [all.verdicts, sportFilter, featured]);
  const countBySport = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of games) if (inWindow(g.item.start_time_utc, now, win)) m.set(g.slug, (m.get(g.slug) ?? 0) + 1);
    return m;
  }, [games, win, now]);
  const today = new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const liveCount = all.opportunities.filter(isLive).filter((o) => inWindow(o.startTime, now, win)).length;

  return (
    <div className="page home ghome mktboard">
      <header className="hbar">
        <h1 className="hbar__h">Market board</h1>
        <span className="hbar__m">{today}{!all.loading && <> · <b>{games.filter((g) => inWindow(g.item.start_time_utc, now, win)).length}</b> games {WINDOW_WORD[win].toLowerCase()} across {countBySport.size} sports · <b>{liveCount}</b> {liveCount === 1 ? 'opportunity' : 'opportunities'} the publications flag</>}</span>
      </header>

      {phone ? (
        <PhoneControls
          sportFilter={sportFilter} setSport={(v) => set('sport', v)} countBySport={countBySport}
          win={win} setWin={(w) => set('when', w === 'today' ? null : w)}
          status={status} setStatus={(v) => set('status', v ? 'all' : null)}
          kind={kind} setKind={(k) => set('type', k)} kindCounts={counts} allCount={featuredAll.length}
          q={q} setQ={setQ} view={view} setView={(v) => set('view', v === 'cards' ? 'cards' : null)} resultCount={featured.length}
        />
      ) : (
    <div className="ghome__filters" role="group" aria-label="Filters">
          <div className="ghome__row">
            <div className="skchips" role="group" aria-label="Sport">
              <button type="button" className={`skchip${!sportFilter ? ' is-on' : ''}`} onClick={() => set('sport', null)}>All sports</button>
              {NAV_SPORTS.filter((s) => s.status !== 'planned').map((s) => (
                <button key={s.slug} type="button" className={`skchip${sportFilter === s.slug ? ' is-on' : ''}`} style={{ ['--accent' as string]: s.accent }} onClick={() => set('sport', sportFilter === s.slug ? null : s.slug)} aria-pressed={sportFilter === s.slug}>
                  <SportMark slug={s.slug} icon={s.icon} size={14} />{s.label}{countBySport.get(s.slug) ? <small>{countBySport.get(s.slug)}</small> : null}
                </button>
              ))}
            </div>
          </div>
          <div className="ghome__row">
            <div className="skchips" role="group" aria-label="When">
              {(['today', 'tomorrow', 'week'] as Window[]).map((w) => <button key={w} type="button" className={`skchip${win === w ? ' is-on' : ''}`} onClick={() => set('when', w === 'today' ? null : w)} aria-pressed={win === w}>{WINDOW_WORD[w]}</button>)}
              <span aria-hidden="true" style={{ width: 6 }} />
              <button type="button" className={`skchip${status === 'all' ? ' is-on' : ''}`} onClick={() => set('status', status === 'all' ? null : 'all')} aria-pressed={status === 'all'}>Include passes</button>
            </div>
            <label className="ghome__search"><Icon name="search" size={16} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Team, player or competition" aria-label="Filter games and opportunities by team, player or competition" /></label>
          </div>
          <div className="ghome__row">
            <div className="skchips" role="group" aria-label="Market type">
              <button type="button" className={`skchip${!kind ? ' is-on' : ''}`} aria-pressed={!kind} onClick={() => set('type', null)}>All markets <small>{featuredAll.length}</small></button>
              {KIND_ORDER.filter((k) => counts[k] > 0).map((k) => (
                <button key={k} type="button" className={`skchip${kind === k ? ' is-on' : ''}`} aria-pressed={kind === k} onClick={() => set('type', kind === k ? null : k)}>{KIND_WORD[k]} <small>{counts[k]}</small></button>
              ))}
            </div>
            <div className="seg seg--tight" role="group" aria-label="View">
              <button type="button" className={`seg__b${view === 'browse' ? ' is-on' : ''}`} aria-pressed={view === 'browse'} onClick={() => set('view', null)}>Browse</button>
              <button type="button" className={`seg__b${view === 'cards' ? ' is-on' : ''}`} aria-pressed={view === 'cards'} onClick={() => set('view', 'cards')}>Full cards</button>
            </div>
          </div>
        </div>
      )}

      {(!sportFilter || sportFilter === 'nfl') && (
        <Link to={routes.parlays('nfl')} className="lsd-promo lmb__promo">
          <span className="lsd-promo__ic" aria-hidden="true"><Icon name="parlays" size={18} /></span>
          <span><b>NFL teasers & parlays</b><small>This week's Stanford Wong teaser legs, each with the Kalshi contract that settles the teased line. Research, never combined into a bet.</small></span>
          <Icon name="arrowRight" size={16} />
        </Link>
      )}

      <section className="sksec" aria-labelledby="opps-h">
        <div className="sksec__h">
          <div><h2 id="opps-h" className="sksec__t">{WINDOW_WORD[win]}’s opportunities</h2><p className="sksec__s">{phone ? <>What a publication flags, with its price, fee-aware break-even and evidence. Research candidates are research only. <Link to="/status">How this is decided</Link>.</> : <>Only what a publication itself flags, with its executable price, the fee-aware break-even, its own bet-up-to, the evidence and what beats it. Research candidates are research only. <Link to="/status">How this is decided</Link>.</>}</p></div>
          <span className="ghome__count">{featured.length} featured{passes.length && status === 'all' ? ` · ${passes.length} passes` : ''}</span>
        </div>
        {all.loading && <Skeleton lines={5} tall />}
        {!all.loading && view === 'cards' && <OpportunityBoard featured={featured} verdicts={verdicts} now={now} loading={all.loading} emptyText={sportFilter || q || kind ? 'Nothing matches these filters. Clear a filter or widen the window.' : undefined} />}
        {!all.loading && view === 'browse' && <BrowseBoard featured={featured} verdicts={verdicts} now={now} loading={all.loading} emptyText={sportFilter || q || kind ? 'Nothing matches these filters. Clear a filter or widen the window.' : undefined} />}
        {status === 'all' && passes.length > 0 && (
          <details className="skdeep">
            <summary className="skdeep__s">{passes.length} contracts the publications judged and passed on<Icon name="chevronDown" size={14} /></summary>
            <div className="skdeep__b">
              <ul className="lims">{passes.slice(0, 40).map((o) => <li key={o.id}><Link to={o.href} title={betPhrase(o.what.side, o.what.title).exact}>{betPhrase(o.what.side, o.what.title).text}</Link> <span className="muted">· {o.eventLabel} · {o.statusReason}</span></li>)}</ul>
            </div>
          </details>
        )}
      </section>

      <div className="home__grid">
        <section className="sksec" aria-labelledby="games-h" style={{ gridColumn: '1 / -1' }}>
          <div className="sksec__h">
            <div><h2 id="games-h" className="sksec__t">{WINDOW_WORD[win]}’s games</h2><p className="sksec__s">Every game on the publications’ boards, games carrying an opportunity first, then by start time. Tap one for its research.</p></div>
            <span className="ghome__count">{shownGames.length} games</span>
          </div>
          {all.loading && <Skeleton lines={6} />}
          {!all.loading && shownGames.length === 0 && <p className="muted">No game in this window{sportFilter ? ' for this sport' : ''}.</p>}
          <div className="ghome__games">
            {byDay.map(([day, rows]) => {
              const shown = showAll ? rows : rows.slice(0, Math.max(0, GAME_CAP - 0));
              return (
                <div key={day} className="ghome__day">
                  <h3 className="ghome__dayh">{day} <span className="muted">· {rows.length}</span></h3>
                  {shown.map((g) => {
                    const nav = navSport(g.slug);
                    const { home, away } = sides(g.item);
                    return (
                      <Link key={g.item.event_id} to={routes.game(g.slug, g.item.event_id)} className="gm" aria-label={`${g.label}, ${nav?.label ?? g.sport}, ${timeLabel(g.item.start_time_utc)}`}>
                        <span className="gm__t num">{timeLabel(g.item.start_time_utc)}</span>
                        <span className="gm__sport" style={{ ['--accent' as string]: nav?.accent }}>{nav && <SportMark slug={g.slug} icon={nav.icon} size={14} />}{nav?.label ?? g.sport}</span>
                        <span className="gm__m"><span className="gm__n">{g.label}</span><span className="gm__s">{g.item.competition ?? ''}{home && away && g.sport !== 'SOCCER' ? ` · ${away.display_name} at ${home.display_name}` : ''}</span></span>
                        <span className="gm__x">{phaseWord(g.item, now) ?? (g.opps > 0 ? <Pill tone="research">{g.opps} {g.opps === 1 ? 'candidate' : 'candidates'}</Pill> : <span>{g.item.markets_available ? <><b className="num">{g.item.markets_available}</b> markets</> : 'no markets yet'}</span>)}</span>
                      </Link>
                    );
                  })}
                  {!showAll && rows.length > GAME_CAP && <button type="button" className="btn btn--sm btn--ghost" onClick={() => setShowAll(true)}>Show all {rows.length} games</button>}
                </div>
              );
            })}
          </div>
        </section>
        <YourResearch />
      </div>
    </div>
  );
}

/** Phone filters: sport chips and search stay on screen; day, market type and passes live in one bottom sheet, with the active ones shown beside it. */
function PhoneControls(p: {
  sportFilter: string | null; setSport: (v: string | null) => void; countBySport: Map<string, number>;
  win: Window; setWin: (w: Window) => void; status: StatusFilter; setStatus: (includePasses: boolean) => void;
  kind: MarketKind | null; setKind: (k: MarketKind | null) => void; kindCounts: Record<MarketKind, number>; allCount: number;
  q: string; setQ: (v: string) => void; view: 'browse' | 'cards'; setView: (v: 'browse' | 'cards') => void; resultCount: number;
}) {
  const [open, setOpen] = useState(false);
  const active = (p.win !== 'today' ? 1 : 0) + (p.kind ? 1 : 0) + (p.status === 'all' ? 1 : 0);
  const reset = () => { p.setWin('today'); p.setKind(null); p.setStatus(false); };
  return (
    <div className="mkc" role="group" aria-label="Filters">
      <div className="skchips mkc__sports" role="group" aria-label="Sport">
        <button type="button" className={`skchip${!p.sportFilter ? ' is-on' : ''}`} aria-pressed={!p.sportFilter} onClick={() => p.setSport(null)}>All sports</button>
        {NAV_SPORTS.filter((s) => s.status !== 'planned' && (p.countBySport.get(s.slug) || p.sportFilter === s.slug)).map((s) => (
          <button key={s.slug} type="button" className={`skchip${p.sportFilter === s.slug ? ' is-on' : ''}`} style={{ ['--accent' as string]: s.accent }} onClick={() => p.setSport(p.sportFilter === s.slug ? null : s.slug)} aria-pressed={p.sportFilter === s.slug}>
            <SportMark slug={s.slug} icon={s.icon} size={14} />{s.label}{p.countBySport.get(s.slug) ? <small>{p.countBySport.get(s.slug)}</small> : null}
          </button>
        ))}
      </div>
      <div className="mkc__row">
        <label className="ghome__search mkc__search"><Icon name="search" size={16} /><input type="search" value={p.q} onChange={(e) => p.setQ(e.target.value)} placeholder="Team, player or competition" aria-label="Filter games and opportunities by team, player or competition" /></label>
        <button type="button" className={`mkc__btn${active ? ' is-on' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          <Icon name="sliders" size={16} /> Filters{active ? <b className="mkc__n" aria-label={`${active} active`}>{active}</b> : null}
        </button>
      </div>
      <div className="mkc__row mkc__row--sum">
        <div className="mkc__active" role="group" aria-label="Active filters">
          <button type="button" className="mkc__tag" onClick={() => setOpen(true)} aria-label={`Day: ${WINDOW_WORD[p.win]}. Change`}>{WINDOW_WORD[p.win]}</button>
          {p.kind && <button type="button" className="mkc__tag is-removable" onClick={() => p.setKind(null)} aria-label={`Remove market type filter: ${KIND_WORD[p.kind]}`}>{KIND_WORD[p.kind]} <Icon name="close" size={12} /></button>}
          {p.status === 'all' && <button type="button" className="mkc__tag is-removable" onClick={() => p.setStatus(false)} aria-label="Remove filter: include passes">Passes <Icon name="close" size={12} /></button>}
        </div>
        <div className="seg seg--tight mkc__view" role="group" aria-label="View">
          <button type="button" className={`seg__b${p.view === 'browse' ? ' is-on' : ''}`} aria-pressed={p.view === 'browse'} onClick={() => p.setView('browse')}>Browse</button>
          <button type="button" className={`seg__b${p.view === 'cards' ? ' is-on' : ''}`} aria-pressed={p.view === 'cards'} onClick={() => p.setView('cards')}>Full cards</button>
        </div>
      </div>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Filters" className="mkc__sheet"
        footer={<><button type="button" className="btn" onClick={reset} disabled={!active}>Reset</button><button type="button" className="btn btn--primary mkc__done" onClick={() => setOpen(false)}>Show {p.resultCount} featured</button></>}>
        <fieldset className="mkc__group"><legend>Day</legend>
          <div className="mkc__opts" role="group" aria-label="Day">{(['today', 'tomorrow', 'week'] as Window[]).map((w) => <button key={w} type="button" className={`skchip${p.win === w ? ' is-on' : ''}`} aria-pressed={p.win === w} onClick={() => p.setWin(w)} data-autofocus={p.win === w ? '' : undefined}>{WINDOW_WORD[w]}</button>)}</div>
        </fieldset>
        <fieldset className="mkc__group"><legend>Market type</legend>
          <div className="mkc__opts" role="group" aria-label="Market type">
            <button type="button" className={`skchip${!p.kind ? ' is-on' : ''}`} aria-pressed={!p.kind} onClick={() => p.setKind(null)}>All markets <small>{p.allCount}</small></button>
            {KIND_ORDER.filter((k) => p.kindCounts[k] > 0 || p.kind === k).map((k) => <button key={k} type="button" className={`skchip${p.kind === k ? ' is-on' : ''}`} aria-pressed={p.kind === k} onClick={() => p.setKind(p.kind === k ? null : k)}>{KIND_WORD[k]} <small>{p.kindCounts[k]}</small></button>)}
          </div>
        </fieldset>
        <fieldset className="mkc__group"><legend>Passes</legend>
          <label className="mkc__switch"><input type="checkbox" checked={p.status === 'all'} onChange={(e) => p.setStatus(e.target.checked)} /><span><b>Include passes</b><small>Also list contracts the publications judged and passed on.</small></span></label>
        </fieldset>
      </BottomSheet>
    </div>
  );
}
