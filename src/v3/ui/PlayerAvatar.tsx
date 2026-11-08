import { useState } from 'react';
import type { PlayerPhoto } from '../../lib/players';
import type { V3Team } from '../model/types';
import { TeamLogo } from './TeamLogo';

/** Initials for a name ("Jayson Tatum" → "JT", "Nikola Jokić" → "NJ"); "?" when there is no name. Pure, so tests can pin it. */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').replace(/\b(jr|sr|ii|iii|iv)\b\.?/gi, '').split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '')).toUpperCase();
}

/**
 * One player mark, with a fallback chain that never invents a face:
 *   1. a verified, licensed photo (only ever from `playerPhoto`, never a guessed or hot-linked URL), credited in `title`;
 *   2. when there is none or it fails to load: the team's logo (the player's identity is the team's, not a lookalike's);
 *   3. with no team either: the player's initials on a neutral disc.
 */
export function PlayerAvatar({ photo, team, name, size = 32, className }: { photo?: Pick<PlayerPhoto, 'src' | 'focus' | 'credit'> | null; team?: Pick<V3Team, 'logo' | 'abbr' | 'colors' | 'name'> | null; name?: string | null; size?: number; className?: string }) {
  const [bad, setBad] = useState<string | null>(null);
  const box = { width: size, height: size } as const;
  const cls = `v3-pav${className ? ` ${className}` : ''}`;
  if (photo && bad !== photo.src) {
    return <span className={cls} style={box} data-pav="photo" title={`Photo: ${photo.credit}`}><img src={photo.src} alt="" width={size} height={size} decoding="async" loading="lazy" onError={() => setBad(photo.src)} style={{ ...box, objectFit: 'cover', objectPosition: photo.focus, borderRadius: '50%', display: 'block' }} /></span>;
  }
  if (team) return <span className={cls} style={box} data-pav="team"><TeamLogo team={team} size={size} /></span>;
  return <span className={cls} style={{ ...box, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', background: '#2a3042', color: '#cfd6e6', fontSize: Math.max(10, Math.round(size * 0.38)), fontWeight: 600 }} data-pav="initials" aria-hidden="true">{initialsOf(name)}</span>;
}
