// The Script Engine payload of a game (event_research.extensions.script_engine), decoded by the SIFT 2.0 decoder (src/lib/scriptEngine.ts, reused as is) and
// stated per game: `ready` only when the payload carries `script_generation`; a payload that explains why it could not build a read is `unavailable` with the
// engine's own status and reason; a game whose research carries nothing is `none`. A trimmed event (the publisher cut detail to fit its size budget) links a
// verified same-run research sidecar (src/data/scriptResearch.ts): the event paints first, the sidecar is read after, and a failure is kept with its reason.
import { useMemo } from 'react';
import type { EventResearchDoc } from '../../../contract/types';
import { useAsync } from '../../../data/hooks';
import { loadScriptResearch, trimInfo, type ScriptResearch } from '../../../data/scriptResearch';
import { isEngine, readEngine, type Engine } from '../../../lib/scriptEngine';
import type { V3Game } from '../../model/types';
import { useResearchRepo } from './hooks';

export type ScriptState =
  /** The research document (or the sidecar of a trimmed event) is still being read. */
  | { kind: 'loading' }
  /** The research carries no Script Engine payload (or could not be read: `reason` says so). */
  | { kind: 'none'; reason: string | null }
  /** The payload says the engine could not build a read for this game. */
  | { kind: 'unavailable'; status: string; reason: string | null }
  | { kind: 'ready'; engine: Engine };

/** Pure: the state a research document stands for. `sidecar` is the trimmed event's detail (data/scriptResearch.ts) or 'loading'. */
export function scriptStateOf(research: EventResearchDoc | null | undefined, sidecar?: ScriptResearch | 'loading'): ScriptState {
  const e = readEngine(research, sidecar);
  if (!e) return { kind: 'none', reason: null };
  return isEngine(e) ? { kind: 'ready', engine: e } : { kind: 'unavailable', status: e.status, reason: e.reason };
}

/**
 * The game's Script Engine state. Sample games have none. While the research document is read the state is `loading`; a document that could not be
 * read is `none` with the reason (the screen says it).
 */
export function useScriptState(g: V3Game | null, research: EventResearchDoc | null | undefined, researchLoading: boolean, researchError?: unknown): ScriptState {
  const real = !!g && g.provenance === 'publication';
  const { repo } = useResearchRepo(real ? g!.slug : '');
  const trim = useMemo(() => trimInfo(research), [research]);
  const side = useAsync(real && research && trim && repo ? `v3sr:${g!.slug}:${g!.eventId}:${trim.pointer?.sha256 ?? 'unlinked'}` : null, () => loadScriptResearch(research!, (p) => repo!.url(p)));
  return useMemo<ScriptState>(() => {
    if (!real) return { kind: 'none', reason: null };
    if (researchLoading && !research) return { kind: 'loading' };
    if (!research) return { kind: 'none', reason: researchError ? 'The research document for this game could not be read.' : null };
    const sidecar = trim ? (side.data ?? (side.error ? ({ state: 'unavailable', reason: String(side.error) } as const) : 'loading')) : undefined;
    return scriptStateOf(research, sidecar);
  }, [real, researchLoading, research, researchError, trim, side.data, side.error]);
}
