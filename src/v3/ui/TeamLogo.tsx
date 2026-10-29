import { useState } from 'react';
import type { V3Team } from '../model/types';

/** A team's authentic committed logo, or (when none is committed or it fails to load) its abbreviation on its own colours — never a made-up crest. */
export function TeamLogo({ team, size = 28, className }: { team: Pick<V3Team, 'logo' | 'abbr' | 'colors' | 'name'>; size?: number; className?: string }) {
  const [bad, setBad] = useState(false);
  if (team.logo && !bad) {
    return <img className={`v3-logo${className ? ` ${className}` : ''}`} src={team.logo} alt="" width={size} height={size} decoding="async" onError={() => setBad(true)} style={{ width: size, height: size }} />;
  }
  return (
    <span className={`v3-logo v3-logo--mono${className ? ` ${className}` : ''}`} aria-hidden="true" style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.34)), background: `linear-gradient(145deg, ${team.colors[0]}, ${team.colors[1]})` }}>
      {team.abbr.slice(0, 3)}
    </span>
  );
}
