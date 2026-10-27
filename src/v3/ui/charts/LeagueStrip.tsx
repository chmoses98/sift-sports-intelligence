// One statistic across the whole league on a single line (locked design P4): every team a dot, the league average marked, worst on the
// left and best on the right whichever way the statistic runs, and one team ringed with its logo. Positions come from the published
// ranking's own values; nothing is estimated. Defense rings are amber, offense rings ice (the role colours of the design system).
import type { RankingEntryVM } from '../../data/research/types';

const W = 330;
const PAD = 8;

export interface LeagueStripProps {
  entries: Pick<RankingEntryVM, 'code' | 'value'>[];
  /** The team to ring. */
  team: string;
  /** Higher values are better (so they sit on the right); false flips the line so the best is still on the right. */
  higherIsBetter: boolean;
  role: 'off' | 'def';
  logo: string | null;
  label: string;
}

export function LeagueStrip({ entries, team, higherIsBetter, role, logo, label }: LeagueStripProps) {
  const rows = entries.filter((e): e is { code: string; value: number } => e.value != null && Number.isFinite(e.value));
  const me = rows.find((e) => e.code === team);
  if (!me || rows.length < 2) return <div className="v3p-strip v3p-strip--none" role="img" aria-label={`${label}: not ranked`} />;
  const vals = rows.map((e) => e.value);
  const mn = Math.min(...vals), mx = Math.max(...vals), avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const x = (v: number) => { let t = (v - mn) / (mx - mn || 1); if (!higherIsBetter) t = 1 - t; return PAD + t * (W - PAD * 2); };
  let lastX = -99, flip = 1;
  const dots = [...rows].sort((p, q) => x(p.value) - x(q.value)).map((e) => { const px = x(e.value); flip = px - lastX < 7 ? -flip : 1; lastX = px; return { e, px, dy: flip === -1 ? 7 : 0 }; });
  const mxp = x(me.value);
  return (
    <svg className="v3p-strip" viewBox={`0 0 ${W} 62`} role="img" aria-label={label}>
      <line x1={PAD} x2={W - PAD} y1="30" y2="30" className="v3p-strip__rail" />
      {dots.filter((d) => d.e.code !== team).map((d) => <circle key={d.e.code} cx={d.px} cy={30 + d.dy} r="3.4" className="v3p-strip__dot" />)}
      <line x1={x(avg)} x2={x(avg)} y1="20" y2="40" className="v3p-strip__avg" /><text x={x(avg)} y="14" textAnchor="middle" className="v3p-strip__avgt">league avg</text>
      <text x={PAD} y="58" className="v3p-strip__end">Worst</text><text x={W - PAD} y="58" textAnchor="end" className="v3p-strip__end">Best</text>
      <circle cx={mxp} cy="30" r="13" className={`v3p-strip__me v3p-strip__me--${role}`} />
      {logo ? <image href={logo} x={mxp - 9} y="21" width="18" height="18" /> : <text x={mxp} y="34" textAnchor="middle" className="v3p-strip__code">{team}</text>}
    </svg>
  );
}
