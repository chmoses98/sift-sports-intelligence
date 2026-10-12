// UNIT BY UNIT on screen: pick a direction (which offense against which defense), then one card per football unit —
// a plain conclusion first, then rank against rank for each published measure (in the reader's footing, tagged
// Adjusted or Raw), then the box-score basics beside it. Conclusions are observations from published ranks.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { EntityProfileDoc, EventResearchDoc, MetricDef } from '../../contract/types';
import { BasisTag, DuelRow } from '../../components/statviz';
import { TeamMark } from '../../components/ui';
import { basicText, type TeamBasics } from '../../insights/basics';
import type { GameSides, Side } from '../../insights/game';
import { unitSections, type ObsPick, type UnitSection } from '../../insights/unitAnalysis';
import { formatStat, unitLine, valueWithUnit } from '../../insights/units';
import { routes } from '../../lib/routes';
import { teamAccent } from '../../lib/teams';
import type { StatMode } from '../../state/statMode';

function valueOf(p: ObsPick | null, metrics: Map<string, MetricDef>) {
  return p ? formatStat(p.obs.metric_id, p.obs.value, metrics.get(p.obs.metric_id)) : '—';
}

const tagOf = (p: ObsPick | null) => (p ? <BasisTag basis={p.basis} fallback={p.fallback} /> : null);

function SectionCard({ s, metrics, slug, eventId }: { s: UnitSection; metrics: Map<string, MetricDef>; slug: string; eventId?: string }) {
  const o = s.offense;
  const d = s.defense;
  const c = s.conclusion;
  return (
    <article className={`ub lc-card ub--${c?.lean ?? 'none'}`} aria-labelledby={`ub-${s.key}-${o.abbr}`}>
      <header className="ub__h">
        <span className="lc-kicker">{o.abbr} offense vs {d.abbr} defense</span>
        <h3 className="ub__t" id={`ub-${s.key}-${o.abbr}`}>{s.title}</h3>
      </header>
      {c ? (
        <p className="ub__c">
          {c.lean !== 'even' && <TeamMark sport="NFL" abbr={c.lean === 'offense' ? o.abbr : d.abbr} size="sm" />}
          <span>{c.text}</span>
        </p>
      ) : <p className="ub__c ub__c--none">No ranked pair is published for both units, so there is no conclusion — the numbers below are context.</p>}
      <div className="ub__rows">
        {s.pairs.map((p) => {
          const id = p.off?.obs.metric_id ?? p.def?.obs.metric_id ?? '';
          if (p.off && p.def) {
            return (
              <DuelRow
                key={p.label}
                label={p.label}
                unit={unitLine(p.off.obs.metric_id, metrics.get(p.off.obs.metric_id))}
                left={{ abbr: o.abbr, color: teamAccent('NFL', o.abbr), rank: p.off.obs.context?.rank ?? null, of: p.off.obs.context?.universe_size ?? null, value: valueOf(p.off, metrics), who: `${o.abbr} ${s.offUnit}`, tag: tagOf(p.off) }}
                right={{ abbr: d.abbr, color: teamAccent('NFL', d.abbr), rank: p.def.obs.context?.rank ?? null, of: p.def.obs.context?.universe_size ?? null, value: valueOf(p.def, metrics), who: `${d.abbr} ${s.defUnit}`, tag: tagOf(p.def) }}
              />
            );
          }
          const one = (p.off ?? p.def)!;
          const team = p.off ? o : d;
          return (
            <p key={p.label} className="ub__one">
              <TeamMark sport="NFL" abbr={team.abbr} size="sm" />
              <span><b>{team.abbr} {p.label}</b>: <span className="num">{valueWithUnit(id, one.obs.value, metrics.get(id))}</span>{tagOf(one)} · {one.obs.context?.rank != null ? `#${one.obs.context.rank} of ${one.obs.context.universe_size}` : 'unranked'}<span className="muted"> · no {p.off ? 'defensive' : 'offensive'} counterpart is published</span></span>
            </p>
          );
        })}
        {s.basics.map((b) => {
          const k = (b.off ?? b.def)!.def;
          return (
            <DuelRow
              key={k.key}
              label={`${k.short.off} vs ${k.short.def}`}
              unit={k.per}
              left={{ abbr: o.abbr, color: teamAccent('NFL', o.abbr), rank: b.off?.rank ?? null, of: b.off?.of ?? null, value: b.off ? basicText(b.off) : '—', who: `${o.abbr} ${k.label.off}`, tag: <BasisTag basis="box" /> }}
              right={{ abbr: d.abbr, color: teamAccent('NFL', d.abbr), rank: b.def?.rank ?? null, of: b.def?.of ?? null, value: b.def ? basicText(b.def) : '—', who: `${d.abbr} ${k.label.def}`, tag: <BasisTag basis="box" /> }}
            />
          );
        })}
      </div>
      {s.limit && <p className="ub__lim">{s.limit}</p>}
      <p className="ub__x">
        <span className="lc-tier lc-tier--obs">Observation</span>
        {s.pairs[0]?.off && <Link to={routes.metric(slug, s.pairs[0].off.obs.metric_id, { team: o.pid, opp: d.pid, event: eventId })}>Every team →</Link>}
      </p>
    </article>
  );
}

export function UnitByUnit({ r, profiles, g, mode, basics, metrics, slug }: { r: EventResearchDoc | null; profiles: { home?: EntityProfileDoc | null; away?: EntityProfileDoc | null }; g: GameSides; mode: StatMode; basics: Map<string, TeamBasics> | null; metrics: Map<string, MetricDef>; slug: string }) {
  const [offAbbr, setOff] = useState<string>(g.away.abbr);
  const offense: Side = g.byAbbr(offAbbr);
  const sections = useMemo(() => unitSections(r, profiles, g, offense, mode, basics), [r, profiles, g, offense, mode, basics]);
  return (
    <div className="ubx">
      <div className="ubx__dir" role="group" aria-label="Which offense">
        {[g.away, g.home].map((t) => (
          <button key={t.abbr} type="button" className={`ubx__b${t.abbr === offAbbr ? ' is-on' : ''}`} aria-pressed={t.abbr === offAbbr} onClick={() => setOff(t.abbr)} style={{ ['--tc' as string]: teamAccent('NFL', t.abbr) }}>
            <TeamMark sport="NFL" abbr={t.abbr} size="sm" />
            <span><b>{t.nick} offense</b><small>vs {g.opp(t.abbr).nick} defense</small></span>
          </button>
        ))}
      </div>
      <div className="lc-grid lc-grid--2">
        {sections.map((s) => <SectionCard key={s.key} s={s} metrics={metrics} slug={slug} eventId={r?.event.event_id} />)}
      </div>
      {!sections.length && <p className="muted">No unit measures are published for this game.</p>}
    </div>
  );
}
