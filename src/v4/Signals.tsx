// v4 Signals: the research inbox. Every published opportunity the app's opportunity layer holds, in the order and grouping
// the app already defines (compareOpportunities / featureOpportunities), placed by what it is at this moment: a current
// signal, a published watch, a pass (with the publication's reason), or something that is no longer current. A card says
// only what is needed to decide whether to look: the game, the exact contract and side, the published thesis, the
// publication's status and authority, and the Kalshi ask with its age. Fee, uncertainty, calibration and risk live in the
// existing research sheet. Nothing here prices, scores or ranks on its own.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from '../routing';
import { Icon } from './Icon';
import { SaveControl } from './SaveControl';
import { contractWords, useResearch } from './ResearchSheet';
import { sideExtra } from './saveSide';
import { buildFeed, coverage, focusOf, gameOptions, parseFilter, signalsHref, standingOf, STANDING_LABEL, STANDING_ORDER, type SportCoverage, type StandingKind } from './signalsModel';
import { agoWord, authorityWord } from './words';
import { clock } from './model';
import { gameHref } from './base';
import { useNow } from '../live/hooks';
import { quoteAgeMs, quoteFreshness } from '../live/freshness';
import { useAllOpportunities } from '../opportunity/load';
import type { Featured } from '../opportunity/rank';
import type { Opportunity } from '../opportunity/types';
import { gameRows, type GameRow } from '../views/broadcast/games';
import { navSport } from '../data/nav';
import { SportMark } from '../components/SportMark';
import { betPhrase } from '../lib/betWords';

const cents = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
const STATUS_WORD: Record<Opportunity['status'], string> = { ACTIONABLE: 'Actionable', RESEARCH_CANDIDATE: 'Research candidate', WATCH: 'Watch', PASS: 'Passed' };
const cardId = (o: Opportunity) => `sg-${o.id.replace(/[^A-Za-z0-9_-]/g, '-')}`;

// ------------------------------------------------------------------ one card

interface CardProps {
  o: Opportunity;
  g: GameRow | undefined;
  kind: StandingKind;
  now: number;
  focus: boolean;
  /** The lead's correlation context from the app's own grouping (featureOpportunities). */
  f?: Featured;
  onOpen: (o: Opportunity, g?: GameRow) => void;
}

function Ask({ o, kind, now }: { o: Opportunity; kind: StandingKind; now: number }) {
  // A watch is a game-level signal, not a priced contract: it carries no price claim.
  if (kind === 'watch') return <span className="v4-sg__ask">Game-level watch · no priced contract signal</span>;
  const p = o.price;
  if (p.ask == null) return <span className="v4-sg__ask">No executable quote</span>;
  const q = quoteFreshness(p.observedAt, now);
  const ok = q === 'FRESH' || q === 'AGING';
  const age = quoteAgeMs(p.observedAt, now);
  return (
    <span className="v4-sg__ask">
      <i className={`v4-dot${ok && kind === 'current' ? '' : ' v4-dot--stale'}`} aria-hidden="true" />
      <span>Kalshi {o.what.side} ask <b className="num">{cents(p.ask)}</b></span>
      <span className="v4-sg__age">{p.observedAt ? (ok ? agoWord(age) : `stale · ${agoWord(age)}`) : 'no capture time'}</span>
    </span>
  );
}

