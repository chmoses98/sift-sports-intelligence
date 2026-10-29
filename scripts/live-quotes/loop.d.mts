// Types for loop.mjs (tests import it from TypeScript).
import type { HandoverConfig, RunInfo } from './handover.mjs';
import type { RemoteTip } from './guard.mjs';
export interface LoopDeps {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  log: (s: string) => void;
  publish: (dir: string) => Promise<boolean>;
  readRemote: () => Promise<RemoteTip | null>;
  push: (o: { dir: string; remote?: RemoteTip | null; message: string; yieldAfter?: string }) => Promise<{ pushed: true } | { pushed: false; yielded?: boolean; remote: RemoteTip }>;
  listRuns: () => Promise<RunInfo[]>;
  dispatch: (slot: string) => Promise<void>;
  workDir: string;
  runId: number;
  slot: string;
  cfg?: HandoverConfig;
}
export function runLoop(deps: LoopDeps): Promise<{ ok: number; failed: number; superseded: number; dispatched: boolean; reason: string }>;
export function makeDispatch(o: { url: string; headers: Record<string, string>; fetchImpl?: typeof fetch }): (slot: string) => Promise<void>;
export function makePush(o: { url: string; probeDir: string; guard?: (o: Record<string, unknown>) => Promise<unknown> }): LoopDeps['push'];
