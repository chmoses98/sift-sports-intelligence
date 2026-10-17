// HOME · TOP PROPS — a preview of the Player Prop Explorer's slate ranking, on Home.
//
// The ranking is the /props board's own (views/props/ranking.ts: projection vs line in widths of the simulation's
// middle-50% range, role disagreements set aside, touchdown ladders apart), cut to at most ten props that clear the
// board's evidence bar, one card per player. It never pads: when three qualify, three show, and the section says
// why the rest do not. Every prop carries its authority from the opportunity layer (Validated only when that layer
// marks the contract ACTIONABLE; today NFL props are research only), its market line and the line's age, the
// projection with its simulated range, and the last 10 games against today's line (history, n ≥ 5, never a chance).
// Props can be ticked and saved together to My Board (the tray's own MARKET item; games that kicked off are refused).
// The slate re-reads on the research clock while Home stays open (data/hooks.ts `revalidate`).
import { useMemo, useState } from 'react';
import { Link } from '../../routing';
import { Icon } from '../../components/Icon';
import { ValidationState } from '../../components/IntelligenceNote';
import { PlayerFace, RangeBar } from '../../components/insight';
import { FreshChip, CapabilityState } from '../../components/fxResearch';
import { Skeleton, TeamMark } from '../../components/ui';
import { useAsync, useRepo, type Async } from '../../data/hooks';
import type { SportRepo } from '../../data/repo';
import { sportBySlug } from '../../data/sports';
import type { HitRate } from '../../history/hitRate';
import { fmtValue, type PropRow } from '../../insights/propBoard';
import { PROPS_PATH } from '../../lib/destinations';
import { accentOnDark } from '../../lib/hero/accent';
import { playerPhoto } from '../../lib/players';
import { routes } from '../../lib/routes';
import { teamColors } from '../../lib/teams';
import { usePhone } from '../../lib/useMediaQuery';
import { formatQuoteAgo, quoteAgeMs } from '../../live/freshness';
import type { Opportunity } from '../../opportunity/types';
import { useTray } from '../../state/tray';
import { HitDots } from '../props/HitRate';
import { historySide, type DiscoveryRow } from '../props/model';
import { EXCLUSION_ORDER, EXCLUSION_WORDS, HISTORY_MIN_GAMES, HOME_TOP_PROPS, homeTopProps, opportunitiesByMarket, type HomePick, type HomePlayer } from '../props/ranking';
import { addedNotice, addPropsToBoard, cents, onBoard, propHref, rowKey, upcomingGames, useSlateProps } from '../props/slate';
import { histKey, hitFor, usePlayerHistories } from '../props/useHits';
import '../../styles/lane-b-props.css';
import '../../styles/home-top-props.css';

/** How many ranked props the phone layout shows as rows; the rest stay one tap away in the explorer. */
export const PHONE_PROP_ROWS = 3;
/** The coming NFL slate: the same horizon as the props hub. */
const SLATE_DAYS = 8;
const SLUG = 'nfl';
const SPORT = 'NFL';

const kickoffWord = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const unitless = (v: number, r: PropRow) => fmtValue(v, r.def).replace(/ \S+$/, '');

/** `phoneRows`: SIFT 2.0's phone layout (three full-width rows). The classic Home keeps its card carousel. */
export default function HomeTopProps({ opportunities, now, phoneRows = false }: { opportunities: Opportunity[]; now: number; phoneRows?: boolean }) {
  const repo = useRepo(sportBySlug(SLUG));
  return <TopPropsPreview repo={repo} opportunities={opportunities} now={now} phoneRows={phoneRows} />;
}

