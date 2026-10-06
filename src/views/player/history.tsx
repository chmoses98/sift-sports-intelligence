// A player's season, game by game — Sift's history layer drawn for reading, not as a spreadsheet.
// Generic over the stat (history/stats.ts): any sport that publishes per-game rows and stat accessors can
// reuse these components. Layer 1: the chart against the line; layer 2: usage per game; layer 3: splits;
// layer 4: the full log table.
import { useState } from 'react';
import type { GameLogRow, PlayerHistoryDoc } from '../../history/types';
import { mean, roleShift, type StatDef } from '../../history/stats';
import { TeamMark } from '../../components/ui';

export interface UpcomingMark {
  projection: number;
  typical: [number, number];
  label: string;
}

const fmt1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/**
 * Bars per game (oldest → newest), the market line drawn across them, each bar marked over/under in words
 * and glyphs, and the upcoming game as a projection with its typical range.
 */
export function GameBars({ rows, stat, line, upcoming, sport = 'NFL' }: { rows: GameLogRow[]; stat: StatDef; line: number | null; upcoming: UpcomingMark | null; sport?: string }) {
  const [sel, setSel] = useState<string | null>(null);
  const vals = rows.map((r) => ({ r, v: stat.get(r) })).filter((x): x is { r: GameLogRow; v: number } => x.v != null);
  const max = Math.max(1, ...vals.map((x) => x.v), line ?? 0, upcoming ? upcoming.typical[1] : 0) * 1.08;
  const pct = (v: number) => `${Math.max(0, (v / max) * 100)}%`;
  const picked = vals.find((x) => x.r.game_id === sel) ?? null;
  if (!vals.length) return <p className="muted small">No games with this stat yet this season.</p>;
  return (
    <div className="gbars">
      <div className="gbars__plot" role="group" aria-label={`${stat.label} by game${line != null ? `, against the line ${line}` : ''}`}>
        {line != null && <span className="gbars__line" style={{ bottom: pct(line) }} aria-hidden="true"><span>Line {line}</span></span>}
        {vals.map(({ r, v }) => {
          const over = line != null ? v > line : null;
          return (
            <button
              key={r.game_id}
              type="button"
              className={`gbars__b${over === true ? ' is-over' : over === false ? ' is-under' : ''}${sel === r.game_id ? ' is-sel' : ''}`}
              onClick={() => setSel(sel === r.game_id ? null : r.game_id)}
              aria-pressed={sel === r.game_id}
              aria-label={`Week ${r.week} ${r.home ? 'vs' : 'at'} ${r.opp}: ${fmt1(v)} ${stat.unit}${over != null ? (over ? ', over the line' : ', under the line') : ''}`}
            >
              <span className="gbars__v num" style={{ bottom: `calc(${pct(v)} + 4px)` }}>{fmt1(v)}{over === true ? ' ▲' : over === false ? ' ▼' : ''}</span>
              <span className="gbars__bar" style={{ height: pct(v) }} />
              <span className="gbars__x"><TeamMark sport={sport} abbr={r.opp} size="sm" /><span>W{r.week}</span></span>
            </button>
          );
        })}
        {upcoming && (
          <span className="gbars__b gbars__b--next" aria-label={`${upcoming.label}: projection ${fmt1(upcoming.projection)}, typical ${fmt1(upcoming.typical[0])} to ${fmt1(upcoming.typical[1])}`} role="img">
            <span className="gbars__v num" style={{ bottom: `calc(${pct(upcoming.typical[1])} + 4px)` }}>{fmt1(Math.round(upcoming.projection * 10) / 10)}</span>
            <span className="gbars__range" style={{ bottom: pct(upcoming.typical[0]), height: `calc(${pct(upcoming.typical[1])} - ${pct(upcoming.typical[0])})` }} />
            <span className="gbars__bar gbars__bar--proj" style={{ height: pct(upcoming.projection) }} />
            <span className="gbars__x"><span>Next</span></span>
          </span>
        )}
      </div>
      {picked ? <GameDetail r={picked.r} /> : <p className="gbars__hint">Tap a game for its box score and usage.</p>}
    </div>
  );
}

