// The game overview's panels. Each answers one question and links to the deep view that owns it.
import { useMemo, useState, type ReactNode } from 'react';
import { statusWord } from '../../lib/nfl';
import { Link } from 'react-router';
import { MiniLines, type LineSeries } from '../../charts/MiniLines';
import type { EntityProfileDoc, EventResearchDoc, MarketHistoryDoc } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { Popover, TeamMark } from '../../components/ui';
import { centsText, completedGames, gapText, headToHead, notableInjuries, teamStat, type InjuryRow, type MarketGroupKey, type PriceRow } from '../../lib/gamedata';
import { routes } from '../../lib/routes';
import { sharePct, type Fit, type GameScript, type ScriptId, type ScriptSet } from '../../lib/scripts';
import { quoteAgeMs, quoteFreshness, formatQuoteAge } from '../../live/freshness';
import { splitName } from './Hero';
import { scriptCast, type CastMember } from '../../insights/cast';
import { RankBadge } from '../../components/insight';
import { rankView } from '../../lib/rank';
import type { NewsItem } from '../../insights/news';
import { teamColors, teamLogo } from '../../lib/teams';
import { useHeldImage } from '../../lib/useImage';
import { MarketIcon } from '../../components/MarketIcon';
import { glossLine, metricGloss, term } from '../../lib/glossary';
import { useSport } from '../../state/sport';
import { isFullGame } from '../../lib/period';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ------------------------------------------------------------------ primitives

export function Info({ label, children, align }: { label: string; children: ReactNode; align?: 'start' | 'end' }) {
  return (
    <span className="info">
      <Popover label={label} trigger={<Icon name="info" size={15} />} align={align}>
        <span className="info__body">{children}</span>
      </Popover>
    </span>
  );
}

export function PanelHead({ title, to, sub, info, children }: { title: string; to?: string; sub?: ReactNode; info?: ReactNode; children?: ReactNode }) {
  return (
    <div className="phead">
      <div>
        <h2 className="phead__t">{to ? <Link to={to}>{title}</Link> : title}{info}</h2>
        {sub && <div className="phead__sub">{sub}</div>}
      </div>
      {children && <div className="phead__x">{children}</div>}
    </div>
  );
}

export function ViewAll({ to, children = 'View all' }: { to: string; children?: ReactNode }) {
  return <Link to={to} className="phead__more">{children} <Icon name="arrowRight" size={14} /></Link>;
}

/** Bars that sketch where the final margin lands in a script (decorative; the label carries meaning). */
export function ScriptGlyph({ id }: { id: ScriptId }) {
  const h: Record<ScriptId, number[]> = { 'fav-big': [5, 9, 13, 18], fav: [6, 11, 15, 11], close: [10, 16, 16, 10], dog: [18, 13, 9, 5] };
  return (
    <svg className="sglyph" width="30" height="20" viewBox="0 0 30 20" aria-hidden="true" focusable="false">
      {h[id].map((v, i) => <rect key={i} x={i * 7.5} y={20 - v} width="5.5" height={v} rx="1" />)}
    </svg>
  );
}

function FitCells({ fits, set, selected }: { fits: Fit[]; set: ScriptSet; selected: ScriptId | null }) {
  return (
    <span className="fitcells" aria-hidden="true">
      {fits.map((f, i) => (
        <span key={i} className={`fitcell fitcell--${f} fitcell--s${set.scripts[i].index}${selected === set.scripts[i].id ? ' is-sel' : ''}`} title={`${set.scripts[i].name}: ${f === 'yes' ? 'wins' : f === 'part' ? 'wins only part of the time' : 'loses'}`} />
      ))}
    </span>
  );
}

function fitText(fits: Fit[], set: ScriptSet): string {
  const yes = set.scripts.filter((_, i) => fits[i] === 'yes').map((s) => s.name);
  const part = set.scripts.filter((_, i) => fits[i] === 'part').map((s) => s.name);
  return `Wins in ${yes.length ? yes.join(', ') : 'no script outright'}${part.length ? `; partly in ${part.join(', ')}` : ''}`;
}

function Price({ row, now }: { row: PriceRow; now: number }) {
  const fresh = quoteFreshness(row.m.captured_at, now);
  const age = quoteAgeMs(row.m.captured_at, now);
  const cls = row.ask == null ? 'price--none' : fresh === 'STALE' || fresh === 'UNKNOWN' ? 'price--stale' : fresh === 'AGING' ? 'price--aging' : '';
  return (
    <span className={`price ${cls}`} title={`YES ask ${centsText(row.ask)} · bid ${centsText(row.bid)} · updated ${formatQuoteAge(age)} ago (${fresh})`} data-quote-state={fresh}>
      {centsText(row.ask)}
    </span>
  );
}

