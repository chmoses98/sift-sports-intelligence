// v4 Game Command Center: the scoreboard and four tabs (Live, Matchups, Players, Markets) over the app's existing
// published research. Where the contract has no live data (scores, clock, plays, down and distance) the tab says so;
// the pregame research is shown as frozen once the game has started, exactly as the rest of the app treats it.
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams, useLocation } from '../routing';
import { useAsync } from '../data/hooks';
import { SportRepo } from '../data/repo';
import { resolveSource } from '../data/source';
import { sportBySlug } from '../data/sports';
import { NAV_SPORTS } from '../data/nav';
import type { EventResearchDoc, Market } from '../contract/types';
import { useLiveQuotes, useNow } from '../live/hooks';
import { classifyQuoteAge, formatQuoteAgo, quoteAgeMs, quoteFreshness, worstQuote } from '../live/freshness';
import { overlayMarket } from '../live/overlay';
import { heroInputFor } from '../lib/hero/input';
import { resolveHero } from '../lib/hero/resolve';
import { gameSides } from '../insights/game';
import { matchupInsights } from '../insights/matchups';
import { propCards, rangeText } from '../insights/props';
import { useAuthority } from '../data/projections';
import { gameScripts, sharePct } from '../lib/scripts';
import { gameWeather, weatherLine } from '../views/game/Hero';
import { marketLabel, priceRow, centsText, type PriceRow } from '../lib/gamedata';
import { latestPrices } from '../components/MarketBoard';
import { broadcastPlayerPhoto } from '../components/sift2/playerArt';
import { teamName } from '../components/sift2/GameList';
import { competitionWord, type GameRow } from '../views/broadcast/games';
import { useCardFacts } from '../views/broadcast/GameCard';
import { routes } from '../lib/routes';
import { Icon } from './Icon';
import { agoWord, authorityWord } from './words';
import { Crest } from './base';
import { Scoreboard } from './Scoreboard';
import { useFinal } from './parts';
import { contractWords, useResearch } from './ResearchSheet';
import { SlateStates, useSlate } from './slate';
import { useStageColours } from './Feature';
import { isLiveGame } from './model';
import type { Opportunity } from '../opportunity/types';

type Tab = 'live' | 'matchups' | 'players' | 'markets';
const TABS: [Tab, string][] = [['live', 'Live'], ['matchups', 'Matchups'], ['players', 'Players'], ['markets', 'Markets']];

/** One game's published research and market documents, through its sport's own resolved source. */
function useGameData(slug: string, eventId: string) {
  return useAsync(`v4game:${slug}:${eventId}`, async () => {
    const sport = sportBySlug(slug);
    if (!sport) return { research: null, detail: null };
    const repo = new SportRepo(await resolveSource(sport));
    if (!repo.hasExplorer) return { research: null, detail: null };
    const [research, detail] = await Promise.all([repo.eventResearch(eventId).catch(() => null), repo.eventDetail(eventId).catch(() => null)]);
    return { research, detail };
  });
}

const Unavailable = ({ title, children, icon = 'cloud-slash' }: { title: string; children: React.ReactNode; icon?: 'cloud-slash' | 'info' | 'hourglass-medium' }) => (
  <div className="v4-note"><Icon name={icon} /><div><b>{title}</b>{children}</div></div>
);

