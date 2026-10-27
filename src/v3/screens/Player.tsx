// Player Research (locked designs P1 to P4). Route: /v3/player/:slug/:playerId. Everything the viewer can change (tab, statistic, line, window, every
// filter, the selected game) is in the address, so Back, a reload and Saved research restore it exactly; the filters and contract sheets are history
// entries that Back closes. Sports: football in full, basketball and hockey from their published box logs, baseball as prices only (capabilities.ts),
// everything else says it is not available. Evidence lanes are never blended: Market is the pre-fee Kalshi ask, History is the observed frequency,
// the SIFT model is shown only where the approval ledger lets it.
import { useEffect, useMemo } from 'react';
import { Link } from '../../routing';
import { routes } from '../nav/routes';
import { pushVisit, removeSaved, saveResearch, useSaved } from '../state/prefs';
import { findSaved } from '../model/saved';
import { gameWhen, rungLabel, savedChips, windowLabel } from '../model/playerResearch';
import { publishContracts, type ContractInfo } from '../ui/ContractSheet';
import { DataState } from '../ui/DataState';
import { Icon } from '../ui/Icon';
import { LockedRow, Tabs } from '../ui/atoms';
import { useSheet } from '../ui/Sheet';
import { FiltersSheet } from './player/FiltersSheet';
import { Hero, GameStrip, MiniBar, useGone, useHeroRef, useShortScreen } from './player/Header';
import { LadderSheet } from './player/LadderSheet';
import { LogTab } from './player/LogTab';
import { MatchupTab } from './player/MatchupTab';
import { TrendsTab } from './player/TrendsTab';
import { ChartCard, Decision, FilterChips, LadderCard, ObsCard, StatPills } from './player/Overview';
import { PropsTab } from './player/PropsTab';
import { publishView } from './player/shared';
import { filterPatch, usePlayerView } from './player/view';
import './player.css';

const TABS = (n: number) => [{ key: 'overview', label: 'Overview' }, { key: 'props', label: 'Props', badge: n || null }, { key: 'matchup', label: 'Matchup' }, { key: 'trends', label: 'Trends' }, { key: 'log', label: 'Log' }] as const;

