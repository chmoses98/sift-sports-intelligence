// Types for scripts/cfb/priorities.mjs (imported by tests/cfbProductionCheckRail.test.tsx).
export const NO_UPCOMING: string;
export function railStateOf(text: string): 'none' | 'upcoming';
export function judgeRailState(text: string, upcomingBefore: number, upcomingAfter: number): { state: 'none' | 'upcoming'; ok: boolean; msg: string };
export function noUpcomingChecks(name: string, seen: { text: string; links: number; valueSlots: number }): [boolean, string][];
