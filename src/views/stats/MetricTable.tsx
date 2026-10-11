// Every published team metric for a game, both teams side by side by league rank (moved from views/Game.tsx and made
// footing-aware): the opponent-adjusted ratings in the game's matchup rows, or the raw measures from each team's
// profile (the publication's last-34-games window). Each value carries its footing and its unit.
//
// MatchupBoard: each offense against the defense it faces on the seven opponent-adjusted rating pairs, every team's
// bar under its own label and growing with its strength (league rank, direction-aware). No combined "advantage"
// number is drawn: the publication's advantage_to_offense subtracts a defensive rating that is already "allowed above
// average", which reverses the defense's effect (docs/MATCHUP_MATH.md). Ranks only, until it is fixed upstream.
import { useState } from 'react';
import { Link } from 'react-router';
import type { EntityProfileDoc, EventResearchDoc, MetricDef, Observation } from '../../contract/types';
import { TeamMark } from '../../components/ui';
import { BasisTag } from '../../components/statviz';
import { categoryLabel, CATEGORY_ORDER, MATCHUP_AREAS } from '../../lib/nfl';
import { glossLine, metricGloss } from '../../lib/glossary';
import { routes } from '../../lib/routes';
import { signed } from '../../lib/format';
import { basisOf, formatStat, unitLine } from '../../insights/units';
import type { StatMode } from '../../state/statMode';
import { Info } from '../game/panels';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function MatchupBoard({ ext, r, slug, homeId, awayId, homeAbbr, awayAbbr, sportCode }: { ext: any; r: EventResearchDoc; slug: string; homeId: string; awayId: string; homeAbbr: string; awayAbbr: string; sportCode: string }) {
  const pairs = (ext?.matchup_pairs ?? []) as { matchup: string; offense: string; defense: string; offense_rating: number; defense_rating: number }[];
  if (!pairs.length) return null;
  const obs = new Map<string, Observation>();
  for (const m of r.matchup) {
    if (m.home) obs.set(`${m.metric_id}|${homeAbbr}`, m.home);
    if (m.away) obs.set(`${m.metric_id}|${awayAbbr}`, m.away);
  }
  const idOf = (abbr: string) => (abbr === homeAbbr ? homeId : awayId);
  const strength = (o: Observation | undefined) => (o?.context?.rank != null && o.context.universe_size ? (o.context.universe_size - o.context.rank + 1) / o.context.universe_size : 0);
  const block = (off: string, def: string) => (
    <div className="mb__block" key={off}>
      <div className="mb__bh">
        <span className={`mb__side mb__side--off mb__side--${off === homeAbbr ? 'home' : 'away'}`}><TeamMark sport={sportCode} abbr={off} size="sm" /> {off} offense</span>
        <span className="mb__vs">vs</span>
        <span className={`mb__side mb__side--def mb__side--${def === homeAbbr ? 'home' : 'away'}`}>{def} defense <TeamMark sport={sportCode} abbr={def} size="sm" /></span>
      </div>
      <ol className="mb__rows">
        {MATCHUP_AREAS.map((a) => {
          const p = pairs.find((x) => x.matchup === a.name && x.offense === off);
          if (!p) return null;
          const oo = obs.get(`${a.offense}|${off}`);
          const dd = obs.get(`${a.defense}|${def}`);
          const so = strength(oo);
          const sd = strength(dd);
          const rk = (o: Observation | undefined) => (o?.context?.rank != null ? `#${o.context.rank}` : '—');
          const of = oo?.context?.universe_size ?? dd?.context?.universe_size ?? 32;
          return (
            <li key={a.name} className="mb__row">
              <Link className="mb__cell mb__cell--off" to={routes.metric(slug, a.offense, { team: idOf(off), opp: idOf(def), event: r.event.event_id })} aria-label={`${off} ${a.label.toLowerCase()} offense: ranked ${rk(oo)} of ${of}, adjusted rating ${signed(p.offense_rating, 3)} ${unitLine(a.offense)}`}>
                <span className="mb__rank num">{rk(oo)}</span>
                <span className="mb__val num">{signed(p.offense_rating, 3)}</span>
                <span className={`mb__bar mb__bar--off mb__bar--${off === homeAbbr ? 'home' : 'away'}`} aria-hidden="true"><span style={{ width: `${Math.round(so * 100)}%` }} /></span>
              </Link>
              <span className="mb__area">{a.label}</span>
              <Link className="mb__cell mb__cell--def" to={routes.metric(slug, a.defense, { team: idOf(def), opp: idOf(off), event: r.event.event_id })} aria-label={`${def} ${a.label.toLowerCase()} defense: ranked ${rk(dd)} of ${of}, adjusted rating ${signed(p.defense_rating, 3)} ${unitLine(a.defense)}`}>
                <span className={`mb__bar mb__bar--def mb__bar--${def === homeAbbr ? 'home' : 'away'}`} aria-hidden="true"><span style={{ width: `${Math.round(sd * 100)}%` }} /></span>
                <span className="mb__val num">{signed(p.defense_rating, 3)}</span>
                <span className="mb__rank num">{rk(dd)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
  const n = r.matchup.find((m) => m.home?.context?.universe_size)?.home?.context?.universe_size ?? null;
  return (
    <div className="mb">
      <p className="mb__key">
        <BasisTag basis="adjusted" /> League rank{n ? ` of ${n}` : ''} for each unit{n && n < 32 ? ' (the teams in the publication\'s current ratings)' : ''}. A longer bar is a stronger unit — on its own side.
        Ratings are differences from the league average of the same measure (EPA per play, per dropback, per run, or a rate); for defenses they are what the unit allows, so lower is better.
        <Info label="Why there is no single edge number">
          The publication's <b>advantage_to_offense</b> is offense − defense. Its defensive ratings are already &ldquo;allowed above average&rdquo;
          (lower is better), so subtracting them rewards the offense for facing a <i>good</i> defense. Under the rating model
          (y = league mean + offense + defense allowed) the two would add. Sift shows the ranks and leaves the combined figure out until
          the publication corrects it.
        </Info>
      </p>
      <div className="mb__grid">
        {block(awayAbbr, homeAbbr)}
        {block(homeAbbr, awayAbbr)}
      </div>
    </div>
  );
}

/** "Adjusted offensive EPA per dropback" → "Offensive EPA per dropback": the footing is on the tag, not in the name. */
export function friendlyName(name: string): string {
  const n = name.replace(/^Adjusted\s+/i, '').replace(/, neutral script$/i, ' (neutral script)');
  return n.charAt(0).toUpperCase() + n.slice(1);
}

interface Row { metric_id: string; name: string; home: Observation | null; away: Observation | null }

/** The rows for the reader's footing: adjusted = the game's matchup rows; raw = each profile's raw measures. */
export function metricRows(r: EventResearchDoc, profiles: { home?: EntityProfileDoc | null; away?: EntityProfileDoc | null }, mode: StatMode, metrics: Map<string, MetricDef>): Row[] {
  if (mode === 'adjusted') return r.matchup.map((m) => ({ metric_id: m.metric_id, name: m.name, home: m.home, away: m.away }));
  const ids = new Set<string>();
  for (const p of [profiles.home, profiles.away]) for (const o of p?.metrics ?? []) if (!o.split && basisOf(o) !== 'adjusted' && metrics.get(o.metric_id)?.entity_type === 'TEAM') ids.add(o.metric_id);
  const get = (p: EntityProfileDoc | null | undefined, id: string) => p?.metrics.find((o) => o.metric_id === id && !o.split) ?? null;
  return [...ids].map((id) => ({ metric_id: id, name: metrics.get(id)?.name ?? id, home: get(profiles.home, id), away: get(profiles.away, id) }));
}

export function MatchupTable({ rows, metrics, slug, homeId, awayId, homeAbbr, awayAbbr, eventId, mode }: { rows: Row[]; metrics: Map<string, MetricDef>; slug: string; homeId: string; awayId: string; homeAbbr: string; awayAbbr: string; eventId: string; mode: StatMode }) {
  const [cat, setCat] = useState<string>('all');
  const cats = [...new Set(rows.map((r) => metrics.get(r.metric_id)?.category ?? 'other'))].sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));
  const active = cat === 'all' || cats.includes(cat) ? cat : 'all';
  const shown = rows.filter((r) => active === 'all' || (metrics.get(r.metric_id)?.category ?? 'other') === active);
  const of = rows.find((r) => r.home?.context?.universe_size)?.home?.context?.universe_size ?? 32;
  return (
    <div className="mt">
      <div className="mt__bar">
        <div className="seg" role="tablist" aria-label="Metric categories">
          <button type="button" role="tab" aria-selected={active === 'all'} className={`seg__b${active === 'all' ? ' is-on' : ''}`} onClick={() => setCat('all')}>All metrics <span className="seg__n">{rows.length}</span></button>
          {cats.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={active === c} className={`seg__b${active === c ? ' is-on' : ''}`} onClick={() => setCat(c)}>
              {categoryLabel(c)}
            </button>
          ))}
        </div>
        <Info label="What these metrics mean" align="end">
          {shown.map((r) => {
            const line = glossLine(metricGloss(r.metric_id, metrics.get(r.metric_id)));
            return line ? <span key={r.metric_id}><b>{metrics.get(r.metric_id)?.short_name ?? r.name}:</b> {line}</span> : null;
          })}
        </Info>
      </div>
      <div className="mt__head" aria-hidden="true">
        <span className="mt__ta">{awayAbbr}</span>
        <span>league rank of {of} (#1 = best for that job) · value and its unit beside it · {mode === 'adjusted' ? 'opponent-adjusted' : 'raw, last 34 games'} · tap a metric for the full comparison</span>
        <span className="mt__th">{homeAbbr}</span>
      </div>
      <ul className="mt__rows">
        {shown.map((r) => {
          const def = metrics.get(r.metric_id);
          const strength = (c: { rank: number | null; universe_size: number | null; higher_is_better: boolean | null } | null | undefined) =>
            c?.rank != null && c.universe_size && c.higher_is_better !== null ? ((c.universe_size - c.rank + 1) / c.universe_size) * 100 : null;
          const pa = strength(r.away?.context);
          const ph = strength(r.home?.context);
          const basis = basisOf(r.home ?? r.away);
          return (
            <li key={r.metric_id}>
              <Link to={routes.metric(slug, r.metric_id, { team: homeId, opp: awayId, event: eventId })} className="mt__row">
                <span className="mt__v mt__v--away">
                  <span className="mt__rk mt__rk--big num">{r.away?.context?.rank != null ? `#${r.away.context.rank}` : '—'}</span>
                  <span className="num mt__raw">{formatStat(r.metric_id, r.away?.value, def)}</span>
                </span>
                <span className="mt__bars">
                  <span className="mt__half mt__half--away"><span style={{ width: `${pa ?? 0}%` }} /></span>
                  <span className="mt__name" title={glossLine(metricGloss(r.metric_id, def)) ?? undefined}>
                    <span className="mt__nm">{friendlyName(def?.name ?? r.name)}</span>
                    <span className="mt__unit">{unitLine(r.metric_id, def)}{basis === 'adjusted' || basis === 'raw' || basis === 'season' ? <BasisTag basis={basis} /> : null}</span>
                  </span>
                  <span className="mt__half mt__half--home"><span style={{ width: `${ph ?? 0}%` }} /></span>
                </span>
                <span className="mt__v mt__v--home">
                  <span className="num mt__raw">{formatStat(r.metric_id, r.home?.value, def)}</span>
                  <span className="mt__rk mt__rk--big num">{r.home?.context?.rank != null ? `#${r.home.context.rank}` : '—'}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {!shown.length && <p className="muted small">No {mode === 'adjusted' ? 'opponent-adjusted' : 'raw'} team metrics are published for this game.</p>}
    </div>
  );
}