export function Player() {
  const v = usePlayerView();
  const { vm } = v;
  const sheet = useSheet();
  const saved = useSaved();
  const heroRef = useHeroRef();
  const short = useShortScreen();
  const tab = v.state.tab;
  const gone = useGone(heroRef, tab !== 'matchup' && !short);

  // Sheets read the live view from here, never a copy taken when they opened.
  useEffect(() => { publishView(v); });
  useEffect(() => () => publishView(null), []);

  useEffect(() => {
    if (vm) pushVisit({ route: `/v3/player/${v.slug}/${encodeURIComponent(v.pid)}`, title: vm.name, subtitle: [v.slug.toUpperCase(), vm.team?.abbr, vm.position].filter(Boolean).join(' · '), kind: 'player', slug: v.slug, logo: vm.team?.logo });
  }, [vm?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // The exact-contract sheet resolves its ticker from what this screen publishes.
  useEffect(() => {
    if (!vm?.next) return;
    const g = vm.next;
    const when = vm.nextStartMs != null ? gameWhen(vm.nextStartMs, v.now) : '';
    const list: ContractInfo[] = [];
    for (const [key, p] of vm.props) {
      const s = vm.stats.find((x) => x.key === key);
      const word = (s?.label ?? p.statLabel).toLowerCase();
      const neighbours = p.rungs.map((r) => ({ ticker: r.price.ticker, label: `${rungLabel(r.line)} ${word}`, price: r.price }));
      for (const r of p.rungs) {
        list.push({
          ticker: r.price.ticker, title: `${vm.name}: ${rungLabel(r.line)} ${word}`, subtitle: `${g.away.abbr} at ${g.home.abbr}${when ? ` · ${when}` : ''} · Kalshi YES`,
          price: r.price, startMs: vm.nextStartMs, live: g.phase === 'live', neighbours,
          actions: [{ label: 'Game Detail', to: routes.game({ slug: g.slug, eventId: g.eventId }), primary: true }],
        });
      }
    }
    publishContracts(list);
  }, [vm?.props, vm?.next, vm?.nextStartMs]); // eslint-disable-line react-hooks/exhaustive-deps

  // The route that restores this exact research: the statistic and the line are written out (not left to defaults that can move).
  const route = useMemo(() => routes.player({ slug: v.slug, id: v.pid }, { tab: v.state.tab, stat: v.stat, line: v.committedLine, win: v.win, ...filterPatch(v.filters), view: v.state.view, rmode: v.state.rmode }), [v.slug, v.pid, v.state.tab, v.state.view, v.state.rmode, v.stat, v.committedLine, v.win, v.filters]);
  const savedItem = findSaved(saved, route);
  const toggleSave = () => {
    if (!vm || !v.stat) return;
    if (savedItem) { removeSaved(savedItem.id); return; }
    const total = vm.obs.length;
    const win = windowLabel(v.win, { opp: vm.opp?.abbr ?? null, season: vm.season, total });
    const where = vm.opp ? `${vm.nextHome === false ? 'at' : 'vs'} ${vm.opp.abbr}` : null;
    saveResearch({
      kind: 'player', sport: v.slug, route,
      title: `${vm.name} · ${v.statDef?.short ?? v.stat}${v.k != null ? ` ${v.k}+` : ''}`,
      subtitle: [win, ...v.filterChips.map((c) => c.label), where].filter(Boolean).join(' · '),
      chips: savedChips(win, v.filters, v.k),
      snapshot: [
        ...(v.hit.n ? [{ label: 'Hit rate', value: `${v.hit.over}/${v.hit.n}`, asOf: vm.asOf }] : []),
      ],
    });
  };

  const openFilters = () => sheet.open('Research filters', <FiltersSheet />, { tall: true });
  const openLadder = () => sheet.open('Alt lines', <LadderSheet />, { tall: true });

  if (v.loading) return <div className="v3p"><div className="v3-page"><div className="v3-skel" style={{ height: 220 }} role="status" aria-label="Loading player" /></div></div>;
  if (!vm && v.error) {
    return (
      <div className="v3p"><div className="v3-page">
        <DataState title="Player research unavailable" err={v.error} retry={v.retry} alert>The player's research</DataState>
        <p className="v3-note"><Link to="/v3/explore" style={{ color: 'var(--sift-cyan)' }}>Search players</Link></p>
      </div></div>
    );
  }
  if (!vm) {
    return (
      <div className="v3p"><div className="v3-page"><div className="v3-state"><Icon name="info" size={20} /><div>
        <b>Player research is not available</b>{v.noExplorer ? `The ${v.slug.toUpperCase()} publication carries no player profiles yet.` : 'This player is not in the publication.'}<br />
        <Link to="/v3/explore" style={{ color: 'var(--sift-cyan)' }}>Search players</Link>
      </div></div></div></div>
    );
  }

  const flow = (tab === 'matchup' || short) && v.researchReady;
  const top = (
    <>
      <MiniBar v={v} saved={!!savedItem} onSave={toggleSave} shown={gone} inflow={flow} short={short} />
      {!flow && <Hero v={v} saved={!!savedItem} onSave={toggleSave} heroRef={heroRef} />}
      {!(tab === 'matchup' && v.researchReady) && <GameStrip v={v} />}
    </>
  );

  // Prices only (baseball) or not supported: the player, the game and the listed contracts, no chart and no invented research.
  if (!v.researchReady) {
    return (
      <div className="v3p" data-sport={vm.sport}>
        {top}
        <div className="v3p-body">
          <LockedRow title="Research:">{v.researchWhy ?? 'This sport has no published player research yet.'}</LockedRow>
          <PropsTab v={v} priceOnly />
        </div>
      </div>
    );
  }

  const noLog = vm.why != null && vm.obs.length === 0;
  return (
    <div className="v3p" data-sport={vm.sport} data-tab={tab} data-short={short || undefined}>
      {top}
      <Tabs tabs={TABS(vm.props.size)} value={tab} onChange={(k) => v.set({ tab: k, obs: null, view: 'main', more: false })} label="Player sections" />
      <div className="v3p-body">
        {v.marketsError != null && (tab === 'overview' || tab === 'props') && <DataState title="Kalshi prices unavailable" err={v.marketsError} retry={v.marketsRetry}>The contract list for his next game</DataState>}
        {tab === 'overview' && (
          noLog ? (
            <>{v.histError != null ? <DataState title="Game history unavailable" err={v.histError} retry={v.histRetry}>The game log</DataState> : <div className="v3-state"><Icon name="info" size={20} /><div><b>No game history to chart</b>{vm.why}</div></div>}<PropsTab v={v} priceOnly /></>
          ) : v.stat ? (
            <>
              <StatPills v={v} onFilters={openFilters} />
              <FilterChips v={v} />
              <Decision v={v} onLadder={openLadder} onFilters={openFilters} />
              <ChartCard v={v} onLadder={openLadder} />
              <ObsCard v={v} />
              <LadderCard v={v} onAll={openLadder} />
            </>
          ) : <div className="v3p-empty" role="status"><b>No statistic to chart</b>This player has no published statistic for this sport yet.</div>
        )}
        {tab === 'props' && <PropsTab v={v} priceOnly={noLog} />}
        {tab === 'matchup' && <MatchupTab v={v} />}
        {(tab === 'trends' || tab === 'log') && (
          noLog ? <div className="v3-state"><Icon name="info" size={20} /><div><b>No game history</b>{vm.why}</div></div>
            : !v.stat ? <div className="v3p-empty" role="status"><b>No statistic to show</b>This player has no published statistic for this sport yet.</div>
            : tab === 'trends' ? <TrendsTab v={v} onFilters={openFilters} /> : <LogTab v={v} onFilters={openFilters} />
        )}
      </div>
    </div>
  );
}
