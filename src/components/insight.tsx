// Shared building blocks for Sift's progressive layers: rank-first badges, matchup lines, labelled range
// bars and player faces. Every one states its meaning in words (tier words, labelled endpoints), never by
// colour alone.
import type { ReactNode } from 'react';
import type { MatchupInsight, UnitRank } from '../insights/matchups';
import type { RankView } from '../lib/rank';
import type { PlayerPhoto } from '../lib/players';
import { teamColors } from '../lib/teams';
import { useHeldImage } from '../lib/useImage';
import { TeamMark } from './ui';

/** "#3 NFL" big, the tier in words beside it ("Top 3"), the raw number (if any) quieter underneath. */
export function RankBadge({ rank, raw, compact }: { rank: RankView; raw?: ReactNode; compact?: boolean }) {
  return (
    <span className={`rk rk--${rank.tier}${compact ? ' rk--compact' : ''}${rank.directional ? '' : ' rk--neutral'}`}>
      <span className="rk__n num">#{rank.rank}</span>
      <span className="rk__w">{rank.directional ? rank.tierWord : rank.tierWord}</span>
      {raw != null && <span className="rk__raw num">{raw}</span>}
    </span>
  );
}

/** One unit with its league rank: "Falcons rush offense  #3 NFL · Top 3". */
export function UnitRankRow({ u, sport = 'NFL', raw }: { u: UnitRank; sport?: string; raw?: ReactNode }) {
  return (
    <span className="urow">
      <TeamMark sport={sport} abbr={u.team.abbr} size="sm" />
      <span className="urow__name">{u.team.nick} <span className="urow__unit">{u.unit}</span></span>
      <RankBadge rank={u.rank} raw={raw} compact />
    </span>
  );
}

/** Layer 2 of a matchup insight: the two units and their ranks, the advantaged one first. */
export function EdgeVs({ ins, sport = 'NFL' }: { ins: MatchupInsight; sport?: string }) {
  const first = ins.side === 'offense' ? ins.offense : ins.defense;
  const second = ins.side === 'offense' ? ins.defense : ins.offense;
  return (
    <span className="edgevs">
      <UnitRankRow u={first} sport={sport} />
      <span className="edgevs__vs" aria-hidden="true">vs</span>
      <span className="sr-only"> versus </span>
      <UnitRankRow u={second} sport={sport} />
    </span>
  );
}

/**
 * A projected range with its numbers written on it: the typical outcome (middle half of simulations) as a
 * band, the low and high ends at the ends, the projection as a dot and the market line as a tick.
 */
export function RangeBar({ typical, full, projection, line, format, label }: {
  typical: [number, number]; full: [number, number]; projection: number; line?: number | null; format: (v: number) => string; label: string;
}) {
  const lo = Math.min(full[0], line ?? full[0]);
  const hi = Math.max(full[1], line ?? full[1]);
  const span = Math.max(1e-9, hi - lo);
  const x = (v: number) => `${((v - lo) / span) * 100}%`;
  return (
    <div className="rbar" role="img" aria-label={`${label}: projection ${format(projection)}; typical range ${format(typical[0])} to ${format(typical[1])}; low end ${format(full[0])}, high end ${format(full[1])}${line != null ? `; market line ${format(line)}` : ''}`}>
      <div className="rbar__track" aria-hidden="true">
        <span className="rbar__full" style={{ left: x(full[0]), right: `calc(100% - ${x(full[1])})` }} />
        <span className="rbar__typ" style={{ left: x(typical[0]), right: `calc(100% - ${x(typical[1])})` }} />
        {line != null && <span className="rbar__line" style={{ left: x(line) }} title={`Line ${format(line)}`} />}
        <span className="rbar__dot" style={{ left: x(projection) }} />
      </div>
      <div className="rbar__ends" aria-hidden="true">
        <span>{format(full[0])}<small>low end</small></span>
        <span className="rbar__mid">{format(typical[0])}–{format(typical[1])}<small>typical</small></span>
        <span>{format(full[1])}<small>high end</small></span>
      </div>
    </div>
  );
}

/** A real photo of the player, or the team's mark on its colour — never initials or a silhouette. */
export function PlayerFace({ photo, team, sport = 'NFL', size = 'md', name }: { photo: PlayerPhoto | null; team: string; sport?: string; size?: 'sm' | 'md' | 'lg' | 'xl'; name?: string | null }) {
  const img = useHeldImage(photo?.src ?? null);
  const [c] = teamColors(sport, team);
  return (
    <span className={`pface pface--${size}${img ? '' : ' pface--logo'}`} style={{ ['--tc' as string]: c }}>
      {img ? <img src={img} alt={name ? `${name}` : ''} style={{ objectPosition: photo?.focus }} loading="lazy" decoding="async" /> : <TeamMark sport={sport} abbr={team} size={size === 'sm' ? 'sm' : 'md'} />}
    </span>
  );
}

/** A disclosure layer: the headline stays, the detail opens beneath it. */
export function Layer({ summary, children, className, open }: { summary: ReactNode; children: ReactNode; className?: string; open?: boolean }) {
  return (
    <details className={`layer${className ? ' ' + className : ''}`} open={open}>
      <summary className="layer__s">{summary}</summary>
      <div className="layer__b">{children}</div>
    </details>
  );
}
