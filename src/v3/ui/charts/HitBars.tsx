// The Player Research hit-bar chart (locked design P1 and P2). One bar per game the cut shows, coloured by whether the game cleared the line
// (green) or not (coral), the line drawn through it with its value on the right, the opponent's logo and week under each bar, and the
// coming game as a hatched bar that shows the SIFT model's published range ONLY when a value is passed in (the caller has already
// checked the approval ledger).
//
// The line is draggable: it snaps to the real Kalshi rungs, bars recolour as it moves, and the caller updates every number from the
// line this component reports. Touch: the drag handle and the line's right gutter set `touch-action: none` (so a finger on them
// moves the line, never the page) and capture the pointer; everywhere else the chart leaves vertical panning to the browser.
// Geometry, spacing and colours are those of mock.js `barChart` in the ink-and-graphite theme.
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Obs } from '../../model/research';
import { sameLine } from '../../model/playerResearch';

export interface TonightBar {
  label: string;
  /** The opponent's logo (src), when committed. */
  logo: string | null;
  /** The approved model's published range for this stat, or null (then the bar is an empty hatched placeholder: nothing is invented). */
  model: { median: number; mean: number; p10: number; p90: number } | null;
  /** Where tapping the bar goes (Game Detail for the coming game), set as data-dest. */
  to: string | null;
  onOpen: () => void;
}

export interface HitBarsProps {
  games: Obs[];
  stat: string;
  line: number | null;
  /** The ladder's lines (snap points). Empty: the line is a reference line and cannot be dragged. */
  rungs: number[];
  tonight: TonightBar | null;
  selKey: string | null;
  onSelect: (key: string) => void;
  /** Called with each rung the dragged line snaps to; `commit` is true on release. */
  onLine: (line: number, commit: boolean) => void;
  onScrub: (on: boolean) => void;
  scrubbing: boolean;
  logoOf: (opp: string) => string | null;
  height: number;
  label: string;
  /** The line's label ("6.5"). */
  fmt: (v: number) => string;
}

const W = 338;
const L = 22, R = 46, T = 16, B = 36;
const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

export const niceTop = (mx: number): { step: number; top: number } => {
  const step = STEPS.find((s) => mx / s <= 5) ?? STEPS[STEPS.length - 1];
  return { step, top: Math.max(step, Math.ceil(mx / step) * step) };
};

const SEASON_DIV = (a?: Obs, b?: Obs) => !!a && !!b && a.season != null && b.season != null && a.season !== b.season;

