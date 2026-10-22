// Strict game identity: which Sift event does a provider's game belong to?
//
// A wrong match is worse than no match: it would put another game's score on a screen that carries a market and a
// projection. So the matcher accepts only evidence, and when the evidence is not unique it says why it refused:
//
//   1. PROVIDER_ID       the publication already carries this provider's id for the event, and the provider's
//                        teams and start still agree with the event (an id that now points at a different pairing
//                        is an ID_CONFLICT, not a match);
//   2. TEAMS_AND_START   same sport, both teams resolve to the event's canonical team keys, home/away agree (or
//                        the event is a neutral site), and the start times are within the sport's window.
//
// Never matched: a name that merely looks similar, a one-team match, a start-time-only match, a game in another
// sport. When two provider games satisfy rule 2 (a doubleheader) the closest start wins only if it is clearly
// closer; otherwise the result is AMBIGUOUS and nothing is shown.
import type { LiveGame, LiveSport, MatchResult, SiftEventRef } from './types';

/** How far a provider's start may differ from the Sift event's (schedule shifts, TV windows, time zones). */
export const START_WINDOW_MIN: Record<LiveSport, number> = {
  NFL: 90, CFB: 90, NBA: 60, CBB: 90, NHL: 60, MLB: 60, SOCCER: 45, TENNIS: 24 * 60,
};
/** The closest of several candidates must beat the runner-up by this much to be chosen (doubleheaders). */
export const AMBIGUITY_GAP_MIN = 90;

