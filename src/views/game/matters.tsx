// WHAT MATTERS — the top of every game page. Layer 1 is a sentence; layer 2 the two ranks behind it;
// layer 3 (one tap) the season numbers that support it, rank first; layer 4 (links) the full league
// comparison and methodology. Each card can be saved on its own as a research finding.
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { EntityProfileDoc, EventResearchDoc, Market, MetricDef, Observation } from '../../contract/types';
import { EdgeVs, Layer, PlayerFace, RangeBar, RankBadge } from '../../components/insight';
import { DigDeeper, TeamMark } from '../../components/ui';
import { metricFormatter } from '../../lib/format';
import { glossLine, metricGloss } from '../../lib/glossary';
import { playerPhoto } from '../../lib/players';
import { rankView } from '../../lib/rank';
import { routes } from '../../lib/routes';
import type { ScriptSet } from '../../lib/scripts';
import { useAsync } from '../../data/hooks';
import { historyAvailable, playerHistory, useHistoryIndex } from '../../history/load';
import { hitRecord, statDef, pregameRows, windowRows } from '../../history/stats';
import type { PlayerHistoryDoc } from '../../history/types';
import type { ContextNote } from '../../insights/context';
import { nameKey } from '../../insights/context';
import type { GameSides, Side } from '../../insights/game';
import type { MatchupInsight } from '../../insights/matchups';
import type { PropCard } from '../../insights/props';
import { rangeText, valueText } from '../../insights/props';
import type { SchemeInsight } from '../../insights/scheme';
import type { Finding } from '../../research/findings';
import { useSport } from '../../state/sport';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface GameCtx {
  r: EventResearchDoc;
  g: GameSides;
  slug: string;
  sport: string;
  profiles: { home?: EntityProfileDoc | null; away?: EntityProfileDoc | null };
  label: string;
}

const gsi = (r: EventResearchDoc) => (r.extensions as any)?.game_script_inputs;

function projOf(r: EventResearchDoc, team: Side, role: string, metric: string) {
  return r.players
    .filter((p) => p.team_id === team.pid && p.role === role)
    .map((p) => ({ p, v: r.distributions.find((d) => d.entity_id === p.participant_id && d.metric_id === metric)?.mean ?? null }))
    .filter((x) => x.v != null)
    .sort((a, b) => (b.v as number) - (a.v as number))[0] ?? null;
}

/** Why a matchup matters for THIS game, from the publication's own projections (facts, not claims). */
export function whyItMatters(ins: MatchupInsight, r: EventResearchDoc): string | null {
  const off = ins.offense.team;
  const tv = gsi(r)?.team_volume?.[off.abbr];
  const qb = projOf(r, off, 'QB', 'met_nfl.sim_passing_yards');
  switch (ins.area) {
    case 'run': {
      const rb = projOf(r, off, 'RB', 'met_nfl.sim_carries');
      if (ins.side === 'offense') return `The ${off.nick} are projected for ${Math.round(tv?.designed_rush?.mean ?? 0)} designed runs${rb ? `; ${rb.p.display_name} projects for ${Math.round(rb.v!)} carries` : ''}. This is the matchup their ground game runs through.`;
      const trail = tv?.by_final_margin?.['trail7-13']?.pass_rate_mean;
      return `If the run stalls, the ${off.nick} lean on the pass: they throw on ${Math.round((trail ?? 0) * 100)}% of plays in simulated games they trail by 7–13, against ${Math.round((tv?.pass_rate?.mean ?? 0) * 100)}% overall.`;
    }
    case 'pass':
      return `The ${off.nick} are projected for ${Math.round(tv?.dropbacks?.mean ?? 0)} dropbacks${qb ? `; ${qb.p.display_name} projects for ${Math.round(qb.v!)} passing yards` : ''}.`;
    case 'protection': {
      const q = ((r.extensions as any)?.quarterbacks?.[off.abbr] ?? [])[0];
      const up = q?.profile?.under_pressure;
      const clean = q?.profile?.clean_pocket;
      const n = q?.profile?.dropbacks && q?.profile?.overall?.pressure_rate_proxy != null ? Math.round(q.profile.dropbacks * q.profile.overall.pressure_rate_proxy) : null;
      if (up?.epa_per_dropback != null && clean?.epa_per_dropback != null && n != null && n >= 10) {
        const f = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;
        return `${q.player} this season: ${f(up.epa_per_dropback)} EPA per dropback under pressure (about ${n} pressured dropbacks) against ${f(clean.epa_per_dropback)} from a clean pocket.`;
      }
      return `Pressure decides how much of the ${off.nick} passing plan survives: ${Math.round(tv?.dropbacks?.mean ?? 0)} projected dropbacks.`;
    }
    default: {
      const pts = gsi(r)?.game_environment?.[off.home ? 'home_points' : 'away_points'];
      return pts ? `The simulation projects ${Math.round(pts.mean)} points for the ${off.nick} (typical ${pts.range_50?.[0]}–${pts.range_50?.[1]}).` : null;
    }
  }
}