export function HitBars(p: HitBarsProps) {
  const uid = useId().replace(/:/g, '');
  const svg = useRef<SVGSVGElement>(null);
  const [focus, setFocus] = useState(false);
  const { games, stat, line, tonight } = p;
  const H = p.height;
  const pw = W - L - R, ph = H - T - B;
  const vals = games.map((g) => g.v[stat] ?? 0);
  const tm = tonight?.model ?? null;
  const mx = Math.max(1, ...vals, (line ?? 0) + 1.5, tm?.p90 ?? 0);
  const { step, top } = niceTop(mx);
  const y = (v: number) => T + ph - (v / top) * ph;
  const slots = games.length + (tonight ? 1 : 0);
  const sw = pw / Math.max(1, slots);
  const dense = games.length > 14, compact = games.length > 24;
  const bw = compact ? Math.max(1.6, sw - 1.4) : Math.min(19, sw - (dense ? 4 : 7));
  const cx = (i: number) => L + sw * i + sw / 2;
  const ticks: number[] = []; for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const ly = line != null ? y(line) : null;
  const canDrag = p.rungs.length > 1 && line != null;
  const rungYs = p.rungs.map((r) => ({ line: r, y: y(r) })).filter((r) => r.y >= T - 2 && r.y <= T + ph + 1);

  // ---- the drag: pointer y in the chart's own coordinates, snapped to the nearest rung inside the plot
  const dragging = useRef(false);
  const last = useRef<number | null>(null);
  const toLine = (clientY: number): number | null => {
    const el = svg.current; if (!el || !rungYs.length) return null;
    const r = el.getBoundingClientRect();
    const sy = ((clientY - r.top) / r.height) * H;
    let best = rungYs[0];
    for (const c of rungYs) if (Math.abs(c.y - sy) < Math.abs(best.y - sy)) best = c;
    return best.line;
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (!canDrag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true; last.current = line; p.onScrub(true);
    e.preventDefault();
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const l = toLine(e.clientY);
    if (l != null && !sameLine(l, last.current)) { last.current = l; p.onLine(l, false); }
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    p.onScrub(false);
    if (last.current != null) p.onLine(last.current, true);
    last.current = null;
  };
  const key = (e: KeyboardEvent) => {
    if (!canDrag || line == null) return;
    const sorted = [...p.rungs].sort((a, b) => a - b);
    const i = sorted.findIndex((r) => sameLine(r, line));
    const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = sorted[Math.max(0, Math.min(sorted.length - 1, (i < 0 ? 0 : i) + d))];
    p.onLine(n, true);
  };

  return (
    <div className="v3p-hbw">
    <svg ref={svg} className={`v3p-hb${p.scrubbing ? ' is-scrub' : ''}`} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={p.label} style={{ aspectRatio: `${W} / ${H}` }}>
      <defs>
        <linearGradient id={`${uid}go`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#46e49b" /><stop offset="1" stopColor="#1c9a62" /></linearGradient>
        <linearGradient id={`${uid}gu`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff7468" /><stop offset="1" stopColor="#cf453c" /></linearGradient>
        <linearGradient id={`${uid}gp`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c3c8ce" /><stop offset="1" stopColor="#7d8895" /></linearGradient>
        <pattern id={`${uid}hh`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="rgba(25,205,224,.10)" /><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(25,205,224,.55)" strokeWidth="2" /></pattern>
      </defs>
      {ticks.map((v) => (<g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="v3p-hb__grid" /><text x={L - 5} y={y(v) + 3.5} textAnchor="end" className="v3p-hb__ax">{v}</text></g>))}
      {games.map((g, i) => {
        const v = g.v[stat];
        const res = v == null || line == null ? null : v > line ? 'over' : v < line ? 'under' : 'push';
        const x = cx(i), val = v ?? 0;
        const fill = res === 'over' ? `url(#${uid}go)` : res === 'under' ? `url(#${uid}gu)` : `url(#${uid}gp)`;
        const prev = games[i - 1];
        const showLabels = !dense || i % 2 === (games.length - 1) % 2;
        const logo = p.logoOf(g.opp);
        return (
          <g key={g.key}>
            {SEASON_DIV(prev, g) && (<><line x1={L + sw * i} x2={L + sw * i} y1={T - 8} y2={H - B + 4} className="v3p-hb__div" />{!compact && <><text x={L + sw * i - 4} y={T - 4} textAnchor="end" className="v3p-hb__yr">{prev!.season}</text><text x={L + sw * i + 4} y={T - 4} className="v3p-hb__yr">{g.season}</text></>}</>)}
            <g role="button" tabIndex={0} className="v3p-hb__bar" data-obs={g.key} aria-pressed={p.selKey === g.key} aria-label={`${g.label}${g.date ? `, ${g.date}` : ''}: ${v == null ? 'no value' : v}${res ? `, ${res === 'over' ? 'cleared' : res === 'under' ? 'missed' : 'pushed'} the line` : ''}. Show this game`}
              onClick={() => p.onSelect(g.key)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelect(g.key); } }}>
              <rect x={cx(i) - sw / 2} y={T - 6} width={sw} height={ph + 6 + (compact ? 4 : B - 4)} className="v3p-hb__hit" />
              <rect x={x - bw / 2} y={y(val)} width={bw} height={Math.max(2, y(0) - y(val))} rx={compact ? 1 : 4} fill={fill} stroke={p.selKey === g.key ? '#fff' : 'none'} strokeWidth="1.6" opacity={p.selKey && p.selKey !== g.key ? 0.55 : 1} />
              {!compact && v != null && showLabels && <text x={x} y={y(val) - 4} textAnchor="middle" className={`v3p-hb__v${res === 'over' ? ' is-hit' : res === 'under' ? ' is-miss' : ''}`}>{v}</text>}
              {!compact && !dense && logo && <image href={logo} x={x - 8} y={H - B + 8} width="16" height="16" />}
              {!compact && !dense && g.home === false && <text x={x - 11} y={H - B + 20} textAnchor="end" className="v3p-hb__ax" fontSize="8.5">@</text>}
              {!compact && showLabels && <text x={x} y={H - B + 33} textAnchor="middle" className={`v3p-hb__wk${g.week == null ? ' is-date' : ''}`}>{g.week != null ? `W${g.week}` : shortDate(g.date)}</text>}
            </g>
          </g>
        );
      })}
      {tonight && (() => {
        const x = cx(games.length), tmv = tm;
        const hb = tmv ? y(tmv.median) : y(0) - ph * 0.34;
        return (
          <g role="link" tabIndex={0} className="v3p-hb__tonight" data-tap="game" data-dest={tonight.to ?? undefined} aria-label={`Coming game ${tonight.label}. Open game`} onClick={tonight.onOpen} onKeyDown={(e) => { if (e.key === 'Enter') tonight.onOpen(); }}>
            <rect x={x - sw / 2 - 1} y={T - 6} width={sw + 2} height={ph + B + 2} className="v3p-hb__hit" />
            <rect x={x - bw / 2} y={hb} width={bw} height={y(0) - hb} rx={compact ? 1 : 4} fill={tmv ? `url(#${uid}hh)` : 'none'} stroke="rgba(25,205,224,.8)" strokeDasharray="3 2" />
            {tmv && <>
              <line x1={x} x2={x} y1={y(tmv.p90)} y2={y(tmv.p10)} className="v3p-hb__whisk" /><line x1={x - 5} x2={x + 5} y1={y(tmv.p90)} y2={y(tmv.p90)} className="v3p-hb__whisk" /><line x1={x - 5} x2={x + 5} y1={y(tmv.p10)} y2={y(tmv.p10)} className="v3p-hb__whisk" />
              <rect x={x - 7} y={y(tmv.mean) - 7} width="9" height="9" transform={`rotate(45 ${x - 2.5} ${y(tmv.mean) - 2.5})`} className="v3p-hb__mean" />
            </>}
            <text x={x} y={T - 4} textAnchor="middle" className="v3p-hb__tn">TONIGHT</text>
            {!compact && tonight.logo && <image href={tonight.logo} x={x - 8} y={H - B + 8} width="16" height="16" />}
            {!compact && <text x={x} y={H - B + 33} textAnchor="middle" className={`v3p-hb__wk is-tn${/\//.test(tonight.label) ? ' is-date' : ''}`}>{tonight.label}</text>}
          </g>
        );
      })()}
      {ly != null && line != null && (
        <>
          <line x1={L} x2={W - R + 2} y1={ly} y2={ly} className="v3p-hb__line" />
          {p.scrubbing && rungYs.map((r) => <line key={r.line} x1={W - R - 2} x2={W - R + 4} y1={r.y} y2={r.y} className={`v3p-hb__rung${sameLine(r.line, line) ? ' is-on' : ''}`} />)}
          <g transform={`translate(${W - R + 5},${ly - 11})`} aria-hidden="true"><rect width="38" height="22" rx="6" className="v3p-hb__tag" /><text x="19" y="15" textAnchor="middle" className="v3p-hb__tagt">{p.fmt(line)}</text></g>
          {(p.scrubbing || focus) && <g aria-hidden="true"><circle cx={L + 70} cy={ly} r="15" className="v3p-hb__halo" /><circle cx={L + 70} cy={ly} r="8" className="v3p-hb__knob" /></g>}
        </>
      )}
    </svg>
    {canDrag && ly != null && line != null && (
      // The drag target is HTML, not SVG: `touch-action: none` is reliable on an element (iOS Safari included), and it covers the line's label and
      // gutter with a 44-point-high target that follows the line. Everywhere else on the chart the page pans normally.
      <div className="v3p-hb__grab" role="slider" tabIndex={0} aria-label="Line" aria-orientation="vertical" aria-valuemin={Math.min(...p.rungs)} aria-valuemax={Math.max(...p.rungs)} aria-valuenow={line} aria-valuetext={`Over ${p.fmt(line)}`}
        style={{ left: `${((W - R - 8) / W) * 100}%`, width: `${((R + 8) / W) * 100}%`, top: `${((ly - 22) / H) * 100}%`, height: `${(44 / H) * 100}%` }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} />
    )}
    </div>
  );
}

const shortDate = (d: string) => { const [, m, dd] = d.split('-'); return `${Number(m)}/${Number(dd)}`; };
