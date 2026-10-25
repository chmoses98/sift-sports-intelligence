import { useId } from 'react';

export interface Bar { key: string; v: number | null; label: string; sub: string; result: 'over' | 'under' | 'push' | null }

/**
 * A game-by-game bar chart with the line drawn through it. Colour is never the only signal: each bar carries an O / U / P mark above it,
 * and the selected bar is outlined. Bars are real observed games; tapping one picks it (the caller opens its source observation).
 */
export function BarChart({ bars, line, sel, onSel, fmt, label }: { bars: Bar[]; line: number | null; sel: string | null; onSel: (k: string) => void; fmt: (v: number) => string; label: string }) {
  const id = useId();
  const W = 358, H = 236, L = 34, R = 40, T = 22, B = 38;
  const vals = bars.map((b) => b.v ?? 0);
  const top = Math.max(1, ...vals, line ?? 0);
  const step = top <= 10 ? 2 : top <= 20 ? 5 : top <= 60 ? 10 : top <= 120 ? 20 : 50;
  const max = Math.ceil((top * 1.08) / step) * step;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const n = Math.max(bars.length, 1);
  const slot = (W - L - R) / n;
  const bw = Math.min(26, slot * 0.66);
  const ticks: number[] = []; for (let t = 0; t <= max; t += step) ticks.push(t);
  const every = n > 14 ? 3 : n > 9 ? 2 : 1;
  return (
    <svg className="v3-bc" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={`${id}o`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#28e0c0" /><stop offset="1" stopColor="#12a58f" /></linearGradient>
        <linearGradient id={`${id}u`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff7d63" /><stop offset="1" stopColor="#d9503f" /></linearGradient>
        <linearGradient id={`${id}p`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c3d3df" /><stop offset="1" stopColor="#7d93a5" /></linearGradient>
      </defs>
      {ticks.map((t) => (<g key={t}><line x1={L} x2={W - R + 6} y1={y(t)} y2={y(t)} className="v3-bc__grid" /><text x={L - 6} y={y(t) + 4} textAnchor="end" className="v3-bc__tick">{t}</text></g>))}
      {bars.map((b, i) => {
        const cx = L + slot * i + slot / 2;
        const v = b.v ?? 0;
        const h = Math.max(1, y(0) - y(v));
        const fill = b.result === 'over' ? `url(#${id}o)` : b.result === 'under' ? `url(#${id}u)` : `url(#${id}p)`;
        const isSel = sel === b.key;
        return (
          <g key={b.key} role="button" tabIndex={0} aria-label={`${b.label}, ${b.sub}: ${b.v == null ? 'no value' : fmt(b.v)}${b.result ? `, ${b.result === 'over' ? 'over' : b.result === 'under' ? 'under' : 'push'} the line` : ''}. Open this game`}
            onClick={() => onSel(b.key)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSel(b.key); } }} className="v3-bc__bar">
            <rect x={cx - slot / 2} y={T - 8} width={slot} height={H - T - B + 8} className="v3-bc__hit" />
            <rect x={cx - bw / 2} y={y(v)} width={bw} height={h} rx="3" fill={fill} className={isSel ? 'is-sel' : undefined} />
            {b.result && <text x={cx} y={y(v) - 5} textAnchor="middle" className={`v3-bc__mark v3-bc__mark--${b.result}`}>{b.result === 'over' ? 'O' : b.result === 'under' ? 'U' : 'P'}</text>}
            {i % every === 0 && (<><text x={cx} y={H - 20} textAnchor="middle" className="v3-bc__x">{b.label}</text><text x={cx} y={H - 7} textAnchor="middle" className="v3-bc__x v3-bc__x2">{b.sub}</text></>)}
          </g>
        );
      })}
      {line != null && (<g aria-hidden="true"><line x1={L} x2={W - R + 4} y1={y(line)} y2={y(line)} className="v3-bc__line" /><rect x={W - R + 2} y={y(line) - 11} width="38" height="22" rx="5" className="v3-bc__tag" /><text x={W - R + 21} y={y(line) + 4} textAnchor="middle" className="v3-bc__tagtx">{line}</text></g>)}
    </svg>
  );
}
