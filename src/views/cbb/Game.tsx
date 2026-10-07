// The CBB game page: a basketball matchup first, research detail below it.
// Hierarchy: the matchup hero (logos, tip, venue, projected score and win probability — or a clear pending
// state) → the projection with the model's own uncertainty → each offense against the defense it faces →
// roster composition and the expected rotation → model comparison → research status → markets → provenance.
// Every number is read from the event research document the CBB publisher built from its immutable pre-tip
// archive (and, for national ranks, the teams' published profiles); nothing here computes a projection, a
// rating or an edge.
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import type { EntityProfileDoc, EventResearchDoc, MetricDef, Observation, Participant } from '../../contract/types';
import { useAsync } from '../../data/hooks';
import { Icon } from '../../components/Icon';
import { MetricInfo, TermInfo } from '../../components/Gloss';
import { ErrorState, Notice, QualityBadge, Skeleton, Stratum } from '../../components/ui';
import { routes } from '../../lib/routes';
import { useNow } from '../../live/hooks';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import {
  CONFIDENCE_TEXT, fmt1, marginWords, pct0, researchExt, shortSha, signed1, stampTime, teamShort, tipLabel,
  type CbbResearchExt, type ModelRow, type ProsterSide, type RotationPlayer, type TeamRoster,
} from './data';
import { confShort, identity, matchupAccents } from './identity';
import { AsOf, CbbMark, ConfidenceChip, IntegrityBadge, KV, RoleTag } from './ui';
import { AxisKey, MarginAxis, MinuteBar, MinutesComp, TotalAxis, WinSplit } from './viz';

type Side = 'home' | 'away';

export function CbbGameView({ eventId }: { eventId: string }) {
  const { sport, repo, slug } = useSport();
  const research = useAsync(`er:${sport.code}:${eventId}`, () => repo.eventResearch(eventId));
  const now = useNow(30_000);
  const r = research.data;
  const ev = r?.event;
  const home = ev?.participants.find((p) => p.participant_id === ev.home_participant);
  const away = ev?.participants.find((p) => p.participant_id === ev.away_participant);
  // the teams' published profiles: national ranks for the roster comparison (memoized with the team pages)
  const hp = useAsync(home ? `prof:${sport.code}:${home.participant_id}` : null, () => repo.profile(home!.participant_id));
  const ap = useAsync(away ? `prof:${sport.code}:${away.participant_id}` : null, () => repo.profile(away!.participant_id));
  const neutral = !!(ev?.extensions as { cbb?: { neutral_site?: boolean } } | undefined)?.cbb?.neutral_site;
  useVisit(ev ? `${teamShort(away)} ${neutral ? 'vs' : 'at'} ${teamShort(home)}` : null, 'game');
  if (research.loading) return <div className="page"><Skeleton lines={8} tall /></div>;
  const c = researchExt(r);
  if (!r || !ev || !home || !away || !c) return <div className="page"><ErrorState error={research.error} what="this game's research" /></div>;
  const hn = teamShort(home);
  const an = teamShort(away);
  const primary = c.models_detail.find((m) => m.version === c.primary_version) ?? null;
  const colors = matchupAccents(identity(away.participant_id), identity(home.participant_id));
  const accentVars = { '--ca': colors[0], '--ch': colors[1] } as CSSProperties;
  return (
    <div className="page cbbg" style={accentVars}>
      <Hero r={r} c={c} home={home} away={away} slug={slug} now={now} primary={primary} colors={colors} />
      <nav className="cbbg__toc" aria-label="Game sections">
        {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} onClick={(e) => jumpTo(e, id)}>{label}</a>)}
      </nav>

      <Stratum id="cg-proj" title="Projected score" sub={primary ? 'The production incumbent’s projection, archived before tip. Research evidence, never a pick.' : undefined}>
        {primary ? <ProjectionBlock m={primary} hn={hn} an={an} c={c} now={now} /> : <NoProjection c={c} start={ev.start_time_utc} />}
        {c.result && <ResultLine c={c} hn={hn} an={an} />}
      </Stratum>

      <Stratum id="cg-matchup" title={r.matchup.length ? 'Opponent-adjusted matchup' : 'Roster comparison'} sub={r.matchup.length ? <>Each offense against the defense it faces, on ratings adjusted for opponent strength inside the model fit. Bars show national standing (closer to #1 = longer). <TermInfo k="cbb_standing" /></> : <>Roster truth side by side, with each team’s national rank. Not opponent-adjusted. Opponent-adjusted ratings arrive with the first archived projection.</>}>
        {r.matchup.length ? <Matchup r={r} c={c} an={an} hn={hn} slug={slug} /> : <TaleOfTape c={c} away={away} home={home} ap={ap.data} hp={hp.data} slug={slug} />}
      </Stratum>

      <Stratum id="cg-roster" title="Roster situation" sub={c.roster.basis_text}>
        <Rosters c={c} home={home} away={away} slug={slug} />
      </Stratum>

      <Stratum id="cg-models" title="Model comparison" sub={c.model_order_note}>
        <ModelComparison c={c} hn={hn} an={an} />
      </Stratum>

      <Stratum id="cg-status" title="Research status" sub="Prospective evaluation of the frozen models: what this game will count for, and nothing more.">
        <ResearchStatus c={c} />
      </Stratum>

      <Stratum id="cg-markets" title="Markets">
        {r.markets.length ? (
          <ul className="cbbmk">
            {r.markets.map((m) => (
              <li key={m.market_id}><Link to={routes.market(slug, m.market_id, ev.event_id)}>{m.yes_description}</Link> <span className="num muted">{m.yes_bid != null ? `${Math.round(m.yes_bid * 100)}¢` : '—'} / {m.yes_ask != null ? `${Math.round(m.yes_ask * 100)}¢` : '—'}</span></li>
            ))}
          </ul>
        ) : (
          <p className="muted">Market research is not published for CBB yet: no Kalshi game contract maps to this game. Projections are shown without any market comparison.</p>
        )}
      </Stratum>

      <p className="cbbg__packet">
        <Link className="btn btn--sm" to={routes.packet({ sport: slug, scope: 'GAME', event: ev.event_id })}><Icon name="copy" size={14} /> Copy for ChatGPT</Link>
        <span className="muted small">A research packet: projection rows, rosters, opponent-adjusted ratings and the prospective sample. Evidence, not instructions.</span>
      </p>

      <Provenance r={r} c={c} now={now} />
    </div>
  );
}