function SignalCard({ o, g, kind, now, focus, f, onOpen }: CardProps) {
  const [rel, setRel] = useState(false);
  const words = betPhrase(o.what.side, o.what.title);
  const when = Number.isFinite(Date.parse(o.startTime)) ? clock(Date.parse(o.startTime)) : null;
  const nav = navSport(o.slug);
  const marketBeats = o.confidence.calibration === 'MARKET_BEATS_MODEL';
  const related = f?.related ?? [];
  const label = `Open research: ${words.exact}, ${o.eventLabel}${kind === 'current' ? '' : `, ${STANDING_LABEL[kind].toLowerCase()}`}`;
  return (
    <li id={cardId(o)} className={`v4-sg v4-sg--${kind}${focus ? ' is-focus' : ''}`} data-standing={kind} data-side={o.what.side}>
      <div className="v4-sg__row">
        <button type="button" className="v4-sg__main" onClick={() => onOpen(o, g)} aria-label={label}>
          <span className="v4-sg__top">
            {nav && <SportMark slug={nav.slug} icon={nav.icon} size={16} />}
            <span className="v4-sg__game">{o.eventLabel}</span>
            {when && <span className="v4-sg__when">{when}</span>}
          </span>
          <span className="v4-sg__t"><b title={words.exact}>{contractWords(o)}</b><span className={`v4-sg__side v4-sg__side--${o.what.side.toLowerCase()}`}>{o.what.side}</span></span>
          <span className="v4-sg__why">{o.why}</span>
          <span className="v4-sg__meta">
            <span className={`v4-badge${kind === 'current' ? ' v4-badge--model' : kind === 'watch' ? '' : ' v4-badge--quiet'}`}>{kind === 'current' ? STATUS_WORD[o.status] : kind === 'watch' ? 'Watch' : kind === 'passed' ? 'Passed' : 'No longer current'}</span>
            <span className="v4-sg__auth">{authorityWord(o.authority)}</span>
            {marketBeats && <span className="v4-badge v4-badge--risk" title="The publication's own settled record shows the market has beaten its model on this kind of signal.">Market has beaten the model</span>}
          </span>
          {kind !== 'passed' && <Ask o={o} kind={kind} now={now} />}
        </button>
        {o.marketId && kind !== 'passed' && kind !== 'stale' && (
          <SaveControl sport={o.sport} id={o.marketId} extra={sideExtra(o.marketId, o.eventId, o.what.side)} kickoff={o.startTime} variant="icon"
            label={{ label: contractWords(o), sub: `${o.eventLabel}${o.competition ? ` · ${o.competition}` : ''}`, href: o.href, kickoff: o.startTime, side: o.what.side }} />
        )}
      </div>
      {(kind === 'passed' || kind === 'stale') && <p className="v4-sg__reason"><b>{kind === 'passed' ? 'Why it passed' : 'Why it is no longer current'}</b>{' '}{standingOf(o, now).why ?? o.statusReason}</p>}
      {f && (f.related.length > 0 || f.conflicts.length > 0 || f.sameGame.length > 0) && (
        <div className="v4-sg__rel">
          {f.conflicts.length > 0 && <p className="v4-sg__flag"><Icon name="warning" size="xs" />Relies on the opposite scenario to {f.conflicts.map((c) => betPhrase(c.what.side, c.what.title).text).join('; ')}: the two cannot both win.</p>}
          {f.sameGame.length > 0 && f.conflicts.length === 0 && <p className="v4-sg__flag v4-sg__flag--plain">{f.sameGame.length} other signal{f.sameGame.length === 1 ? '' : 's'} on this game: one game exposure, not independent edges.</p>}
          {related.length > 0 && (
            <>
              <button type="button" className="v4-sg__more" aria-expanded={rel} onClick={() => setRel((r) => !r)}>{related.length} related expression{related.length === 1 ? '' : 's'}<Icon name={rel ? 'caret-up' : 'caret-down'} size="xs" /></button>
              {rel && (
                <ul className="v4-sg__relist">
                  {related.map((r) => (
                    <li key={r.id}>
                      <button type="button" className="v4-sg__relbtn" onClick={() => onOpen(r, g)} aria-label={`Open research: ${betPhrase(r.what.side, r.what.title).exact}`}>
                        <span><b>{contractWords(r)}</b><span className={`v4-sg__side v4-sg__side--${r.what.side.toLowerCase()}`}>{r.what.side}</span></span>
                        <small>{f.opposed.includes(r.id) ? 'Opposite outcome to the lead: they cannot both win' : 'Same thesis, another way in'}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

// ------------------------------------------------------------------ groups

function Group({ title, n, children, note }: { title: string; n: number; children: React.ReactNode; note?: string }) {
  if (!n) return null;
  return (
    <section className="v4-sec" aria-label={title}>
      <header className="v4-sechead"><h2>{title}</h2><span className="v4-sechead__n">{n}</span></header>
      {note && <p className="meta v4-sg__gnote">{note}</p>}
      <ul className="v4-sg__list">{children}</ul>
    </section>
  );
}

/** A group the feed keeps closed until asked (passes, and what is no longer current): the count and the reason stay visible. */
function Collapsed({ id, title, n, note, forceOpen, children }: { id: string; title: string; n: number; note: string; forceOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const shown = open || forceOpen;
  if (!n) return null;
  return (
    <section className="v4-disc v4-sg__disc" aria-label={title}>
      <button type="button" className="v4-disc__b" aria-expanded={shown} aria-controls={id} onClick={() => setOpen(!shown)}>
        <span><b>{title} <span className="v4-sechead__n">{n}</span></b><small>{note}</small></span><Icon name={shown ? 'caret-up' : 'caret-down'} size="s" />
      </button>
      {shown && <ul id={id} className="v4-sg__list v4-sg__list--in">{children}</ul>}
    </section>
  );
}

function Coverage({ rows, sport }: { rows: SportCoverage[]; sport: string | null }) {
  const list = rows.filter((r) => !sport || r.slug === sport);
  if (!list.length) return null;
  return (
    <section className="v4-sec" aria-label="What each sport published">
      <header className="v4-sechead"><h2>By sport</h2></header>
      <ul className="v4-sg__cov">
        {list.map((r) => (
          <li key={r.slug} className={`v4-sg__covrow v4-sg__covrow--${r.state}`} data-state={r.state}>
            <span className="v4-sg__covh"><b>{r.label}</b>
              <span>{r.state === 'unavailable' ? 'Publication unavailable' : r.state === 'signals' ? `${r.counts.current} current${r.counts.watch ? ` · ${r.counts.watch} watch` : ''}` : 'No current signals'}</span>
            </span>
            {r.note && <p>{r.state === 'unavailable' ? `Could not be read (${r.note}). This is not a verdict that nothing qualifies.` : r.note}</p>}
            {r.state !== 'unavailable' && (r.counts.passed > 0 || r.counts.stale > 0) && <p className="v4-sg__covn">{r.counts.passed} passed · {r.counts.stale} no longer current</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ the screen

export function V4Signals() {
  const [sp, setSp] = useSearchParams();
  const now = useNow(30_000);
  const all = useAllOpportunities(now);
  const open = useResearch();
  const f = useMemo(() => parseFilter(sp), [sp]);
  const set = (patch: Record<string, string | null>) => setSp((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); } return n; }, { replace: true });
  // Changing a filter drops the contract the viewer arrived with: that focus belongs to the link they followed.
  const pick = (patch: Record<string, string | null>) => set({ market: null, side: null, ...patch });

  const rows = useMemo(() => gameRows(all.bundles, all.opportunities, now), [all.bundles, all.opportunities, now]);
  const gameBy = useMemo(() => new Map(rows.map((g) => [`${g.slug}:${g.item.event_id}`, g])), [rows]);
  const feed = useMemo(() => buildFeed(all.opportunities, now, f), [all.opportunities, now, f]);
  const cov = useMemo(() => coverage(all.bundles, all.verdicts, all.opportunities, now), [all.bundles, all.verdicts, all.opportunities, now]);
  const games = useMemo(() => gameOptions(all.opportunities, f.sport), [all.opportunities, f.sport]);
  const { exact: focus, other: otherSide } = useMemo(() => focusOf(all.opportunities, f.market, f.side), [all.opportunities, f.market, f.side]);
  const focusGroup = focus ? feed.standing.get(focus.id)?.kind ?? null : null;
  const unavailable = !!all.error || (!all.loading && all.bundles.length > 0 && all.bundles.every((b) => b.error != null));
  const failed = all.bundles.filter((b) => b.error != null);

  // Bring the contract a prop or game link pointed at into view once the feed has loaded.
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || all.loading) return;
    const key = `${focus.id}`;
    if (done.current === key) return;
    const el = document.getElementById(cardId(focus));
    if (el) { done.current = key; el.scrollIntoView({ block: 'center' }); }
  });

  const onOpen = (o: Opportunity, g?: GameRow) => open(o, g ?? gameBy.get(`${o.slug}:${o.eventId}`), { signalsLink: false });
  const live = feed.counts.current + feed.counts.watch;
  const newestQuote = useMemo(() => {
    const t = feed.current.flatMap((x) => [x.lead, ...x.related]).map((o) => o.price.observedAt).filter((x): x is string => !!x).sort().pop() ?? null;
    return t;
  }, [feed]);
  const sportRows = cov;

  return (
    <div>
      <div className="v4-stage">
        <header className="v4-top" style={{ alignItems: 'flex-start', paddingBottom: 0 }}>
          <div style={{ minWidth: 0 }}>
            <h1 className="v4-h1">Signals</h1>
            <p className="v4-sub">What the publications flag for research, in their own order. Research only.</p>
          </div>
        </header>
        <div className="v4-chips" role="group" aria-label="Sport" style={{ paddingTop: 14 }}>
          <button type="button" className="v4-chip" aria-pressed={!f.sport} onClick={() => pick({ sport: null, game: null })}>All sports</button>
          {sportRows.map((s) => {
            const nav = navSport(s.slug);
            return (
              <button key={s.slug} type="button" className="v4-chip" aria-pressed={f.sport === s.slug} onClick={() => pick({ sport: f.sport === s.slug ? null : s.slug, game: null })}>
                {nav && <SportMark slug={nav.slug} icon={nav.icon} size={20} />}{s.label}
                {s.state === 'unavailable' ? <i title="Publication unavailable">!</i> : s.counts.current + s.counts.watch > 0 ? <i>{s.counts.current + s.counts.watch}</i> : null}
              </button>
            );
          })}
        </div>
        {(f.sport || f.game) && games.length > 0 && (
          <div className="v4-chips" role="group" aria-label="Game" style={{ paddingTop: 8 }}>
            <button type="button" className="v4-chip" aria-pressed={!f.game} onClick={() => pick({ game: null })}>All games</button>
            {games.map((g) => <button key={g.eventId} type="button" className="v4-chip" aria-pressed={f.game === g.eventId} onClick={() => pick({ game: f.game === g.eventId ? null : g.eventId })}>{g.label}<i>{g.n}</i></button>)}
          </div>
        )}
        <div className="v4-chips" role="group" aria-label="Status" style={{ paddingTop: 8 }}>
          <button type="button" className="v4-chip" aria-pressed={!f.status} onClick={() => pick({ status: null })}>All</button>
          {STANDING_ORDER.map((k) => <button key={k} type="button" className="v4-chip" aria-pressed={f.status === k} onClick={() => pick({ status: f.status === k ? null : k })}>{STANDING_LABEL[k]}<i>{feed.counts[k]}</i></button>)}
        </div>
      </div>

      <div className="v4-body">
        {unavailable ? (
          <div className="v4-note v4-note--risk" role="alert"><Icon name="cloud-slash" /><div><b>Published signals are unavailable</b>No publication could be read, so there is nothing to say about signals. This is not a verdict that none qualify.</div></div>
        ) : all.loading && !all.opportunities.length ? (
          <div role="status" aria-label="Loading published signals"><div className="v4-skel" style={{ height: 150, margin: '0 16px', borderRadius: 22 }} /><div className="v4-skel" style={{ height: 150, margin: '12px 16px 0', borderRadius: 22 }} /></div>
        ) : (
          <>
            {failed.length > 0 && <div className="v4-note" style={{ marginBottom: 16 }} role="status"><Icon name="info" /><div><b>{failed.length} publication{failed.length === 1 ? '' : 's'} unavailable</b>{failed.map((b) => b.sport.label).join(', ')} could not be read: that is missing data, not zero signals. The rest are shown.</div></div>}
            {f.market && !focus && !otherSide && <div className="v4-note" style={{ marginBottom: 16 }} role="status"><Icon name="info" /><div><b>No published signal for that contract{f.side ? ` on the ${f.side} side` : ''}</b>The publication holds nothing for it, so none is shown{f.game ? '; here are the signals on the game' : ''}.</div></div>}
            {otherSide && <div className="v4-note" style={{ marginBottom: 16 }} role="status"><Icon name="info" /><div><b>Only the {otherSide.what.side} side is published</b>There is no published signal for the {f.side} side of this contract. The {otherSide.what.side} signal is not a signal for the side you were reading.</div></div>}
            <p className="meta v4-sg__sum" role="status">
              {live > 0 ? `${feed.counts.current} current signal${feed.counts.current === 1 ? '' : 's'}${feed.counts.watch ? ` · ${feed.counts.watch} watch` : ''}` : 'No current signals'}
              {newestQuote && feed.counts.current > 0 ? ` · newest quote ${agoWord(quoteAgeMs(newestQuote, now))}` : ''}
            </p>

            <Group title={STANDING_LABEL.current} n={feed.counts.current && feed.current.reduce((n, x) => n + 1 + x.related.length, 0)} note={feed.current.length < feed.counts.current ? `${feed.current.length} thesis group${feed.current.length === 1 ? '' : 's'}: the publications' own grouping puts related expressions under one lead.` : undefined}>
              {feed.current.map((x) => <SignalCard key={x.lead.id} o={x.lead} f={x} kind="current" g={gameBy.get(`${x.lead.slug}:${x.lead.eventId}`)} now={now} focus={focus?.id === x.lead.id} onOpen={onOpen} />)}
            </Group>
            <Group title={STANDING_LABEL.watch} n={feed.watch.reduce((n, x) => n + 1 + x.related.length, 0)} note="Published game-level watches. A watch is a game to look at, not a priced contract signal.">
              {feed.watch.map((x) => <SignalCard key={x.lead.id} o={x.lead} f={x} kind="watch" g={gameBy.get(`${x.lead.slug}:${x.lead.eventId}`)} now={now} focus={focus?.id === x.lead.id} onOpen={onOpen} />)}
            </Group>
            {live === 0 && !f.status && <div className="v4-note" style={{ marginTop: 24 }}><Icon name="pulse" /><div><b>No current signals{f.sport ? ' for this sport' : ''}</b>Nothing the publications flag qualifies right now. The reason for each sport is below.</div></div>}

            <Collapsed id="sg-stale" title={STANDING_LABEL.stale} n={feed.stale.length} forceOpen={focusGroup === 'stale' || f.status === 'stale'} note="Expired, stale or frozen: not signals any more. Each says why.">
              {feed.stale.map(({ o }) => <SignalCard key={o.id} o={o} kind="stale" g={gameBy.get(`${o.slug}:${o.eventId}`)} now={now} focus={focus?.id === o.id} onOpen={onOpen} />)}
            </Collapsed>
            <Collapsed id="sg-passed" title={STANDING_LABEL.passed} n={feed.passed.length} forceOpen={focusGroup === 'passed' || f.status === 'passed'} note="The publication judged these and said no. Each keeps its reason; none is active.">
              {feed.passed.map(({ o }) => <SignalCard key={o.id} o={o} kind="passed" g={gameBy.get(`${o.slug}:${o.eventId}`)} now={now} focus={focus?.id === o.id} onOpen={onOpen} />)}
            </Collapsed>

            <Coverage rows={cov} sport={f.sport} />
            <p className="v4-foot">Research only. SIFT reports what each publication states and does not recommend a bet. A model figure above a Kalshi price is not a profit: it is not net of fees, and only the publication's own uncertainty and calibration, in the research sheet, say how much weight it deserves.</p>
            {f.game && (() => { const g = rows.find((r) => r.item.event_id === f.game); return g ? <p style={{ padding: '0 16px', marginTop: 12 }}><Link to={gameHref(g)} className="v4-btn v4-btn--sec">Open the game</Link></p> : null; })()}
            {(f.sport || f.game || f.status) && <p style={{ padding: '0 16px', marginTop: 12 }}><Link to={signalsHref()} className="v4-textlink">Clear filters</Link></p>}
          </>
        )}
      </div>
    </div>
  );
}
