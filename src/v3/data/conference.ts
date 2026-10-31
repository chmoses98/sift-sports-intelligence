// Conference identity for the Home filter, read lazily: only a viewer on CFB or CBB loads it (the CBB identity file is ~57 KB).
//   CFB: contract team code -> publication conference (src/lib/cfb-conferences.json; scripts/teams/fetch-cfb-conferences.mjs).
//   CBB: publication participant id -> the conference its team profile states (src/views/cbb/identity.ts).
// Nothing is inferred: a team with no stated conference keeps `conference` unset.
import { useEffect, useMemo, useState } from 'react';
import { cfbConferenceLabel, isCollege, unifyLabel } from '../model/conference';
import type { V3Game, V3Team } from '../model/types';

export interface ConferenceSource {
  cfb: (code: string) => string | null;
  cbb: (participantId: string | null | undefined) => string | null;
}

let source: Promise<ConferenceSource> | null = null;
/** The two identity tables, loaded once (each is its own lazy chunk). */
export function loadConferences(): Promise<ConferenceSource> {
  source ??= Promise.all([import('../../lib/cfb-conferences.json'), import('../../views/cbb/identity')]).then(([cfb, cbb]) => {
    const map = (cfb.default as { teams: Record<string, string> }).teams;
    return {
      cfb: (code) => (map[code] ? cfbConferenceLabel(map[code]) : null),
      cbb: (pid) => { const c = cbb.confShort(cbb.identity(pid)?.conference); return c ? unifyLabel(c) : null; },
    };
  });
  return source;
}

const withConf = (t: V3Team, conference: string | null): V3Team => (conference && !t.conference ? { ...t, conference } : t);

const enriched = new WeakMap<V3Game, V3Game>();
/** The game with each team's conference set where the identity data states one (the same object when nothing changed; a team that already has one keeps it). */
export function withConferences(g: V3Game, src: ConferenceSource): V3Game {
  if (!isCollege(g.slug)) return g;
  const hit = enriched.get(g);
  if (hit) return hit;
  const lookup = (t: V3Team, pid: string | null | undefined) => (g.slug === 'cfb' ? src.cfb(t.id) : src.cbb(pid));
  const away = withConf(g.away, lookup(g.away, g.item?.away_participant));
  const home = withConf(g.home, lookup(g.home, g.item?.home_participant));
  const out = away === g.away && home === g.home ? g : { ...g, away, home };
  enriched.set(g, out);
  return out;
}

/**
 * The games with conferences attached for the college sports. The college identity loads only when `enabled` (a college sport is selected);
 * `ready` is false until it has answered (or failed), so a screen never shows an unfiltered list that then narrows.
 */
export function useConferenceGames(games: V3Game[], enabled: boolean): { games: V3Game[]; ready: boolean } {
  const [src, setSrc] = useState<ConferenceSource | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled || src || failed) return;
    let live = true;
    loadConferences().then((s) => { if (live) setSrc(s); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [enabled, src, failed]);
  const out = useMemo(() => (src ? games.map((g) => withConferences(g, src)) : games), [games, src]);
  return { games: out, ready: !enabled || !!src || failed };
}
