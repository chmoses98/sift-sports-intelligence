// The Game Overview as a Visual Intelligence Dashboard (approved references 01 option 1 and 02): a bento of lit
// cards — SIFT Game Read, Likely Game Scripts, Key Matchup Advantages, Player Prop Explorer, Top Market Context, Game
// Information and Related Research — each a graphic first and a sentence second, with the detail one tap away.
//
// Every number is a published one, read through the same insight layer the rest of the page uses:
//  - matchup bars are the publication's opponent-adjusted league ranks (r.matchup observations, #1 = best for the job);
//  - script shares are the simulator's SIM SHARES (extensions.game_script_inputs), never called a probability;
//  - prop cards carry the publication's projection and the market line, and their mini distribution is the player's
//    own game log (real games before this one) against today's line — a range strip when too few games exist;
//  - market rows are the game's own contracts with the quote's age, no model gap (that lives on the Markets tab).
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { EventResearchDoc, Market, Observation } from '../../contract/types';
import { FxCard, Histogram, VsBar, binSamples } from '../../components/fx';
import { Icon } from '../../components/Icon';
import { PlayerFace, RangeBar } from '../../components/insight';
import { TeamMark } from '../../components/ui';
import { centsText, type PriceRow } from '../../lib/gamedata';
import { MATCHUP_AREAS } from '../../lib/nfl';
import { playerPhoto } from '../../lib/players';
import { rankView } from '../../lib/rank';
import { routes } from '../../lib/routes';
import { sharePct, type ScriptId, type ScriptSet } from '../../lib/scripts';
import { teamColors } from '../../lib/teams';
import { isFullGame } from '../../lib/period';
import { quoteFreshness, quoteAgeMs, formatQuoteAgo } from '../../live/freshness';
import { scriptCast } from '../../insights/cast';
import type { ContextNote } from '../../insights/context';
import { nameKey } from '../../insights/context';
import type { GameSides, Side } from '../../insights/game';
import type { MatchupInsight } from '../../insights/matchups';
import { propsToWatch, valueText, type PropCard } from '../../insights/props';
import { pregameRows, statDef } from '../../history/stats';
import type { PlayerHistoryDoc } from '../../history/types';
import { CastLayer } from './panels';
import { propCat } from './CompactProps';
import { gameWeather, weatherLine } from './Hero';
import { resolveHero } from '../../lib/hero/resolve';
import { heroInputFromResearch } from '../../lib/hero/input';
import { usePropHistories, type GameCtx } from './matters';

// ------------------------------------------------------------------ SIFT Game Read

interface ReadRow { key: string; icon: string; tone: 'green' | 'gold' | 'cyan' | 'red' | 'violet'; title: ReactNode; sub: ReactNode }

/**
 * The read in one headline and up to four icon rows: the strongest published matchup edges, the leading simulated
 * script and the largest context note — each row says where it comes from in its sub line.
 */
export function GameReadCard({ insights, context, set, fullHref, scriptHref }: { insights: MatchupInsight[]; context: ContextNote[]; set: ScriptSet | null; fullHref: string; scriptHref: string }) {
  const lead = set?.scripts[0] ?? null;
  const headline = insights[0]?.headline ?? context[0]?.headline ?? (lead ? `${lead.name} leads the simulation` : null);
  const rows: ReadRow[] = [];
  for (const ins of insights.slice(0, 2)) {
    rows.push({
      key: ins.id,
      icon: ins.side === 'defense' ? 'shield' : 'trend',
      tone: ins.size === 'major' ? 'green' : 'cyan',
      title: `${ins.beneficiary.abbr} ${ins.side === 'offense' ? 'offense' : 'defense'} · ${ins.areaLabel}`,
      sub: `${ins.offense.team.abbr} ${ins.offense.unit} ${ins.offense.rank.text.replace(/ NFL$/, '')} vs ${ins.defense.team.abbr} ${ins.defense.unit} ${ins.defense.rank.text.replace(/ NFL$/, '')} · opponent-adjusted`,
    });
  }
  if (lead) rows.push({ key: 'script', icon: 'play', tone: 'gold', title: `Most simulated: ${lead.name}`, sub: `${sharePct(lead.share)} sim share · ${lead.line}` });
  const note = context.find((c) => c.kind === 'key-absence' || c.kind === 'qb-change') ?? context[0];
  if (note && rows.length < 4) rows.push({ key: note.id, icon: 'alert', tone: 'red', title: note.headline, sub: note.detail });
  return (
    <FxCard title="SIFT Game Read" icon="bolt" className="gdash__read fx-span-5" id="gd-read">
      {headline ? <p className="gdash__headline">{headline}</p> : <p className="muted">No unit in this game holds a clear ranked edge over the unit it faces on the published ratings.</p>}
      {rows.length > 0 && (
        <ul className="gdash__rows">
          {rows.map((x) => (
            <li key={x.key} className={`gdash__row gdash__row--${x.tone}`}>
              <span className="gdash__ric" aria-hidden="true"><Icon name={x.icon} size={18} /></span>
              <span className="gdash__rt"><b>{x.title}</b><small>{x.sub}</small></span>
            </li>
          ))}
        </ul>
      )}
      <div className="gdash__cta">
        <Link className="btn btn--glass btn--sm" to={fullHref}>View full analysis <Icon name="arrowRight" size={14} /></Link>
        {lead && <Link className="gdash__ghost" to={scriptHref}>Scripts</Link>}
      </div>
    </FxCard>
  );
}

