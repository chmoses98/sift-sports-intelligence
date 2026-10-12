// Player photographs are game-day frames in the player's CURRENT team uniform — never a press conference,
// interview, draft event, training camp, off-field event, college or former-team uniform. The reviewed
// blocklist and the file-name rule are enforced at runtime (src/lib/players.ts) and by the fetch script.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../src/lib/player-images.json';
import blocklist from '../src/lib/player-image-blocklist.json';
import { allPlayerImages, NON_GAME_FILE, playerImageAllowed, playerPhoto } from '../src/lib/players';

const entries = Object.entries((manifest as { players: Record<string, { file: string; name: string; team: string; participant_id?: string }> }).players);
const blocked = (blocklist as { files: { id: string; file: string; why: string }[] }).files;

describe('player imagery is game action only', () => {
  it('no blocklisted or non-game file is in the manifest', () => {
    const files = new Set(blocked.map((b) => b.file));
    for (const [id, p] of entries) {
      expect(files.has(p.file), `${id} is blocklisted`).toBe(false);
      expect(NON_GAME_FILE.test(p.file), `${id}: ${p.file} names a non-game context`).toBe(false);
    }
  });

  it('every shipped photo exists, and no rejected photo is still shipped', () => {
    for (const [id] of entries) expect(existsSync(join('public/players/nfl', `${id}.webp`)), id).toBe(true);
    for (const b of blocked) expect(existsSync(join('public/players/nfl', `${b.id}.webp`)), b.id).toBe(false);
  });

  it('every blocklist entry says why', () => {
    for (const b of blocked) expect(b.why.length, b.id).toBeGreaterThan(8);
  });

  it('the file-name rule catches press conferences, interviews, draft and camp frames', () => {
    for (const f of ['File:2024 Atlanta Falcons Post-draft Press Conference Michael Penix Jr.png', 'File:2025 NYJ offseason - Garrett Wilson interview (cropped).png', 'File:2024 Titans FA Announcement - Tony Pollard.png', 'File:Jacoby Brissett at Charity Softball Game 2024 (cropped).jpg', 'File:Lamar jackson ravens camp 2018 (cropped).jpg', 'File:2025 FanDuel Super Bowl LIX Winner Poll - Kyren Williams.png']) {
      expect(playerImageAllowed(f), f).toBe(false);
    }
    expect(playerImageAllowed('File:Bijan Robinson 2025.jpg')).toBe(true);
  });

  it('a player whose photo was rejected has none (the card shows the team-branded graphic)', () => {
    const love = blocked.find((b) => b.id === 'ari-jeremiyah-love')!;
    expect(love.why).toMatch(/press conference/);
    expect(playerPhoto(null, 'Jeremiyah Love', 'ARI')).toBeNull();
    expect(playerPhoto(null, 'Bijan Robinson', 'ATL')?.src).toMatch(/atl-bijan-robinson\.webp$/);
    expect(allPlayerImages().some((p) => p.id === 'ari-jeremiyah-love')).toBe(false);
  });
});
