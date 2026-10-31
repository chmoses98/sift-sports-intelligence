// The per-sport readers behind Matchup Intelligence (Workstream 4, "Expand sport coverage"). `readSport` picks the reader for a game's sport, but only for
// the layers the sport's capability declaration (model/capabilities.ts) does not say `none`: a layer a sport does not publish is never read, and a layer a
// sport publishes game by game appears for a game only when that game's own document fills it (the reader returns nothing for it otherwise).
import { capability } from '../../../model/capabilities';
import { readCbbSport } from './cbb';
import { readMlbSport } from './mlb';
import { readNbaSport } from './nba';
import { readNhlSport } from './nhl';
import { readSoccerSport } from './soccer';
import { readTennisSport } from './tennis';
import type { SportInput, SportRead } from './types';

export type { SportBlock, SportInput, SportRead, SportRow } from './types';

const READERS: Record<string, (i: SportInput) => SportRead | null> = {
  nhl: readNhlSport, nba: readNbaSport, mlb: readMlbSport, cbb: readCbbSport, soccer: readSoccerSport, tennis: readTennisSport,
};

export function readSport(i: SportInput): SportRead | null {
  const slug = i.g.slug.toLowerCase();
  const read = READERS[slug];
  if (!read) return null;
  const open = (s: 'gameModel' | 'gameEnvironment' | 'gameAvailability' | 'gameScript') => capability(slug, s).status !== 'none';
  let r: SportRead | null;
  try { r = read(i); } catch { return null; } // a document the reader cannot make sense of is an absent layer, never an error on the Overview
  if (!r) return null;
  return {
    ...r,
    model: open('gameModel') ? r.model : null,
    environment: open('gameEnvironment') ? r.environment : null,
    script: open('gameScript') ? r.script : null,
    // `undefined` (the reader says nothing about notes) lets the generic injury news stand; `null` (it looked and found none) replaces it.
    notes: open('gameAvailability') ? r.notes : r.notes === undefined ? undefined : null,
    blocks: open('gameAvailability') ? r.blocks : [],
  };
}
