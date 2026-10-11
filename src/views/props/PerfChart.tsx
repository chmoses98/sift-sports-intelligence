// Game-log bars against TODAY's market line (d3-scale, drawn at real pixel width so labels stay legible on a phone).
// One bar per eligible game, oldest → newest; over = blue with ▲, under = red with ▼, push = gold with "=" (shape and
// glyph carry the result, not colour alone). The line is a dashed gold threshold. Hover, focus or tap a game for its
// opponent, date, value and result; ←/→ step through games from the keyboard. A table view sits one tap down.
import { scaleBand, scaleLinear } from 'd3-scale';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { TeamMark } from '../../components/ui';
import { useWidth } from '../../charts/useWidth';
import { lineText, type GameResult, type HitRate } from '../../history/hitRate';
import { gameTag } from '../../history/stats';

const M = { top: 26, right: 14, bottom: 8, left: 40 };
const fmt1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const day = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null);
const RESULT_WORD = { over: 'Over', under: 'Under', push: 'Push' } as const;
const GLYPH = { over: '▲', under: '▼', push: '=' } as const;

export interface ChartProjection {
  value: number;
  typical: [number, number] | null;
}

export function PerfChart({ h, statLabel, unit, season, sport = 'NFL', projection, height = 230 }: { h: HitRate; statLabel: string; unit: string; season: number; sport?: string; projection: ChartProjection | null; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const games = h.games;
  const [sel, setSel] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const active = hover ?? sel;
  const keys = useMemo(() => [...games.map((g) => g.row.game_id), ...(projection ? ['__next'] : [])], [games, projection]);
  const geo = useMemo(() => {
    const vals = [...games.map((g) => g.v), h.line, ...(projection ? [projection.value, ...(projection.typical ?? [])] : [])];
    const lo = Math.min(0, ...vals);
    const hi = Math.max(1, ...vals);
    const y = scaleLinear().domain([lo, hi * 1.08]).nice(4).range([height - M.bottom, M.top]);
    const x = scaleBand<string>().domain(keys).range([M.left, width - M.right]).paddingInner(keys.length > 12 ? 0.22 : 0.32).paddingOuter(0.12);
    return { x, y };
  }, [games, h.line, projection, keys, width, height]);
  if (!games.length) return <p className="fr-note">No games played in this window.</p>;
  const bw = Math.min(44, geo.x.bandwidth());
  const y0 = geo.y(0);
  const ly = geo.y(h.line);
  const dense = geo.x.bandwidth() < 22;
  const cx = (k: string) => (geo.x(k) ?? 0) + geo.x.bandwidth() / 2;
  const pick = (i: number) => setSel(sel === i ? null : i);
  const onKey = (e: KeyboardEvent) => {
    const i = sel ?? games.length;
    if (e.key === 'ArrowRight') setSel(Math.min(games.length - 1, sel == null ? 0 : i + 1));
    else if (e.key === 'ArrowLeft') setSel(Math.max(0, i - 1));
    else if (e.key === 'Escape') setSel(null);
    else return;
    e.preventDefault();
  };
  const act: GameResult | null = active != null ? games[active] ?? null : null;
  const tipLeft = act ? Math.min(width - 190, Math.max(4, cx(act.row.game_id) - 95)) : 0;
  const ticks = geo.y.ticks(4);
  return (
    <figure className="pchart">
      <div ref={ref} className="pchart__plot" tabIndex={0} onKeyDown={onKey} role="group"
        aria-label={`${statLabel} in each game against today's line of ${lineText(h.line)}. Use left and right arrows to read each game.`}>
        <svg width={width} height={height} role="img" aria-label={`${statLabel}: ${h.over} of ${h.n} games over ${lineText(h.line)}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={geo.y(t)} y2={geo.y(t)} className={t === 0 ? 'pchart__zero' : 'pchart__grid'} />
              <text x={M.left - 8} y={geo.y(t)} className="pchart__tick" textAnchor="end" dominantBaseline="middle">{fmt1(t)}</text>
            </g>
          ))}
          {games.map((g, i) => {
            const k = g.row.game_id;
            const top = Math.min(geo.y(g.v), y0);
            const hgt = Math.max(2, Math.abs(geo.y(g.v) - y0));
            return (
              <g key={k} className={`pchart__g pchart__g--${g.result}${active === i ? ' is-act' : ''}`}>
                <rect x={cx(k) - bw / 2} y={top} width={bw} height={hgt} rx={Math.min(4, bw / 3)} className="pchart__bar" />
                {(!dense || active === i) && <text x={cx(k)} y={Math.min(geo.y(g.v), y0) - 6} className="pchart__val" textAnchor="middle">{fmt1(g.v)} {GLYPH[g.result]}</text>}
                <rect x={(geo.x(k) ?? 0) - (geo.x.step() - geo.x.bandwidth()) / 2} y={M.top - 20} width={geo.x.step()} height={height - M.top - M.bottom + 20} className="pchart__hit"
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => pick(i)} />
              </g>
            );
          })}
          {projection && (() => {
            const k = '__next';
            const t = projection.typical;
            return (
              <g className="pchart__next">
                {t && <rect x={cx(k) - bw / 2} y={geo.y(t[1])} width={bw} height={Math.max(2, geo.y(t[0]) - geo.y(t[1]))} rx={4} className="pchart__band" />}
                <line x1={cx(k) - bw / 2 - 3} x2={cx(k) + bw / 2 + 3} y1={geo.y(projection.value)} y2={geo.y(projection.value)} className="pchart__proj" />
                <text x={cx(k)} y={geo.y(t ? t[1] : projection.value) - 6} className="pchart__val pchart__val--proj" textAnchor="middle">{fmt1(Math.round(projection.value * 10) / 10)}</text>
              </g>
            );
          })()}
          <line x1={M.left} x2={width - M.right} y1={ly} y2={ly} className="pchart__line" />
          <text x={width - M.right} y={ly - 6} className="pchart__lineLab" textAnchor="end">Line {lineText(h.line)}</text>
          {act && <line x1={cx(act.row.game_id)} x2={cx(act.row.game_id)} y1={M.top - 14} y2={height - M.bottom} className="pchart__cross" />}
        </svg>
        <div className="pchart__x" aria-hidden="true">
          {games.map((g) => (
            <span key={g.row.game_id} style={{ left: cx(g.row.game_id), width: Math.max(28, geo.x.step()) }} className="pchart__xl">
              {!dense && <TeamMark sport={sport} abbr={g.row.opp} size="sm" />}
              <span>{dense ? g.row.opp : gameTag(g.row, season)}</span>
            </span>
          ))}
          {projection && <span style={{ left: cx('__next'), width: Math.max(28, geo.x.step()) }} className="pchart__xl pchart__xl--next"><span>Next</span></span>}
        </div>
        {act && (
          <div className="pchart__tip" style={{ left: tipLeft }} role="status">
            <b>{act.row.season != null && act.row.season !== season ? `${act.row.season} · ` : ''}{gameTag(act.row, season)} · {act.row.home ? 'vs' : 'at'} {act.row.opp}</b>
            {day(act.row.date) && <span className="pchart__tipd">{day(act.row.date)}{act.row.score ? ` · ${act.row.score.for > act.row.score.against ? 'W' : act.row.score.for < act.row.score.against ? 'L' : 'T'} ${act.row.score.for}–${act.row.score.against}` : ''}</span>}
            <span className={`pchart__tipv pchart__tipv--${act.result}`}><span className="num">{fmt1(act.v)}</span> {unit} · {RESULT_WORD[act.result]} {lineText(h.line)}</span>
          </div>
        )}
      </div>
      <figcaption className="pchart__legend">
        <span className="pchart__lg pchart__lg--over">▲ Over</span>
        <span className="pchart__lg pchart__lg--under">▼ Under</span>
        {h.push > 0 && <span className="pchart__lg pchart__lg--push">= Push</span>}
        <span className="pchart__lg pchart__lg--line">Today’s line</span>
        {projection && <span className="pchart__lg pchart__lg--proj">Projection{projection.typical ? ' · middle 50%' : ''}</span>}
      </figcaption>
      <details className="tableview">
        <summary>Table view ({games.length} games)</summary>
        <div className="tscroll">
          <table className="dtable">
            <thead><tr><th scope="col">Game</th><th scope="col">Date</th><th scope="col">Opponent</th><th scope="col" className="r">{statLabel}</th><th scope="col">vs {lineText(h.line)}</th></tr></thead>
            <tbody>
              {[...games].reverse().map((g) => (
                <tr key={g.row.game_id}>
                  <td>{g.row.season != null && g.row.season !== season ? `${g.row.season} ` : ''}{gameTag(g.row, season)}</td>
                  <td>{day(g.row.date) ?? '—'}</td>
                  <td>{g.row.home ? 'vs' : 'at'} {g.row.opp}</td>
                  <td className="r num">{fmt1(g.v)}</td>
                  <td>{RESULT_WORD[g.result]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
