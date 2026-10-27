// Shared pieces of the Team Research tabs: the page context every tab reads, the statistic target, the small switch, and date words.
import type { ReactNode } from 'react';
import type { StateOf } from '../../state/url';
import type { teamSchema } from '../../nav/schemas';
import { StatLink } from '../../nav/Targets';
import type { TeamProfile } from '../../data/research/types';
import type { CodeOf, MetricLookup, StatObs } from '../../model/teamResearch';
import type { SportTeamDecl } from '../../model/teamSports';
import type { V3Team } from '../../model/types';
import { monthDay, weekdayShort, whenWords } from '../../model/time';

export type TeamState = StateOf<typeof teamSchema.fields>;

/** What every tab reads: one team's profile and the helpers that turn published ids into things a row prints. */
export interface TeamPageCtx {
  slug: string;
  /** The team's code ("DAL"): the stable identity in routes and the statistic highlight. */
  code: string;
  team: V3Team;
  decl: SportTeamDecl;
  /** Null until the team's document arrives (the first viewport renders without it). */
  profile: TeamProfile | null;
  /** True while the statistic registry (names, categories) is still loading. */
  defsLoading: boolean;
  look: MetricLookup;
  state: TeamState;
  set: (p: Partial<TeamState>) => void;
  now: number;
  demo: boolean;
  codeOf: CodeOf;
  nameOf: (participantId: string | null) => string | null;
  /** Identity (logo, colours) of any team of the sport, for opponents. */
  identity: (code: string, name: string | null) => V3Team;
}

export type ReadyCtx = TeamPageCtx & { profile: TeamProfile };

/** Toggle one token of the expanded-rows list in place (history is replaced). */
export const toggleExp = (c: Pick<TeamPageCtx, 'state' | 'set'>, token: string) => c.set({ exp: c.state.exp.includes(token) ? c.state.exp.filter((x) => x !== token) : [...c.state.exp, token] });

/** A statistic, rank or value: opens that statistic's ranking with this team highlighted. Without a published ranking id it is plain text. */
export function StatT({ c, obs, label, className, children, sel }: { c: Pick<TeamPageCtx, 'slug' | 'code'>; obs: Pick<StatObs, 'rankingId' | 'window'> | null; label: string; className?: string; children: ReactNode; sel?: { sel?: string; opp?: string } }) {
  if (!obs?.rankingId) return <span className={className}>{children}</span>;
  return (
    <StatLink stat={{ slug: c.slug, statId: obs.rankingId }} state={{ sel: sel?.sel ?? c.code, opp: sel?.opp ?? null, win: obs.window }} label={label} className={className}>
      {children}
    </StatLink>
  );
}

/** The mockup's inline switch (Adjusted | Raw, season | last 10): buttons, the selected one cyan. */
export function SegC<T extends string | boolean>({ options, value, onChange, label, wide }: { options: readonly [T, string][]; value: T; onChange: (v: T) => void; label: string; wide?: boolean }) {
  return (
    <div className={`tm-seg${wide ? ' tm-seg--wide' : ''}`} role="group" aria-label={label}>
      {options.map(([k, l]) => <button key={String(k)} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

// A game's start (a published UTC instant) in the viewer's local time zone, through model/time.ts. No start: nothing.
export const shortDate = (iso: string) => monthDay(Date.parse(iso));
export const weekday = (iso: string) => weekdayShort(Date.parse(iso));
/** "Mon 8:15 PM" within the coming week, "Nov 15 1:00 PM" beyond it; "" without a start. */
export const startWords = (iso: string, now: number): string => whenWords(Date.parse(iso), now);
/** A published YYYY-MM-DD (a return date) without a timezone shift. */
export const dateOnly = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

export const Skel = ({ h, label }: { h: number; label?: string }) => <div className="tm-sk v3-skel" style={{ height: h }} role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;

export const Eyebrow = ({ children }: { children: ReactNode }) => <span className="tm-eyebrow">{children}</span>;
