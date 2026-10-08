// The CFB home: edge discovery first, the schedule underneath. One board read and one research-signals document
// (cfb_research_signals/1.x) — never a per-game research fetch. Top to bottom: the slate header; Top CFB Signals
// (Value Watch, the strongest football edges, market disagreements, close games, pace and scoring spots), each
// header applying its filter; the research-signals status in four small tiles; filter and sort; a compact card per
// game with SIFT's read, its CONTROL side and that side's own price; and the full schedule.
//
// The order is SIFT priority (cfbSignals.ts priorityTier): deterministic, by signal, never by return, popularity or
// price, and no game is hidden because its price is unattractive.
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { BoardItem } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { publicationView, QuoteChip } from '../../components/LiveQuote';
import { ErrorState, Skeleton, TeamMark } from '../../components/ui';
import { useAsync } from '../../data/hooks';
import { useCfbSignals } from '../../data/cfbSignals';
import {
  captureLine,
  cardHistorical,
  environmentCount,
  hasEnvironment,
  isClose,
  isModerate,
  isStrong,
  matchesFilter,
  parseFilter,
  parseSort,
  priceText,
  slateGame,
  slateOf,
  sortSlate,
  STRENGTH_LABEL,
  valueWatchActive,
  type FilterId,
  type SignalsDoc,
  type SlateGame,
  type SortId,
} from '../../lib/cfbSignals';
import { ago, dayLabel } from '../../lib/format';
import { cfbMatchupNames } from '../../lib/cfbTeams';
import { routes } from '../../lib/routes';
import { useLiveQuotes, useNow } from '../../live/hooks';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import { sides } from '../home/cards';
import { Info } from '../game/panels';
import { CfbGlyph, Chip, SignalMarks, supportChips, type CfbGlyphName } from './kit';
import { CfbSlatePriorities } from './CfbPriorities';

const CARD_CAP = 24;
const ENV_CAP = 6;
/** Close Game Profiles can run to dozens of games: the first eight, then "See all" (the filter shows every one). */
const CLOSE_CAP = 8;
/** Strongest Football Edges: the first eight by kickoff, then "See all" (the Strong Control filter). */
const STRONG_CAP = 8;

/** Both schools by the names fans use ("Iowa State", "Ole Miss"), guaranteed distinguishable (lib/cfbTeams.ts). */
const names = (item: BoardItem) => {
  const { away, home } = sides(item);
  const n = cfbMatchupNames({ code: away?.short_name, name: away?.display_name }, { code: home?.short_name, name: home?.display_name });
  return { away, home, awayName: n.away, homeName: n.home };
};

function started(item: BoardItem, now: number): boolean {
  return item.status === 'LIVE' || item.status === 'IN_PROGRESS' || Date.parse(item.start_time_utc) <= now;
}