function Gap({ g }: { g: number | null }) {
  const v = g == null ? null : Math.round(g * 100);
  return <span className={`gap ${v == null || v === 0 ? 'gap--flat' : v > 0 ? 'gap--pos' : 'gap--neg'}`}>{gapText(g)}</span>;
}

// ------------------------------------------------------------------ model read

export function ModelReadPanel({ r, read, homeAbbr, awayAbbr, to }: { r: EventResearchDoc; read: string | null; homeAbbr: string; awayAbbr: string; to: string }) {
  const ext = r.extensions as any;
  const mv = ext?.model_view;
  const mi = ext?.market_implied;
  const spread = mv?.model_spread != null ? Number(mv.model_spread) : null;
  const favHome = spread == null || spread <= 0;
  const fav = favHome ? homeAbbr : awayAbbr;
  const wp = mv?.model_win_probability?.[fav];
  const mwp = mi?.win_probability?.[fav];
  const mSpread = mi?.implied_spread != null ? Number(mi.implied_spread) : null;
  const line = (v: number | null) => (v == null ? '—' : `${fav} −${(Math.round(Math.abs(v) * 2) / 2).toFixed(1).replace(/\.0$/, '')}`);
  return (
    <section className="panel ov-model" aria-labelledby="ov-model-h">
      <div className="phead">
        <span className="ov-model__ic" aria-hidden="true"><Icon name="chart" size={18} /></span>
        <h2 className="phead__t" id="ov-model-h"><Link to={to}>Model Read</Link></h2>
        <Link to={to} className="phead__x iconbtn" aria-label="Open the game script view"><Icon name="chevronRight" size={18} /></Link>
      </div>
      <p className="ov-model__read">{read ?? 'The publication has no model view for this game.'}</p>
      {mv && (
        <dl className="tiles">
          <div className="tile">
            <dt>{fav} win prob</dt>
            <dd className="tile__v num">{wp != null ? `${Math.round(wp * 100)}%` : '—'}</dd>
            <dd className="tile__m">Market {mwp != null ? `${Math.round(mwp * 100)}%` : '—'}</dd>
          </div>
          <div className="tile">
            <dt>Model spread</dt>
            <dd className="tile__v num">{line(spread)}</dd>
            <dd className="tile__m">Market {line(mSpread)}</dd>
          </div>
          <div className="tile">
            <dt>Model total</dt>
            <dd className="tile__v num">{mv.model_total != null ? (Math.round(mv.model_total * 2) / 2).toFixed(1).replace(/\.0$/, '') : '—'}</dd>
            <dd className="tile__m">Market {mi?.implied_total_median != null ? (Math.round(mi.implied_total_median * 2) / 2).toFixed(1).replace(/\.0$/, '') : '—'}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ scripts

export const SIM_SHARE_INFO = <><b>Sim share:</b> {glossLine(term('sim_share'))}</>;

/**
 * The face of a script: the player whose role IS the script (insights/cast.ts), a real photo when one is
 * pinned, otherwise the team's mark on its colour. The reason is written on the card, not implied.
 */
export function CastLayer({ cast }: { cast: CastMember[] }) {
  return (
    <span className={`scard__art${cast.length > 1 ? ' scard__art--split' : ''}`} aria-hidden="true">
      {cast.map((c) => <span key={c.team} className="scard__frame" style={{ ['--tc' as string]: teamColors('NFL', c.team)[0] }}><CastImage c={c} /></span>)}
    </span>
  );
}

function CastImage({ c }: { c: CastMember }) {
  const img = useHeldImage(c.photo?.src ?? null);
  const logo = useHeldImage(c.photo ? null : teamLogo('NFL', c.team));
  if (img) return <img className="scard__img" src={img} alt="" style={{ objectPosition: c.photo!.focus }} />;
  return logo ? <img className="scard__img scard__img--logo" src={logo} alt="" /> : null;
}

export function ScriptsPanel({ set, selected, hrefFor, title = 'How It Could Play Out', compact, r, slug }: { set: ScriptSet; selected: ScriptId | null; hrefFor: (id: ScriptId | null) => string; title?: string; compact?: boolean; r?: EventResearchDoc; slug?: string }) {
  const sel = set.scripts.find((s) => s.id === selected) ?? null;
  return (
    <section className="panel ov-scripts" aria-labelledby="ov-scripts-h">
      <div className="phead">
        <h2 className="phead__t" id="ov-scripts-h">{title}<Info label="What is sim share?">{SIM_SHARE_INFO}</Info></h2>
        <div className="phead__x">
          <div className="mode" role="group" aria-label="Script mode">
            <Link to={hrefFor(null)} className={`mode__b${!sel ? ' is-on' : ''}`} aria-current={!sel ? 'true' : undefined}>All scripts</Link>
            <span className={`mode__b mode__b--static${sel ? ' is-on' : ''}`} aria-current={sel ? 'true' : undefined}>{sel ? 'Selected script' : 'Select one'}</span>
          </div>
        </div>
      </div>
      <ul className={`scards${compact ? ' scards--compact' : ''}`}>
        {set.scripts.map((s, rank) => {
          const on = s.id === selected;
          const cast = r ? scriptCast(r, set, s) : [];
          return (
            <li key={s.id}>
              <div className={`scard scard--s${s.index}${on ? ' is-sel' : ''}${sel && !on ? ' is-dim' : ''}`}>
                <CastLayer cast={cast} />
                <Link to={hrefFor(on ? null : s.id)} className="scard__a" aria-current={on ? 'true' : undefined} aria-label={`${rank === 0 ? 'Most likely: ' : ''}${s.name}: ${sharePct(s.share)} of simulated games. ${s.summary}${on ? ' Selected.' : ''}`}>
                  {rank === 0 && <span className="scard__top">Most likely</span>}
                  <span className="scard__name">{s.name}</span>
                  <span className="scard__pct num">{sharePct(s.share)}</span>
                  <span className="scard__d">{s.summary}</span>
                </Link>
                {!compact && cast[0]?.name && (
                  <span className="scard__cast">
                    {cast.filter((c) => c.name).map((c) => (
                      slug && c.playerId ? <Link key={c.team} to={routes.player(slug, c.playerId)} className="scard__who">{c.name}</Link> : <span key={c.team} className="scard__who">{c.name}</span>
                    ))}
                    <span className="scard__why">{cast.length === 1 ? cast[0].why : 'Both quarterbacks carry a one-score game.'}</span>
                  </span>
                )}
                <ScriptGlyph id={s.id} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ survivors

/**
 * Margin markets that win in two or more scripts, with the share of simulated games they cover. Ladder
 * rungs that survive exactly the same scripts are one line (the rung with the largest model–market gap,
 * the others counted), so the list shows distinct ways to survive, not one ladder five times.
 */
export function survivors(rows: PriceRow[], selected: ScriptId | null, set: ScriptSet, n = 5): (PriceRow & { similar: number })[] {
  const si = selected ? set.scripts.findIndex((s) => s.id === selected) : -1;
  const eligible = rows
    .filter((r) => r.fit && r.model != null && r.ask != null && r.ask >= 0.1 && r.ask <= 0.9)
    .filter((r) => r.fit!.full + r.fit!.part >= 2 && r.fit!.full >= 1)
    .filter((r) => si < 0 || r.fit!.fits[si] === 'yes');
  const byPattern = new Map<string, PriceRow[]>();
  for (const r of eligible) {
    const k = `${r.m.participant_id}|${r.fit!.fits.join('')}`;
    byPattern.set(k, [...(byPattern.get(k) ?? []), r]);
  }
  return [...byPattern.values()]
    .map((g) => ({ ...[...g].sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0) || Math.abs((a.mid ?? 0.5) - 0.5) - Math.abs((b.mid ?? 0.5) - 0.5))[0], similar: g.length - 1 }))
    .sort((a, b) => b.fit!.coverage - a.fit!.coverage || b.fit!.coverageMax - a.fit!.coverageMax || Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0))
    .slice(0, n);
}

export function SurvivorsPanel({ rows, set, selected, slug, eventId, now, to }: { rows: PriceRow[]; set: ScriptSet; selected: ScriptId | null; slug: string; eventId: string; now: number; to: string }) {
  const shown = survivors(rows, selected, set);
  const sel = set.scripts.find((s) => s.id === selected);
  return (
    <section className="panel ov-surv" aria-labelledby="ov-surv-h">
      <PanelHead
        title="Bets That Survive Multiple Scripts"
        info={
          <Info label="How script survival works">
            A market <b>survives</b> a script when it wins in every simulated game that ends that way (◧ = only some of them).
            <b> Coverage</b> is the sim share of the scripts it always wins in. Exact for moneylines and full-game spreads; totals and props
            need a joint margin × points simulation the publication does not carry yet. Surviving many scripts is not a reason on its own —
            read it next to Model − Market and the price.
          </Info>
        }
        sub={sel ? <>Markets that win if <b>{sel.name}</b></> : 'Moneyline and spreads, by share of simulated games covered'}
      />
      <div className="tscroll"><table className="survt ">
        <thead>
          <tr>
            <th scope="col">Market</th>
            <th scope="col" className="survt__fits">
              <span className="fitcells fitcells--head" aria-hidden="true">{set.scripts.map((s) => <span key={s.id} className={`fitcell fitcell--key fitcell--s${s.index}`} title={s.name} />)}</span>
              <span className="sr-only">Scripts</span>
            </th>
            <th scope="col">Coverage</th>
            <th scope="col" className="r"><abbr title="Model probability minus the market midpoint, in percentage points">Model − Mkt</abbr></th>
            <th scope="col" className="r">Price</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.m.market_id}>
              <th scope="row"><span className="mkrow"><MarketIcon m={r.m} /><span className="mkrow__t"><Link to={routes.market(slug, r.m.market_id, eventId)} className="survt__m">{r.label}</Link>{r.similar > 0 && <span className="survt__sim">+{r.similar} similar {r.similar === 1 ? 'line' : 'lines'}</span>}</span></span></th>
              <td>
                <FitCells fits={r.fit!.fits} set={set} selected={selected} />
                <span className="sr-only">{fitText(r.fit!.fits, set)}</span>
              </td>
              <td>
                <span className="cov">
                  <span className="cov__bar" aria-hidden="true"><span style={{ width: `${Math.round(r.fit!.coverage * 100)}%` }} /><span className="cov__part" style={{ width: `${Math.round((r.fit!.coverageMax - r.fit!.coverage) * 100)}%` }} /></span>
                  <span className="cov__n num">{sharePct(r.fit!.coverage)}</span>
                </span>
                <span className="survt__k">{r.fit!.full}/4{r.fit!.part ? ` +${r.fit!.part}◧` : ''}</span>
              </td>
              <td className="r"><Gap g={r.gap} /></td>
              <td className="r"><Price row={r} now={now} /></td>
            </tr>
          ))}
          {!shown.length && (
            <tr><td colSpan={5} className="muted small">No priced margin market wins in this script and at least one other.</td></tr>
          )}
        </tbody>
      </table></div>
      <div className="ov-surv__foot"><ViewAll to={to}>All script fits</ViewAll></div>
    </section>
  );
}

// ------------------------------------------------------------------ top markets by script fit

const FILTERS: [MarketGroupKey | 'all', string][] = [
  ['all', 'All'], ['spreads', 'Spreads'], ['totals', 'Totals'], ['team_totals', 'Team Totals'], ['props', 'Player Props'], ['halves', '1H/2H'], ['more', 'More'],
];

export function MarketsPanel({ rows, set, selected, slug, eventId, now, allHref }: { rows: PriceRow[]; set: ScriptSet | null; selected: ScriptId | null; slug: string; eventId: string; now: number; allHref: string }) {
  const [f, setF] = useState<MarketGroupKey | 'all'>('all');
  const si = set && selected ? set.scripts.findIndex((s) => s.id === selected) : -1;
  const shown = useMemo(() => {
    const live = rows.filter((r) => r.model != null && r.ask != null && r.ask >= 0.08 && r.ask <= 0.92 && (f === 'all' || r.group === f));
    const score = (r: PriceRow) => (r.fit ? (si >= 0 ? (r.fit.fits[si] === 'yes' ? 2 : r.fit.fits[si] === 'part' ? 1 : 0) : r.fit.coverage) : -1);
    return live.sort((a, b) => score(b) - score(a) || Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0)).slice(0, 6);
  }, [rows, f, si]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.group] = (c[r.group] ?? 0) + 1;
    return c;
  }, [rows]);
  return (
    <section className="panel ov-markets" aria-labelledby="ov-markets-h">
      <PanelHead
        title="Top Markets by Script Fit"
        info={<Info label="How this table is ordered">Markets that win in the most simulated games across scripts come first (the selected script, when one is chosen), then the largest gaps between the model and the market midpoint. A gap is research evidence, not a validated edge.</Info>}
      >
        <div className="seg seg--tight" role="tablist" aria-label="Market type">
          {FILTERS.filter(([k]) => k === 'all' || counts[k]).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={f === k} className={`seg__b${f === k ? ' is-on' : ''}`} onClick={() => setF(k)}>{l}</button>
          ))}
        </div>
      </PanelHead>
      <div className="tscroll"><table className="mtab ">
        <thead>
          <tr>
            <th scope="col">Market</th>
            <th scope="col" className="r">Live price</th>
            <th scope="col" className="r">Model</th>
            <th scope="col" className="r"><abbr title="Model probability minus the market midpoint, in percentage points">Model − Mkt</abbr></th>
            <th scope="col" className="mtab__fit">Fits scripts</th>
            <th scope="col"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.m.market_id}>
              <th scope="row"><span className="mkrow"><MarketIcon m={r.m} /><Link to={routes.market(slug, r.m.market_id, eventId)} className="mtab__m">{r.label}</Link></span></th>
              <td className="r"><Price row={r} now={now} /></td>
              <td className="r num">{r.model != null ? `${Math.round(r.model * 100)}%` : '—'}</td>
              <td className="r"><Gap g={r.gap} /></td>
              <td className="mtab__fit">
                {r.fit && set ? (
                  <span className="row"><FitCells fits={r.fit.fits} set={set} selected={selected} /><span className="num mtab__k">{r.fit.full}/4</span><span className="sr-only">{fitText(r.fit.fits, set)}</span></span>
                ) : (
                  <span className="mtab__na" title="Script fit needs a joint margin × points simulation output, not published yet">—</span>
                )}
              </td>
              <td className="mtab__go"><Link to={routes.market(slug, r.m.market_id, eventId)} className="iconbtn" aria-label={`Open ${r.label}`}><Icon name="chevronRight" size={16} /></Link></td>
            </tr>
          ))}
          {!shown.length && <tr><td colSpan={6} className="muted small">No priced markets of this type have a model price.</td></tr>}
        </tbody>
      </table></div>
      <div className="ov-markets__foot">
        <span className="muted small">{rows.length} markets · model prices are research evidence</span>
        <ViewAll to={allHref}>All markets</ViewAll>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ team form

