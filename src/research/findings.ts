// RESEARCH FINDINGS — what the research tray holds: atomic "dig deeper into THIS" items, not whole games.
//
// A finding is one specific thing a reader noticed (a matchup edge, a prop projection, a script, a context
// note, a player's usage trend…). It is stored as a contract research_tray item so the handicap packet can
// resolve it against the publication: an anchor reference (the metric, market, player or game it rests on),
// `extra.x` = the finding's own key (so two findings on the same anchor stay distinct), and the contract
// `note` = the finding written out, which the packet prints next to the item. Nothing else changes in the
// packet format.
import type { RefKind, TrayExtra } from '../packet/tray';
import type { TrayAdd } from '../state/tray';

export type FindingKind = 'matchup' | 'prop' | 'projection' | 'script' | 'context' | 'scheme' | 'injury' | 'weather' | 'usage' | 'history' | 'market' | 'metric';

export const FINDING_WORD: Record<FindingKind, string> = {
  matchup: 'Matchup', prop: 'Prop', projection: 'Projection', script: 'Game script', context: 'Context', scheme: 'Scheme',
  injury: 'Injury', weather: 'Weather', usage: 'Usage', history: 'History', market: 'Market', metric: 'Metric',
};

export interface Finding {
  /** Stable key within its game/entity, e.g. "run:ATL" or "prop:<player>|rushing_yards". */
  key: string;
  kind: FindingKind;
  sport: string;
  /** Short title: "Falcons run defense has a clear edge". */
  title: string;
  /** The finding written out for the packet: ranks, numbers, sample sizes. */
  statement: string;
  /** Where the finding lives in Sift. */
  href: string;
  /** Contract reference the packet resolves. */
  anchor: { ref_kind: RefKind; id: string; extra?: Partial<TrayExtra> };
  /** Game-scoped findings freeze at kickoff like any pregame research. */
  kickoff?: string | null;
  eventStatus?: string | null;
}

/** The tray entry for a finding (contract item + label cache). */
export function findingToTray(f: Finding): TrayAdd {
  return {
    ref_kind: f.anchor.ref_kind,
    sport: f.sport,
    id: f.anchor.id,
    extra: { ...(f.anchor.extra ?? {}), x: `finding:${f.kind}:${f.key}` },
    note: `${FINDING_WORD[f.kind]} — ${f.title}. ${f.statement}`.trim(),
    label: { label: f.title, sub: f.statement, href: f.href, finding: f.kind },
    kickoff: f.kickoff ?? null,
    eventStatus: f.eventStatus ?? null,
  };
}
