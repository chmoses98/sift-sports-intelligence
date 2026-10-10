// When a game's pregame research closes. One rule for the whole app: once the event's SCHEDULED KICKOFF
// (event.start_time_utc) has passed on the app clock, nothing new from that game may be saved as pregame
// research. A FINAL event is past kickoff by definition and is frozen too. Market status is never used:
// a market can stay open after kickoff, the research behind it cannot.

export type ResearchPhase = 'pregame' | 'frozen';

export const FROZEN_LABEL = 'Pregame research frozen';
export const FROZEN_WHY = 'This game has kicked off. New pregame research can’t be saved after kickoff; items saved before kickoff stay on My Board.';

export function researchPhase(kickoffUtc: string | null | undefined, now: number = Date.now(), eventStatus?: string | null): ResearchPhase {
  if (eventStatus === 'FINAL' || eventStatus === 'IN_PROGRESS' || eventStatus === 'LIVE') return 'frozen';
  if (!kickoffUtc) return 'pregame';
  const t = Date.parse(kickoffUtc);
  return Number.isFinite(t) && t <= now ? 'frozen' : 'pregame';
}

export function isFrozen(kickoffUtc: string | null | undefined, now: number = Date.now(), eventStatus?: string | null): boolean {
  return researchPhase(kickoffUtc, now, eventStatus) === 'frozen';
}