/** "Sat 7:30 PM" for a game still to play; "In progress" / "Final" once it is not. */
function kickText(item: BoardItem, now: number): string {
  if (item.status === 'FINAL') return 'Final';
  if (started(item, now)) return 'In progress';
  return new Date(item.start_time_utc).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function timeOnly(item: BoardItem, now: number): string {
  if (item.status === 'FINAL') return 'Final';
  if (started(item, now)) return 'Live';
  return new Date(item.start_time_utc).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** The word a filter chip carries; Value Watch takes the contract's own label. */
function filterWord(f: FilterId, doc: SignalsDoc | null): string {
  switch (f) {
    case 'value-watch': return doc?.signals.moderate_control.label ?? 'Value Watch';
    case 'moderate': return 'Moderate Control';
    case 'strong': return 'Strong Control';
    case 'close': return 'Close';
    case 'fast': return 'Fast pace';
    case 'defensive': return 'Defensive';
    case 'disagreement': return doc?.signals.market_disagreement.label ?? 'Market Disagreement';
    case 'environment': return 'Pace / scoring spots';
    default: return 'All';
  }
}

const FILTER_GLYPH: Partial<Record<FilterId, [CfbGlyphName, string]>> = {
  'value-watch': ['star', 'star'], moderate: ['control', 'control'], strong: ['control', 'control'], close: ['close', 'close'],
  fast: ['fast', 'fast'], defensive: ['shield', 'shield'], disagreement: ['alert', 'alert'], environment: ['fast', 'fast'],
};

/** The marks a schedule row carries, in the same vocabulary as the cards. */
function marksOf(x: SlateGame | null): { glyph: CfbGlyphName; tone: string; label: string }[] {
  if (!x?.g) return [];
  const out: { glyph: CfbGlyphName; tone: string; label: string }[] = [];
  if (x.valueWatch) out.push({ glyph: 'star', tone: 'star', label: 'Value Watch' });
  if (x.g.claims?.control) out.push({ glyph: 'control', tone: 'control', label: `${x.g.claims.control.team} ${STRENGTH_LABEL[x.g.claims.control.strength] ?? 'control'}` });
  if (x.disagreement) out.push({ glyph: 'alert', tone: 'alert', label: 'Market disagreement' });
  for (const c of supportChips(x.g.claims)) out.push({ glyph: c.glyph, tone: c.tone, label: c.text });
  return out;
}

function PriceToken({ x, team, now }: { x: SlateGame; team: string; now?: number }) {
  const p = x.price;
  return (
    <span className={`cfpx cfpx--${p.kind.toLowerCase()}`} title={p.observedAt ? `${p.source === 'live' ? 'Live quote' : 'Captured'} ${p.observedAt}` : undefined}>
      {priceText(team, p)}
      {now != null && p.observedAt && p.kind !== 'UNAVAILABLE' && <span className="cfpx__age">{p.source === 'live' ? 'live' : ago(p.observedAt, now).replace(/ ago$/, '')}</span>}
    </span>
  );
}

// ------------------------------------------------------------------ Top CFB Signals

interface SectionProps {
  id: FilterId;
  glyph: CfbGlyphName;
  tone: string;
  title: string;
  sub: string;
  info?: ReactNode;
  rows: SlateGame[];
  cap?: number;
  total?: number;
  onPick: (f: FilterId) => void;
  render: (x: SlateGame) => ReactNode;
  children?: ReactNode;
}

function SignalSection({ id, glyph, tone, title, sub, info, rows, cap, total, onPick, render, children }: SectionProps) {
  const shown = cap ? rows.slice(0, cap) : rows;
  const n = total ?? rows.length;
  return (
    <section className={`cfs cfs--${tone}`} aria-label={title} data-signal={id}>
      <div className="cfs__head">
        <button type="button" className="cfs__h" onClick={() => onPick(id)} aria-label={`${title}: show ${n} ${n === 1 ? 'game' : 'games'} below`}>
          <CfbGlyph name={glyph} tone={tone} size={18} />
          <span className="cfs__t">{title}</span>
          <span className="cfs__n num">{n}</span>
        </button>
        {info}
      </div>
      <p className="cfs__sub">{sub}</p>
      {children}
      <ul className="cfs__list">
        {shown.map((x) => <li key={x.item.event_id}>{render(x)}</li>)}
      </ul>
      {cap && n > shown.length && (
        <button type="button" className="cfs__all" onClick={() => onPick(id)}>See all {n} <Icon name="arrowRight" size={13} /></button>
      )}
    </section>
  );
}

function SignalRow({ x, slug, now, main, aside }: { x: SlateGame; slug: string; now: number; main: ReactNode; aside?: ReactNode }) {
  const { away, home, awayName, homeName } = names(x.item);
  return (
    <Link to={routes.game(slug, x.item.event_id)} className="cfs__row">
      <span className="cfs__logos" aria-hidden="true">
        <TeamMark sport="CFB" abbr={away?.short_name} size="sm" />
        <TeamMark sport="CFB" abbr={home?.short_name} size="sm" />
      </span>
      <span className="cfs__main">
        <span className="cfs__m">{main}</span>
        <span className="cfs__s">{awayName} @ {homeName} · {kickText(x.item, now)}</span>
      </span>
      {aside && <span className="cfs__x">{aside}</span>}
    </Link>
  );
}

function TopSignals({ games, doc, slug, now, onPick }: { games: SlateGame[]; doc: SignalsDoc; slug: string; now: number; onPick: (f: FilterId) => void }) {
  const byTime = (xs: SlateGame[]) => sortSlate(xs, 'time');
  const s = doc.signals;
  const vwActive = valueWatchActive(doc);
  const moderate = byTime(games.filter((x) => isModerate(x.g)));
  const strong = byTime(games.filter((x) => isStrong(x.g)));
  const disagree = byTime(games.filter((x) => x.disagreement));
  const close = byTime(games.filter((x) => isClose(x.g)));
  const env = sortSlate(games.filter((x) => hasEnvironment(x.g)), 'time').sort((a, b) => Number(environmentCount(b.g) >= 2) - Number(environmentCount(a.g) >= 2));
  const control = (x: SlateGame) => {
    const c = x.g!.claims!.control!;
    return <><b>{c.team}</b> · {STRENGTH_LABEL[c.strength]}</>;
  };
  const priced = (x: SlateGame) => <PriceToken x={x} team={x.g!.claims!.control!.team} />;
  const claimsText = (x: SlateGame) => supportChips(x.g?.claims).map((c) => c.text).join(' · ');
  const matchup = (x: SlateGame) => { const n = names(x.item); return <b>{n.awayName} @ {n.homeName}</b>; };
  const quiet = (x: SlateGame) => (
    <Link to={routes.game(slug, x.item.event_id)} className="cfs__row">
      <span className="cfs__logos" aria-hidden="true">
        <TeamMark sport="CFB" abbr={names(x.item).away?.short_name} size="sm" />
        <TeamMark sport="CFB" abbr={names(x.item).home?.short_name} size="sm" />
      </span>
      <span className="cfs__main">
        <span className="cfs__m">{matchup(x)}</span>
        <span className="cfs__s">{claimsText(x)} · {kickText(x.item, now)}</span>
      </span>
    </Link>
  );
  const any = moderate.length + strong.length + close.length + env.length > 0;
  return (
    <section className="cftop" aria-labelledby="cftop-h">
      <h2 className="cfh__h2" id="cftop-h">Top CFB Signals</h2>
      {!any && <p className="cfh__quiet">No CONTROL, close-game or environment claim on this slate yet.</p>}
      <div className="cftop__grid">
        {moderate.length > 0 && (
          <SignalSection
            id={vwActive ? 'value-watch' : 'moderate'}
            glyph={vwActive ? 'star' : 'control'}
            tone={vwActive ? 'star' : 'control'}
            title={vwActive ? s.moderate_control.label : 'Moderate Control'}
            sub={vwActive ? `${s.moderate_control.short} · ${s.moderate_control.status_line}` : 'Historically validated football signal'}
            info={vwActive ? <Info label={`What ${s.moderate_control.label} means`}>{s.moderate_control.explanation}</Info> : undefined}
            rows={moderate}
            onPick={onPick}
            render={(x) => <SignalRow x={x} slug={slug} now={now} main={control(x)} aside={priced(x)} />}
          />
        )}
        {/* The other signal lists pack into balanced columns: a short list never leaves a hole beside a long one. */}
        <div className="cftop__cols">
        {strong.length > 0 && (
          <SignalSection
            id="strong" glyph="control" tone="control" title="Strongest Football Edges"
            sub={`${s.strong_control.label}: ${s.strong_control.short.toLowerCase()} · ${s.strong_control.market_summary.toLowerCase()}`}
            info={<Info label={`What ${s.strong_control.label} means`}>{s.strong_control.explanation}</Info>}
            rows={strong} cap={STRONG_CAP} onPick={onPick}
            render={(x) => <SignalRow x={x} slug={slug} now={now} main={control(x)} aside={priced(x)} />}
          />
        )}
        {disagree.length > 0 && (
          <SignalSection
            id="disagreement" glyph="alert" tone="alert" title={s.market_disagreement.label} sub={s.market_disagreement.short}
            rows={disagree} onPick={onPick}
            render={(x) => <SignalRow x={x} slug={slug} now={now} main={control(x)} aside={priced(x)} />}
          >
            <details className="cfs__why">
              <summary>Why this is flagged</summary>
              <p>{s.market_disagreement.explanation}</p>
            </details>
          </SignalSection>
        )}
        {close.length > 0 && (
          <SignalSection id="close" glyph="close" tone="close" title="Close Game Profiles" sub="Evidence supports a relatively close game" rows={close} cap={CLOSE_CAP} onPick={onPick} render={quiet} />
        )}
        {env.length > 0 && (
          <SignalSection id="environment" glyph="fast" tone="fast" title="Pace / Scoring Spots" sub="Pace, scoring environment or defensive suppression" rows={env} cap={ENV_CAP} onPick={onPick} render={quiet} />
        )}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ research-signals status

function ResearchStrip({ doc }: { doc: SignalsDoc }) {
  const m = doc.signals.moderate_control;
  const st = doc.signals.strong_control;
  const cap = captureLine(doc);
  return (
    <section className="cfrs" aria-labelledby="cfrs-h">
      <h2 className="cfh__h2" id="cfrs-h">CFB Research Signals</h2>
      <div className="cfrs__grid">
        <div className="cfrs__t cfrs__t--star">
          <span className="cfrs__k"><CfbGlyph name="star" tone="star" size={13} /> Moderate CONTROL</span>
          <span className="cfrs__v">{m.label}</span>
          <span className="cfrs__s">{m.status_line} · {m.small_sample}</span>
        </div>
        <div className="cfrs__t">
          <span className="cfrs__k"><CfbGlyph name="control" tone="control" size={13} /> Strong CONTROL</span>
          <span className="cfrs__v">{st.short}</span>
          <span className="cfrs__s">{st.market_summary}</span>
        </div>
        {cap && (
          <div className="cfrs__t">
            <span className="cfrs__k">{cap.title}</span>
            <span className="cfrs__v cfrs__v--sm">{cap.value}</span>
          </div>
        )}
        <div className="cfrs__t">
          <span className="cfrs__k">Prospective tracking</span>
          <span className="cfrs__v cfrs__v--sm">Moderate CONTROL: n = {m.prospective.n}</span>
          <span className="cfrs__s">{m.prospective.statement}</span>
        </div>
      </div>
      <p className="cfrs__foot"><span className="rchip">Research only</span> {doc.methodology_version}</p>
    </section>
  );
}

// ------------------------------------------------------------------ the cards

function GameCard({ x, doc, slug, now }: { x: SlateGame; doc: SignalsDoc | null; slug: string; now: number }) {
  const { away, home, awayName, homeName } = names(x.item);
  const g = x.g;
  const c = g?.claims?.control ?? null;
  const chips = supportChips(g?.claims).slice(0, 3);
  const hist = c ? cardHistorical(g?.historical) : null;
  const noRead = !g || !g.claims || g.status !== 'CLAIMS_PUBLISHED';
  const cls = ['cfc', x.valueWatch && 'cfc--vw', x.disagreement && 'cfc--dis', isStrong(g) && 'cfc--strong', noRead && 'cfc--none'].filter(Boolean).join(' ');
  return (
    <Link to={routes.game(slug, x.item.event_id)} className={cls} data-event={x.item.event_id}>
      <span className="cfc__top">
        <span className="cfc__time">{kickText(x.item, now)}</span>
        {x.valueWatch && <span className="cfbadge cfbadge--star"><CfbGlyph name="star" tone="star" size={12} />{doc?.signals.moderate_control.label ?? 'Value Watch'}</span>}
        {x.disagreement && <span className="cfbadge cfbadge--alert"><CfbGlyph name="alert" tone="alert" size={12} />{doc?.signals.market_disagreement.label ?? 'Market Disagreement'}</span>}
      </span>
      <span className="cfc__teams">
        <TeamMark sport="CFB" abbr={away?.short_name} size="sm" /><span className="cfc__tn">{awayName}</span>
        <span className="cfc__at">@</span>
        <TeamMark sport="CFB" abbr={home?.short_name} size="sm" /><span className="cfc__tn">{homeName}</span>
      </span>
      {c ? (
        <span className="cfc__ctl">
          <span className="cfc__cn">
            <CfbGlyph name={x.valueWatch ? 'star' : 'control'} tone={x.valueWatch ? 'star' : 'control'} size={15} />
            <b>{c.team}</b> · {STRENGTH_LABEL[c.strength]}
          </span>
          <PriceToken x={x} team={c.team} now={now} />
        </span>
      ) : noRead ? (
        <span className="cfc__none">{g?.status === 'NOT_BUILT' ? 'No SIFT read for this game yet' : doc?.signals.no_claim.label ?? 'No clear SIFT read'}</span>
      ) : null}
      {g?.card_line && !noRead && <span className="cfc__line">{g.card_line}</span>}
      {(chips.length > 0 || hist) && (
        <span className="cfc__foot">
          {chips.map((ch) => <Chip key={ch.key} glyph={ch.glyph} tone={ch.tone}>{ch.text}</Chip>)}
          {hist && <span className="cfc__hist">{hist}</span>}
        </span>
      )}
    </Link>
  );
}

// ------------------------------------------------------------------ the schedule

function Schedule({ slate, rest, bySlate, slug, now }: { slate: BoardItem[]; rest: BoardItem[]; bySlate: Map<string, SlateGame>; slug: string; now: number }) {
  const groups = (xs: BoardItem[]) => {
    const m = new Map<string, BoardItem[]>();
    for (const i of [...xs].sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc))) {
      const k = dayLabel(i.start_time_utc);
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return [...m.entries()];
  };
  const row = (i: BoardItem) => {
    const { away, home, awayName, homeName } = names(i);
    return (
      <li key={i.event_id}>
        <Link to={routes.game(slug, i.event_id)} className="cfsch__row" data-event={i.event_id}>
          <span className="cfsch__t num">{timeOnly(i, now)}</span>
          <span className="cfsch__g">
            <TeamMark sport="CFB" abbr={away?.short_name} size="sm" /><span className="cfsch__n">{awayName}</span>
            <span className="cfsch__at">@</span>
            <TeamMark sport="CFB" abbr={home?.short_name} size="sm" /><span className="cfsch__n">{homeName}</span>
          </span>
          <SignalMarks marks={marksOf(bySlate.get(i.event_id) ?? null)} />
        </Link>
      </li>
    );
  };
  return (
    <section className="cfsch" aria-labelledby="cfsch-h">
      <div className="cfh__bar">
        <h2 className="cfh__h2" id="cfsch-h">Full Schedule</h2>
        <span className="cfh__meta">{slate.length + rest.length} games</span>
      </div>
      {groups(slate).map(([day, xs]) => (
        <div key={`s-${day}`} className="cfsch__day">
          <h3 className="cfsch__d">{day}</h3>
          <ul className="cfsch__list">{xs.map(row)}</ul>
        </div>
      ))}
      {rest.length > 0 && <h3 className="cfsch__more">Beyond this slate</h3>}
      {groups(rest).map(([day, xs]) => (
        <div key={`r-${day}`} className="cfsch__day">
          <h3 className="cfsch__d">{day}</h3>
          <ul className="cfsch__list">{xs.map(row)}</ul>
        </div>
      ))}
      <p className="cfsch__foot"><Link to={routes.slate(slug)}>Full slate view: every week and final <Icon name="arrowRight" size={13} /></Link></p>
    </section>
  );
}

// ------------------------------------------------------------------ the page

export function CfbHomeView() {
  const { sport, repo, slug } = useSport();
  const board = useAsync(`board:${sport.code}:${repo.source.root}`, () => repo.board());
  const signals = useCfbSignals(sport.researchSignalsUrl);
  useVisit(sport.label, 'sport');
  const now = useNow(30_000);
  const [sp, setSp] = useSearchParams();
  const filter = parseFilter(sp.get('f'));
  const sort = parseSort(sp.get('sort'));
  const [showAll, setShowAll] = useState(false);
  const doc = signals.doc;
  const items = useMemo(() => board.data?.items ?? [], [board.data]);
  const slate = useMemo(() => slateOf(items, doc, now), [items, doc, now]);
  const tickers = useMemo(
    () => slate.items.map((i) => doc?.byEvent.get(i.event_id)?.market).filter((m) => m?.is_control_side && m.price?.market_ticker).map((m) => m!.price!.market_ticker!),
    [slate, doc],
  );
  const live = useLiveQuotes(tickers, 'slate');
  const games = useMemo(
    () => slate.items.map((i) => {
      const t = doc?.byEvent.get(i.event_id)?.market?.price?.market_ticker;
      const q = t ? live.quote(t) : undefined;
      return slateGame(i, doc, q ? { yesAsk: q.yesAsk, observedAt: q.observedAt } : null);
    }),
    [slate, doc, live],
  );
  const bySlate = useMemo(() => new Map(games.map((x) => [x.item.event_id, x])), [games]);
  const shown = useMemo(() => sortSlate(games.filter((x) => matchesFilter(x, filter)), sort), [games, filter, sort]);

  const setParam = (k: 'f' | 'sort', v: string | null) => {
    setShowAll(false);
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      if (v) n.set(k, v); else n.delete(k);
      return n;
    }, { replace: true });
  };
  const pick = (f: FilterId) => {
    setParam('f', f === 'all' ? null : f);
    requestAnimationFrame(() => document.getElementById('cfh-games')?.scrollIntoView?.({ block: 'start' }));
  };

  if (board.loading) return <div className="page"><Skeleton lines={6} tall /></div>;
  if (!board.data) return <div className="page"><ErrorState error={board.error} what={`${sport.label} board`} /></div>;
  const slateIds = new Set(slate.items.map((i) => i.event_id));
  const rest = items.filter((i) => !slateIds.has(i.event_id));
  // The freshest read of these prices: the research conductor's own Kalshi read when it succeeded, else the board's capture.
  const boardCapture = slate.items.map((i) => i.market_captured_at).filter(Boolean).sort().pop() ?? null;
  const conductorRead = doc?.sources?.market_read?.ok ? doc.sources.market_read.at : null;
  const lastCapture = [boardCapture, conductorRead].filter((x): x is string => !!x).sort().pop() ?? null;
  const vwActive = valueWatchActive(doc);
  const filters: FilterId[] = ['all', ...(vwActive ? (['value-watch'] as FilterId[]) : []), 'moderate', 'strong', 'close', 'fast', 'defensive', 'disagreement', ...(filter === 'environment' ? (['environment'] as FilterId[]) : [])];
  const cards = showAll ? shown : shown.slice(0, CARD_CAP);

  return (
    <div className="page cfh">
      <header className="hbar">
        <h1 className="hbar__h">{sport.label}</h1>
        <span className="hbar__m">{slate.week != null ? `Week ${slate.week} · ` : ''}{slate.items.length} games · <QuoteChip view={publicationView(lastCapture)} now={now} label="prices" /></span>
        <span className="hbar__x">
          <Link to={routes.slate(slug)} className="btn btn--sm">Full slate <Icon name="arrowRight" size={14} /></Link>
        </span>
      </header>

      {/* One composition: Slate Priorities first on phones (right after the slate line), the right rail beside Top
          CFB Signals on desktop; the slate's cards and the schedule run full width below. */}
      <div className="cfh__top">
        <div className="cfh__rail">
          <CfbSlatePriorities games={games} doc={doc} loading={signals.loading} slug={slug} now={now} />
        </div>
        <div className="cfh__main">
          {signals.loading && !doc && <div className="cfh__load"><Skeleton lines={3} /></div>}
          {!signals.loading && !doc && (
            <p className="cfh__notice" role="status">
              SIFT research signals are unavailable right now, so game reads and Value Watch are not shown. The schedule below is complete.
            </p>
          )}
          {doc && (
            <div className="cfh__intel">
              <TopSignals games={games} doc={doc} slug={slug} now={now} onPick={pick} />
              <ResearchStrip doc={doc} />
            </div>
          )}
        </div>
      </div>

      <section className="cfgames" id="cfh-games" aria-labelledby="cfgames-h">
        <div className="cfh__bar">
          <h2 className="cfh__h2" id="cfgames-h">This Slate</h2>
          <span className="cfh__meta">{shown.length} of {games.length} games</span>
        </div>
        <div className="cfctl">
          <div className="cffilters" role="group" aria-label="Filter games">
            {filters.map((f) => {
              const gl = FILTER_GLYPH[f];
              return (
                <button key={f} type="button" className={`cff${filter === f ? ' is-on' : ''}${f === 'value-watch' ? ' cff--star' : ''}`} aria-pressed={filter === f} onClick={() => setParam('f', f === 'all' ? null : f)}>
                  {gl && <CfbGlyph name={gl[0]} tone={gl[1]} size={13} />}{filterWord(f, doc)}
                </button>
              );
            })}
          </div>
          <div className="cfsort" role="group" aria-label="Sort games">
            {([['priority', 'SIFT priority'], ['time', 'Time']] as [SortId, string][]).map(([k, l]) => (
              <button key={k} type="button" className={`cff${sort === k ? ' is-on' : ''}`} aria-pressed={sort === k} onClick={() => setParam('sort', k === 'priority' ? null : k)}>{l}</button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="cfh__quiet">
            No game on this slate matches {filterWord(filter, doc)}. <button type="button" className="cflink" onClick={() => setParam('f', null)}>Show all games</button>
          </p>
        ) : (
          <ul className="cfcards">
            {cards.map((x) => <li key={x.item.event_id}><GameCard x={x} doc={doc} slug={slug} now={now} /></li>)}
          </ul>
        )}
        {!showAll && shown.length > cards.length && (
          <button type="button" className="btn btn--sm cfmore" onClick={() => setShowAll(true)}>Show all {shown.length} games</button>
        )}
      </section>

      <Schedule slate={slate.items} rest={rest} bySlate={bySlate} slug={slug} now={now} />
    </div>
  );
}