/** The section for an already-resolved NFL source (tests pass a disk-backed one). */
export function TopPropsPreview({ repo, opportunities, now, phoneRows = false }: { repo: Async<SportRepo>; opportunities: Opportunity[]; now: number; phoneRows?: boolean }) {
  const board = useAsync(repo.data ? `props:board:${repo.data.source.root}` : null, () => repo.data!.board(), { revalidate: true });
  const games = useMemo(() => upcomingGames(board.data?.items, now, SLATE_DAYS), [board.data, now]);
  const slate = useSlateProps(repo.data, games, { revalidate: true });
  const byMarket = useMemo(() => opportunitiesByMarket(opportunities, SPORT), [opportunities]);
  const top = useMemo(() => (slate.data ? homeTopProps(slate.data.rows, { now, byMarket }) : null), [slate.data, now, byMarket]);

  // Game logs for the shown players only (at most ten): the trend line under each prop.
  const histKeyList = (top?.players ?? []).map((p) => histKey(p.row.name, p.row.team.abbr)).join(',');
  const histPlayers = useMemo(() => (top?.players ?? []).map((p) => ({ name: p.row.name, team: p.row.team.abbr })), [histKeyList]); // eslint-disable-line react-hooks/exhaustive-deps
  const hist = usePlayerHistories(SPORT, histPlayers);

  const phone = usePhone() && phoneRows;
  const tray = useTray();
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const toggle = (k: string) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const pickedRows = (top?.picks ?? []).filter((p) => picked.has(rowKey(p.d)) && !onBoard(tray, p.d)).map((p) => p.d);
  const addSelected = () => {
    const res = addPropsToBoard(tray, pickedRows, SPORT, SLUG);
    setPicked(new Set());
    setNotice(addedNotice(res));
  };

  const loading = repo.loading || (board.loading && !board.data) || (slate.loading && !slate.data);
  const failed = !loading && (!repo.data || (board.error && !board.data));
  const published = (top?.picks ?? []).map((p) => p.d.publishedAt).filter((x): x is string => !!x).sort().at(-1) ?? null;

  let body: React.ReactNode;
  if (loading) {
    body = <div className="htp__skel" aria-busy="true" aria-label="Loading top props"><Skeleton lines={3} tall /><Skeleton lines={3} tall /><Skeleton lines={3} tall /></div>;
  } else if (failed) {
    body = <CapabilityState title="NFL props are unavailable right now" tone="gold">The NFL publication could not be read, so there are no props to rank. This section fills in on its own when the publication answers.</CapabilityState>;
  } else if (!games.length) {
    body = <div className="bempty htp__empty"><h3>No NFL games on the coming slate</h3><p>The publication lists no NFL game that has not started in the next {SLATE_DAYS} days, so there are no pregame props to rank.</p></div>;
  } else if (!top || !top.priced) {
    body = <div className="bempty htp__empty"><h3>No priced props yet</h3><p>The publication lists {games.length} upcoming game{games.length === 1 ? '' : 's'} but no player-prop line with a two-sided quote. Props appear here when lines are published.</p></div>;
  } else if (!top.picks.length) {
    body = <div className="bempty htp__empty"><h3>No prop qualifies right now</h3><p>{top.priced} priced props were read; none has a simulated projection off its line that can be ranked. Sift does not fill this space with weaker props.</p><Why top={top} open /></div>;
  } else {
    body = phone ? (
      <>
        <ol className="htp-rows" aria-label={`Top ${Math.min(PHONE_PROP_ROWS, top.picks.length)} ranked props`}>
          {top.picks.slice(0, PHONE_PROP_ROWS).map((x) => <PropRow key={rowKey(x.d)} x={x} hits={hist} tray={tray} picked={picked} toggle={toggle} now={now} />)}
        </ol>
        {top.picks.length < PHONE_PROP_ROWS && <p className="htp__few" role="note"><b>Only {top.picks.length} prop{top.picks.length === 1 ? '' : 's'} qualif{top.picks.length === 1 ? 'ies' : 'y'}.</b> Sift shows what clears the bar and does not fill the section.</p>}
        <Link to={PROPS_PATH} className="htp__all">See all props{top.qualifying > PHONE_PROP_ROWS ? <> <b className="num">({top.qualifying})</b></> : null} <Icon name="arrowRight" size={15} /></Link>
        <Why top={top} />
      </>
    ) : (
      <>
        {top.validated.length > 0 && (
          <div className="htp__group htp__group--valid">
            <h3 className="htp__gh"><span className="htp-auth htp-auth--validated">Validated</span> The publication permits these contracts</h3>
            <PlayerCards players={top.validated} hits={hist} tray={tray} picked={picked} toggle={toggle} now={now} />
          </div>
        )}
        {top.research.length > 0 && (
          <div className="htp__group">
            {top.validated.length > 0 && <h3 className="htp__gh"><span className="htp-auth htp-auth--research">Research only</span> Ranked research, not validated</h3>}
            <PlayerCards players={top.research} hits={hist} tray={tray} picked={picked} toggle={toggle} now={now} />
          </div>
        )}
        {top.picks.length < HOME_TOP_PROPS && (
          <p className="htp__few" role="note"><b>Only {top.picks.length} prop{top.picks.length === 1 ? '' : 's'} qualif{top.picks.length === 1 ? 'ies' : 'y'}.</b> Sift shows what clears the bar and does not fill the section to {HOME_TOP_PROPS}.</p>
        )}
        <Why top={top} />
      </>
    );
  }

  const validatedN = top?.picks.filter((p) => p.authority.level === 'validated').length ?? 0;
  return (
    <section className="bsec bhome__props htp" aria-labelledby="htp-h">
      <div className="bsec__h">
        <h2 className="bsec__t" id="htp-h"><Icon name="target" size={20} /> Top props</h2>
        <Link to={PROPS_PATH} className="bsec__more">Open the Player Prop Explorer <Icon name="arrowRight" size={14} /></Link>
      </div>
      <ValidationState compact />
      {phone ? (
        <div className="htp__lede htp__lede--phone">
          <p className="htp__sub"><b className="htp__sport">NFL · coming slate</b>{validatedN ? <>Validated props come first and say so.</> : <><span className="htp-auth htp-auth--research">Research only</span> No prop is validated today.</>}</p>
          <details className="htp__how">
            <summary>How props are ranked</summary>
            <p className="htp__sub">Ranked by how far the <b>published projection</b> sits from the market line, in widths of its own middle-50% range. {validatedN ? null : <>The NFL publication rates its prop pricing research only.</>}</p>
            <p className="htp__legend"><span className="htp-str htp-str--lean">Lean</span> the line sits inside the simulated middle-50% range, close to a coin flip · <b>Last 10</b> is history against today’s line, not a chance</p>
            {top && top.picks.length > 0 && <p className="htp__meta"><span><b className="num">{top.picks.length}</b> shown{top.qualifying > top.picks.length ? <> of <b className="num">{top.qualifying}</b> qualifying</> : null}</span><span><b className="num">{top.priced}</b> priced props · <b className="num">{games.length}</b> game{games.length === 1 ? '' : 's'}</span>{published && <span>Projections published {formatQuoteAgo(quoteAgeMs(published, now))}</span>}</p>}
          </details>
        </div>
      ) : (
      <div className="htp__lede">
        <p className="htp__sub">
          <b className="htp__sport">NFL · coming slate</b> Ranked by how far the <b>published projection</b> sits from the market line, in widths of its own middle-50% range.{' '}
          {validatedN ? <>Validated props come first and say so.</> : <><span className="htp-auth htp-auth--research">Research only</span> No prop is validated today: the NFL publication rates its prop pricing research only.</>}
        </p>
        <p className="htp__legend"><span className="htp-str htp-str--lean">Lean</span> the line sits inside the simulated middle-50% range, close to a coin flip · <b>Last 10</b> is history against today’s line, not a chance</p>
        {top && top.picks.length > 0 && (
          <p className="htp__meta" aria-live="polite">
            <span><b className="num">{top.picks.length}</b> shown{top.qualifying > top.picks.length ? <> of <b className="num">{top.qualifying}</b> qualifying</> : null}</span>
            <span><b className="num">{top.priced}</b> priced props · <b className="num">{games.length}</b> game{games.length === 1 ? '' : 's'}</span>
            <span><b className="num">{validatedN}</b> validated</span>
            {published && <span title={new Date(published).toLocaleString()}>Projections published {formatQuoteAgo(quoteAgeMs(published, now))}</span>}
          </p>
        )}
      </div>
      )}
      {body}
      {slate.data?.unreadable ? <p className="fr-note">{slate.data.unreadable} game{slate.data.unreadable === 1 ? '’s' : 's’'} research could not be read, so {slate.data.unreadable === 1 ? 'its props are' : 'their props are'} not ranked.</p> : null}

      <div className={`htp__bar${pickedRows.length || notice ? ' is-on' : ''}`} aria-live="polite">
        {pickedRows.length ? (
          <>
            <span><b className="num">{pickedRows.length}</b> selected</span>
            <button type="button" className="btn btn--sm" onClick={() => setPicked(new Set())}>Clear</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={addSelected}><Icon name="plus" size={15} /> Add selected to My Board</button>
          </>
        ) : notice ? (
          <>
            <span>{notice}</span>
            <Link to={routes.board()} className="btn btn--sm">Open My Board</Link>
            <button type="button" className="btn btn--sm" onClick={() => setNotice(null)} aria-label="Dismiss"><Icon name="close" size={14} /></button>
          </>
        ) : null}
      </div>
    </section>
  );
}