/** Layer 3: the raw season numbers behind a matchup, rank first. */
function Evidence({ ins, ctx, metrics }: { ins: MatchupInsight; ctx: GameCtx; metrics: Map<string, MetricDef> }) {
  const prof = (t: Side) => (t.home ? ctx.profiles.home : ctx.profiles.away);
  const obs = (t: Side, id: string): Observation | null => prof(t)?.metrics.find((m) => m.metric_id === id && !m.split) ?? null;
  const rows = ins.evidence.map(([o, d]) => ({ o, d, oo: obs(ins.offense.team, o), dd: obs(ins.defense.team, d) })).filter((x) => x.oo || x.dd);
  const fmt = (id: string, v: number | null | undefined, ctxObs: Observation | null) => metricFormatter(metrics.get(id), Math.max(Math.abs(ctxObs?.context?.best_value ?? 0), Math.abs(ctxObs?.context?.worst_value ?? 0)))(v);
  return (
    <div className="evid">
      {rows.length > 0 && (
        <table className="evid__t">
          <caption className="sr-only">Season numbers behind this matchup</caption>
          <thead><tr><th scope="col">This season</th><th scope="col">{ins.offense.team.abbr} {ins.offense.unit}</th><th scope="col">{ins.defense.team.abbr} {ins.defense.unit}</th></tr></thead>
          <tbody>
            {rows.map((x) => {
              const ro = rankView(x.oo?.context);
              const rd = rankView(x.dd?.context);
              return (
                <tr key={x.o + x.d}>
                  <th scope="row">{metrics.get(x.o)?.name.replace(/^Offensive /, '').replace(/ per play$/, '') ?? x.o}</th>
                  <td>{ro ? <RankBadge rank={ro} raw={fmt(x.o, x.oo?.value, x.oo)} compact /> : '—'}</td>
                  <td>{rd ? <RankBadge rank={rd} raw={fmt(x.d, x.dd?.value, x.dd)} compact /> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="evid__note">
        Headline ranks are opponent-adjusted ratings ({glossLine(metricGloss(ins.offense.metricId, metrics.get(ins.offense.metricId))) ?? 'games before this week'}). #1 is the best unit for its job — for a defense, the one that allows the least.
      </p>
      <p className="evid__links">
        <Link to={routes.metric(ctx.slug, ins.offense.metricId, { team: ins.offense.team.pid, opp: ins.defense.team.pid, event: ctx.r.event.event_id })}>Every team's {ins.offense.unit} →</Link>
        <Link to={routes.metric(ctx.slug, ins.defense.metricId, { team: ins.defense.team.pid, opp: ins.offense.team.pid, event: ctx.r.event.event_id })}>Every team's {ins.defense.unit} →</Link>
      </p>
    </div>
  );
}

export function MatchupCard({ ins, ctx }: { ins: MatchupInsight; ctx: GameCtx }) {
  const { metrics } = useSport();
  const why = whyItMatters(ins, ctx.r);
  const finding: Finding = {
    key: ins.id, kind: 'matchup', sport: ctx.sport, title: ins.headline,
    statement: `${ins.offense.team.abbr} ${ins.offense.unit} ${ins.offense.rank.text} vs ${ins.defense.team.abbr} ${ins.defense.unit} ${ins.defense.rank.text} (opponent-adjusted), ${ctx.label}.${why ? ' ' + why : ''}`,
    href: routes.game(ctx.slug, ctx.r.event.event_id), anchor: { ref_kind: 'METRIC', id: ins.offense.metricId, extra: { metric_id: ins.offense.metricId, event_id: ctx.r.event.event_id } },
    kickoff: ctx.r.event.start_time_utc, eventStatus: ctx.r.event.status,
  };
  return (
    <article className={`mcard mcard--${ins.size}`}>
      <header className="mcard__h">
        <span className="mcard__k">{ins.size === 'major' ? 'Major edge' : 'Clear edge'} · {ins.areaLabel}</span>
        <h3 className="mcard__t"><TeamMark sport={ctx.sport} abbr={ins.beneficiary.abbr} size="sm" /> {ins.headline}</h3>
      </header>
      <EdgeVs ins={ins} sport={ctx.sport} />
      {why && <p className="mcard__why">{why}</p>}
      <Layer summary="The numbers behind it">
        <Evidence ins={ins} ctx={ctx} metrics={metrics} />
      </Layer>
      <div className="mcard__x"><DigDeeper finding={finding} /></div>
    </article>
  );
}

export function ContextCard({ note, ctx }: { note: ContextNote; ctx: GameCtx }) {
  const finding: Finding = {
    key: note.id, kind: 'context', sport: ctx.sport, title: note.headline, statement: `${note.detail} ${note.facts.join('; ')}.`,
    href: routes.game(ctx.slug, ctx.r.event.event_id), anchor: { ref_kind: 'TEAM', id: note.team.pid },
    kickoff: ctx.r.event.start_time_utc, eventStatus: ctx.r.event.status,
  };
  return (
    <article className="mcard mcard--context">
      <header className="mcard__h">
        <span className="mcard__k">Context that matters</span>
        <h3 className="mcard__t"><TeamMark sport={ctx.sport} abbr={note.team.abbr} size="sm" /> {note.headline}</h3>
      </header>
      <p className="mcard__why">{note.detail}</p>
      <Layer summary="What the season numbers mix">
        <ul className="mcard__facts">{note.facts.map((f) => <li key={f}>{f}</li>)}</ul>
        <p className="evid__note">Small samples — read any split as context, not a correction. Affected season ranks: {note.affects.map((a) => `${a.label}${a.rank ? ` (${a.rank})` : ''}`).join(', ')}. Sift does not adjust them — this is context for reading them. Starts are the quarterback with the most dropbacks in each game (nflverse play-by-play).</p>
        <p className="evid__links"><Link to={routes.team(ctx.slug, note.team.pid)}>{note.team.nick} team page →</Link></p>
      </Layer>
      <div className="mcard__x"><DigDeeper finding={finding} /></div>
    </article>
  );
}

export function SchemeCard({ s, ctx }: { s: SchemeInsight; ctx: GameCtx }) {
  const finding: Finding = {
    key: s.id, kind: 'scheme', sport: ctx.sport, title: s.headline, statement: `${s.lines.join(' ')} (${s.samples.join('; ')}; FTN charting via nflverse).`,
    href: routes.game(ctx.slug, ctx.r.event.event_id, { tab: 'matchup' }), anchor: { ref_kind: 'TEAM', id: s.team.pid },
    kickoff: ctx.r.event.start_time_utc, eventStatus: ctx.r.event.status,
  };
  return (
    <article className="mcard mcard--scheme">
      <header className="mcard__h">
        <span className="mcard__k">Scheme</span>
        <h3 className="mcard__t"><TeamMark sport={ctx.sport} abbr={s.team.abbr} size="sm" /> {s.headline}</h3>
      </header>
      <ul className="mcard__lines">{s.lines.map((l) => <li key={l}>{l}</li>)}</ul>
      <Layer summary="Sample and source">
        <ul className="mcard__facts">{s.samples.map((x) => <li key={x}>{x}</li>)}</ul>
        <p className="evid__note">Charted by FTN (via nflverse), games before this week only. Descriptive tendencies, not cause and effect; small samples swing. Man/zone coverage is not published for 2026.</p>
      </Layer>
      <div className="mcard__x"><DigDeeper finding={finding} /></div>
    </article>
  );
}

// ------------------------------------------------------------------ props to watch

/** The last few games for a prop's stat against its line (games before this one only). */
function PropHistory({ c, hist, kickoff, week }: { c: PropCard; hist: PlayerHistoryDoc | null | undefined; kickoff: string; week: number | null }) {
  const def = statDef(c.stat);
  if (!def || !hist || c.line == null) return null;
  // Last five games before this one, across seasons; compared with TODAY's line (past lines are not published).
  const rec = hitRecord(windowRows(pregameRows(hist, kickoff, week), 'last5'), def, c.line);
  if (!rec.values.length) return null;
  return (
    <span className="pcard__hist">
      <span className="pcard__hk">Last {rec.values.length}</span>
      {rec.values.map((x) => (
        <span key={x.row.game_id} className={`pcard__g ${x.v > c.line! ? 'is-over' : 'is-under'}`} title={`${x.row.season ?? ''} week ${x.row.week} vs ${x.row.opp}: ${x.v}`}>
          {x.v}<span className="sr-only">{x.v > c.line! ? " (above today's line)" : " (below today's line)"}</span>
        </span>
      ))}
      <span className="pcard__hr">{rec.over} of {rec.values.length} above today's {c.line}</span>
    </span>
  );
}

export function PropCardView({ c, ctx, hist }: { c: PropCard; ctx: GameCtx; hist?: PlayerHistoryDoc | null }) {
  const fmt = (v: number) => (c.unit === 'rec' ? (Math.round(v * 10) / 10).toString() : String(Math.round(v)));
  const finding: Finding = {
    key: `prop:${c.id}`, kind: 'prop', sport: ctx.sport, title: `${c.name} ${c.statLabel.toLowerCase()}`,
    statement: `Projection ${valueText(c.projection, c.unit)} (typical ${rangeText(c.range.typical, c.unit)}, low ${fmt(c.range.full[0])}, high ${fmt(c.range.full[1])})${c.line != null ? `; market line ${c.line} (${c.marketTitle})` : ''}${c.matchup ? `; matchup: ${c.matchup.label} ${c.matchup.rank.text}` : ''}. ${ctx.label}.`,
    href: routes.player(ctx.slug, c.playerId),
    anchor: c.market ? { ref_kind: 'MARKET', id: c.market.market_id, extra: { market_id: c.market.market_id, event_id: ctx.r.event.event_id } } : { ref_kind: 'PLAYER', id: c.playerId },
    kickoff: ctx.r.event.start_time_utc, eventStatus: ctx.r.event.status,
  };
  return (
    <article className="pcard">
      <Link to={routes.player(ctx.slug, c.playerId)} className="pcard__who">
        <PlayerFace photo={playerPhoto(c.playerId, c.name, c.team.abbr)} team={c.team.abbr} size="md" />
        <span>
          <span className="pcard__n">{c.name}</span>
          <span className="pcard__s">{c.team.abbr} {c.role} · {c.statLabel}</span>
        </span>
      </Link>
      <dl className="pcard__nums">
        <div><dt>Projection</dt><dd className="num">{valueText(c.projection, c.unit)}</dd></div>
        <div><dt>Line</dt><dd className="num">{c.line != null ? c.line : '—'}</dd></div>
        <div><dt>Typical range</dt><dd className="num">{rangeText(c.range.typical, c.unit)}</dd></div>
      </dl>
      <RangeBar typical={c.range.typical} full={c.range.full} projection={c.projection} line={c.line} format={fmt} label={`${c.name} ${c.statLabel.toLowerCase()} projected range`} />
      {c.matchup && (
        <p className="pcard__mu">
          <span>Matchup</span> <TeamMark sport={ctx.sport} abbr={c.opp.abbr} size="sm" /> {c.matchup.label} <RankBadge rank={c.matchup.rank} compact against />
        </p>
      )}
      <PropHistory c={c} hist={hist} kickoff={ctx.r.event.start_time_utc} week={ctx.g.week} />
      <div className="pcard__x">
        {c.market && <Link className="pcard__m" to={routes.market(ctx.slug, c.market.market_id, ctx.r.event.event_id)}>{c.marketTitle} →</Link>}
        <DigDeeper finding={finding} compact />
      </div>
    </article>
  );
}

/** Game logs for a set of publication players, matched to the history layer by name and team. */
export function usePropHistories(sportCode: string, players: { name: string; team: string }[]) {
  const index = useHistoryIndex(sportCode);
  const ids = useMemo(() => {
    if (!index.data) return [];
    const byName = new Map(Object.entries(index.data.players).map(([gsis, p]) => [`${nameKey(p.name)}|${p.team}`, gsis]));
    return players.map((p) => byName.get(`${nameKey(p.name)}|${p.team}`) ?? null);
  }, [index.data, players]);
  const key = ids.filter(Boolean).join(',');
  const docs = useAsync(key && historyAvailable(sportCode) ? `hist:many:${key}` : null, async () => {
    const out = await Promise.all(ids.map((id) => (id ? playerHistory(id).catch(() => null) : Promise.resolve(null))));
    return out;
  });
  return useMemo(() => {
    const m = new Map<string, PlayerHistoryDoc | null>();
    players.forEach((p, i) => m.set(`${nameKey(p.name)}|${p.team}`, docs.data?.[i] ?? null));
    return m;
  }, [docs.data, players]);
}

export function PropsGrid({ cards, ctx }: { cards: PropCard[]; ctx: GameCtx }) {
  const players = useMemo(() => cards.map((c) => ({ name: c.name, team: c.team.abbr })), [cards]);
  const hist = usePropHistories(ctx.sport, players);
  return (
    <div className="pgrid">
      {cards.map((c) => <PropCardView key={c.id} c={c} ctx={ctx} hist={hist.get(`${nameKey(c.name)}|${c.team.abbr}`)} />)}
    </div>
  );
}

export type { GameCtx, Market, ScriptSet };
