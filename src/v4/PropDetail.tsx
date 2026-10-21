// v4 Player detail: one player's props for one game. The default view is concise: who, the line against the one SIFT
// projection, the Kalshi ladder with the model on the same side, and how the projection sits against the line. Form,
// matchup research and sources open on request. Every figure is a published field of the app's own prop board
// (insights/propBoard.ts); the projection is the one the authority selected, never a substitute.
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from '../routing';
import { Icon } from './Icon';
import { PlayerAvatar } from './PropsUi';
import { SaveControl } from './SaveControl';
import { DifferenceNote, ProjectionStatus, RangeBar, SourceList } from './PropParts';
import { propSave, usePropResearch } from './PropSheet';
import { propsExplorerHref, classifyDifference, ladderViews, projectionWhy, quoteView, statShort, type PropSide } from './propsModel';
import { rowFor, usePropBoard, usePropGame } from './propsData';
import { agoWord } from './words';
import { broadcastPlayerPhoto } from '../components/sift2/playerArt';
import { fmtValue, type PropRow } from '../insights/propBoard';
import { gameSides } from '../insights/game';
import { hitRate, hitWindows, hitWindowLabel, hitWindowShort, type HitWindow } from '../history/hitRate';
import { pregameRows, statDef } from '../history/stats';
import { histKey, usePlayerHistories } from '../views/props/useHits';
import { matchupSentence } from '../views/props/model';
import { opportunitiesByMarket } from '../views/props/ranking';
import { useAllOpportunities } from '../opportunity/load';
import { isFrozen } from '../lib/lifecycle';
import { teamColors } from '../lib/teams';
import { useNow } from '../live/hooks';
import { clock } from './model';

const cents = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

function Disclosure({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="v4-disc">
      <button type="button" className="v4-disc__b" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span><b>{title}</b>{hint && <small>{hint}</small>}</span><Icon name={open ? 'caret-up' : 'caret-down'} size="s" />
      </button>
      {open && <div className="v4-disc__p">{children}</div>}
    </section>
  );
}

export function V4PropDetail() {
  const { slug = '', eventId = '', playerId = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const loc = useLocation();
  const now = useNow(15_000);
  const data = usePropGame(slug, eventId);
  const { board } = usePropBoard(data.data);
  const open = usePropResearch();
  const opps = useAllOpportunities(now);
  const byMarket = useMemo(() => opportunitiesByMarket(opps.opportunities, 'NFL'), [opps.opportunities]);
  const { rows, sel } = rowFor(board, decodeURIComponent(playerId), sp.get('stat'));
  const side: PropSide = sp.get('side') === 'under' ? 'under' : 'over';
  const set = (patch: Record<string, string | null>) => setSp((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); } return n; }, { replace: true });
  const back = () => (loc.key !== 'default' ? nav(-1) : nav(propsExplorerHref({ game: eventId })));

  const topBar = (extra?: ReactNode) => (
    <div className="v4-gtop"><button type="button" className="v4-gbtn" aria-label="Back" onClick={back}><Icon name="caret-left" /></button><span className="v4-spacer" />{extra}</div>
  );
  const frame = (body: ReactNode) => <div><div className="v4-stage">{topBar()}</div><div className="v4-body">{body}</div></div>;

  if (data.loading && !data.data) return <div><div className="v4-stage">{topBar()}<div className="v4-gboard"><div className="v4-skel" style={{ height: 150, borderRadius: 22 }} role="status" aria-label="Loading player research" /></div></div></div>;
  if (data.error && !data.data) {
    return frame(<div className="v4-note v4-note--risk" role="alert"><Icon name="cloud-slash" /><div><b>Player research is unavailable</b>This game's research could not be read, so the player's props cannot be verified. This is not a no-props verdict.<br /><Link to={propsExplorerHref({ game: eventId })} className="v4-btn v4-btn--sec">Back to props</Link></div></div>);
  }
  if (data.data?.kind === 'unsupported') {
    return frame(<div className="v4-note"><Icon name="info" /><div><b>Player prop research is not published for this sport</b>The publication carries no simulated player projection here. Kalshi player markets, with their capture times, are on the game's Markets tab.<br /><Link to={`/v4/game/${slug}/${encodeURIComponent(eventId)}?tab=markets`} className="v4-btn v4-btn--sec">Open game markets</Link></div></div>);
  }
  if (!sel || data.data?.kind !== 'ok') {
    return frame(<div className="v4-note"><Icon name="magnifying-glass" /><div><b>No published props for this player</b>The publication lists no priced prop or projection for this player in this game (he may be out, or not part of the prop population).<br /><Link to={propsExplorerHref({ game: eventId })} className="v4-btn v4-btn--sec">Back to props</Link></div></div>);
  }
  return <Detail key={`${eventId}|${sel.playerId}`} slug={slug} eventId={eventId} data={data.data} row={sel} rows={rows} side={side} now={now} set={set} byMarket={byMarket} back={back} open={open} stat={sp.get('stat')} sp={sp} />;
}