// The app routes on the URL hash, so an in-page "#section" link would navigate away from the game:
// the section tabs scroll instead (and open the provenance disclosure when it is the target).
const SECTIONS = [['cg-proj', 'Projection'], ['cg-matchup', 'Matchup'], ['cg-roster', 'Rosters'], ['cg-models', 'Models'], ['cg-status', 'Research status'], ['cg-prov', 'Data & provenance']] as const;

function jumpTo(e: MouseEvent<HTMLAnchorElement>, id: string) {
  e.preventDefault();
  const el = document.getElementById(id);
  if (!el) return;
  if (el instanceof HTMLDetailsElement) el.open = true;
  el.scrollIntoView({ block: 'start' });
}

// ------------------------------------------------------------------ hero

function captureOpens(startIso: string): string {
  return new Date(new Date(startIso).getTime() - 30 * 3600_000).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function Hero({ r, c, home, away, slug, now, primary, colors }: { r: EventResearchDoc; c: CbbResearchExt; home: Participant; away: Participant; slug: string; now: number; primary: ModelRow | null; colors: [string, string] }) {
  const ev = r.event;
  const venue = [c.venue.name, [c.venue.city, c.venue.region].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  const hn = teamShort(home);
  const an = teamShort(away);
  const final = c.result;
  const scoreOf = (side: Side): { v: string; k: string } | null =>
    final ? { v: String(side === 'home' ? final.home_score : final.away_score), k: 'Final' }
      : primary ? { v: fmt1(side === 'home' ? primary.home_score : primary.away_score), k: 'Projected' } : null;
  const team = (p: Participant, side: Side) => {
    const t = identity(p.participant_id);
    const conf = confShort(t?.conference ?? (typeof p.metadata?.conference === 'string' ? p.metadata.conference : null));
    const s = scoreOf(side);
    return (
      <div className={`cgh__side cgh__side--${side}`}>
        <Link to={routes.team(slug, p.participant_id)} className="cbbh__team">
          <CbbMark p={p} size="xl" />
          <span className="cgh__id">
            <span className="cgh__name">{teamShort(p)}</span>
            <span className="cgh__sub">{t?.full.replace(teamShort(p), '').trim() || p.display_name}{conf ? ` · ${conf}` : ''}</span>
          </span>
        </Link>
        {s && <span className={`cgh__score num${final ? ' is-final' : ''}`} aria-label={`${s.k} ${teamShort(p)} ${s.v}`}>{s.v}</span>}
        <ConfidenceChip c={c.roster_confidence[side]} />
      </div>
    );
  };
  return (
    <header className="cgh">
      <div className="cgh__eyebrow">
        <span className="cgh__when"><Icon name="clock" size={13} /> {tipLabel(ev.start_time_utc, c)}</span>
        {c.event_name && <span className="cgh__tag cgh__tag--event">{c.event_name}</span>}
        {c.neutral_site && <span className="cgh__tag">Neutral site</span>}
        {c.conference_game && <span className="cgh__tag">Conference game</span>}
        {c.tbd && <span className="cgh__tag cgh__tag--warn"><Icon name="info" size={12} /> Tip time TBD</span>}
        {ev.status !== 'SCHEDULED' && <span className="cgh__tag cgh__tag--st">{ev.status.toLowerCase()}</span>}
      </div>
      <h1 className="sr-only">{an} {c.neutral_site ? 'vs' : 'at'} {hn}</h1>
      <div className={`cgh__board${primary || final ? ' has-score' : ''}`}>
        {team(away, 'away')}
        <div className="cgh__mid">
          {final ? (
            <><span className="cgh__k">Final</span><IntegrityBadge i={c.integrity} /></>
          ) : primary ? (
            <>
              <span className="cgh__k">Projected</span>
              <span className="cgh__line">{marginWords(primary.margin, hn, an)}</span>
              <span className="cgh__at" aria-hidden="true">{c.neutral_site ? 'vs' : '@'}</span>
            </>
          ) : (
            <>
              <span className="cgh__at cgh__at--big" aria-hidden="true">{c.neutral_site ? 'vs' : '@'}</span>
              <PendingBadge c={c} start={ev.start_time_utc} />
            </>
          )}
        </div>
        {team(home, 'home')}
      </div>
      {primary && primary.home_win_prob != null && (
        <div className="cgh__strip">
          <WinSplit pHome={primary.home_win_prob} away={an} home={hn} colors={colors} />
          <dl className="cgh__kpis">
            <div><dt>Projected margin</dt><dd>{marginWords(primary.margin, hn, an)}</dd></div>
            <div><dt>Total</dt><dd className="num">{fmt1(primary.total)}</dd></div>
            <div><dt>Possessions</dt><dd className="num">{fmt1(primary.possessions)}</dd></div>
            <div><dt>Margin SD <TermInfo k="cbb_model_range" align="end" /></dt><dd className="num">±{fmt1(primary.margin_sd)}</dd></div>
          </dl>
        </div>
      )}
      <p className="cgh__meta">
        {venue && <span><Icon name="pin" size={13} /> {venue}</span>}
        {primary && <AsOf iso={primary.as_of} label="projection archived" now={now} />}
        {final && primary && <span className="muted">Projected {an} {fmt1(primary.away_score)} – {hn} {fmt1(primary.home_score)}</span>}
      </p>
    </header>
  );
}

function PendingBadge({ c, start }: { c: CbbResearchExt; start: string }) {
  const st = c.projection_state;
  return (
    <div className={`cpend cpend--${st.toLowerCase()}`}>
      <span className="cpend__t"><Icon name="clock" size={14} /> {st === 'UNAVAILABLE' ? 'No pre-tip projection' : st === 'AWAITING_CAPTURE' ? 'Capture window open' : 'Projection pending'}</span>
      {st === 'PENDING_WINDOW' && <span className="cpend__s">{c.tbd ? 'Archived within 30 h of tip' : <>Window opens {captureOpens(start)}</>}</span>}
      {st === 'AWAITING_CAPTURE' && <span className="cpend__s">The next scheduled run records it before tip</span>}
    </div>
  );
}

// ------------------------------------------------------------------ projection

function ProjectionBlock({ m, hn, an, c, now }: { m: ModelRow; hn: string; an: string; c: CbbResearchExt; now: number }) {
  return (
    <div className="cproj">
      <div className="cproj__who">
        <RoleTag role={m.role} version={m.version} /> <AsOf iso={m.as_of} label="archived pre-tip" now={now} />
      </div>
      <dl className="cproj__grid" aria-label="Projection">
        <KV k="Margin">{marginWords(m.margin, hn, an)}</KV>
        <KV k="Total"><span className="num">{fmt1(m.total)}</span></KV>
        <KV k={`${hn} win probability`}><span className="num">{pct0(m.home_win_prob)}</span></KV>
        <KV k="Possessions"><span className="num">{fmt1(m.possessions)}</span></KV>
      </dl>
      <div className="cproj__axes">
        <div className="cproj__ax">
          <div className="cproj__axh">Margin <span className="muted">· {an} ← → {hn}</span></div>
          {m.margin != null && <MarginAxis margin={m.margin} r50={m.margin_range_50} r80={m.margin_range_80} away={an} home={hn} />}
          {m.margin_range_80 && <p className="cproj__rng">80% model range: <b>{marginWords(m.margin_range_80[0], hn, an)}</b> to <b>{marginWords(m.margin_range_80[1], hn, an)}</b></p>}
        </div>
        <div className="cproj__ax">
          <div className="cproj__axh">Total points</div>
          {m.total != null && <TotalAxis total={m.total} r50={m.total_range_50} r80={m.total_range_80} />}
          {m.total_range_80 && <p className="cproj__rng">80% model range: <b className="num">{fmt1(m.total_range_80[0])}–{fmt1(m.total_range_80[1])}</b></p>}
        </div>
      </div>
      <AxisKey />
      <p className="cproj__unc">
        <b>Model uncertainty.</b> The bands are the frozen model’s own normal distribution (margin SD <span className="num">{fmt1(m.margin_sd)}</span>, total SD <span className="num">{fmt1(m.total_sd)}</span>) — not guaranteed ranges.
        {c.neutral_site && ' Neutral site: no home-court edge in the model.'} <TermInfo k="cbb_model_range" />
      </p>
      {c.integrity.identity_changed_versions.length > 0 && (
        <Notice tone="warn" title="This projection is for a different matchup than the current schedule">
          The schedule changed the teams or home/away after the projection was archived. It is shown for transparency and is not clean evidence.
        </Notice>
      )}
    </div>
  );
}

const STEPS = [
  { k: 'listed', label: 'On the schedule' },
  { k: 'window', label: 'Capture window (30 h before tip)' },
  { k: 'archived', label: 'Projection archived' },
  { k: 'tip', label: 'Tip-off' },
  { k: 'settled', label: 'Settled & scored' },
] as const;

function NoProjection({ c, start }: { c: CbbResearchExt; start: string }) {
  const at = c.result ? 4 : c.projection_state === 'AWAITING_CAPTURE' ? 1 : c.projection_state === 'UNAVAILABLE' ? 3 : 0;
  return (
    <div className="cnoproj">
      <ol className="ctl" aria-label="Projection timeline">
        {STEPS.map((s, i) => {
          const skipped = c.projection_state === 'UNAVAILABLE' && s.k === 'archived';
          const state = skipped ? 'skip' : i < at ? 'done' : i === at ? 'now' : 'next';
          return (
            <li key={s.k} className={`ctl__s ctl__s--${state}`} aria-current={state === 'now' ? 'step' : undefined}>
              <span className="ctl__dot" aria-hidden="true">{state === 'done' ? <Icon name="check" size={11} /> : state === 'skip' ? <Icon name="close" size={11} /> : null}</span>
              <span className="ctl__l">{s.label}{s.k === 'window' && !c.tbd && <span className="ctl__w">{captureOpens(start)}</span>}{skipped && <span className="ctl__w">not archived</span>}</span>
            </li>
          );
        })}
      </ol>
      <p className="cnoproj__msg">{c.projection_message} <TermInfo k="cbb_capture_window" /></p>
    </div>
  );
}

function ResultLine({ c, hn, an }: { c: CbbResearchExt; hn: string; an: string }) {
  const res = c.result!;
  return (
    <div className="cres">
      <span className="eyebrow">Final</span>
      <span className="num cres__s">{an} {res.away_score} — {hn} {res.home_score}</span>
      <IntegrityBadge i={c.integrity} />
      {c.integrity.reasons.length > 0 && <span className="muted small">{c.integrity.reasons.join('; ')}</span>}
    </div>
  );
}

// ------------------------------------------------------------------ matchup (ratings)

function Matchup({ r, c, an, hn, slug }: { r: EventResearchDoc; c: CbbResearchExt; an: string; hn: string; slug: string }) {
  const { metrics } = useSport();
  const obs = new Map<string, { home: Observation | null; away: Observation | null }>();
  for (const m of r.matchup) obs.set(m.metric_id.replace(/^met_cbb\./, ''), { home: m.home, away: m.away });
  const homeId = r.event.home_participant!;
  const awayId = r.event.away_participant!;
  const block = (offName: string, defName: string, offSide: Side) => {
    const defSide: Side = offSide === 'home' ? 'away' : 'home';
    const offId = offSide === 'home' ? homeId : awayId;
    const defId = offSide === 'home' ? awayId : homeId;
    return (
      <div className="cmu__block">
        <div className="cmu__bh">
          <CbbMark p={r.event.participants.find((p) => p.participant_id === offId)} size="sm" />
          <span>When <b>{offName}</b> has the ball</span>
        </div>
        <div className="cmu__cols" aria-hidden="true"><span>{offName} offense</span><span /><span>{defName} defense</span></div>
        <ul className="cmu__rows">
          {c.matchup_pairs.map((p) => {
            const o = obs.get(p.offense)?.[offSide];
            const d = obs.get(p.defense)?.[defSide];
            if (!o && !d) return null;
            return (
              <li key={p.label} className="cmu__row">
                <MuCell o={o} def={o ? metrics.get(o.metric_id) : undefined} side="l" tone={offSide} href={o ? routes.metric(slug, o.metric_id, { team: offId, opp: defId, event: r.event.event_id }) : null} />
                <span className="cmu__l">{p.label}{o && <MetricInfo metricId={o.metric_id} def={metrics.get(o.metric_id)} />}</span>
                <MuCell o={d} def={d ? metrics.get(d.metric_id) : undefined} side="r" tone={defSide} href={d ? routes.metric(slug, d.metric_id, { team: defId, opp: offId, event: r.event.event_id }) : null} />
              </li>
            );
          })}
        </ul>
      </div>
    );
  };
  return (
    <>
      <div className="cmu">
        {block(an, hn, 'away')}
        {block(hn, an, 'home')}
      </div>
      <p className="muted small">
        Pregame ratings from the {c.ratings_source?.version ?? 'incumbent'} record archived {c.ratings_source?.as_of?.slice(0, 16).replace('T', ' ')} UTC.
        Efficiency is points per 100 possessions; a defensive value is what opponents do against the team. Rank 1 is the best rank where the metric has a better direction;
        tendencies (3-point attempt rate) show position only. No combined “edge” number is drawn.
      </p>
    </>
  );
}

function MuCell({ o, def, side, tone, href }: { o: Observation | null | undefined; def: MetricDef | undefined; side: 'l' | 'r'; tone: Side; href: string | null }) {
  if (!o) return <span className={`cmu__c cmu__c--${side} muted`}>—</span>;
  const unit = def?.unit === '%' ? '%' : '';
  const ctx = o.context;
  const directional = def?.higher_is_better != null;
  const pos = ctx?.rank != null && ctx.universe_size && ctx.universe_size > 1 ? (1 - (ctx.rank - 1) / (ctx.universe_size - 1)) * 100 : null;
  const inner = (
    <>
      <span className="cmu__nums">
        <b className="num">{o.value?.toFixed(1)}{unit}</b>
        {ctx?.rank != null && <span className="cmu__rk num">#{ctx.rank}<span className="muted">/{ctx.universe_size}</span></span>}
      </span>
      {pos != null && (
        <span className={`cmu__bar${directional ? '' : ' cmu__bar--pos'}`} aria-hidden="true">
          {directional ? <span className={`cmu__fill cmu__fill--${tone}`} style={{ width: `${Math.max(pos, 2)}%` }} /> : <span className="cmu__dot" style={{ [side === 'l' ? 'right' : 'left']: `${pos}%` } as CSSProperties} />}
        </span>
      )}
    </>
  );
  const label = `${def?.name ?? o.metric_id} ${o.value?.toFixed(1)}${unit}${ctx?.rank != null ? `, rank ${ctx.rank} of ${ctx.universe_size}` : ''}`;
  return href
    ? <Link to={href} className={`cmu__c cmu__c--${side} cmu__v`} aria-label={label}>{inner}</Link>
    : <span className={`cmu__c cmu__c--${side}`} aria-label={label}>{inner}</span>;
}

// ------------------------------------------------------------------ roster comparison (pre-projection)

const TAPE = [
  { id: 'met_cbb.returning_minutes_share', label: 'Returning minutes', fmt: (v: number | null) => pct0(v) },
  { id: 'met_cbb.expected_returning_minutes', label: 'Minutes to returners', fmt: (v: number | null) => (v == null ? '—' : `${Math.round(v)}`) },
  { id: 'met_cbb.expected_transfer_minutes', label: 'Minutes to transfers', fmt: (v: number | null) => (v == null ? '—' : `${Math.round(v)}`) },
  { id: 'met_cbb.expected_first_d1_minutes', label: 'Minutes to first-D-I', fmt: (v: number | null) => (v == null ? '—' : `${Math.round(v)}`) },
] as const;

function TaleOfTape({ c, away, home, ap, hp, slug }: { c: CbbResearchExt; away: Participant; home: Participant; ap: EntityProfileDoc | undefined; hp: EntityProfileDoc | undefined; slug: string }) {
  const { metrics } = useSport();
  const ob = (p: EntityProfileDoc | undefined, id: string) => p?.metrics.find((o) => o.metric_id === id) ?? null;
  const ro = (s: Side) => c.roster[s];
  const fallback = (s: Side, id: string): number | null => {
    const m = ro(s)?.continuity?.minutes;
    if (!m) return null;
    if (id.endsWith('returning_minutes_share')) return ro(s)?.continuity?.returning_minutes_share ?? null;
    if (id.endsWith('expected_returning_minutes')) return m.returning;
    if (id.endsWith('expected_transfer_minutes')) return m.transfer;
    return m.first_d1;
  };
  const cell = (s: Side, p: Participant, prof: EntityProfileDoc | undefined, row: (typeof TAPE)[number]) => {
    const o = ob(prof, row.id);
    const v = o?.value ?? fallback(s, row.id);
    const rank = o?.context?.rank;
    const size = o?.context?.universe_size;
    const body = (
      <>
        <span className="cmu__nums"><b className="num">{row.fmt(v)}</b>{rank != null && <span className="cmu__rk num">#{rank}<span className="muted">/{size}</span></span>}</span>
        {rank != null && size ? <span className="cmu__bar cmu__bar--pos" aria-hidden="true"><span className="cmu__dot" style={{ [s === 'away' ? 'right' : 'left']: `${(1 - (rank - 1) / (size - 1)) * 100}%` } as CSSProperties} /></span> : null}
      </>
    );
    const cls = `cmu__c cmu__c--${s === 'away' ? 'l' : 'r'}`;
    return o ? <Link to={routes.metric(slug, row.id, { team: p.participant_id, opp: (s === 'away' ? home : away).participant_id })} className={`${cls} cmu__v`}>{body}</Link> : <span className={cls}>{body}</span>;
  };
  if (!ro('home')?.available && !ro('away')?.available) return <p className="muted">{c.roster.basis_text}</p>;
  return (
    <div className="ctape">
      <div className="cmu__cols ctape__h">
        <span><CbbMark p={away} size="sm" /> {teamShort(away)}</span><span /><span>{teamShort(home)} <CbbMark p={home} size="sm" /></span>
      </div>
      <ul className="cmu__rows">
        {TAPE.map((row) => (
          <li key={row.id} className="cmu__row">
            {cell('away', away, ap, row)}
            <span className="cmu__l">{row.label}<MetricInfo metricId={row.id} def={metrics.get(row.id)} /></span>
            {cell('home', home, hp, row)}
          </li>
        ))}
        <li className="cmu__row">
          <span className="cmu__c cmu__c--l"><b className="num">{ro('away')?.continuity?.first_d1_expected_to_play ?? '—'}</b></span>
          <span className="cmu__l">First-D-I players expected to play</span>
          <span className="cmu__c cmu__c--r"><b className="num">{ro('home')?.continuity?.first_d1_expected_to_play ?? '—'}</b></span>
        </li>
        <li className="cmu__row">
          <span className="cmu__c cmu__c--l"><ConfidenceChip c={c.roster_confidence.away} /></span>
          <span className="cmu__l">Roster confidence<TermInfo k="cbb_roster_confidence" /></span>
          <span className="cmu__c cmu__c--r"><ConfidenceChip c={c.roster_confidence.home} /></span>
        </li>
      </ul>
      <p className="muted small">Roster metrics come from roster truth and are <b>not opponent-adjusted</b>; they describe roster construction, not team strength. Dots show national position (#1 at the outer edge).</p>
    </div>
  );
}

// ------------------------------------------------------------------ rosters

function Rosters({ c, home, away, slug }: { c: CbbResearchExt; home: Participant; away: Participant; slug: string }) {
  if (c.roster.basis === 'none') return <p className="muted">{c.roster.basis_text}</p>;
  const sides: [Participant, Side][] = [[away, 'away'], [home, 'home']];
  return (
    <>
      {c.proster && (
        <div className="cpro">
          <div className="eyebrow">P-ROSTER-1 · prospective roster overlay</div>
          <p className="small">
            Roster snapshot {stampTime(c.proster.truth_snapshot)?.slice(0, 16).replace('T', ' ')} UTC, archived with the projection.
            Overlay change to the margin vs its frozen base: <b className="num">{signed1(c.proster.adjustment_total)}</b>
            {' '}(input substitution <span className="num">{signed1(c.proster.adjustment_input_substitution)}</span>, continuity correction <span className="num">{signed1(c.proster.adjustment_continuity)}</span>).
          </p>
        </div>
      )}
      <div className="crost">
        {sides.map(([p, side]) => (
          <section key={side} className={`panel crost__team crost__team--${side}`} aria-label={`${teamShort(p)} roster`}>
            <div className="crost__h">
              <Link to={routes.team(slug, p.participant_id)} className="crost__name"><CbbMark p={p} size="md" /> {teamShort(p)}</Link>
            </div>
            {c.proster ? <ProsterTeam s={c.proster.sides[side]} /> : <TruthTeam t={c.roster[side]} />}
          </section>
        ))}
      </div>
      <p className="muted small">Expected pregame rotation from roster and prior participation evidence — not a confirmed starting lineup, and not availability. <TermInfo k="cbb_expected_minutes" /></p>
    </>
  );
}

function Flag({ on, children }: { on: boolean; children: ReactNode }) {
  return <li className={on ? 'on' : ''}><Icon name={on ? 'check' : 'close'} size={11} /> {children}</li>;
}

function ProsterTeam({ s }: { s: ProsterSide }) {
  return (
    <>
      <ConfidenceChip c={s.roster_confidence} long />
      <MinutesComp m={s.minutes} />
      <ul className="cflags">
        <Flag on={s.input_substitution_active}>Input substitution {s.input_substitution_active ? 'active' : 'not applied'}</Flag>
        <Flag on={s.continuity_correction_active}>Continuity correction {s.continuity_correction_active ? 'active' : 'not applied'}</Flag>
      </ul>
      <dl className="cproj__grid cproj__grid--sm">
        <KV k="Returning-minutes share">{pct0(s.returning_minutes_share)}</KV>
        <KV k="Expected (pre-roster)">{pct0(s.expected_returning_share)}</KV>
        <KV k="First-D-I expected to play"><span className="num">{s.first_d1_expected_to_play ?? '—'}</span></KV>
      </dl>
      <Rotation players={s.expected_rotation} note={s.expected_rotation.length ? null : 'No valid expected rotation for this team (roster confidence or structural checks): the overlay leaves it at the frozen base.'} />
    </>
  );
}

function TruthTeam({ t }: { t: TeamRoster | null }) {
  if (!t?.available) return <p className="muted small">{t?.explanation ?? 'No roster-truth snapshot.'}</p>;
  return (
    <>
      <ConfidenceChip c={t.confidence} long />
      {t.continuity && <MinutesComp m={t.continuity.minutes} />}
      {t.counts && <RosterCounts counts={t.counts} />}
      <Rotation players={t.expected_rotation ?? []} note={t.rotation_valid ? null : `No expected rotation: ${t.rotation_note ?? 'not built'}.`} />
      <p className="muted small">Snapshot {t.snapshot_at?.slice(0, 16).replace('T', ' ')} UTC{t.reason_text ? ` · ${t.reason_text}` : ''}{t.continuity ? ` · game-1 continuity correction ${signed1(t.continuity.game1_continuity_correction)}` : ''}</p>
    </>
  );
}

export function RosterCounts({ counts }: { counts: Record<string, number> }) {
  const items: [string, number | undefined][] = [['listed', counts.listed], ['returning', counts.returning], ['transfers', counts.transfer], ['first D-I', counts.first_d1]];
  return (
    <ul className="ccounts">
      {items.filter(([, v]) => v != null).map(([k, v]) => <li key={k}><b className="num">{v}</b> {k}</li>)}
    </ul>
  );
}

const CLASS_CLS: Record<string, string> = { returning: 'ret', returning_after_gap: 'ret', transfer: 'tr', first_d1: 'fd' };

/** The expected rotation with a minutes bar per player: the top of the rotation in view, the rest one tap away. */
export function Rotation({ players, note, max = 10, open = 5 }: { players: RotationPlayer[]; note: string | null; max?: number; open?: number }) {
  if (!players.length) return <p className="muted small">{note ?? 'No expected rotation published.'}</p>;
  const shown = players.slice(0, max);
  const row = (p: RotationPlayer) => (
    <tr key={p.player_id}>
      <th scope="row">
        <span className="crot__n">{p.name ?? 'Unnamed listing'}</span>
        <span className="crot__m">
          {p.position && <span>{p.position}</span>}
          <span className={`crot__c crot__c--${CLASS_CLS[p.class] ?? 'x'}`}>{p.class_label}</span>
          {p.prior_team && <span className="muted">from {p.prior_team}</span>}
          {p.expected_starter && <span className="crot__st" title="Among the five highest expected minutes in the published rotation. Not a starting lineup.">top-5 minutes</span>}
        </span>
      </th>
      <td className="crot__min"><MinuteBar v={p.minutes} /></td>
    </tr>
  );
  const head = <thead><tr><th scope="col">Player</th><th scope="col" className="r">Expected minutes</th></tr></thead>;
  return (
    <div className="crot">
      <table className="dtable crot__t">
        <caption>Expected rotation</caption>
        {head}
        <tbody>{shown.slice(0, open).map(row)}</tbody>
      </table>
      {shown.length > open && (
        <details className="crot__more">
          <summary>Full expected rotation ({shown.length})</summary>
          <table className="dtable crot__t"><tbody>{shown.slice(open).map(row)}</tbody></table>
        </details>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ model comparison

function ModelComparison({ c, hn, an }: { c: CbbResearchExt; hn: string; an: string }) {
  if (!c.models_detail.length) return <p className="muted">No model has an archived pre-tip projection for this game. {c.projection_message}</p>;
  const ext = Math.max(4, ...c.models_detail.flatMap((m) => [Math.abs(m.margin ?? 0), ...(m.margin_range_80 ?? []).map(Math.abs)]));
  const lim = Math.ceil((ext + 1) / 5) * 5;
  const x = (v: number) => ((v + lim) / (2 * lim)) * 100;
  return (
    <>
      <ul className="cmc" aria-label="Projections by model">
        <li className="cmc__head" aria-hidden="true"><span>Model</span><span>Score</span><span>Margin <span className="muted">· {an} ← → {hn}</span></span><span>Total</span><span>{hn} win</span></li>
        {c.models_detail.map((m) => (
          <li key={m.version} className={`cmc__row cmc__row--${m.role}`}>
            <span className="cmc__m"><RoleTag role={m.role} version={m.version} /></span>
            <span className="cmc__s num">{an} {fmt1(m.away_score)} – {hn} {fmt1(m.home_score)}</span>
            <span className="cmc__g">
              <span className="cmc__gl num">{marginWords(m.margin, hn, an)}</span>
              {m.margin != null && (
                <span className="cmc__ax" aria-hidden="true">
                  <span className="cmc__zero" style={{ left: '50%' }} />
                  {m.margin_range_80 && <span className="cmc__band" style={{ left: `${x(m.margin_range_80[0])}%`, width: `${x(m.margin_range_80[1]) - x(m.margin_range_80[0])}%` }} />}
                  <span className="cmc__pt" style={{ left: `${x(m.margin)}%` }} />
                </span>
              )}
            </span>
            <span className="cmc__t num">{fmt1(m.total)}</span>
            <span className="cmc__w num">{pct0(m.home_win_prob)}</span>
          </li>
        ))}
      </ul>
      <p className="muted small">Each margin dot sits on one shared axis (center = even) with the model’s 80% range behind it. Listed in the protocol’s order — no model is ranked above another.</p>
    </>
  );
}

function ResearchStatus({ c }: { c: CbbResearchExt }) {
  return (
    <div className="cstat">
      <p><IntegrityBadge i={c.integrity} /> <span className="muted">{c.integrity.text}</span></p>
      {c.integrity.reasons.length > 0 && <ul className="small">{c.integrity.reasons.map((x) => <li key={x}>{x}</li>)}</ul>}
      {c.integrity.post_tip_records_ignored > 0 && <p className="small muted">{c.integrity.post_tip_records_ignored} archived record(s) made at or after tip are excluded: Sift never shows a projection created after tip.</p>}
      <p className="small muted">The models are compared only by the preregistered prospective protocol; no model is called better before it concludes.</p>
    </div>
  );
}

// ------------------------------------------------------------------ provenance

function Provenance({ r, c, now }: { r: EventResearchDoc; c: CbbResearchExt; now: number }) {
  return (
    <details className="gnotes cprov" id="cg-prov">
      <summary>Data &amp; provenance</summary>
      <dl className="cprov__kv">
        <KV k="Game">{c.cbb_game_id} · ESPN {c.espn_game_id}</KV>
        <KV k="Schedule source">{c.schedule.source === 'ESPN_FALLBACK' ? 'ESPN scoreboard (fallback: SportsDataverse did not list the game yet)' : 'SportsDataverse schedule (ESPN)'}{c.schedule.source_observed_at ? ` · observed ${c.schedule.source_observed_at.slice(0, 16).replace('T', ' ')} UTC` : ''}</KV>
        <KV k="Reconciled fields">{c.schedule.reconciled_fields.length ? c.schedule.reconciled_fields.join(', ') + ' (from ESPN’s latest observation of the same game)' : 'none'}</KV>
        <KV k="Listed tip">{c.schedule.listed_start} · {c.schedule.time_state}</KV>
        <KV k="Projection state">{c.projection_state}</KV>
        <KV k="Integrity">{c.integrity.status}{c.integrity.scoreboard ? ` · scoreboard ${c.integrity.scoreboard}` : ''}</KV>
        {c.proster && <KV k="Roster archive commit">{shortSha(c.proster.truth_archive_commit)} · snapshot {c.proster.truth_snapshot}</KV>}
      </dl>
      {c.models_detail.map((m) => (
        <div key={m.version} className="cprov__m">
          <div className="eyebrow">{m.role_label} · {m.version}</div>
          <dl className="cprov__kv">
            <KV k="As of"><AsOf iso={m.as_of} label="" now={now} /></KV>
            <KV k="Information cutoff">{m.info_cutoff ?? '—'}</KV>
            <KV k="Pre-tip basis">{m.pretip_basis.replace(/_/g, ' ')}</KV>
            <KV k="Code">{shortSha(m.provenance.code_sha)} (v{String(m.provenance.code_version ?? '—')})</KV>
            <KV k="Model artifact">{shortSha(m.provenance.model_sha256)}</KV>
            <KV k="Archive record">{String(m.provenance.archive_path ?? '—')} · sha {shortSha(m.provenance.record_sha256)}</KV>
            <KV k="Schedule at capture">{String(m.provenance.schedule_source ?? '—')} · window {String(m.provenance.schedule_window ?? '—')}</KV>
            {m.provenance.roster_archive_commit ? <KV k="Roster archive">{shortSha(m.provenance.roster_archive_commit)} · {String(m.provenance.truth_snapshot ?? '')}</KV> : null}
          </dl>
        </div>
      ))}
      {c.rejected_records.length > 0 && <p className="small muted">Excluded records: {c.rejected_records.map((x) => `${x.version} ${x.as_of ?? ''} (${x.reason.replace(/_/g, ' ')})`).join('; ')}.</p>}
      <p className="small muted"><QualityBadge quality={r.quality} /> {r.quality.source} · generated {r.quality.generated_at} · {r.quality.limitations.join(' · ')}</p>
      <p className="small muted">Roster confidence: {Object.entries(CONFIDENCE_TEXT).map(([k, v]) => `${k} — ${v}`).join(' ')}</p>
      <p className="small muted">Team logos: the schools’ marks as published by ESPN, committed to Sift once; colors from ESPN’s team data. Presentation only.</p>
    </details>
  );
}