/** Provider spellings that differ from the publication's, per sport. Extend by evidence, never by guess. */
const ALIASES: Partial<Record<LiveSport, Record<string, string>>> = {
  NFL: { WSH: 'WAS', LA: 'LAR', JAC: 'JAX', OAK: 'LV', SD: 'LAC', STL: 'LAR' },
  NHL: { TB: 'TBL', NJ: 'NJD', SJ: 'SJS', LA: 'LAK', WPG: 'WPG', UTAH: 'UTA' },
  NBA: { GS: 'GSW', NY: 'NYK', NO: 'NOP', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS' },
  MLB: { CHW: 'CWS', WSN: 'WSH', AZ: 'ARI', KCR: 'KC', SDP: 'SD', SFG: 'SF', TBR: 'TB' },
};

const strip = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The canonical team key: `<SPORT>:<abbr>` for leagues with fixed abbreviations (after aliasing), else
 * `<SPORT>:<normalised name>`. Provider-independent on purpose: two providers' spellings of one club agree.
 */
export function teamKey(sport: LiveSport, abbrOrName: string): string {
  const raw = abbrOrName.trim();
  const alias = ALIASES[sport]?.[raw.toUpperCase()];
  if (alias) return `${sport}:${alias}`;
  if (/^[A-Z]{2,4}$/.test(raw) && ALIASES[sport]) return `${sport}:${raw}`;
  return `${sport}:${strip(raw)}`;
}

const minutes = (a: string, b: string): number => Math.abs(Date.parse(a) - Date.parse(b)) / 60_000;

/** Does this provider game pair these teams, in this orientation? */
function sameTeams(g: LiveGame, e: SiftEventRef): 'straight' | 'swapped' | null {
  if (g.home.key === e.home.key && g.away.key === e.away.key) return 'straight';
  if (g.home.key === e.away.key && g.away.key === e.home.key) return 'swapped';
  return null;
}

/** Match one provider game to one Sift event, or say exactly why not. */
export function matchGameToEvent(g: LiveGame, e: SiftEventRef): MatchResult {
  if (g.sport !== e.sport) return { ok: false, reason: 'SPORT_MISMATCH', detail: `${g.sport} game against a ${e.sport} event` };
  if (!Number.isFinite(Date.parse(g.startUtc)) || !Number.isFinite(Date.parse(e.startUtc))) return { ok: false, reason: 'NO_EVENT', detail: 'a start time is missing or unreadable' };
  const delta = minutes(g.startUtc, e.startUtc);
  const orient = sameTeams(g, e);

  const known = e.providerIds?.[g.provenance.provider];
  if (known) {
    if (known !== g.provenance.providerGameId) return { ok: false, reason: 'NO_EVENT', detail: 'the publication carries a different provider id for this event' };
    // The id agrees; the pairing must still agree, or the provider reused / reassigned it.
    if (!orient || delta > START_WINDOW_MIN[g.sport] * 4) return { ok: false, reason: 'ID_CONFLICT', detail: `provider id ${known} now describes ${g.away.key} @ ${g.home.key} at ${g.startUtc}` };
    if (orient === 'swapped' && !e.neutral) return { ok: false, reason: 'ORIENTATION', detail: 'home and away are reversed for a non-neutral event' };
    return { ok: true, match: { eventId: e.eventId, method: 'PROVIDER_ID', startDeltaMin: Math.round(delta), swapped: orient === 'swapped' } };
  }

  if (!orient) return { ok: false, reason: 'TEAM_UNKNOWN', detail: `${g.away.key} @ ${g.home.key} is not ${e.away.key} @ ${e.home.key}` };
  if (orient === 'swapped' && !e.neutral) return { ok: false, reason: 'ORIENTATION', detail: 'home and away are reversed for a non-neutral event' };
  if (delta > START_WINDOW_MIN[g.sport]) return { ok: false, reason: 'NO_EVENT', detail: `starts ${Math.round(delta)} min apart (window ${START_WINDOW_MIN[g.sport]})` };
  return { ok: true, match: { eventId: e.eventId, method: 'TEAMS_AND_START', startDeltaMin: Math.round(delta), swapped: orient === 'swapped' } };
}

export interface Pairing {
  event: SiftEventRef;
  game: LiveGame | null;
  result: MatchResult;
}

/**
 * Pair every Sift event with at most one provider game, and refuse an event whose candidates are not clearly
 * distinct. One provider game is also never attached to two events.
 */
export function pairGames(events: SiftEventRef[], games: LiveGame[]): Pairing[] {
  const out: Pairing[] = events.map((event) => {
    const cands = games
      .map((g) => ({ g, r: matchGameToEvent(g, event) }))
      .filter((x): x is { g: LiveGame; r: Extract<MatchResult, { ok: true }> } => x.r.ok);
    if (!cands.length) {
      // Report the most informative refusal (a conflicting id beats a plain miss).
      const refusals = games.map((g) => matchGameToEvent(g, event)).filter((r) => !r.ok);
      const worst = refusals.find((r) => !r.ok && r.reason === 'ID_CONFLICT') ?? refusals.find((r) => !r.ok && r.reason === 'ORIENTATION');
      return { event, game: null, result: worst ?? { ok: false as const, reason: 'NO_EVENT' as const, detail: 'no provider game for these teams near this start' } };
    }
    cands.sort((a, b) => a.r.match.startDeltaMin - b.r.match.startDeltaMin);
    const [first, second] = cands;
    if (second && second.r.match.startDeltaMin - first.r.match.startDeltaMin < AMBIGUITY_GAP_MIN && first.r.match.method !== 'PROVIDER_ID') {
      return { event, game: null, result: { ok: false as const, reason: 'AMBIGUOUS' as const, detail: `${cands.length} provider games match ${event.away.key} @ ${event.home.key} within ${AMBIGUITY_GAP_MIN} min of each other` } };
    }
    return { event, game: first.g, result: first.r };
  });
  // A provider game claimed by two events is attached to neither: that is a fault in one of the two sides.
  const claims = new Map<LiveGame, number>();
  for (const p of out) if (p.game) claims.set(p.game, (claims.get(p.game) ?? 0) + 1);
  return out.map((p) => (p.game && (claims.get(p.game) ?? 0) > 1
    ? { event: p.event, game: null, result: { ok: false as const, reason: 'AMBIGUOUS' as const, detail: 'one provider game matched two Sift events' } }
    : p));
}

/**
 * The publication's own teams for one sport: the only authority on who a team is. A provider's team resolves by
 * abbreviation (after the sport's aliases) or by exact normalised name; anything else stays unresolved and the
 * game simply does not match (TEAM_UNKNOWN), which is the safe outcome.
 */
export class TeamDirectory {
  private byAbbr = new Map<string, string>();
  private byName = new Map<string, string>();

  constructor(readonly sport: LiveSport, teams: { abbr: string | null; name: string }[]) {
    for (const t of teams) {
      const key = teamKey(sport, t.abbr ?? t.name);
      if (t.abbr) this.byAbbr.set(teamKey(sport, t.abbr), key);
      this.byName.set(strip(t.name), key);
    }
  }

  resolve(t: { abbr: string | null; name: string }): string | null {
    if (t.abbr) {
      const hit = this.byAbbr.get(teamKey(this.sport, t.abbr));
      if (hit) return hit;
    }
    return this.byName.get(strip(t.name)) ?? null;
  }
}

/** Re-key a provider game with the publication's team directory. Unresolvable teams get an `?unresolved:` key. */
export function canonicalizeGame(g: LiveGame, dir: TeamDirectory): LiveGame {
  const fix = (t: LiveGame['home']) => ({ ...t, key: dir.resolve(t) ?? `?unresolved:${t.key}` });
  return { ...g, home: fix(g.home), away: fix(g.away) };
}

/** A Sift event as the matcher sees it, built from a publication board item (read-only; nothing is modified). */
export function eventRefFromBoardItem(
  item: { event_id: string; start_time_utc: string; home_participant: string | null; away_participant: string | null; participants: { participant_id: string; display_name: string; short_name: string | null }[] },
  sport: LiveSport,
  dir: TeamDirectory,
  extra: { neutral?: boolean; providerIds?: Record<string, string> } = {},
): SiftEventRef | null {
  const side = (id: string | null) => item.participants.find((p) => p.participant_id === id);
  const h = side(item.home_participant);
  const a = side(item.away_participant);
  if (!h || !a) return null;
  const hk = dir.resolve({ abbr: h.short_name, name: h.display_name });
  const ak = dir.resolve({ abbr: a.short_name, name: a.display_name });
  if (!hk || !ak) return null;
  return { eventId: item.event_id, sport, startUtc: item.start_time_utc, home: { key: hk, name: h.display_name }, away: { key: ak, name: a.display_name }, ...extra };
}
