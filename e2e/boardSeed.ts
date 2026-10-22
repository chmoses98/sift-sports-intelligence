// A seeded research tray for the v4 Board tests: the items a real device would hold (an older un-sided SIFT 2.0 save, a v4 NO save,
// a game, items with no v4 screen, a game that is gone, a game whose publication cannot be read), written to the same
// localStorage key the app reads (state/tray.tsx). The contract, game and prices are the bundled NFL publication's own.
import type { Page } from '@playwright/test';
import { makeTray, makeTrayItem, type RefKind } from '../src/packet/tray';
import { GAME, OLAVE } from './projectionDoc';
import { olaveRung } from './propSignals';

export const TRAY_KEY = 'sift.researchTray.v1';
export const SAVED_AT = '2026-10-04T13:00:00Z';      // two hours before the e2e clock
export const SNAP_AT = '2026-10-04T12:58:00Z';

interface Seed {
  ref_kind: RefKind; sport: string; id: string; extra?: Record<string, string | null>; note?: string;
  label: { label: string; sub?: string; href: string; kickoff?: string | null; side?: 'YES' | 'NO'; finding?: string; market?: { ticker: string; yesAsk: number | null; noAsk: number | null } | null; savedAt?: string };
}

const snap = (ticker: string, yesAsk: number | null, noAsk: number | null) => ({ ticker, yesAsk, yesBid: null, noAsk, noBid: null, observedAt: SNAP_AT, source: 'publication' });

const r7 = olaveRung(7);
export const SEEDS: Record<string, Seed> = {
  /** Saved from SIFT 2.0 before sides existed: no side anywhere, which has always meant YES. YES ask 40¢ when saved. */
  legacyYes: { ref_kind: 'MARKET', sport: 'NFL', id: r7.market, extra: { market_id: r7.market, event_id: GAME }, label: { label: 'Chris Olave 7+ receptions', sub: 'ATL @ NO · 2026 REG week 4', href: `/nfl/market/${r7.market}?event=${GAME}`, kickoff: '2026-10-06T00:15:00Z', market: snap(r7.ticker, 0.4, 0.62) as never } },
  /** Saved from v4: the under, NO ask 50¢ when saved. */
  v4No: { ref_kind: 'MARKET', sport: 'NFL', id: r7.market, extra: { market_id: r7.market, event_id: GAME, x: 'side=NO' }, label: { label: 'Chris Olave under 6.5 receptions', sub: 'Saved the under (No) · Over 40¢ · under 50¢', href: `/nfl/props?game=${GAME}&prop=${encodeURIComponent(`${OLAVE}|receptions`)}`, kickoff: '2026-10-06T00:15:00Z', side: 'NO', market: snap(r7.ticker, 0.4, 0.5) as never } },
  game: { ref_kind: 'EVENT', sport: 'NFL', id: GAME, label: { label: 'ATL @ NO', href: `/nfl/game/${GAME}`, kickoff: '2026-10-06T00:15:00Z' } },
  /** A saved team: no v4 screen, so it opens the SIFT 2.0 page it was saved from. */
  team: { ref_kind: 'TEAM', sport: 'NFL', id: 'prt_saints', label: { label: 'New Orleans Saints', href: '/nfl/team/prt_saints' } },
  /** An older save with a note typed in SIFT 2.0, padded with spaces the way an on-blur save leaves it: the editor must never rewrite it unless it is changed. */
  noted: { ref_kind: 'TEAM', sport: 'NFL', id: 'prt_falcons', note: '  Falcons pass rush vs the Saints line. Recheck Friday.  ', label: { label: 'Atlanta Falcons', href: '/nfl/team/prt_falcons' } },
  /** A game that is no longer on the publication's board. */
  gone: { ref_kind: 'EVENT', sport: 'NFL', id: 'evt_0000000000gone', label: { label: 'Old game', href: '/nfl/game/evt_0000000000gone', kickoff: '2026-09-20T17:00:00Z' } },
  /** A game in a sport whose publication cannot be read. */
  nhlGame: { ref_kind: 'EVENT', sport: 'NHL', id: 'evt_5938c3f8a7c1b24c0118', label: { label: 'FLA @ LAK', href: '/nhl/game/evt_5938c3f8a7c1b24c0118', kickoff: '2026-10-07T02:00:00Z' } },
  /** A saved contract whose quote was never on screen when it was saved. */
  noSnapshot: { ref_kind: 'MARKET', sport: 'NFL', id: olaveRung(8).market, extra: { market_id: olaveRung(8).market, event_id: GAME }, label: { label: 'Chris Olave 8+ receptions', href: `/nfl/market/${olaveRung(8).market}?event=${GAME}`, kickoff: '2026-10-06T00:15:00Z', market: null } },
};

export function trayDoc(names: (keyof typeof SEEDS)[], now = SAVED_AT) {
  const items = names.map((n) => makeTrayItem({ ref_kind: SEEDS[n].ref_kind, sport: SEEDS[n].sport, id: SEEDS[n].id, extra: SEEDS[n].extra ?? null, note: SEEDS[n].note ?? null, added_at: SAVED_AT }));
  const labels = Object.fromEntries(items.map((it, i) => [it.item_id, { ...SEEDS[names[i]].label, savedAt: SEEDS[names[i]].label.savedAt ?? SAVED_AT }]));
  return { tray: makeTray(items, now), labels, items };
}

/** Put a tray in this device's storage before the app loads. */
export async function seedTray(page: Page, names: (keyof typeof SEEDS)[]) {
  const doc = trayDoc(names);
  await page.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, [TRAY_KEY, JSON.stringify({ tray: doc.tray, labels: doc.labels })] as const);
  return doc;
}