type Loaded = Extract<NonNullable<ReturnType<typeof usePropGame>['data']>, { kind: 'ok' }>;

function Detail({ slug, eventId, data, row, rows, side, now, set, byMarket, back, open, sp }: {
  slug: string; eventId: string; data: Loaded; row: PropRow; rows: PropRow[]; side: PropSide; now: number; stat: string | null; sp: URLSearchParams;
  set: (p: Record<string, string | null>) => void; byMarket: ReturnType<typeof opportunitiesByMarket>; back: () => void; open: ReturnType<typeof usePropResearch>;
}) {
  const r = data.r;
  const g = gameSides(r);
  const kickoff = r.event.start_time_utc;
  const status = r.event.status ?? null;
  const frozen = isFrozen(kickoff, now, status);
  const gameLabel = g ? `${g.away.abbr} @ ${g.home.abbr}` : '';
  const fmt = (v: number) => fmtValue(v, row.def);
  const unitless = (v: number) => fmt(v).replace(/ \S+$/, '');
  const photo = broadcastPlayerPhoto(row.playerId, row.name, row.team.abbr, 'wide');
  const [tc] = teamColors('NFL', row.team.abbr);
  const where = row.team.home ? 'vs' : 'at';
  const ladder = ladderViews(row, side, now);
  const mainView = ladder.find((x) => x.isMain) ?? null;
  const diff = classifyDifference(mainView, projectionWhy(row), byMarket);
  const q = quoteView(side === 'over' ? row.main?.yesAsk : row.main?.noAsk, row.main?.market.captured_at, now);
  const save = propSave({ row, slug, eventId, kickoff, status });
  const ctx = { row, slug, eventId, kickoff, status, game: gameLabel, researchAt: r.generated_at ?? null, side, marketId: null as string | null };

  // Recent form: the player's real game logs against today's line (history, never a probability).
  const hist = usePlayerHistories('NFL', useMemo(() => [{ name: row.name, team: row.team.abbr }], [row.name, row.team.abbr]));
  const doc = hist.docs.get(histKey(row.name, row.team.abbr)) ?? null;
  const hdef = statDef(row.def.stat);
  const hrows = doc ? pregameRows(doc, kickoff, null) : null;
  const wins = hrows && hdef ? hitWindows(hrows, hdef) : [];
  const winParam = sp.get('w') as HitWindow | null;
  const win: HitWindow = wins.some((w) => w.w === winParam) ? (winParam as HitWindow) : wins.find((w) => w.w === 'last10')?.w ?? wins[0]?.w ?? 'last10';
  const h = hrows && hdef && row.line != null ? hitRate(hrows, hdef, row.line, win) : null;
  const winName = doc ? hitWindowLabel(win, doc.season, doc.prior?.season ?? null) : '';
  const mu = matchupSentence(row);
  const quoteAt = row.main?.market.captured_at ?? null;
  const statChips = rows.filter((x) => x.main || x.projection != null);

  return (
    <div>
      <div className="v4-hero" style={{ ['--tc' as string]: tc }}>
        {photo && <img className="v4-hero__img" src={photo.src} alt="" style={{ objectPosition: photo.focus }} decoding="async" />}
        <div className="v4-hero__shade" aria-hidden="true" />
        <div className="v4-gtop">
          <button type="button" className="v4-gbtn" aria-label="Back" onClick={back}><Icon name="caret-left" /></button>
          <span className="v4-spacer" />
          {save && <SaveControl {...save} variant="icon" />}
        </div>
        <div className="v4-hero__in">
          {!photo && <PlayerAvatar id={row.playerId} name={row.name} team={row.team.abbr} sport="NFL" size={72} />}
          <h1 className="v4-h1 v4-h1--player">{row.name}</h1>
          <p className="v4-hero__m">{row.role ?? '—'} · {row.team.abbr} {where} {row.opp.abbr} · {clock(Date.parse(kickoff))}</p>
          <p className="v4-hero__s">
            <span className={`v4-badge${frozen ? '' : ' v4-badge--model'}`}>{frozen ? 'Pregame research · frozen at kickoff' : 'Pregame research'}</span>
            {row.injury && <span className="v4-badge v4-badge--risk">{row.injury.toLowerCase().replace(/_/g, ' ')}</span>}
          </p>
        </div>
      </div>

      <div className="v4-body">
        {statChips.length > 1 && (
          <div className="v4-chips" role="group" aria-label={`${row.name}: prop`} style={{ paddingTop: 14 }}>
            {statChips.map((x) => <button key={x.id} type="button" className="v4-chip" aria-pressed={x.id === row.id} onClick={() => set({ stat: x.def.stat })}>{statShort(x.def.stat, x.def.label)}{x.line != null && <i>{x.line}</i>}</button>)}
          </div>
        )}

        <div className="v4-tiles" role="group" aria-label={`${row.def.label}: line and projection`}>
          <div className="v4-tile v4-tile--mkt"><span>Kalshi line</span><b className="num">{row.line ?? '—'}</b><small>{row.main ? `Over ${cents(row.main.yesAsk)} · Under ${cents(row.main.noAsk)}` : 'No priced line'}{row.main && !quoteView(row.main.yesAsk, quoteAt, now).executable ? ' · not current' : ''}</small></div>
          <div className={`v4-tile v4-tile--model${row.projection == null ? ' v4-tile--none' : ''}`}><span>SIFT projection</span><b className="num">{row.projection != null ? unitless(row.projection) : row.projectionStatus.kind === 'withheld' ? 'Withheld' : '—'}</b>
            <small>{row.projection != null ? (row.predictionRange ? `80% range ${unitless(row.predictionRange.lo)}–${unitless(row.predictionRange.hi)}` : row.range ? `Middle 50% ${unitless(row.range.typical[0])}–${unitless(row.range.typical[1])}` : row.def.unit) : (projectionWhy(row) ?? 'No projection')}</small></div>
        </div>

        <div className="v4-acts">
          <button type="button" className="v4-btn" onClick={() => open(ctx)}><Icon name="pulse" size="s" />Research details</button>
          <Link to={`/v4/game/${slug}/${encodeURIComponent(eventId)}?tab=players`} className="v4-btn v4-btn--sec">Game</Link>
        </div>

        <section className="v4-card v4-lad" aria-labelledby="v4-lad-h">
          <div className="v4-lad__h">
            <h2 id="v4-lad-h" className="h3">{row.def.label}</h2>
            <div className="v4-seg v4-seg--sm" role="group" aria-label="Side">
              <button type="button" aria-pressed={side === 'over'} onClick={() => set({ side: null })}>Over</button>
              <button type="button" aria-pressed={side === 'under'} onClick={() => set({ side: 'under' })}>Under</button>
            </div>
          </div>
          <p className="v4-lad__q"><i className={`v4-dot${q.executable ? '' : q.ask == null ? ' v4-dot--off' : ' v4-dot--stale'}`} />{q.ask == null ? 'No Kalshi quote on this side' : q.executable ? `Kalshi quote ${agoWord(q.ageMs)}` : q.freshness === 'UNKNOWN' ? 'Quote has no capture time: not treated as current' : `Kalshi quote stale (${agoWord(q.ageMs)}): shown for context, not executable`}</p>
          {ladder.length === 0 ? <p className="v4-lad__none">No contracts are listed for this prop.</p> : (
            <>
              <div className="v4-lad__head" aria-hidden="true"><span>{side === 'over' ? 'At least' : 'Fewer than'}</span><span>Kalshi {side === 'over' ? 'Yes' : 'No'}</span><span>Model</span><span>Diff</span></div>
              <ul className="v4-lad__rows">
                {ladder.map((v) => (
                  <li key={v.rung.market.market_id} className={`v4-lad__row${v.isMain ? ' is-main' : ''}`}
                    aria-label={`${side === 'over' ? 'At least' : 'Fewer than'} ${v.rung.market.threshold}: Kalshi ${side === 'over' ? 'yes' : 'no'} ${cents(v.quote.ask)}${v.quote.ask != null && !v.quote.executable ? ' (not current)' : ''}, break-even after fee ${pct(v.breakEven)}, model ${pct(v.model)}${v.points != null ? `, model minus break-even ${v.points} points` : ''}${v.isMain ? ', at the line' : ''}`}>
                    <span className="v4-lad__l"><b className="num">{v.rung.market.threshold}{side === 'over' ? '+' : ''}</b>{v.isMain && <em>At the line</em>}</span>
                    <span className={`v4-lad__p${v.quote.executable ? '' : ' is-stale'}`}><b className="num">{cents(v.quote.ask)}</b>{v.breakEven != null && <small>BE {pct(v.breakEven)}</small>}</span>
                    <span className="v4-lad__m num">{pct(v.model)}</span>
                    <span className="v4-lad__d num">{v.points == null ? '—' : `${v.points > 0 ? '+' : v.points < 0 ? '−' : ''}${Math.abs(v.points)}`}</span>
                  </li>
                ))}
              </ul>
              <p className="v4-lad__note">Kalshi pays on the contract settling Yes at that count or more; Under is the No side of the same contract. BE is the probability that side needs to break even after Kalshi's fee. Diff is model minus BE in points, shown only for a current price. It is context, not a recommendation.</p>
            </>
          )}
        </section>

        <DifferenceNote d={diff} view={mainView} onOpen={() => open(ctx)} />

        <section className="v4-card" aria-labelledby="v4-proj-h">
          <h2 id="v4-proj-h" className="h3">Projection against the line</h2>
          <RangeBar row={row} />
          <ProjectionStatus row={row} />
        </section>

        {mu && <p className={`v4-mu v4-mu--${mu.word}`}><b>{mu.word === 'tough' ? 'Tough matchup' : mu.word === 'favorable' ? 'Favorable matchup' : 'Neutral matchup'}.</b> {mu.text}</p>}

        <Disclosure title="Recent form" hint={h && h.n ? `${h.over} of ${h.n} over ${row.line} · ${winName}` : 'Game logs against today\'s line'}>
          {hist.loading && !doc ? <div className="v4-skel" style={{ height: 60 }} role="status" aria-label="Loading game logs" />
            : !doc || !hdef || !hrows || !wins.length ? <p className="v4-pstat">No game log for this player and stat before this kickoff (a rookie, a new role or a stat the public logs do not carry).</p>
            : (
              <>
                <div className="v4-seg v4-seg--sm" role="group" aria-label="History window" style={{ margin: '0 0 12px' }}>
                  {wins.map((w) => <button key={w.w} type="button" aria-pressed={w.w === win} onClick={() => set({ w: w.w })}>{hitWindowShort(w.w, doc.season, doc.prior?.season ?? null)}</button>)}
                </div>
                {h && h.n > 0 ? (
                  <>
                    <ol className="v4-dots" aria-label={`${h.n} games, oldest first`}>
                      {h.games.map((gm, i) => <li key={i} className={`v4-dots__d v4-dots__d--${gm.result}`} title={`${gm.result} ${row.line}: ${gm.v}`}><span className="sr">{gm.result} ({gm.v})</span></li>)}
                    </ol>
                    <p className="v4-pstat"><b>{h.over} of {h.n} over {row.line}</b>{h.push ? `, ${h.push} push${h.push > 1 ? 'es' : ''}` : ''} in {winName}. History against today's line, not a probability; past betting lines are not published.</p>
                  </>
                ) : <p className="v4-pstat">No priced line to compare with.</p>}
              </>
            )}
        </Disclosure>

        <Disclosure title="Matchup and role research" hint={row.matchup ? `${row.opp.abbr} ${row.def.defUnit ?? 'defense'} #${row.matchup.rank.rank} of ${row.matchup.rank.of}` : undefined}>
          {row.reasons.length > 0 ? <ul className="v4-sbullets">{row.reasons.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="v4-pstat">No standout reason on this prop: the projection, matchup and price sit within ordinary ranges.</p>}
          {row.risks.length > 0 && <><h3 className="v4-sub3">Published risks</h3><ul className="v4-sbullets v4-sbullets--risk">{row.risks.map((x) => <li key={x}>{x}</li>)}</ul></>}
          <p className="v4-pstat v4-pstat--m">The NFL publication rates its prop pricing research only. Everything on this page is research, not a validated edge.</p>
        </Disclosure>

        <Disclosure title="Data and sources" hint={quoteAt ? `Kalshi captured ${agoWord(Math.max(0, now - Date.parse(quoteAt)))}` : undefined}>
          <SourceList row={row} researchAt={r.generated_at ?? null} kickoff={kickoff} quoteAt={quoteAt} frozen={frozen} now={now} />
        </Disclosure>

        <p className="v4-foot">Research only. SIFT reports what the publication states and does not recommend a bet. Selecting a prop is not an endorsement of it.</p>
      </div>
    </div>
  );
}
