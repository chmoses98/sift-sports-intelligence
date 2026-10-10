// The CFB Script Engine research sidecar (cfb-edge-finder explorer/script_research/<event_id>.json).
//
// When an event's Script Engine payload is too large for the event document's byte budget, the publisher trims
// detail from the event (the metric registry, both teams' metric tables, the matchup dimensions, the market map)
// and publishes that detail verbatim in a same-run sidecar, linked from
// `extensions.script_engine.research_sidecar` with the sha256 of the file's bytes. Sift paints the event first
// (SIFT Read, scripts, findings, contracts) and then loads the sidecar; it is accepted only when its bytes match
// the digest and its identity (schema, event, run, football artifact) matches the event that links it. Anything
// else is reported with its reason, and the trimmed event stays on screen.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { EventResearchDoc } from '../contract/types';
import { normalizeCfbNames } from '../lib/cfbTeams';
import { getText, NotFoundError } from './fetcher';

export const SCRIPT_RESEARCH_SCHEMA = 'cfb_script_research/1.0.0';
const SIDECAR_PATH = /^script_research\/evt_[0-9a-z]+\.json$/;

export interface SidecarPointer {
  path: string;
  schema: string;
  sha256: string;
  bytes: number;
  artifact_hash: string;
  sections: string[];
  omitted_sections: string[];
}

/** What the event's trim removed, and whether a sidecar restores it. */
export interface TrimInfo {
  steps: string[];
  omitted: boolean;
  pointer: SidecarPointer | null;
}

export type ScriptResearch =
  | { state: 'recovered'; sections: Record<string, unknown>; pointer: SidecarPointer; omittedSections: string[] }
  | { state: 'unavailable'; reason: string };

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The event's trim record and sidecar link; null when the event was published whole. */
export function trimInfo(r: EventResearchDoc | null | undefined): TrimInfo | null {
  const p = (r?.extensions as any)?.script_engine;
  const t = p?.payload_trim;
  if (!t || typeof t !== 'object') return null;
  const ptr = p.research_sidecar;
  const pointer: SidecarPointer | null =
    ptr && typeof ptr === 'object' && typeof ptr.path === 'string' && typeof ptr.sha256 === 'string'
      ? {
          path: ptr.path,
          schema: String(ptr.schema ?? ''),
          sha256: ptr.sha256,
          bytes: Number(ptr.bytes ?? 0),
          artifact_hash: String(ptr.artifact_hash ?? ''),
          sections: Array.isArray(ptr.sections) ? ptr.sections.map(String) : [],
          omitted_sections: Array.isArray(ptr.omitted_sections) ? ptr.omitted_sections.map(String) : [],
        }
      : null;
  return { steps: Array.isArray(t.steps) ? t.steps.map(String) : [], omitted: t.omitted === true, pointer };
}

/** Pure: the sidecar's text checked against the event that links it. Exported for tests. */
export function verifyScriptResearch(text: string, r: EventResearchDoc, pointer: SidecarPointer): ScriptResearch {
  const digest = bytesToHex(sha256(utf8ToBytes(text)));
  if (digest !== pointer.sha256) {
    return { state: 'unavailable', reason: `the detailed research file does not match the digest this game links (expected ${pointer.sha256.slice(0, 12)}, received ${digest.slice(0, 12)}); it may be mid-publication` };
  }
  let doc: any;
  try {
    doc = JSON.parse(text);
  } catch {
    return { state: 'unavailable', reason: 'the detailed research file is not valid JSON' };
  }
  const gen = (r.extensions as any)?.script_engine?.script_generation ?? {};
  const problems: string[] = [];
  if (doc?.schema !== SCRIPT_RESEARCH_SCHEMA) problems.push(`schema ${String(doc?.schema)} is not ${SCRIPT_RESEARCH_SCHEMA}`);
  if (doc?.event_id !== r.event.event_id) problems.push(`it describes ${String(doc?.event_id)}, not ${r.event.event_id}`);
  if (doc?.run_id !== r.run_id) problems.push(`it is from run ${String(doc?.run_id)}, not this page's run ${r.run_id}`);
  if (!gen.artifact_hash || doc?.artifact_hash !== gen.artifact_hash || pointer.artifact_hash !== gen.artifact_hash) problems.push('its football artifact is not the one this game embeds');
  if (!doc?.sections || typeof doc.sections !== 'object') problems.push('it carries no sections');
  if (problems.length) return { state: 'unavailable', reason: `the detailed research file was rejected: ${problems.join('; ')}` };
  return { state: 'recovered', sections: normalizeCfbNames(doc.sections), pointer, omittedSections: Array.isArray(doc.omitted_sections) ? doc.omitted_sections : [] };
}

/**
 * Load and verify the sidecar an event links. Never rejects: a missing, mismatched or unreachable file comes back
 * as `unavailable` with the reason, so the caller can keep the trimmed event on screen and say why.
 */
export async function loadScriptResearch(r: EventResearchDoc, url: (path: string) => string): Promise<ScriptResearch> {
  const info = trimInfo(r);
  if (!info) return { state: 'unavailable', reason: 'this game was published whole; there is nothing to recover' };
  if (!info.pointer) {
    return { state: 'unavailable', reason: 'the publication trimmed this game to fit its size budget and linked no detailed research file (published before research sidecars existed)' };
  }
  if (!SIDECAR_PATH.test(info.pointer.path)) return { state: 'unavailable', reason: `the linked research path ${info.pointer.path} is not a script research document` };
  try {
    const text = await getText(url(`explorer/${info.pointer.path}`));
    return verifyScriptResearch(text, r, info.pointer);
  } catch (e) {
    if (e instanceof NotFoundError) return { state: 'unavailable', reason: 'the detailed research file this game links is not published yet' };
    return { state: 'unavailable', reason: `the detailed research file could not be read (${e instanceof Error ? e.message : String(e)})` };
  }
}
