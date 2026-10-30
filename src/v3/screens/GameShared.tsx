// Shared by the Matchup tab and the expanded unit: the game context a tab receives, the model both read, and a few small pieces.
import { useMemo, useState } from 'react';
import type { EventDetailDoc, EventResearchDoc } from '../../contract/types';
import { playerPhoto } from '../../lib/players';
import { deriveProps } from '../data/adapt';
import { useMatchupProfiles, useRoster } from '../data/research/gameHooks';
import type { ScriptState } from '../data/research/scriptEngine';
import { keyMatchups, NFL_PROP_UNITS } from '../data/research/keyMatchups';
import { sideOf, unitRows, unitsFor } from '../data/research/matchup';
import type { V3Game, V3Team } from '../model/types';
import { TeamLogo } from '../ui/TeamLogo';

export interface GameCtx {
  g: V3Game;
  /** The schedule authority's start (ms), else the board's. */
  startMs: number | null;
  detail: EventDetailDoc | null;
  research: EventResearchDoc | null;
  researchLoading: boolean;
  /** Why a document could not be read (null/undefined when it could, or when it is simply not published), and how to ask again. */
  detailError?: unknown;
  detailRetry?: () => void;
  researchError?: unknown;
  researchRetry?: () => void;
  /** The Script Engine payload of this game's research (data/research/scriptEngine.ts): ready only when the research carries one. */
  script?: ScriptState;
}

const NO_STAT_UNITS: Record<string, never> = {};
export const teamLookup =(g: V3Game) => (code: string): V3Team => (code === g.away.id ? g.away : g.home);
/** `dir` is omitted from the address when it is the default (the home team's offense). */
export const dirParamOf = (g: V3Game, code: string) => (code === g.home.id ? null : code);

/** What the two team profiles give: both directions' rows in the sport's declared order, plus the props that name key players. */
export function useMatchupModel(ctx: GameCtx) {
  const { g } = ctx;
  const P = useMatchupProfiles(g, true);
  const units = useMemo(() => unitsFor(g.slug), [g.slug]);
  const rowsAway = useMemo(() => unitRows(units, g.away.id, g.home.id, P.away, P.home), [units, g, P.away, P.home]);
  const rowsHome = useMemo(() => unitRows(units, g.home.id, g.away.id, P.home, P.away), [units, g, P.away, P.home]);
  const roster = useRoster(g, ctx.research);
  const props = useMemo(() => (ctx.detail ? deriveProps(ctx.detail.markets ?? []) : []), [ctx.detail]);
  const statUnits = g.slug === 'nfl' ? NFL_PROP_UNITS : NO_STAT_UNITS;
  const defSide = useMemo(() => (team: string, u: { def: string }) => sideOf(team === g.away.id ? P.away : P.home, u.def), [g, P.away, P.home]);
  const opponent = useMemo(() => (team: string) => (team === g.away.id ? g.home.id : team === g.home.id ? g.away.id : null), [g]);
  const key = useMemo(() => keyMatchups({ props, roster, units, statUnits, max: 3, defSide, opponent }), [props, roster, units, statUnits, defSide, opponent]);
  /** Every unit-mapped candidate (for the expanded unit's "where this shows up"). */
  const allKey = useMemo(() => keyMatchups({ props, roster, units, statUnits, max: 99, defSide, opponent }), [props, roster, units, statUnits, defSide, opponent]);
  return { ...P, units, rowsAway, rowsHome, props, roster, key, allKey };
}
export type MatchupModel = ReturnType<typeof useMatchupModel>;

/** A player's photograph when one is committed, credited and loads, else the team's logo: never initials or a silhouette. */
export function Avatar({ k, g }: { k: { playerId: string; name: string; team: string }; g: V3Game }) {
  const [bad, setBad] = useState(false);
  const ph = playerPhoto(k.playerId, k.name, k.team);
  const t = k.team === g.away.id ? g.away : g.home;
  return ph && !bad ? <img className="mx-av__img" src={ph.src} alt="" width={36} height={36} loading="lazy" onError={() => setBad(true)} style={{ objectPosition: ph.focus }} /> : <TeamLogo team={t} size={30} />;
}