function GameDetail({ r }: { r: GameLogRow }) {
  const parts: string[] = [];
  if (r.passing && r.passing.att) parts.push(`${r.passing.cmp}/${r.passing.att}, ${r.passing.yds} pass yds, ${r.passing.td} TD, ${r.passing.int} INT`);
  if (r.rushing.car) parts.push(`${r.rushing.car} carries, ${r.rushing.yds} yds${r.rushing.td ? `, ${r.rushing.td} TD` : ''}`);
  if (r.receiving.tgt) parts.push(`${r.receiving.rec}/${r.receiving.tgt} targets, ${r.receiving.yds} rec yds${r.receiving.td ? `, ${r.receiving.td} TD` : ''}`);
  return (
    <div className="gdet">
      <b>Week {r.week} · {r.home ? 'vs' : 'at'} {r.opp}</b>
      {r.score && <span className="muted"> · {r.score.for > r.score.against ? 'W' : r.score.for < r.score.against ? 'L' : 'T'} {r.score.for}–{r.score.against}</span>}
      <div>{parts.join(' · ') || 'No offensive touches'}</div>
      <div className="muted small">{r.snaps ? `${r.snaps.off} offensive snaps (${Math.round((r.snaps.pct ?? 0) * 100)}%)` : 'Snap count not published yet'}{r.receiving.target_share != null ? ` · ${Math.round(r.receiving.target_share * 100)}% of team targets` : ''}</div>
    </div>
  );
}

const USAGE: { key: string; label: string; get: (g: GameLogRow) => number | null; fmt: (v: number) => string; pos: string[] }[] = [
  { key: 'snaps', label: 'Snap share', get: (g) => g.snaps?.pct ?? null, fmt: (v) => `${Math.round(v * 100)}%`, pos: ['QB', 'RB', 'WR', 'TE', 'FB'] },
  { key: 'att', label: 'Pass attempts', get: (g) => g.passing?.att ?? null, fmt: (v) => fmt1(v), pos: ['QB'] },
  { key: 'car', label: 'Carries', get: (g) => g.rushing.car, fmt: (v) => fmt1(v), pos: ['RB', 'QB', 'FB'] },
  { key: 'tgt', label: 'Targets', get: (g) => g.receiving.tgt, fmt: (v) => fmt1(v), pos: ['WR', 'TE', 'RB'] },
  { key: 'share', label: 'Target share', get: (g) => g.receiving.target_share, fmt: (v) => `${Math.round(v * 100)}%`, pos: ['WR', 'TE', 'RB'] },
];

