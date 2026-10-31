// Where a classic (root) address lands when SIFT 3.0 is the default interface. Pure: the gate (App.tsx UiGate) calls it with the classic path and query.
// Addresses SIFT 3.0 has a screen for map to it; anything else opens SIFT 3.0 Home rather than a retired page. Query strings of the mapped screens are kept.
const SPORTS = new Set(['nfl', 'cfb', 'nba', 'cbb', 'mlb', 'nhl', 'soccer', 'tennis']);

export function v3Target(pathname: string, search: string): string {
  const parts = pathname.split('/').filter(Boolean);
  const q = search && search !== '?' ? search : '';
  if (parts.length === 0) return '/v3';
  const [a, b, c] = parts;
  if (a === 'games') return `/v3${q}`;
  if (a === 'props') return `/v3/props${q}`;
  if (a === 'search' || a === 'explore') return `/v3/search${q}`;
  if (a === 'settings') return '/v3/settings';
  if (SPORTS.has(a)) {
    if (b === 'game' && c) return `/v3/game/${a}/${c}${q}`;
    if (b === 'team' && c) return `/v3/team/${a}/${c}${q}`;
    if (b === 'player' && c) return `/v3/player/${a}/${c}${q}`;
    if (b === 'props') return `/v3/props${q}`;
    return `/v3?sport=${a}`;
  }
  return '/v3';
}
