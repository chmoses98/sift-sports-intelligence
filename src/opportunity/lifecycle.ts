// EVENT LIFECYCLE — whether a pregame opportunity can still be acted on, decided from the clock and the event's own
// timing first, and from the publisher's status word second. A publication that stopped refreshing keeps saying
// SCHEDULED or LIVE long after the game ended; the start time it published does not lie about having passed.
//
//   PREGAME     the start is in the future (or the publication verifies it as still upcoming, for at most six hours)
//   STARTED     the start time has passed, or the publisher says the game is live; pregame research is frozen
//   FINAL       the publisher says the game is over
//   POSTPONED / CANCELLED / SUSPENDED   the publisher's own word; nothing pregame is actionable
//   NO_START    no usable start time: nothing can be called actionable, research stays research
//
// Every timestamp is ISO-8601 UTC from the contract; `now` is epoch milliseconds from the caller's clock (never 0).
export type EventPhase = 'PREGAME' | 'STARTED' | 'FINAL' | 'POSTPONED' | 'CANCELLED' | 'SUSPENDED' | 'NO_START';

export interface EventTiming {
  status: string | null | undefined;
  start_time_utc: string | null | undefined;
  /** The contract's effective start when published (delays, moved games). */
  effective_start_time_utc?: string | null;
}

export interface PhaseInputs {
  /** The publication verifies the event as still upcoming (tennis first-ball status), overriding a nominal start that has passed. */
  verifiedUpcoming?: boolean;
}

export interface PhaseRead {
  phase: EventPhase;
  /** The start used, in epoch ms, or null when none is usable. */
  startMs: number | null;
  /** Why the phase is what it is, in one sentence. */
  reason: string;
  /** True when the publisher's status word disagrees with the clock (a stale SCHEDULED past kickoff, a LIVE before it). */
  staleStatus: boolean;
}

const FINAL_RE = /^(FINAL|FINISHED|COMPLETE|COMPLETED|CLOSED|SETTLED|ENDED|OVER)$/i;
const LIVE_RE = /^(LIVE|IN_PROGRESS|INPROGRESS|STARTED|PLAYING|ACTIVE)$/i;
const POSTPONED_RE = /^(POSTPONED|DELAYED|RESCHEDULED|TBD)$/i;
const CANCELLED_RE = /^(CANCELLED|CANCELED|ABANDONED|VOID|FORFEIT)$/i;
const SUSPENDED_RE = /^(SUSPENDED|HALTED|PAUSED|INTERRUPTED)$/i;

/** How long a publication's "verified upcoming" word may hold a nominal start that has passed (tennis day placeholders). */
export const VERIFIED_UPCOMING_GRACE_MS = 6 * 3600_000;

export function parseUtc(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** The phase of an event at `now`. `now` must be the caller's clock in epoch milliseconds. */
export function eventPhase(ev: EventTiming, now: number, x: PhaseInputs = {}): PhaseRead {
  if (!Number.isFinite(now) || now <= 0) throw new Error(`eventPhase: now must be the current time in epoch ms (got ${now})`);
  const st = String(ev.status ?? '').trim().toUpperCase();
  const startMs = parseUtc(ev.effective_start_time_utc) ?? parseUtc(ev.start_time_utc);
  if (FINAL_RE.test(st)) return { phase: 'FINAL', startMs, reason: 'The game is over: pregame research is frozen for review.', staleStatus: false };
  if (CANCELLED_RE.test(st)) return { phase: 'CANCELLED', startMs, reason: 'The publication lists the game as cancelled.', staleStatus: false };
  if (POSTPONED_RE.test(st)) return { phase: 'POSTPONED', startMs, reason: 'The publication lists the game as postponed; its pregame prices no longer apply.', staleStatus: false };
  if (SUSPENDED_RE.test(st)) return { phase: 'SUSPENDED', startMs, reason: 'The publication lists the game as suspended.', staleStatus: false };
  if (startMs == null) {
    if (LIVE_RE.test(st)) return { phase: 'STARTED', startMs, reason: 'The publication lists the game as live.', staleStatus: false };
    return { phase: 'NO_START', startMs, reason: 'No usable start time is published for this event, so nothing on it can be called actionable.', staleStatus: false };
  }
  const passed = startMs <= now;
  if (LIVE_RE.test(st)) {
    // A LIVE word before the published start is the publisher's call; after it, both agree.
    return { phase: 'STARTED', startMs, reason: 'The game has started: pregame research is frozen.', staleStatus: !passed };
  }
  if (passed) {
    if (x.verifiedUpcoming && now - startMs <= VERIFIED_UPCOMING_GRACE_MS) return { phase: 'PREGAME', startMs, reason: 'The listed time has passed but the publication verifies the start as still upcoming.', staleStatus: true };
    return { phase: 'STARTED', startMs, reason: st === 'SCHEDULED' || st === '' ? 'The published start time has passed; the publication still says scheduled, so its pregame research is frozen until it refreshes.' : 'The game has started: pregame research is frozen.', staleStatus: st === 'SCHEDULED' };
  }
  return { phase: 'PREGAME', startMs, reason: 'Before the start.', staleStatus: false };
}

/** True only for a phase in which a pregame opportunity may still be acted on. */
export const isPregame = (p: EventPhase) => p === 'PREGAME';

/** A phase in which the research stays readable as history, never as a new recommendation. */
export const isFrozen = (p: EventPhase) => p === 'STARTED' || p === 'FINAL';