// ------------------------------------------------------------------ Likely Game Scripts (NFL sim shares)

export function ScriptsCard({ set, r, hrefFor, allHref }: { set: ScriptSet; r: EventResearchDoc; hrefFor: (id: ScriptId) => string; allHref: string }) {
  return (
    <FxCard title="Likely Game Scripts" icon="play" className="gdash__scripts fx-span-7" id="gd-scripts" action={{ to: allHref, label: 'View all scripts' }}>
      <ul className="gscr" aria-label="Game scripts by simulation share">
        {set.scripts.map((s, i) => (
          <li key={s.id} className={`gscr__i gscr__i--s${s.index}`}>
            <Link to={hrefFor(s.id)} className="gscr__a" aria-label={`${i === 0 ? 'Most simulated: ' : ''}${s.name}, ${sharePct(s.share)} of simulated games. ${s.summary}`}>
              <CastLayer cast={scriptCast(r, set, s)} />
              <span className="gscr__shade" aria-hidden="true" />
              <span className="gscr__body">
                <span className="gscr__n">{s.name}</span>
                <span className="gscr__p"><b className="fx-num">{sharePct(s.share)}</b> <small>sim share</small></span>
                <span className="gscr__bar" aria-hidden="true"><i style={{ width: `${Math.max(3, s.share * 100)}%` }} /></span>
                <span className="gscr__d">{s.line}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="gdash__fine">Share of the publication&rsquo;s simulated games that end this way — a simulation share, not a calibrated probability.</p>
    </FxCard>
  );
}

// ------------------------------------------------------------------ Key Matchup Advantages (NFL ranks)

interface VsRow { key: string; label: string; off: Side; def: Side; o: Observation; d: Observation; gap: number }

/** Each offense against the defense it faces, area by area; the four largest published rank gaps first. */
export function nflVsRows(r: EventResearchDoc, g: GameSides): VsRow[] {
  const obs = new Map<string, Observation>();
  for (const m of r.matchup) {
    if (m.home) obs.set(`${m.metric_id}|${g.home.abbr}`, m.home);
    if (m.away) obs.set(`${m.metric_id}|${g.away.abbr}`, m.away);
  }
  const out: VsRow[] = [];
  for (const a of MATCHUP_AREAS) {
    for (const [off, def] of [[g.home, g.away], [g.away, g.home]] as const) {
      const o = obs.get(`${a.offense}|${off.abbr}`);
      const d = obs.get(`${a.defense}|${def.abbr}`);
      const ro = rankView(o?.context);
      const rd = rankView(d?.context);
      if (!o || !d || !ro || !rd || !ro.directional || !rd.directional) continue;
      out.push({ key: `${a.name}|${off.abbr}`, label: a.label, off, def, o, d, gap: Math.abs(ro.strength - rd.strength) });
    }
  }
  return out.sort((x, y) => y.gap - x.gap);
}

function teamVars(sport: string, left: string, right: string) {
  return { ['--fx-home' as string]: teamColors(sport, left)[0], ['--fx-away' as string]: teamColors(sport, right)[0] };
}

export function MatchupAdvantagesCard({ r, g, sport, href, wide }: { r: EventResearchDoc; g: GameSides; sport: string; href: string; wide?: boolean }) {
  // Both directions of the game: the largest gaps first, at most three rows for either offense.
  const rows = useMemo(() => {
    const per = new Map<string, number>();
    return nflVsRows(r, g).filter((x) => {
      const n = per.get(x.off.abbr) ?? 0;
      per.set(x.off.abbr, n + 1);
      return n < 3;
    }).slice(0, 5);
  }, [r, g]);
  return (
    <FxCard title="Key Matchup Advantages" icon="compare" className={`gdash__vs ${wide ? 'fx-span-12' : 'fx-span-5'}`} id="gd-vs" action={{ to: href, label: 'View full matchup' }}>
      {rows.length ? (
        <div className="gvs">
          {rows.map((x) => (
            <div key={x.key} className="gvs__row" style={teamVars(sport, x.off.abbr, x.def.abbr)}>
              <VsBar
                label={<><b>{x.off.abbr}</b> {x.label.toLowerCase()} offense vs <b>{x.def.abbr}</b> defense</>}
                left={{ rank: x.o.context?.rank ?? null, of: x.o.context?.universe_size ?? null, text: `${x.off.abbr} ${x.label.toLowerCase()} offense` }}
                right={{ rank: x.d.context?.rank ?? null, of: x.d.context?.universe_size ?? null, text: `${x.def.abbr} ${x.label.toLowerCase()} defense` }}
                leftMark={<TeamMark sport={sport} abbr={x.off.abbr} size="sm" />}
                rightMark={<TeamMark sport={sport} abbr={x.def.abbr} size="sm" />}
              />
            </div>
          ))}
        </div>
      ) : <p className="muted small">No opponent-adjusted unit ranks are published for this game.</p>}
      <p className="gdash__fine">League rank of {rows[0]?.o.context?.universe_size ?? 32}, opponent-adjusted; #1 is the best unit for its job. The longer, lit bar is the stronger unit.</p>
    </FxCard>
  );
}

// ------------------------------------------------------------------ Player Prop Explorer (compact)

function gameValues(c: PropCard, hist: PlayerHistoryDoc | null | undefined, kickoff: string, week: number | null): number[] {
  const def = statDef(c.stat);
  if (!def || !hist) return [];
  const rows = pregameRows(hist, kickoff, week);
  return [...rows.prior, ...rows.current].map((x) => def.get(x)).filter((v): v is number => v != null && Number.isFinite(v));
}

function MiniDist({ c, values }: { c: PropCard; values: number[] }) {
  const fmt = (v: number) => (c.unit === 'rec' ? (Math.round(v * 10) / 10).toString() : String(Math.round(v)));
  if (values.length >= 6) {
    const lo = Math.min(...values, c.line ?? Infinity);
    const hi = Math.max(...values, c.line ?? -Infinity);
    const bins = Math.min(8, Math.max(4, Math.round(values.length / 2)));
    const { edges, counts } = binSamples(values, bins, lo, hi > lo ? hi : lo + 1);
    return (
      <div className="gpx__dist">
        <Histogram edges={edges} counts={counts} height={130} ticks={2} format={fmt} marker={c.line != null ? { value: c.line, label: `${c.line}` } : null} label={`${c.name} ${c.statLabel.toLowerCase()} in his last ${values.length} games${c.line != null ? `, against today's line ${c.line}` : ''}`} />
        <span className="gpx__dk">Last {values.length} games{c.line != null ? ` · ${values.filter((v) => v > c.line!).length} above ${c.line}` : ''}</span>
      </div>
    );
  }
  return (
    <div className="gpx__dist gpx__dist--range">
      <RangeBar typical={c.range.typical} full={c.range.full} projection={c.projection} line={c.line} format={fmt} label={`${c.name} ${c.statLabel.toLowerCase()} projected range`} />
      <span className="gpx__dk">Projected range · too few logged games to plot</span>
    </div>
  );
}

export function PropExplorerCard({ all, ctx, slug, eventId, propsHref }: { all: PropCard[]; ctx: GameCtx; slug: string; eventId: string; propsHref: string }) {
  const [team, setTeam] = useState<string>('');
  const [cat, setCat] = useState<string>('');
  const teams = useMemo(() => [...new Set(all.map((c) => c.team.abbr))], [all]);
  const cats = useMemo(() => (['passing', 'rushing', 'receiving', 'touchdowns'] as const).filter((k) => all.some((c) => propCat(c.stat) === k)), [all]);
  const cards = useMemo(() => propsToWatch(all.filter((c) => (!team || c.team.abbr === team) && (!cat || propCat(c.stat) === cat)), 4, team ? 4 : 2), [all, team, cat]);
  const players = useMemo(() => cards.map((c) => ({ name: c.name, team: c.team.abbr })), [cards]);
  const hist = usePropHistories(ctx.sport, players);
  return (
    <FxCard title="Player Prop Explorer" icon="target" className="gdash__props fx-span-7" id="gd-props" action={{ to: routes.props(slug, { game: eventId }), label: 'View full prop board' }}>
      <div className="gpx__f">
        <label className="gpx__sel"><span className="sr-only">Team</span>
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">Both teams</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="gpx__sel"><span className="sr-only">Prop type</span>
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All prop types</option>
            {cats.map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}
          </select>
        </label>
      </div>
      {cards.length ? (
        <ul className="gpx">
          {cards.map((c) => {
            const values = gameValues(c, hist.get(`${nameKey(c.name)}|${c.team.abbr}`), ctx.r.event.start_time_utc, ctx.g.week);
            return (
              <li key={c.id} className="gpx__c" style={{ ['--tc' as string]: teamColors(ctx.sport, c.team.abbr)[0] }}>
                <Link to={routes.player(slug, c.playerId)} className="gpx__who">
                  <PlayerFace photo={playerPhoto(c.playerId, c.name, c.team.abbr)} team={c.team.abbr} size="md" />
                  <span><span className="gpx__n">{c.name}</span><span className="gpx__r">{c.team.abbr} {c.role}</span></span>
                </Link>
                <span className="gpx__stat">{c.statLabel}</span>
                <span className="gpx__nums">
                  <span><small>Line</small><b className="fx-num">{c.line != null ? `O/U ${c.line}` : '—'}</b></span>
                  <span><small>Projection</small><b className="fx-num gpx__proj">{valueText(c.projection, c.unit)}</b></span>
                </span>
                <MiniDist c={c} values={values} />
                <Link className="gpx__go" to={routes.props(slug, { game: eventId, player: c.playerId, stat: c.stat })}>View props <Icon name="arrowRight" size={13} /></Link>
              </li>
            );
          })}
        </ul>
      ) : <p className="muted small">No published projection in this filter.</p>}
      <p className="gdash__fine"><Link to={propsHref}>All {all.filter((c) => c.market).length} priced player props on this game →</Link></p>
    </FxCard>
  );
}

// ------------------------------------------------------------------ Top market context

/** The game's core contracts — each team to win, the spread and total rungs nearest a coin flip — with quote age. */
export function topContracts(rows: PriceRow[]): PriceRow[] {
  const full = rows.filter((r) => r.ask != null && r.ask > 0 && r.ask < 1 && (r.m.period == null || isFullGame(r.m.period)) && !r.m.player_id);
  const nearest = (xs: PriceRow[]) => xs.filter((r) => r.mid != null).sort((a, b) => Math.abs(a.mid! - 0.5) - Math.abs(b.mid! - 0.5))[0];
  const winners = full.filter((r) => r.m.market_family === 'game_winner' || r.m.market_family === 'game_moneyline').sort((a, b) => (b.ask ?? 0) - (a.ask ?? 0));
  const spread = nearest(full.filter((r) => r.group === 'spreads' && r.m.market_family !== 'game_winner' && r.m.market_family !== 'game_moneyline'));
  const total = nearest(full.filter((r) => r.group === 'totals'));
  return [...winners.slice(0, 2), spread, total].filter((x): x is PriceRow => !!x);
}

export function MarketContextCard({ rows, slug, eventId, now, allHref, title = 'Top Market Context', className = 'fx-span-5', fine = true }: { rows: PriceRow[]; slug: string; eventId: string; now: number; allHref: string; title?: string; className?: string; fine?: boolean }) {
  const top = useMemo(() => topContracts(rows), [rows]);
  return (
    <FxCard title={title} icon="chart" className={`gdash__mkt ${className}`} id="gd-mkt" action={{ to: allHref, label: 'All markets' }}>
      {top.length ? (
        <ol className="gmk">
          {top.map((x, i) => {
            const fresh = quoteFreshness(x.m.captured_at, now);
            return (
              <li key={x.m.market_id}>
                <Link to={routes.market(slug, x.m.market_id, eventId)} className="gmk__a">
                  <span className="gmk__i num" aria-hidden="true">{i + 1}</span>
                  <span className="gmk__l">{x.label}</span>
                  <span className={`gmk__p fx-num gmk__p--${fresh.toLowerCase()}`} data-quote-state={fresh}>{centsText(x.ask)}</span>
                  <span className={`gmk__age gmk__age--${fresh.toLowerCase()}`}>{fresh === 'UNKNOWN' ? 'no time' : formatQuoteAgo(quoteAgeMs(x.m.captured_at, now))}</span>
                  <Icon name="chevronRight" size={15} />
                </Link>
              </li>
            );
          })}
        </ol>
      ) : <p className="muted small">No priced game contract is published for this game.</p>}
      {fine && <p className="gdash__fine">YES ask on Kalshi with the quote&rsquo;s age. Context, not a recommendation: the verdict above says whether the publication flags anything.</p>}
    </FxCard>
  );
}

// ------------------------------------------------------------------ Game information + related research

export function GameInfoCard({ r, sport, className = 'fx-span-4' }: { r: EventResearchDoc; sport: string; className?: string }) {
  const spec = useMemo(() => resolveHero(heroInputFromResearch(r, sport)), [r, sport]);
  const wx = gameWeather(r, spec.venue);
  const d = new Date(r.event.start_time_utc);
  const v = r.context?.venue as { surface?: string | null } | undefined;
  const items: { icon: string; k: string; v: string; s?: string | null }[] = [
    { icon: 'calendar', k: 'Kickoff', v: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), s: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) },
  ];
  if (spec.venue?.name) items.push({ icon: 'pin', k: 'Venue', v: spec.venue.name, s: spec.venue.city ?? null });
  const wl = weatherLine(wx);
  if (wl) items.push({ icon: wx.icon, k: wx.kind === 'outdoor' ? 'Forecast' : 'Roof', v: wx.kind === 'outdoor' ? `${wx.temp}°` : wl, s: wx.kind === 'outdoor' ? [wx.condition, wx.wind, wx.flag].filter(Boolean).join(' · ') || 'Context only' : null });
  if (v?.surface) items.push({ icon: 'grid', k: 'Surface', v: v.surface.replace(/_/g, ' ').replace(/^a turf$/i, 'Artificial turf').replace(/^\w/, (c) => c.toUpperCase()) });
  return (
    <FxCard title="Game Information" icon="info" className={`gdash__info ${className}`} id="gd-info">
      <dl className="ginfo">
        {items.map((x) => (
          <div key={x.k} className="ginfo__i">
            <span className="ginfo__ic" aria-hidden="true"><Icon name={x.icon} size={20} /></span>
            <dt className="sr-only">{x.k}</dt>
            <dd><b>{x.v}</b>{x.s && <small>{x.s}</small>}</dd>
          </div>
        ))}
      </dl>
    </FxCard>
  );
}

export function RelatedResearchCard({ links, className = 'fx-span-3' }: { links: { to: string; icon: string; t: string; s: string }[]; className?: string }) {
  return (
    <FxCard title="Related Research" icon="layers" className={`gdash__rel ${className}`} id="gd-rel">
      <ul className="grel">
        {links.map((l) => (
          <li key={l.t}><Link to={l.to} className="grel__a"><Icon name={l.icon} size={18} /><span><b>{l.t}</b><small>{l.s}</small></span></Link></li>
        ))}
      </ul>
    </FxCard>
  );
}

export type { Market };
