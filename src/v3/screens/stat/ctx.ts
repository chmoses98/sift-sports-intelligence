// What every Stat Detail tab receives: the statistic being shown (a ranking), the address state, and the identities and formatters the
// tabs share. Built once by the screen from published documents (or the labelled sample view model); the tabs never fetch the ranking.
import type { MetricDef } from '../../../contract/types';
import type { StateOf, UpdateOptions } from '../../state/url';
import type { statSchema } from '../../nav/schemas';
import type { RankingCatalog, RankingVM, ScheduleEvent } from '../../data/research/types';
import type { Role } from '../../model/statDecl';
import type { V3Team } from '../../model/types';

export type StatState = StateOf<typeof statSchema.fields>;

export interface StatCtx {
  /** "real": published documents. "demo": the labelled sample view model (?demo=1). */
  mode: 'real' | 'demo';
  slug: string;
  /** "NFL". */
  sportCode: string;
  /** The short id in the address ("adj_off_epa"), or "sample-0". */
  statId: string;
  /** The window the ranking is for. */
  window: string;
  windows: string[];
  def: MetricDef | undefined;
  /** Which ranking is which (real mode); null for the sample view model. */
  catalog: RankingCatalog | null;
  ranking: RankingVM;
  adjusted: boolean;
  /** The raw version's name, when the statistic has a linked raw counterpart (the side-by-side view is titled with it). */
  rawName: string | null;
  role: Role;
  /** The universe's current season, for default windows ("2026-27"). */
  season: string | null;
  st: StatState;
  set: (patch: Partial<StatState>, o?: UpdateOptions) => void;
  sel: string | null;
  opp: string | null;
  /** The upcoming game between the selected team and the next opponent, from the schedule. */
  event: ScheduleEvent | null;
  team: (code: string, name?: string) => V3Team;
  fmt: (v: number | null) => string;
  /** Sample statistics' related list (real statistics derive theirs from the registry). */
  sampleRelated?: { id: string; name: string }[];
}