type FormView = 'offense' | 'defense' | 'overall';
// Definitions come from the shared glossary (lib/glossary.ts), with direction from the registry.
const pctFmt = (v: number) => `${(v * 100).toFixed(1)}%`;
/** NHL form rows: opponent-adjusted 5v5 rates where they exist (labelled "Adj."), raw counts and percentages labelled raw. */
const NHL_FORM_STATS: Record<FormView, { id: string; label: string; fmt: (v: number) => string }[]> = {
  offense: [
    { id: 'met_nhl.gf_per_game', label: 'Goals / game', fmt: (v) => v.toFixed(2) },
    { id: 'met_nhl.oa_xgf60_5v5', label: 'Adj. 5v5 xGF/60', fmt: (v) => v.toFixed(2) },
    { id: 'met_nhl.pp_pct', label: 'Power play (raw)', fmt: pctFmt },
  ],
  defense: [
    { id: 'met_nhl.ga_per_game', label: 'Allowed / game', fmt: (v) => v.toFixed(2) },
    { id: 'met_nhl.oa_xga60_5v5', label: 'Adj. 5v5 xGA/60', fmt: (v) => v.toFixed(2) },
    { id: 'met_nhl.pk_pct', label: 'Penalty kill (raw)', fmt: pctFmt },
  ],
  overall: [
    { id: 'met_nhl.points_pct', label: 'Points %', fmt: pctFmt },
    { id: 'met_nhl.oa_xgf_pct_5v5', label: 'Adj. 5v5 xG share', fmt: pctFmt },
    { id: 'met_nhl.xgf_pct', label: 'xG share (raw)', fmt: pctFmt },
  ],
};

