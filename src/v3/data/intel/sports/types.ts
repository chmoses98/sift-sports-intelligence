// What a per-sport reader hands back to `buildGameIntel`: the pieces of the Overview research its sport's publication carries for ONE game. A reader
// returns a piece only when the document states it (nothing is estimated); the builder merges the pieces into the sections every sport shares and
// words what is absent. A sport that publishes nothing extra returns null.
import type { Comparison, IntelNotes, IntelSection } from '../build';
import type { Environment } from '../environment';
import type { ModelView } from '../projection';
import type { ScriptIntel } from '../scriptIntel';

export interface SportRow {
  id: string;
  label: string;
  text: string;
  /** What kind of statement this is: a simulation, a season statistic, a published status, or the model's own input. */
  source: 'simulation' | 'season' | 'status' | 'model';
}

/** One research card a sport adds (availability, rotation, surface and form, head to head): a titled list of published statements with its source line. */
export interface SportBlock {
  id: string;
  title: string;
  note?: string;
  rows: SportRow[];
  foot?: string | null;
}

export interface SportRead {
  /** A published model view for this game, when the sport's publication has one and the generic readers found none. */
  model?: ModelView | null;
  /** Why this sport has no model view for this game, when it knows better than the generic sentence. */
  modelAbsent?: string | null;
  environment?: Environment | null;
  /** Used only when the generic comparison found nothing. */
  comparison?: Comparison | null;
  script?: ScriptIntel | null;
  /** Injury or availability notes in the form the generic Notes section prints. */
  notes?: IntelNotes | null;
  blocks: SportBlock[];
  /** Sport-specific wording for a section that is absent. */
  reasons?: Partial<Record<IntelSection, string>>;
}

export interface SportInput {
  g: Pick<import('../../../model/types').V3Game, 'slug' | 'sport' | 'away' | 'home'>;
  research: import('../../../../contract/types').EventResearchDoc;
  detail: import('../../../../contract/types').EventDetailDoc | null;
  now: number;
}
