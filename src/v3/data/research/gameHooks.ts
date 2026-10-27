// Hooks behind Game Detail's research. Everything is lazy: the schedule and team index are one cached document (also used by Team
// Research); the two team profiles are fetched only by the Matchup tab (`enabled`); a ranking document only when a unit is opened.
// Nothing here prices anything: quotes are looked up here and gated by the screen (data/quoteGate.ts).
import { useCallback, useMemo } from 'react';
import type { EventDetailDoc, EventResearchDoc, Market } from '../../../contract/types';
import { useAuthority } from '../../../data/projections';
import { useLiveQuotes, useNow } from '../../../live/hooks';
import { overlayLive } from '../liveMarket';
import { usablePrice } from '../quoteGate';
import { priceOf } from '../adapt';
import type { Price, V3Game } from '../../model/types';
import { demoOn } from '../../state/prefs';
import { scheduledStart } from './gameMarkets';
import { useSchedule, useTeamProfile } from './hooks';
import type { RosterPlayer } from './keyMatchups';
import type { TeamProfile } from './types';

/**
 * The game's start: the league schedule's time (the explorer event for this game), else the board's own. Kalshi event metadata is never
 * a start time. Sample games carry their own sample time.
 */
export function useGameStart(g: V3Game | null): number | null {
  const { schedule } = useSchedule(g && g.provenance === 'publication' ? g.slug : '');
  return useMemo(() => {
    if (!g) return null;
    if (g.provenance !== 'publication' || !schedule.length) return Number.isFinite(g.startMs) ? g.startMs : null;
    return scheduledStart(schedule, { eventId: g.eventId, away: g.away.id, home: g.home.id, startMs: g.startMs }) ?? (Number.isFinite(g.startMs) ? g.startMs : null);
  }, [g, schedule]);
}

/** Both teams' profiles, loaded only when `enabled` (the Matchup tab), cached for Team Research and Stat Detail as well. */
export function useMatchupProfiles(g: V3Game | null, enabled: boolean): { away: TeamProfile | null; home: TeamProfile | null; loading: boolean; demo: boolean } {
  const real = !!g && g.provenance === 'publication' && !demoOn();
  const a = useTeamProfile(g?.slug ?? '', enabled && real ? g!.away.id : null);
  const h = useTeamProfile(g?.slug ?? '', enabled && real ? g!.home.id : null);
  return { away: a.profile, home: h.profile, loading: enabled && real && (a.loading || h.loading), demo: !real };
}

/** The roster the research document names, with each player's team code (by the team id the document states). */
export function useRoster(g: V3Game | null, research: EventResearchDoc | null | undefined): RosterPlayer[] {
  return useMemo(() => {
    if (!g || !research) return [];
    const code = new Map<string, string>();
    for (const p of research.participants ?? []) code.set(p.participant_id, p.home_away === 'AWAY' ? g.away.id : p.home_away === 'HOME' ? g.home.id : p.short_name ?? '');
    return (research.players ?? []).flatMap((p) => { const t = p.team_id ? code.get(p.team_id) : null; return t ? [{ id: p.participant_id, name: p.display_name, role: p.role ?? null, team: t }] : []; });
  }, [g, research]);
}

/**
 * The newest observation of a game's contracts: the publication's capture, replaced by a live quote only when the live observation is
 * at least as new (the app's own overlay). Returns a lookup by ticker; the screen passes the result through the quote gate.
 */
export function useQuotedPrices(detail: EventDetailDoc | null | undefined, tickers: string[]): (ticker: string) => Price | null {
  const markets = detail?.markets;
  const live = useLiveQuotes(tickers.length ? tickers : undefined, 'detail');
  const byTicker = useMemo(() => new Map<string, Market>((markets ?? []).map((m) => [m.kalshi_ticker, m])), [markets]);
  return useCallback((ticker: string) => { const m = byTicker.get(ticker); return m ? priceOf(overlayLive(m, live.quote(ticker))) : null; }, [byTicker, live.version]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * A price slot: the contract's newest observation through the quote gate. Returns the whole cents to print, or null to print "—" (a
 * withheld price). The slot is still a target either way (the contract sheet says "Price unavailable right now"). `fallback` is a
 * price the caller already holds (a sample game's), used only when the document has no row for the ticker.
 */
export function useGatedAsk(g: V3Game | null, detail: EventDetailDoc | null | undefined, startMs: number | null, tickers: string[]): (ticker: string, fallback?: Price | null) => number | null {
  const quoted = useQuotedPrices(detail, tickers);
  const now = useNow(15_000);
  return useCallback((ticker, fallback) => {
    if (!g) return null;
    const p = quoted(ticker) ?? fallback ?? null;
    return usablePrice(p, { kind: 'list', startMs, live: g.phase === 'live' }, now)?.ask ?? null;
  }, [g, quoted, startMs, now]);
}

export interface GameShape {
  state: 'loading' | 'ok' | 'none';
  /** Why there is no shape, in words the viewer reads. */
  reason: string | null;
  /** Away then home: the approved projections of pass and rush attempts. */
  teams: { team: string; pass: number; rush: number }[];
}

/**
 * Projected pass and rush attempts for both teams, from the approved projection authority only (lib/projectionAuthority.ts): the
 * family must be PROMOTED in the approval ledger and pass its freshness, coherence and publication checks. Otherwise there is no
 * shape and the screen says why; a withheld projection is never replaced by another number.
 */
export function useGameShape(g: V3Game | null, startMs: number | null, enabled: boolean): GameShape {
  const { authority, ready } = useAuthority(enabled && g ? g.sport : null);
  return useMemo<GameShape>(() => {
    if (!enabled || !g) return { state: 'none', reason: null, teams: [] };
    if (!ready) return { state: 'loading', reason: null, teams: [] };
    if (!authority) return { state: 'none', reason: 'No approved projection feed for this sport.', teams: [] };
    const q = { home: g.home.abbr, away: g.away.abbr, startUtc: startMs != null ? new Date(startMs).toISOString() : null };
    const pass = authority.resolveTeams({ ...q, family: 'team_pass_attempts' });
    const rush = authority.resolveTeams({ ...q, family: 'team_rush_attempts' });
    if (pass.kind === 'authoritative' && rush.kind === 'authoritative') {
      const teams = pass.teams.map((t) => ({ team: t.team, pass: t.value.mean, rush: rush.teams.find((r) => r.team === t.team)?.value.mean ?? NaN })).filter((t) => Number.isFinite(t.rush));
      if (teams.length === 2) return { state: 'ok', reason: null, teams };
    }
    const why = [pass, rush].find((r) => r.kind === 'withheld');
    return { state: 'none', reason: why && why.kind === 'withheld' ? `Not shown: ${why.reason}.` : 'No approved projection is published for this game yet.', teams: [] };
  }, [enabled, g, ready, authority, startMs]);
}