const FORM_STATS: Record<FormView, { id: string; label: string; fmt: (v: number) => string }[]> = {
  offense: [
    { id: 'met_nfl.points_for', label: 'Points / game', fmt: (v) => v.toFixed(1) },
    { id: 'met_nfl.off_epa_play', label: 'EPA / play', fmt: (v) => (v > 0 ? '+' : '') + v.toFixed(2) },
    { id: 'met_nfl.off_success_rate', label: 'Success rate', fmt: (v) => `${Math.round(v * 100)}%` },
  ],
  defense: [
    { id: 'met_nfl.points_against', label: 'Allowed / game', fmt: (v) => v.toFixed(1) },
    { id: 'met_nfl.def_epa_play', label: 'EPA / play allowed', fmt: (v) => (v > 0 ? '+' : '') + v.toFixed(2) },
    { id: 'met_nfl.def_takeaway_rate', label: 'Takeaway rate', fmt: (v) => `${(v * 100).toFixed(1)}%` },
  ],
  overall: [
    { id: 'met_nfl.point_margin', label: 'Margin / game', fmt: (v) => (v > 0 ? '+' : '') + v.toFixed(1) },
    { id: 'met_nfl.adj_off_epa', label: 'Adj. offense', fmt: (v) => (v > 0 ? '+' : '') + v.toFixed(3) },
    { id: 'met_nfl.adj_def_epa', label: 'Adj. defense', fmt: (v) => (v > 0 ? '+' : '') + v.toFixed(3) },
  ],
};