export function V4Game() {
  const { slug = '', eventId = '' } = useParams();
  const { rows, loading: boardLoading, unavailable, failed } = useSlate();
  const g = useMemo(() => rows.find((r) => r.slug === slug && r.item.event_id === eventId) ?? null, [rows, slug, eventId]);
  const data = useGameData(slug, eventId);
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const loc = useLocation();
  const now = useNow(15_000);
  const research = data.data?.research ?? null;
  const detail = data.data?.detail ?? null;
  const stage = useStageColours(g, research);
  const final = useFinal(g ?? ({ phase: 'PREGAME' } as GameRow), !!g);
  const { facts } = useCardFacts((g ?? ({ sport: '', item: {}, opps: [], phase: 'PREGAME' } as unknown as GameRow)), !!g);

  const spec = useMemo(() => {
    if (!g) return null;
    try { return resolveHero(heroInputFor(g.item, research, g.sport)); } catch { return null; }
  }, [g, research]);

  const settled = !!g && (g.phase === 'FINAL' || g.phase === 'POSTPONED' || g.phase === 'CANCELLED' || (g.phase === 'STARTED' && g.stale));
  const published = detail?.markets;
  const tickers = useMemo(() => (published ?? []).map((m) => m.kalshi_ticker), [published]);
  const events = useMemo(() => (settled ? [] : [...new Set((published ?? []).map((m) => m.kalshi_event_ticker).filter((e): e is string => !!e))]), [published, settled]);
  const live = useLiveQuotes(tickers, settled ? 'background' : 'game', events);
  const quoted = useMemo(() => (published ?? []).map((m) => overlayMarket(m as Market, live.quote(m.kalshi_ticker))), [published, live]);

  const tab = (TABS.find(([k]) => k === sp.get('tab'))?.[0] ?? (g && isLiveGame(g) ? 'live' : 'matchups')) as Tab;
  const setTab = (t: Tab) => setSp((p) => { const n = new URLSearchParams(p); n.set('tab', t); return n; }, { replace: true });
  const back = () => (loc.key !== 'default' ? nav(-1) : nav('/v4'));

  const sport = NAV_SPORTS.find((s) => s.slug === slug)?.label ?? slug.toUpperCase();
  const hosted = spec?.context === 'home' || spec?.context === 'home-elsewhere';
  const awayN = spec?.away?.short ?? (g ? teamName(g.away) : '');
  const homeN = spec?.home?.short ?? (g ? teamName(g.home) : '');
  const frozen = !!g && g.phase !== 'PREGAME' && g.phase !== 'NO_START';
  const fresh = useMemo(() => worstQuote(quoted.filter((m) => m.captured_at).map((m) => quoteFreshness(m.captured_at, now))), [quoted, now]);
  const freshest = useMemo(() => Math.min(...quoted.map((m) => quoteAgeMs(m.captured_at, now)).filter((x): x is number => x != null), Infinity), [quoted, now]);

  const header = (
    <div className="v4-gtop">
      <button type="button" className="v4-gbtn" aria-label="Back" onClick={back}><Icon name="caret-left" /></button>
      <span className="v4-spacer" />
    </div>
  );
  if (boardLoading || (g && data.loading && !data.data)) {
    return <div><div className="v4-stage">{header}<div className="v4-gboard"><div className="v4-skel" style={{ height: 150, borderRadius: 22 }} role="status" aria-label="Loading game" /></div></div></div>;
  }
  if (!g) {
    return (
      <div><div className="v4-stage">{header}</div>
        <div style={{ paddingTop: 8 }}>
          {unavailable ? <SlateStates loading={false} unavailable failed={failed} empty={false} emptyText="" />
            : <Unavailable title="This game is not on the published board" icon="info">It may be outside the publication's window, or the address may be wrong. <br /><Link to="/v4/games" className="v4-btn" style={{ marginTop: 12 }}>Browse games</Link></Unavailable>}
        </div>
      </div>
    );
  }
  const status = isLiveGame(g) ? 'LIVE' : g.phase === 'FINAL' ? 'FINAL' : g.phase === 'STARTED' ? 'AWAITING RESULT' : g.phase === 'PREGAME' || g.phase === 'NO_START' ? 'UPCOMING' : g.phase;
  const venue = spec?.venue?.name ?? null;
  return (
    <div>
      <div className="v4-stage" style={stage}>
        {header}
        <div className="v4-gctx">
          <span className="meta">{competitionWord(g.item.competition, sport)}{venue ? ` · ${venue}` : ''}</span>
          <span className={`v4-badge${isLiveGame(g) ? ' v4-badge--live' : ''}`}>{status}</span>
        </div>
        <div className="v4-gboard">
          <Scoreboard g={g} away={awayN} home={homeN} awayRec={facts.away.record} homeRec={facts.home.record} final={final} hosted={hosted} />
        </div>
        <div className="v4-gstat">
          <span><i className={`v4-dot${quoted.length === 0 ? ' v4-dot--off' : fresh === 'FRESH' ? '' : ' v4-dot--stale'}`} />{quoted.length === 0 ? 'No prices published' : fresh === 'FRESH' ? `Prices live · ${formatQuoteAgo(freshest)}` : fresh === 'AGING' ? `Prices aging · ${formatQuoteAgo(freshest)}` : `Prices stale · ${formatQuoteAgo(freshest)}`}</span>
          <span><i className={`v4-dot${frozen ? ' v4-dot--frozen' : ''}`} />{frozen ? 'Research frozen at kickoff' : 'Pregame research'}</span>
        </div>
      </div>

      <div className="v4-gtabs" role="tablist" aria-label="Game sections">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" id={`v4t-${k}`} aria-selected={tab === k} aria-controls="v4-panel" tabIndex={tab === k ? 0 : -1} className="v4-gtab" onClick={() => setTab(k)}
            onKeyDown={(e) => { const i = TABS.findIndex(([x]) => x === tab); if (e.key === 'ArrowRight') setTab(TABS[(i + 1) % 4][0]); if (e.key === 'ArrowLeft') setTab(TABS[(i + 3) % 4][0]); }}>
            {k === 'live' && isLiveGame(g) && <i className="v4-livedot" aria-hidden="true" />}{label}
          </button>
        ))}
      </div>
      <div className="v4-panel" role="tabpanel" id="v4-panel" aria-labelledby={`v4t-${tab}`} tabIndex={-1}>
        {tab === 'live' && <LiveTab g={g} final={final} spec={spec} research={research} awayN={awayN} homeN={homeN} />}
        {tab === 'matchups' && <MatchupsTab research={research} loading={data.loading} sport={sport} />}
        {tab === 'players' && <PlayersTab g={g} research={research} markets={quoted} detail={detail} sport={sport} now={now} />}
        {tab === 'markets' && <MarketsTab g={g} research={research} markets={quoted} detail={detail} now={now} settled={settled} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ signals (published research on this game)

function Signals({ g, limit }: { g: GameRow; limit?: number }) {
  const open = useResearch();
  const list = g.opps.filter((o) => o.status !== 'PASS');
  const shown = limit ? list.slice(0, limit) : list;
  if (!list.length) return null;
  const frozen = g.phase !== 'PREGAME' && g.phase !== 'NO_START';
  return (
    <section aria-label="Published research">
      <header className="v4-sechead"><h2>Research</h2><span className="v4-sechead__n">{list.length}</span></header>
      <ul className="v4-grp">
        {shown.map((o: Opportunity) => (
          <li key={o.id}>
            <button type="button" className="v4-link" style={{ margin: 0, width: '100%', borderRadius: 0, boxShadow: 'none', background: 'none' }} onClick={() => open(o, g)} aria-label={`Open research: ${contractWords(o)}`}>
              <span className={`v4-sig${frozen ? ' v4-sig--frozen' : ''}`} style={{ minWidth: 0, height: 'auto', width: 'auto' }}><span className="v4-sig__p"><Icon name="pulse" /></span></span>
              <span className="v4-link__t"><b>{contractWords(o)}</b><span>{frozen ? 'Pregame research · frozen' : authorityWord(o.authority)}</span></span>
              <Icon name="caret-right" size="s" />
            </button>
          </li>
        ))}
      </ul>
      {limit && list.length > limit && <p className="meta" style={{ padding: '8px 16px 0' }}>{list.length - limit} more in Markets</p>}
    </section>
  );
}

// ------------------------------------------------------------------ Live

function LiveTab({ g, final, spec, research, awayN, homeN }: { g: GameRow; final: ReturnType<typeof useFinal>; spec: ReturnType<typeof resolveHero> | null; research: EventResearchDoc | null; awayN: string; homeN: string }) {
  const live = isLiveGame(g);
  const pre = g.phase === 'PREGAME' || g.phase === 'NO_START';
  const wx = research && spec?.venue !== undefined ? weatherLine(gameWeather(research, spec?.venue ?? null)) : null;
  const when = Number.isFinite(g.startMs) ? new Date(g.startMs).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Time to be confirmed';
  return (
    <>
      <div className="v4-card">
        <h3>{live ? 'In play' : pre ? 'Game day' : g.phase === 'FINAL' ? 'Final' : g.phase === 'STARTED' ? 'Started, no final yet' : g.phase === 'POSTPONED' ? 'Postponed' : g.phase === 'CANCELLED' ? 'Cancelled' : 'Suspended'}</h3>
        <div style={{ marginTop: 8 }}>
          <div className="v4-kv"><span className="v4-kv__k">{pre ? 'Kickoff' : 'Started'}</span><span className="v4-kv__v">{when}</span></div>
          {spec?.venue && <div className="v4-kv"><span className="v4-kv__k">Venue</span><span className="v4-kv__v">{spec.venue.name}{spec.venue.city && <em>{spec.venue.city}{spec.venue.roof ? ` · ${spec.venue.roof}` : ''}</em>}</span></div>}
          {wx && <div className="v4-kv"><span className="v4-kv__k">Conditions</span><span className="v4-kv__v">{wx}</span></div>}
          {final && <div className="v4-kv"><span className="v4-kv__k">Final score</span><span className="v4-kv__v">{awayN} {final.away} · {homeN} {final.home}</span></div>}
          {g.phase === 'FINAL' && !final && <div className="v4-kv"><span className="v4-kv__k">Final score</span><span className="v4-kv__v">Not published</span></div>}
        </div>
      </div>
      {(live || g.phase === 'STARTED') && (
        <Unavailable title="Live score, clock and plays are unavailable" icon="hourglass-medium">
          SIFT's published research does not carry a live score, game clock, down and distance or play-by-play. They appear here when the live-score feed is connected; nothing is estimated in the meantime.
        </Unavailable>
      )}
      {pre && (
        <Unavailable title="Live details start at kickoff" icon="info">
          Score, clock and plays are not part of pregame research. The research below is what the publication has published so far.
        </Unavailable>
      )}
      <Signals g={g} limit={3} />
    </>
  );
}

// ------------------------------------------------------------------ Matchups

function MatchupsTab({ research, loading, sport }: { research: EventResearchDoc | null; loading: boolean; sport: string }) {
  const sides = useMemo(() => (research ? gameSides(research) : null), [research]);
  const insights = useMemo(() => (research && sides ? matchupInsights(research, {}, sides).slice(0, 5) : []), [research, sides]);
  const scripts = useMemo(() => (research ? gameScripts(research) : null), [research]);
  if (loading) return <div className="v4-card"><div className="v4-skel" style={{ height: 90 }} role="status" aria-label="Loading matchup research" /></div>;
  if (!research || !sides) return <Unavailable title="Matchup research is not published for this game">{sport} matchup data is not available from the publication for this game. Markets and any published research signals are still available.</Unavailable>;
  return (
    <>
      {insights.length > 0 ? (
        <section aria-label="Matchup edges">
          <header className="v4-sechead"><h2>Matchup edges</h2></header>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {insights.map((m) => (
              <article key={m.id} className="v4-card">
                <span className="over">{m.areaLabel}</span>
                <h3 style={{ marginTop: 4 }}>{m.headline}</h3>
                <div className="v4-kv" style={{ marginTop: 8 }}><span className="v4-kv__k">{m.offense.team.abbr} {m.offense.unit}</span><span className="v4-kv__v">{m.offense.rank.text}<em>{m.offense.rank.tierWord}</em></span></div>
                <div className="v4-kv"><span className="v4-kv__k">{m.defense.team.abbr} {m.defense.unit}</span><span className="v4-kv__v">{m.defense.rank.text}<em>{m.defense.rank.tierWord}</em></span></div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <Unavailable title="No published matchup edges" icon="info">The publication lists no ranked unit-versus-unit edges for this game.</Unavailable>
      )}
      {scripts && scripts.scripts.length > 0 && (
        <section aria-label="Simulated game scripts">
          <header className="v4-sechead"><h2>How it could unfold</h2></header>
          <div className="v4-card">
            <p style={{ marginTop: 0 }}>Share of simulated games ending each way. Model output, not a prediction of this game.</p>
            <ul style={{ marginTop: 8 }}>
              {scripts.scripts.map((s) => (
                <li key={s.id} className="v4-kv" style={{ display: 'block' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span className="v4-kv__v" style={{ textAlign: 'left' }}>{s.name}</span><span className="num" style={{ color: 'var(--model)' }}>{sharePct(s.share)}</span></div>
                  <div className="v4-duel__h" style={{ marginTop: 6, height: 6 }}><i style={{ width: `${Math.max(2, s.share * 100)}%`, height: '100%', background: 'var(--model)' }} /></div>
                  <span className="meta" style={{ display: 'block', marginTop: 4 }}>{s.line}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Players

function PlayersTab({ g, research, markets, detail, sport, now }: { g: GameRow; research: EventResearchDoc | null; markets: Market[]; detail: { markets: Market[] } | null; sport: string; now: number }) {
  const { authority, ready } = useAuthority(g.sport);
  const sides = useMemo(() => (research ? gameSides(research) : null), [research]);
  const cards = useMemo(() => (research && detail && ready && sides ? propCards(research, markets.length ? markets : detail.markets, sides, authority) : []), [research, detail, markets, ready, sides, authority]);
  const players = useMemo(() => {
    const m = new Map<string, typeof cards>();
    for (const c of [...cards].sort((a, b) => b.interest - a.interest)) m.set(c.playerId, [...(m.get(c.playerId) ?? []), c]);
    return [...m.values()].slice(0, 16);
  }, [cards]);
  const [open, setOpen] = useState<string | null>(null);
  if (!ready && research) return <div className="v4-card"><div className="v4-skel" style={{ height: 90 }} role="status" aria-label="Loading player research" /></div>;
  if (!players.length) return <Unavailable title="No player projections for this game">{sport} player projections are not published for this game. Where the publication has them they appear here with the Kalshi line beside the SIFT projection.</Unavailable>;
  return (
    <section aria-label="Players">
      <header className="v4-sechead"><h2>Players to watch</h2><span className="v4-sechead__n">{players.length}</span></header>
      <p className="meta" style={{ padding: '0 16px 10px' }}>SIFT's projection and Kalshi's line are shown apart: one is a model, the other a market price.</p>
      <ul className="v4-grp">
        {players.map((rows) => {
          const p = rows[0];
          const photo = broadcastPlayerPhoto(p.playerId, p.name, p.team.abbr, 'portrait');
          const isOpen = open === p.playerId;
          return (
            <li key={p.playerId}>
              <button type="button" className="v4-player" style={{ width: '100%', minHeight: 72 }} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.playerId)}>
                <span className="v4-player__ph">{photo ? <img src={photo.src} alt="" style={{ objectPosition: photo.focus }} loading="lazy" /> : <Crest sport={g.sport} p={p.team.home ? g.home : g.away} size="sm" />}</span>
                <span className="v4-player__t"><b>{p.name}</b><span>{p.team.abbr}{p.role ? ` · ${p.role}` : ''} · {rows.length} market{rows.length === 1 ? '' : 's'}</span></span>
                <Icon name={isOpen ? 'caret-down' : 'caret-right'} size="s" />
              </button>
              {isOpen && (
                <ul style={{ borderTop: '1px solid var(--line)' }}>
                  {rows.map((c) => {
                    const m = c.market;
                    const fr = m ? quoteFreshness(m.captured_at, now) : 'UNKNOWN';
                    return (
                      <li key={c.id} className="v4-quote" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
                        <b style={{ font: '600 15px/20px var(--f-ui)' }}>{c.statLabel}</b>
                        <span style={{ font: '500 13px/18px var(--f-ui)', color: 'var(--model)' }}>SIFT projection {c.projection}{c.unit ? ` ${c.unit}` : ''}{c.range ? ` · typical ${rangeText(c.range.typical, c.unit)}` : c.band ? ` · range ${Math.round(c.band.lo)}–${Math.round(c.band.hi)}` : ''}</span>
                        <span style={{ font: '500 13px/18px var(--f-ui)', color: m ? 'var(--mkt)' : 'var(--tx3)' }}>
                          {m && c.line != null ? `Kalshi line ${c.line}${m.yes_ask != null ? ` · Yes ${centsText(m.yes_ask)}` : ''}${m.no_ask != null ? ` · No ${centsText(m.no_ask)}` : ''} · ${m.captured_at ? `${agoWord(quoteAgeMs(m.captured_at, now))}${fr === 'STALE' ? ' (stale)' : ''}` : 'capture time not published'}` : 'No Kalshi line published'}
                        </span>
                      </li>
                    );
                  })}
                  <li style={{ padding: '4px 14px 12px' }}>
                    <a className="v4-textlink" href={`#/design/sift2${routes.props(g.slug, { game: g.item.event_id, player: p.playerId, stat: rows[0].stat })}`}>Full prop research in SIFT 2.0</a>
                  </li>
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ Markets

const GROUP_ORDER = ['spreads', 'totals', 'team_totals', 'props', 'halves', 'more'];
const GROUP_WORD: Record<string, string> = { spreads: 'Winner and spread', totals: 'Totals', team_totals: 'Team totals', props: 'Player props', halves: 'Halves and quarters', more: 'More markets' };

function MarketsTab({ g, research, markets, detail, now, settled }: { g: GameRow; research: EventResearchDoc | null; markets: Market[]; detail: { markets: Market[]; model_prices: Parameters<typeof latestPrices>[0] } | null; now: number; settled: boolean }) {
  const [picked, setGroup] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const prices = useMemo(() => latestPrices(detail?.model_prices ?? []), [detail]);
  const rows = useMemo<PriceRow[]>(() => {
    if (!research) return [];
    const home = research.participants.find((p) => p.home_away === 'HOME');
    const away = research.participants.find((p) => p.home_away === 'AWAY');
    const abbr = (pid: string | null) => research.event.participants.find((p) => p.participant_id === pid)?.short_name ?? (pid === home?.participant_id ? 'HOME' : pid === away?.participant_id ? 'AWAY' : null);
    return markets.map((m) => priceRow(m, prices, marketLabel(m, abbr, () => null), null))
      .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  }, [markets, prices, research]);
  const groups = useMemo(() => GROUP_ORDER.filter((k) => rows.some((r) => r.group === k)), [rows]);
  // Game lines first: the main winner / spread / total markets, not eight hundred alternates.
  const group = picked ?? groups[0] ?? 'all';
  const shown = rows.filter((r) => group === 'all' || r.group === group);
  const list = more ? shown : shown.slice(0, 20);
  return (
    <>
      <Signals g={g} />
      <section aria-label="Kalshi markets">
        <header className="v4-sechead"><h2>Kalshi markets</h2><span className="v4-sechead__n">{rows.length}</span></header>
        {rows.length === 0 ? (
          <Unavailable title="No markets published for this game" icon="info">The publication lists no Kalshi contracts for this game yet.</Unavailable>
        ) : (
          <>
            <p className="meta" style={{ padding: '0 16px 10px' }}>Asks are Kalshi prices to buy; Kalshi's fee is added at purchase. {settled ? 'This game is over, so prices are the last capture.' : 'Quotes older than 30 minutes are marked stale.'} Model figures are SIFT's research, not a recommendation.</p>
            <div className="v4-chips" role="group" aria-label="Market type" style={{ paddingTop: 0, paddingBottom: 10 }}>
              <button type="button" className="v4-chip" aria-pressed={group === 'all'} onClick={() => { setGroup('all'); setMore(false); }}>All <i>{rows.length}</i></button>
              {groups.map((k) => <button key={k} type="button" className="v4-chip" aria-pressed={group === k} onClick={() => { setGroup(k); setMore(false); }}>{GROUP_WORD[k] ?? k} <i>{rows.filter((r) => r.group === k).length}</i></button>)}
            </div>
            <ul className="v4-grp">
              {list.map((r) => {
                const fr = classifyQuoteAge(quoteAgeMs(r.m.captured_at, now));
                const stale = fr === 'STALE' || fr === 'UNKNOWN';
                return (
                  <li key={r.m.market_id} className="v4-quote">
                    <span className="v4-quote__t">
                      <b>{r.label}</b>
                      <span>
                        {r.model != null && <i style={{ fontStyle: 'normal', color: 'var(--model)' }}>Model {Math.round(r.model * 100)}% · </i>}
                        {r.m.captured_at ? <i style={{ fontStyle: 'normal', color: stale ? 'var(--tx3)' : 'var(--mkt)' }}>Kalshi {agoWord(quoteAgeMs(r.m.captured_at, now))}{stale ? ' · stale' : ''}</i> : 'Capture time not published'}
                      </span>
                    </span>
                    <span className={`v4-px${stale ? ' v4-px--stale' : ''}`} aria-label={`Yes ask ${centsText(r.m.yes_ask)}`}>{centsText(r.m.yes_ask)}<small>Yes</small></span>
                    <span className={`v4-px${stale ? ' v4-px--stale' : ''}`} aria-label={`No ask ${centsText(r.m.no_ask ?? null)}`}>{centsText(r.m.no_ask ?? null)}<small>No</small></span>
                  </li>
                );
              })}
            </ul>
            {shown.length > 20 && !more && <div style={{ padding: '10px 16px 0' }}><button type="button" className="v4-btn v4-btn--sec" style={{ width: '100%' }} onClick={() => setMore(true)}>Show all {shown.length}</button></div>}
          </>
        )}
      </section>
    </>
  );
}
