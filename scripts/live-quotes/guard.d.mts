// Types for guard.mjs (tests import it from TypeScript).
export interface RemoteTip { sha: string; generatedAt: string | null }
export function readRemote(o: { probeDir: string; url: string; branch?: string }): Promise<RemoteTip | null>;
export function guardedPush(o: {
  dir: string; url: string; branch?: string; probeDir: string; message: string; remote?: RemoteTip | null; attempts?: number; identity?: { name: string; email: string };
}): Promise<{ pushed: true; attempts: number } | { pushed: false; reason: 'superseded'; remote: RemoteTip; attempts: number }>;