/** Why the rest are not shown: every excluded count, in words. */
function Why({ top, open }: { top: NonNullable<ReturnType<typeof homeTopProps>>; open?: boolean }) {
  const lines = EXCLUSION_ORDER.filter((k) => top.excluded[k] > 0).map((k) => EXCLUSION_WORDS[k](top.excluded[k]));
  const beyond = top.qualifying - top.picks.length;
  if (!lines.length && beyond <= 0) return null;
  return (
    <details className="htp__why" open={open}>
      <summary>Why {top.considered - top.picks.length} other prop{top.considered - top.picks.length === 1 ? ' is' : 's are'} not shown</summary>
      <ul>
        {beyond > 0 && <li>{beyond} more qualify but rank below the top {HOME_TOP_PROPS}: <Link to={PROPS_PATH}>see them all on the props board</Link></li>}
        {lines.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </details>
  );
}

type Hist = ReturnType<typeof usePlayerHistories>;
type Tray = ReturnType<typeof useTray>;

function PlayerCards({ players, hits, tray, picked, toggle, now }: { players: HomePlayer[]; hits: Hist; tray: Tray; picked: Set<string>; toggle: (k: string) => void; now: number }) {
  return (
    <ul className="htp__cards" aria-label={`${players.length} player${players.length === 1 ? '' : 's'}`}>
      {players.map((p) => <PlayerCard key={p.key} p={p} hits={hits} tray={tray} picked={picked} toggle={toggle} now={now} />)}
    </ul>
  );
}

function PlayerCard({ p, hits, tray, picked, toggle, now }: { p: HomePlayer; hits: Hist; tray: Tray; picked: Set<string>; toggle: (k: string) => void; now: number }) {
  const r = p.row;
  const accent = accentOnDark(teamColors(SPORT, r.team.abbr));
  const home = p.d.game.endsWith(`@ ${r.team.abbr}`);
  const doc = hits.docs.get(histKey(r.name, r.team.abbr));
  return (
    <li className="htp-card" style={{ ['--tc' as string]: accent }}>
      <div className="htp-card__h">
        <PlayerFace photo={playerPhoto(r.playerId, r.name, r.team.abbr)} team={r.team.abbr} size="md" name={r.name} />
        <div className="htp-card__who">
          <Link to={propHref(SLUG, p.picks[0].d)} className="htp-card__name">{r.name}</Link>
          <span className="htp-card__team"><TeamMark sport={SPORT} abbr={r.team.abbr} size="sm" /><b>{r.team.abbr}</b>{r.role ? ` · ${r.role}` : ''} · {home ? 'vs' : '@'} {r.opp.abbr}</span>
          <span className="htp-card__when">{kickoffWord(p.d.kickoff)}</span>
        </div>
        {r.injury && <span className="htp-card__inj" title="Listed on the injury report; the projection assumes he plays">{r.injury.toLowerCase().replace(/_/g, ' ')}</span>}
      </div>
      <ul className="htp-card__props">
        {p.picks.map((x) => <PickRow key={rowKey(x.d)} x={x} h={hitFor(doc, x.d.row, x.d.kickoff, 'last10')} histLoading={hits.loading} tray={tray} picked={picked} toggle={toggle} now={now} />)}
      </ul>
      <Link to={propHref(SLUG, p.picks[0].d)} className="htp-card__go">All {r.name.split(' ').slice(-1)[0]} markets in the explorer <Icon name="arrowRight" size={14} /></Link>
    </li>
  );
}

function PickRow({ x, h, histLoading, tray, picked, toggle, now }: { x: HomePick; h: HitRate | null; histLoading: boolean; tray: Tray; picked: Set<string>; toggle: (k: string) => void; now: number }) {
  const d: DiscoveryRow = x.d;
  const r = d.row;
  const k = rowKey(d);
  const saved = onBoard(tray, d);
  const on = saved || picked.has(k);
  const gap = r.projection != null && r.line != null ? r.projection - r.line : null;
  const up = (gap ?? 0) >= 0;
  const label = `${r.name} ${r.def.label.toLowerCase()} ${r.line ?? ''}`.trim();
  const hs = h && h.n >= HISTORY_MIN_GAMES ? historySide(h) : null;
  const typ = r.range ? `${unitless(r.range.typical[0], r)}–${unitless(r.range.typical[1], r)}` : '';
  const strengthText = x.strength === 'separated'
    ? `The line sits outside his simulated middle-50% range (${typ}).`
    : `A lean: the line sits inside his simulated middle-50% range (${typ}), close to a coin flip on the simulation’s own numbers.`;
  return (
    <li className={`htp-pick${picked.has(k) ? ' is-picked' : ''}${saved ? ' is-saved' : ''}`}>
      <label className="htp-pick__chk">
        <input type="checkbox" checked={on} disabled={saved} onChange={() => toggle(k)} />
        <span className="sr-only">{saved ? 'Already on My Board:' : 'Select'} {label}</span>
      </label>
      <div className="htp-pick__b">
        <div className="htp-pick__top">
          <span className="htp-pick__rk num" title="Position in the slate ranking">#{x.rank}</span>
          <span className="htp-pick__stat">{r.def.label}</span>
          {saved && <span className="htp-pick__saved">On My Board</span>}
          <span className={`htp-str htp-str--${x.strength}`} title={strengthText}>{x.strength === 'separated' ? 'Outside mid-50%' : 'Lean'}<span className="sr-only">: {strengthText}</span></span>
          <span className={`htp-auth htp-auth--${x.authority.level}`} title={x.authority.detail}>{x.authority.word}</span>
        </div>
        <div className="htp-pick__nums">
          <span className="htp-num htp-num--line"><small>Line</small><b className="num">{r.line}</b></span>
          {r.projection != null && <span className={`htp-num htp-num--proj htp-num--${up ? 'up' : 'down'}`}><small>Projection</small><b className="num"><span aria-hidden="true">{up ? '▲' : '▼'}</span> {unitless(r.projection, r)}</b></span>}
          {gap != null && <span className="htp-num htp-num--gap"><small>{up ? 'Above line' : 'Below line'}</small><b className="num">{up ? '+' : '−'}{unitless(Math.abs(gap), r)}</b><i title="Distance from the line in widths of his simulated middle-50% range">{Math.abs(r.separation ?? 0).toFixed(1)}× range</i></span>}
        </div>
        {r.range && r.projection != null && <RangeBar typical={r.range.typical} full={r.range.full} projection={r.projection} line={r.line} format={(v) => unitless(v, r)} label={`${r.name} ${r.def.label.toLowerCase()} simulation`} />}
        <p className="htp-pick__hist">
          {hs && h ? (
            <><span className={`htp-pick__hk htp-pick__hk--${hs.side}`}>Last {h.n}</span> <HitDots h={h} /> <span>{hs.text}</span><span className="sr-only">: history against today’s line, not a chance</span></>
          ) : histLoading ? <small>Reading his game log…</small>
            : h && h.n > 0 ? <small>Only {h.n} game{h.n === 1 ? '' : 's'} played: too few for a trend</small>
              : <small>No game log for this stat</small>}
        </p>
        <div className="htp-pick__foot">
          <FreshChip at={r.main?.market.captured_at} now={now} label="Line" />
          <span className="htp-pick__ask">Over {cents(r.main?.yesAsk)} · Under {cents(r.main?.noAsk)}</span>
          <Link to={propHref(SLUG, d)} className="htp-pick__go" aria-label={`Analyse ${label} in the explorer`}>Explore <Icon name="arrowRight" size={13} /></Link>
        </div>
      </div>
    </li>
  );
}


/** Phone layout: one ranked prop as a full-width row. Every field the card shows survives; nothing is hidden by overflow. */
function PropRow({ x, hits, tray, picked, toggle, now }: { x: HomePick; hits: Hist; tray: Tray; picked: Set<string>; toggle: (k: string) => void; now: number }) {
  const d = x.d;
  const r = d.row;
  const k = rowKey(d);
  const saved = onBoard(tray, d);
  const on = saved || picked.has(k);
  const accent = accentOnDark(teamColors(SPORT, r.team.abbr));
  const home = d.game.endsWith(`@ ${r.team.abbr}`);
  const gap = r.projection != null && r.line != null ? r.projection - r.line : null;
  const up = (gap ?? 0) >= 0;
  const label = `${r.name} ${r.def.label.toLowerCase()} ${r.line ?? ''}`.trim();
  const h = hitFor(hits.docs.get(histKey(r.name, r.team.abbr)), r, d.kickoff, 'last10');
  const hs = h && h.n >= HISTORY_MIN_GAMES ? historySide(h) : null;
  const typ = r.range ? `${unitless(r.range.typical[0], r)}–${unitless(r.range.typical[1], r)}` : '';
  const strengthText = x.strength === 'separated'
    ? `The line sits outside his simulated middle-50% range (${typ}).`
    : `A lean: the line sits inside his simulated middle-50% range (${typ}), close to a coin flip on the simulation’s own numbers.`;
  return (
    <li className={`htp-row${picked.has(k) ? ' is-picked' : ''}${saved ? ' is-saved' : ''}`} style={{ ['--tc' as string]: accent }}>
      <div className="htp-row__who">
        <PlayerFace photo={playerPhoto(r.playerId, r.name, r.team.abbr)} team={r.team.abbr} size="md" name={r.name} />
        <div className="htp-row__id">
          <Link to={propHref(SLUG, d)} className="htp-row__name">{r.name}</Link>
          <span className="htp-row__team"><TeamMark sport={SPORT} abbr={r.team.abbr} size="sm" /><b>{r.team.abbr}</b>{r.role ? ` · ${r.role}` : ''} · {home ? 'vs' : '@'} {r.opp.abbr} · {kickoffWord(d.kickoff)}</span>
        </div>
        <label className="htp-row__chk" title={saved ? 'Already on My Board' : 'Select to save to My Board'}>
          <input type="checkbox" checked={on} disabled={saved} onChange={() => toggle(k)} />
          <span className="sr-only">{saved ? 'Already on My Board:' : 'Select'} {label}</span>
        </label>
      </div>
      <div className="htp-row__mk">
        <span className="htp-row__rk num" title="Position in the slate ranking">#{x.rank}</span>
        <b className="htp-row__stat">{r.def.label}</b>
        <span className={`htp-auth htp-auth--${x.authority.level}`} title={x.authority.detail}>{x.authority.word}</span>
        <span className={`htp-str htp-str--${x.strength}`} title={strengthText}>{x.strength === 'separated' ? 'Outside mid-50%' : 'Lean'}<span className="sr-only">: {strengthText}</span></span>
        {saved && <span className="htp-pick__saved">On My Board</span>}
        {r.injury && <span className="htp-card__inj" title="Listed on the injury report; the projection assumes he plays">{r.injury.toLowerCase().replace(/_/g, ' ')}</span>}
      </div>
      <div className="htp-pick__nums">
        <span className="htp-num htp-num--line"><small>Line</small><b className="num">{r.line}</b></span>
        {r.projection != null && <span className={`htp-num htp-num--proj htp-num--${up ? 'up' : 'down'}`}><small>Projection</small><b className="num"><span aria-hidden="true">{up ? '▲' : '▼'}</span> {unitless(r.projection, r)}</b></span>}
        {gap != null && <span className="htp-num htp-num--gap"><small>{up ? 'Above line' : 'Below line'}</small><b className="num">{up ? '+' : '−'}{unitless(Math.abs(gap), r)}</b></span>}
      </div>
      <div className="htp-row__foot">
        <FreshChip at={r.main?.market.captured_at} now={now} label="Line" />
        {hs && h ? <span className="htp-row__hist"><span className={`htp-pick__hk htp-pick__hk--${hs.side}`}>Last {h.n}</span> <HitDots h={h} /><span className="sr-only">: history against today’s line, not a chance</span></span> : null}
        <Link to={propHref(SLUG, d)} className="htp-pick__go" aria-label={`Analyse ${label} in the explorer`}>Explore <Icon name="arrowRight" size={13} /></Link>
      </div>
    </li>
  );
}
