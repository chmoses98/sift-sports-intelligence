import { useMemo } from 'react';
import { toggleFollow, useFollows } from '../state/prefs';
import type { V3Game, V3Team } from '../model/types';
import { Icon } from './Icon';
import { useSheet } from './Sheet';
import { TeamLogo } from './TeamLogo';

/** The skippable first-run welcome (22): sports first, no account, no alerts, no bankroll. Shown once; closing it never blocks Home. */
export function Welcome({ games }: { games: V3Game[] }) {
  const sheet = useSheet();
  const f = useFollows();
  const teams = useMemo(() => {
    const seen = new Set<string>(); const out: V3Team[] = [];
    for (const g of games) for (const t of [g.home, g.away]) { const k = `${t.slug}:${t.id}`; if (t.logo && !seen.has(k) && out.length < 12) { seen.add(k); out.push(t); } }
    return out;
  }, [games]);
  return (
    <div className="v3-welcome">
      <p className="v3-welcome__p">Live games, team and player research, and the real market price behind it, one tap apart. No account. No alerts unless you ask. SIFT shows research, never a pick.</p>
      {teams.length > 0 && (
        <>
          <h3 className="v3-lens__k">Follow a few teams (optional)</h3>
          <div className="v3-welcome__teams" role="group" aria-label="Teams to follow">
            {teams.map((t) => { const k = `${t.slug}:${t.id}`; const on = f.teams.includes(k); return (
              <button key={k} type="button" className="v3-wt" aria-pressed={on} onClick={() => toggleFollow('teams', k)}><TeamLogo team={t} size={38} /><span>{t.nick}</span>{on && <Icon name="check" size={16} />}</button>); })}
          </div>
        </>
      )}
      <button type="button" className="v3-btn v3-btn--cyan" onClick={sheet.close}>{f.teams.length ? 'Start' : 'Explore without setup'}</button>
      <p className="v3-note v3-note--dim">You can change all of this in Following and Settings.</p>
    </div>
  );
}
