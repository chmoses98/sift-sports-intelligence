// Margin bars (TR1, TR3, TR6): one bar per completed game, wins green above the zero line and losses coral below it, the final margin
// printed at the bar's end, and the opponent's logo under each bar. The geometry is the mockup's (338 by 112, bar radius 3.5, 26 wide
// at most). Every bar opens its completed game; every logo opens the opponent's team page. The drawing is one SVG that scales as a
// whole; the targets are real links laid over it so each keeps a proper hit area.
import { GameLink, TeamLink } from '../../nav/Targets';
import type { GameRef } from '../../nav/routes';
import type { V3Team } from '../../model/types';
import { TeamLogo } from '../TeamLogo';

export interface MarginBar {
  key: string;
  /** For minus against: the final margin, from the team's side. */
  margin: number;
  game: GameRef;
  opp: V3Team;
  away: boolean;
  /** Spoken name: "Win 27 to 13 at PHI. Open game". */
  label: string;
  oppLabel: string;
}

const W = 338;

export function MarginBars({ bars, scale, height = 112, id }: { bars: MarginBar[]; scale: number; height?: number; id: string }) {
  const n = bars.length;
  if (!n) return null;
  const mid = (height - 22) / 2 + 4;
  const sw = (W - 8) / n;
  const bw = Math.min(26, sw - 8);
  return (
    <div className="tm-mb">
      <div className="tm-mb__plot" style={{ aspectRatio: `${W} / ${height}` }}>
        <svg viewBox={`0 0 ${W} ${height}`} width="100%" height="100%" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#46e49b" /><stop offset="1" stopColor="#1c9a62" /></linearGradient>
            <linearGradient id={`${id}l`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#ff7468" /><stop offset="1" stopColor="#cf453c" /></linearGradient>
          </defs>
          <line x1="4" x2={W - 4} y1={mid} y2={mid} stroke="rgba(255,255,255,.28)" strokeWidth="1" />
          {bars.map((b, i) => {
            const x = 4 + sw * i + sw / 2;
            const hh = Math.max(3, (Math.abs(b.margin) / scale) * (mid - 12));
            const win = b.margin > 0;
            const even = b.margin === 0;
            return (
              <g key={b.key}>
                <rect x={x - bw / 2} y={win ? mid - hh : mid} width={bw} height={even ? 3 : hh} rx="3.5" fill={even ? 'rgba(255,255,255,.35)' : `url(#${id}${win ? 'w' : 'l'})`} />
                <text x={x} y={win ? mid - hh - 3 : mid + hh + 10} textAnchor="middle" fontSize="9.5" fontWeight="600" fill={even ? '#a4acb6' : win ? '#46e49b' : '#ff7468'}>{even ? '0' : `${win ? '+' : '−'}${Math.abs(b.margin)}`}</text>
              </g>
            );
          })}
        </svg>
        <div className="tm-mb__hits">
          {bars.map((b) => <GameLink key={b.key} game={b.game} label={b.label} className="tm-mb__hit">{null}</GameLink>)}
        </div>
      </div>
      <div className="tm-mb__logos">
        {bars.map((b) => (
          <span key={b.key} className="tm-mb__lg">
            <TeamLink team={b.opp} label={b.oppLabel}><TeamLogo team={b.opp} size={18} /></TeamLink>
            <i aria-hidden="true">{b.away ? '@' : ''}</i>
          </span>
        ))}
      </div>
    </div>
  );
}