/** Usage per game as small rows of numbers with the season average, plus any material role change. */
export function UsageRows({ rows, pos }: { rows: GameLogRow[]; pos: string }) {
  const shift = roleShift(rows);
  const use = USAGE.filter((u) => u.pos.includes(pos));
  return (
    <div className="usage">
      {shift && (
        <p className="usage__shift">
          <b>Role change:</b> {shift.metric} {shift.metric === 'carries' ? `${fmt1(Math.round(shift.from * 10) / 10)} → ${fmt1(Math.round(shift.to * 10) / 10)} per game` : `${Math.round(shift.from * 100)}% → ${Math.round(shift.to * 100)}%`} since week {shift.sinceWeek}.
        </p>
      )}
      <div className="tscroll">
        <table className="usage__t">
          <thead>
            <tr><th scope="col">Per game</th>{rows.map((r) => <th key={r.game_id} scope="col" className="r">W{r.week} <span className="muted">{r.opp}</span></th>)}<th scope="col" className="r">Avg</th></tr>
          </thead>
          <tbody>
            {use.map((u) => {
              const vs = rows.map((r) => u.get(r));
              const m = mean(vs.filter((v): v is number => v != null));
              return (
                <tr key={u.key}>
                  <th scope="row">{u.label}</th>
                  {vs.map((v, i) => <td key={rows[i].game_id} className="r num">{v == null ? '—' : u.fmt(v)}</td>)}
                  <td className="r num usage__avg">{m == null ? '—' : u.fmt(m)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Splits worth knowing: home/away for the selected stat, and the charted blitz split. */
export function Splits({ doc, rows, stat }: { doc: PlayerHistoryDoc; rows: GameLogRow[]; stat: StatDef }) {
  const avg = (rs: GameLogRow[]) => mean(rs.map((r) => stat.get(r)).filter((v): v is number => v != null));
  const home = rows.filter((r) => r.home === true);
  const away = rows.filter((r) => r.home === false);
  const b = doc.vs_blitz;
  const f = (v: number | null) => (v == null ? '—' : fmt1(Math.round(v * 10) / 10));
  const e = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`);
  return (
    <dl className="splits">
      <div><dt>{stat.label} at home</dt><dd className="num">{f(avg(home))}</dd><dd className="splits__n">{home.length} games</dd></div>
      <div><dt>{stat.label} on the road</dt><dd className="num">{f(avg(away))}</dd><dd className="splits__n">{away.length} games</dd></div>
      {b && doc.position === 'QB' && b.dropbacks_blitz > 0 && (
        <>
          <div><dt>EPA per dropback vs the blitz</dt><dd className="num">{e(b.epa_per_db_blitz)}</dd><dd className="splits__n">{b.dropbacks_blitz} dropbacks</dd></div>
          <div><dt>EPA per dropback, no blitz</dt><dd className="num">{e(b.epa_per_db_no_blitz)}</dd><dd className="splits__n">{b.dropbacks_no_blitz} dropbacks</dd></div>
        </>
      )}
      {b && doc.position !== 'QB' && b.team_targets_blitz != null && b.team_targets_no_blitz != null && b.team_targets_blitz + b.team_targets_no_blitz > 0 && (
        <>
          <div><dt>Share of targets vs the blitz</dt><dd className="num">{b.team_targets_blitz ? `${Math.round((b.targets_blitz / b.team_targets_blitz) * 100)}%` : '—'}</dd><dd className="splits__n">{b.targets_blitz} of {b.team_targets_blitz} team targets</dd></div>
          <div><dt>Share of targets, no blitz</dt><dd className="num">{b.team_targets_no_blitz ? `${Math.round((b.targets_no_blitz / b.team_targets_no_blitz) * 100)}%` : '—'}</dd><dd className="splits__n">{b.targets_no_blitz} of {b.team_targets_no_blitz}</dd></div>
        </>
      )}
    </dl>
  );
}

/** The deepest layer: every published number, one row per game. */
export function LogTable({ rows, pos }: { rows: GameLogRow[]; pos: string }) {
  const qb = pos === 'QB';
  return (
    <div className="tscroll">
      <table className="dtable logt">
        <caption className="sr-only">Game log</caption>
        <thead>
          <tr>
            <th scope="col">Wk</th><th scope="col">Opp</th><th scope="col">Result</th><th scope="col" className="r">Snaps</th>
            {qb && <><th scope="col" className="r">Cmp/Att</th><th scope="col" className="r">Pass yds</th><th scope="col" className="r">TD</th><th scope="col" className="r">INT</th><th scope="col" className="r">Sk</th></>}
            <th scope="col" className="r">Car</th><th scope="col" className="r">Rush yds</th><th scope="col" className="r">Long</th>
            {!qb && <><th scope="col" className="r">Tgt</th><th scope="col" className="r">Rec</th><th scope="col" className="r">Rec yds</th><th scope="col" className="r">Long</th><th scope="col" className="r">Tgt %</th></>}
            <th scope="col" className="r">TD</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((r) => (
            <tr key={r.game_id}>
              <td>{r.week}</td><td>{r.home ? 'vs' : '@'} {r.opp}</td>
              <td>{r.score ? `${r.score.for > r.score.against ? 'W' : r.score.for < r.score.against ? 'L' : 'T'} ${r.score.for}–${r.score.against}` : '—'}</td>
              <td className="r num">{r.snaps ? `${r.snaps.off}` : '—'}</td>
              {qb && <><td className="r num">{r.passing ? `${r.passing.cmp}/${r.passing.att}` : '—'}</td><td className="r num">{r.passing?.yds ?? '—'}</td><td className="r num">{r.passing?.td ?? '—'}</td><td className="r num">{r.passing?.int ?? '—'}</td><td className="r num">{r.passing?.sacks ?? '—'}</td></>}
              <td className="r num">{r.rushing.car}</td><td className="r num">{r.rushing.yds}</td><td className="r num">{r.rushing.long ?? '—'}</td>
              {!qb && <><td className="r num">{r.receiving.tgt}</td><td className="r num">{r.receiving.rec}</td><td className="r num">{r.receiving.yds}</td><td className="r num">{r.receiving.long ?? '—'}</td><td className="r num">{r.receiving.target_share != null ? `${Math.round(r.receiving.target_share * 100)}%` : '—'}</td></>}
              <td className="r num">{r.rushing.td + r.receiving.td}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