export function rankText(rank: number | null) {
  return rank == null ? '—' : `#${rank}`;
}

function FormTeam({ prof, abbr, sportCode, view, before, slug }: { prof: EntityProfileDoc | null | undefined; abbr: string; sportCode: string; view: FormView; before: string; slug: string }) {
  const games = completedGames(prof, before).slice(0, 5);
  const name = prof ? splitName(prof.entity.display_name, abbr, sportCode).nick : abbr;
  const ppg = games.length ? games.reduce((a, g) => a + (view === 'defense' ? g.against : g.for), 0) / games.length : null;
  return (
    <div className="form">
      <div className="form__h">
        <TeamMark sport={sportCode} abbr={abbr} size="md" />
        {prof ? <Link to={routes.team(slug, prof.entity.participant_id, 'results')} className="form__n">{name}</Link> : <span className="form__n">{name}</span>}
      </div>
      <ol className="wl" aria-label={`${abbr} last ${games.length} results, oldest to newest`}>
        {[...games].reverse().map((g) => (
          <li key={g.eventId} className={`wl__g wl__g--${g.outcome.toLowerCase()}`} title={`${g.outcome} ${g.for}-${g.against} ${g.home ? 'vs' : '@'} ${g.opponentName}`}>
            <span aria-hidden="true">{g.outcome}</span>
            <span className="sr-only">{g.outcome === 'W' ? 'Win' : g.outcome === 'L' ? 'Loss' : 'Tie'} {g.for}–{g.against} {g.home ? 'vs' : 'at'} {g.opponentName}</span>
          </li>
        ))}
      </ol>
      <div className="form__l5">{ppg != null ? <>Last {games.length}: <b className="num">{ppg.toFixed(1)}</b> {view === 'defense' ? 'allowed' : 'scored'}/g</> : 'No completed games published'}</div>
      <dl className="form__stats">
        {(sportCode === 'NHL' ? NHL_FORM_STATS : FORM_STATS)[view].map((s) => {
          const st = teamStat(prof, s.id);
          // Rank first for rates a reader can't judge on sight (EPA, success, takeaways); simple counts stay number-first.
          const rv = st.rank != null && st.size ? rankView({ rank: st.rank, universe_size: st.size, higher_is_better: true }) : null;
          const simple = /Points|Allowed|Margin|Goals/.test(s.label);
          return (
            <div key={s.id} className={`fstat${simple ? '' : ' fstat--rank'}`}>
              <dt className="fstat__k">{s.label}</dt>
              {simple || !rv ? (
                <>
                  <dd className="fstat__v num">{st.value != null ? s.fmt(st.value) : '—'}</dd>
                  <dd className={`fstat__r${st.rank != null && st.rank <= 8 ? ' is-top' : st.rank != null && st.rank >= 25 ? ' is-low' : ''}`}>{rankText(st.rank)}<span> {sportCode}</span></dd>
                </>
              ) : (
                <dd className="fstat__rk"><RankBadge rank={rv} raw={st.value != null ? s.fmt(st.value) : undefined} compact /></dd>
              )}
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export function FormPanel({ homeProf, awayProf, homeAbbr, awayAbbr, sportCode, before, slug, to }: { homeProf?: EntityProfileDoc | null; awayProf?: EntityProfileDoc | null; homeAbbr: string; awayAbbr: string; sportCode: string; before: string; slug: string; to: string }) {
  const [view, setView] = useState<FormView>('offense');
  const { metrics } = useSport();
  const defs = (sportCode === 'NHL' ? NHL_FORM_STATS : FORM_STATS)[view].map((s) => ({ id: s.id, label: s.label, def: glossLine(metricGloss(s.id, metrics.get(s.id))) })).filter((d) => d.def);
  return (
    <section className="panel ov-form" aria-labelledby="ov-form-h">
      <PanelHead
        title="Team Form"
        sub="Last 5 games · season ranks of 32"
        info={defs.length ? <Info label="Stat definitions">{defs.map((d) => <span key={d.id}><b>{d.label}:</b> {d.def}</span>)}</Info> : undefined}
      >
        <ViewAll to={to}>Trends</ViewAll>
      </PanelHead>
      <div className="seg seg--tight" role="tablist" aria-label="Team form view">
        {(['offense', 'defense', 'overall'] as FormView[]).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} className={`seg__b${view === v ? ' is-on' : ''}`} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
        ))}
      </div>
      <div className="forms">
        <FormTeam prof={awayProf} abbr={awayAbbr} sportCode={sportCode} view={view} before={before} slug={slug} />
        <FormTeam prof={homeProf} abbr={homeAbbr} sportCode={sportCode} view={view} before={before} slug={slug} />
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ line history

const RANGES: [string, number | null][] = [['7D', 7], ['14D', 14], ['All', null]];

// Full-game line families across publications: NFL says game_winner / spread / total; CFB says game_moneyline /
// game_spread / game_total.
const WINNER_FAMILIES = new Set(['game_winner', 'game_moneyline']);
const SPREAD_FAMILIES = new Set(['spread', 'game_spread']);
const TOTAL_FAMILIES = new Set(['total', 'game_total']);

/**
 * The favourite's side by the market itself: the full-game winner contract with the higher YES midpoint. Null when
 * the game has no priced winner contract. Used where the publication states no favourite of its own (CFB).
 */
export function marketFavoriteId(rows: PriceRow[]): string | null {
  const ml = rows.filter((r) => WINNER_FAMILIES.has(r.m.market_family) && isFullGame(r.m.period) && r.m.participant_id && r.mid != null);
  ml.sort((a, b) => (b.mid ?? 0) - (a.mid ?? 0));
  return ml[0]?.m.participant_id ?? null;
}

export function lineSeries(hist: MarketHistoryDoc | undefined, rows: PriceRow[], favAbbr: string, favId?: string | null): LineSeries[] {
  if (!hist) return [];
  const byTicker = new Map(hist.series.map((s) => [s.kalshi_ticker, s]));
  const mid = (p: { yes_bid: number | null; yes_ask: number | null; last_price?: number | null }) => (p.yes_bid != null && p.yes_ask != null && p.yes_ask - p.yes_bid <= 0.2 ? (p.yes_bid + p.yes_ask) / 2 : p.last_price ?? null);
  const pick = (pred: (r: PriceRow) => boolean) =>
    rows.filter((r) => pred(r) && byTicker.has(r.m.kalshi_ticker) && r.mid != null).sort((a, b) => Math.abs((a.mid ?? 0) - 0.5) - Math.abs((b.mid ?? 0) - 0.5))[0];
  // The favourite's side by the contract's own participant when known; the label prefix otherwise (NFL abbreviations).
  const isFav = (r: PriceRow) => (favId ? r.m.participant_id === favId : r.label.startsWith(favAbbr));
  const ml = rows.find((r) => WINNER_FAMILIES.has(r.m.market_family) && isFullGame(r.m.period) && isFav(r) && byTicker.has(r.m.kalshi_ticker));
  const sp = pick((r) => SPREAD_FAMILIES.has(r.m.market_family) && isFullGame(r.m.period) && isFav(r));
  const to = pick((r) => TOTAL_FAMILIES.has(r.m.market_family) && isFullGame(r.m.period));
  const colors = ['var(--mark-focus)', 'var(--mark-opp)', 'var(--mark-compare)'];
  return [ml, sp, to]
    .filter((r): r is PriceRow => !!r)
    .map((r, i) => ({
      key: r.m.kalshi_ticker,
      label: r.label,
      color: colors[i],
      points: byTicker.get(r.m.kalshi_ticker)!.points.map((p) => ({ t: Date.parse(p.captured_at), v: mid(p) })).filter((p): p is { t: number; v: number } => p.v != null).sort((a, b) => a.t - b.t),
    }))
    .filter((s) => s.points.length >= 2);
}

export function LineHistoryPanel({ hist, loading, rows, favAbbr, favId, to }: { hist: MarketHistoryDoc | undefined; loading: boolean; rows: PriceRow[]; favAbbr: string; favId?: string | null; to: string }) {
  const [range, setRange] = useState<number | null>(7);
  const all = useMemo(() => lineSeries(hist, rows, favAbbr, favId), [hist, rows, favAbbr, favId]);
  const series = useMemo(() => {
    if (!range) return all;
    const end = Math.max(...all.flatMap((s) => s.points.map((p) => p.t)));
    const start = end - range * 86400e3;
    return all.map((s) => {
      const before = s.points.filter((p) => p.t < start).pop();
      return { ...s, points: [...(before ? [{ t: start, v: before.v }] : []), ...s.points.filter((p) => p.t >= start)] };
    });
  }, [all, range]);
  const current = (key: string) => rows.find((r) => r.m.kalshi_ticker === key);
  return (
    <section className="panel ov-lines" aria-labelledby="ov-lines-h">
      <PanelHead title="Line History" sub="YES midpoint, ¢ — captures since listing">
        <div className="seg seg--tight" role="tablist" aria-label="Range">
          {RANGES.map(([l, d]) => (
            <button key={l} type="button" role="tab" aria-selected={range === d} className={`seg__b${range === d ? ' is-on' : ''}`} onClick={() => setRange(d)}>{l}</button>
          ))}
        </div>
      </PanelHead>
      {loading && <p className="muted small">Loading price history…</p>}
      {!loading && !all.length && <p className="muted small">No game-line price history is published for this game.</p>}
      {series.length > 0 && (
        <>
          <ul className="legend">
            {series.map((s) => {
              const c = current(s.key);
              return (
                <li key={s.key}><i style={{ background: s.color }} aria-hidden="true" />{s.label}<b className="num">{c?.mid != null ? `${Math.round(c.mid * 100)}¢` : '—'}</b></li>
              );
            })}
          </ul>
          <MiniLines series={series} summary={`Price history: ${series.map((s) => `${s.label} from ${Math.round(s.points[0].v * 100)}¢ to ${Math.round(s.points[s.points.length - 1].v * 100)}¢`).join('; ')}`} />
        </>
      )}
      <div className="ov-lines__foot"><ViewAll to={to}>Every contract's history</ViewAll></div>
    </section>
  );
}

// ------------------------------------------------------------------ head to head

export function H2HPanel({ homeProf, homeId, awayId, abbrOf, sportCode, before, slug, to, n = 5 }: { homeProf?: EntityProfileDoc | null; homeId: string; awayId: string; abbrOf: (id: string | null) => string; sportCode: string; before: string; slug: string; to?: string; n?: number }) {
  const games = headToHead(homeProf, homeId, awayId, before).slice(0, n);
  return (
    <section className="panel ov-h2h" aria-labelledby="ov-h2h-h">
      <PanelHead title="Recent Head to Head" sub={games.length ? `Last ${games.length} meetings · context, not model evidence` : 'Context, not model evidence'}>
        {to && <ViewAll to={to} />}
      </PanelHead>
      {!games.length ? (
        <p className="muted small">No meetings in the published game history.</p>
      ) : (
        <ol className="h2h">
          {games.map((g) => {
            const w = abbrOf(g.winnerId);
            const l = abbrOf(g.loserId);
            return (
              <li key={g.eventId}>
                <Link to={routes.game(slug, g.eventId, { team: homeId })} className="h2h__row">
                  <span className="h2h__d">{new Date(g.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span className="h2h__w"><TeamMark sport={sportCode} abbr={w} size="sm" /><b>{w}</b></span>
                  <span className="h2h__s num"><b>{g.winnerPts}</b>–{g.loserPts}</span>
                  <span className="h2h__l">{l}<TeamMark sport={sportCode} abbr={l} size="sm" /></span>
                  <span className="h2h__at">{g.homeId === g.winnerId ? 'home' : 'away'} win</span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ injuries

const STATUS_WORD: Record<string, string> = { OUT: 'Out', DOUBTFUL: 'Doubtful', QUESTIONABLE: 'Questionable', PROBABLE: 'Probable', IR: 'IR' };

export function InjuryList({ rows }: { rows: InjuryRow[] }) {
  if (!rows.length) return <p className="muted small">No designations.</p>;
  return (
    <ul className="inj">
      {rows.map((x, i) => (
        <li key={i} className="inj__row">
          <span className="inj__p">{x.player}</span>
          <span className="inj__pos">{x.position}</span>
          <span className={`inj__s inj__s--${x.status.toLowerCase()}`}>{STATUS_WORD[x.status] ?? statusWord(x.status)}</span>
        </li>
      ))}
    </ul>
  );
}

export function InjuriesPanel({ rows, important, homeAbbr, awayAbbr, sportCode, to }: { rows: InjuryRow[]; important?: NewsItem[]; homeAbbr: string; awayAbbr: string; sportCode: string; to: string }) {
  // Important news first; routine designations stay one tap away on the Injuries tab.
  if (important) {
    return (
      <section className="panel ov-inj" aria-labelledby="ov-inj-h">
        <PanelHead title="Injuries That Matter" sub={important.length ? `${important.length} of ${rows.length} designations change this game` : `${rows.length} designations, none to a starter or key player`}>
          <ViewAll to={to}>All {rows.length}</ViewAll>
        </PanelHead>
        {important.length ? (
          <ul className="newsl newsl--game">
            {important.slice(0, 5).map((n) => (
              <li key={n.id} className={`newsl__i newsl__i--${n.level}`}>
                <span className="newsl__h"><TeamMark sport={sportCode} abbr={n.team} size="sm" /><b>{n.headline}</b></span>
                <span className="newsl__d">{n.detail}</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted small">No starter or key player is out or doubtful.</p>}
      </section>
    );
  }
  return (
    <section className="panel ov-inj" aria-labelledby="ov-inj-h">
      <PanelHead title="Notable Injuries" sub={`${rows.length} designations · skill players first`}>
        <ViewAll to={to} />
      </PanelHead>
      <div className="injcols">
        {[awayAbbr, homeAbbr].map((t) => (
          <div key={t} className="injcol">
            <div className="injcol__h"><TeamMark sport={sportCode} abbr={t} size="sm" /> {t}</div>
            <InjuryList rows={notableInjuries(rows, t)} />
          </div>
        ))}
      </div>
    </section>
  );
}

export type { GameScript };
