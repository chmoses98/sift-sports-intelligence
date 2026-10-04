// The handicap protocols, vendored byte for byte from kalshi-bet-router
// contract/edge_finder_contract/protocols/ (contract 1.1.1). packet.protocol_for_sport picks the
// sport extension and falls back to the core protocol.
import type { HandicapProtocol } from '../contract/types';
import core from '../contract/protocols/edge_finder.handicap.core.v1.json';
import nfl from '../contract/protocols/edge_finder.handicap.nfl.v1.json';
import mlb from '../contract/protocols/edge_finder.handicap.mlb.v1.json';
import cfb from '../contract/protocols/edge_finder.handicap.cfb.v1.json';
import nba from '../contract/protocols/edge_finder.handicap.nba.v1.json';
import nhl from '../contract/protocols/edge_finder.handicap.nhl.v1.json';
import soccer from '../contract/protocols/edge_finder.handicap.soccer.v1.json';
import tennis from '../contract/protocols/edge_finder.handicap.tennis.v1.json';

export const PROTOCOLS: Record<string, HandicapProtocol> = Object.fromEntries(
  [core, nfl, mlb, cfb, nba, nhl, soccer, tennis].map((p) => [p.protocol_id, p as unknown as HandicapProtocol]),
);

export function protocolForSport(sport: string): HandicapProtocol {
  return PROTOCOLS[`edge_finder.handicap.${sport.toLowerCase()}.v1`] ?? PROTOCOLS['edge_finder.handicap.core.v1'];
}
