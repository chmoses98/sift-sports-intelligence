// DEPTH CHART — each team's skill players the way a broadcast shows them: position groups (QB, RB, WR, TE),
// starters first, each with his depth slot, injury designation when one is published, this game's projection and
// his season per game from the game logs (games before this one only). The depth order is the publication's
// captured depth chart (Sleeper) — a stated intention, not measured snaps — and the page says so.
import { useMemo } from 'react';
import { Link } from '../../routing';
import type { EventResearchDoc } from '../../contract/types';
import { PlayerFace } from '../../components/insight';
import { TeamMark } from '../../components/ui';
import { nameKey } from '../../insights/context';
import type { Side } from '../../insights/game';
import { pregameRows } from '../../history/stats';
import type { GameLogRow, PlayerHistoryDoc } from '../../history/types';
import { statusWord } from '../../lib/nfl';
import { playerPhoto } from '../../lib/players';
import { routes } from '../../lib/routes';
import { teamAccent } from '../../lib/teams';
import { usePropHistories } from '../game/matters';
import '../../styles/lane-c-views.css';

interface LineupRow { player?: string; position?: string; slot?: string; depth_chart_order?: number | null; injury_status?: string | null; status?: string | null; team?: string }

export interface DepthPlayer {
  name: string;
  pos: string;
  slot: string;
  order: number | null;
  starter: boolean;
  pid: string | null;
  injury: string | null;
  /** On the publication's projection list but not on the captured depth chart. */
  projectedOnly: boolean;
}

const GROUPS: { pos: string; title: string }[] = [
  { pos: 'QB', title: 'Quarterbacks' },
  { pos: 'RB', title: 'Running backs' },
  { pos: 'WR', title: 'Wide receivers' },
  { pos: 'TE', title: 'Tight ends' },
];
const SLOT_ORDER = ['QB', 'RB', 'LWR', 'RWR', 'SWR', 'WR', 'TE'];
const NOT_RISK = new Set(['ACTIVE', 'PROBABLE', '']);

function injuryOf(r: EventResearchDoc, name: string, lineup: string | null | undefined): string | null {
  const row = (r.context?.injuries ?? []).find((i) => (i.detail ?? '').startsWith(`${name} (`));
  if (row && !NOT_RISK.has(row.status)) return row.status;
  if (lineup && !/^active$/i.test(lineup)) return lineup.toUpperCase().replace(/\s+/g, '_');
  return null;
}

/** The depth chart for one team, grouped and ordered (pure). */
export function depthChart(r: EventResearchDoc, team: Side): { pos: string; title: string; players: DepthPlayer[] }[] {
  const rows = ((r.context?.lineups ?? []) as LineupRow[]).filter((l) => l.team === team.abbr && l.player && l.position);
  const pids = new Map(r.players.filter((p) => p.team_id === team.pid).map((p) => [nameKey(p.display_name), p]));
  const seen = new Set<string>();
  const out = GROUPS.map((g) => {
    const players: DepthPlayer[] = rows
      .filter((l) => l.position === g.pos)
      .sort((a, b) => (a.depth_chart_order ?? 9) - (b.depth_chart_order ?? 9) || SLOT_ORDER.indexOf(a.slot ?? '') - SLOT_ORDER.indexOf(b.slot ?? ''))
      .map((l, i) => {
        const key = nameKey(l.player!);
        seen.add(key);
        return {
          name: l.player!, pos: g.pos, slot: l.slot ?? g.pos, order: l.depth_chart_order ?? null,
          // Three receivers start: the first three by depth order (the depth chart numbers receivers either per
          // slot — LWR1, RWR1, SWR1 — or as one list). One quarterback, back and tight end.
          starter: g.pos === 'WR' ? i < 3 && (l.depth_chart_order ?? 9) <= 3 : l.depth_chart_order === 1,
          pid: pids.get(key)?.participant_id ?? null,
          injury: injuryOf(r, l.player!, l.injury_status),
          projectedOnly: false,
        };
      });
    for (const [key, p] of pids) {
      if (p.role === g.pos && !seen.has(key)) {
        players.push({ name: p.display_name, pos: g.pos, slot: g.pos, order: null, starter: false, pid: p.participant_id, injury: injuryOf(r, p.display_name, null), projectedOnly: true });
        seen.add(key);
      }
    }
    return { ...g, players };
  });
  return out.filter((g) => g.players.length);
}

const MAIN: Record<string, { sim: string; label: string; unit: string }[]> = {
  QB: [{ sim: 'met_nfl.sim_passing_yards', label: 'pass yds', unit: 'yds' }, { sim: 'met_nfl.sim_rushing_yards', label: 'rush yds', unit: 'yds' }],
  RB: [{ sim: 'met_nfl.sim_rushing_yards', label: 'rush yds', unit: 'yds' }, { sim: 'met_nfl.sim_carries', label: 'carries', unit: 'car' }],
  WR: [{ sim: 'met_nfl.sim_receiving_yards', label: 'rec yds', unit: 'yds' }, { sim: 'met_nfl.sim_receptions', label: 'rec', unit: 'rec' }],
  TE: [{ sim: 'met_nfl.sim_receiving_yards', label: 'rec yds', unit: 'yds' }, { sim: 'met_nfl.sim_receptions', label: 'rec', unit: 'rec' }],
};

function seasonLine(pos: string, rows: GameLogRow[]): string | null {
  if (!rows.length) return null;
  const n = rows.length;
  const avg = (f: (g: GameLogRow) => number) => rows.reduce((a, g) => a + f(g), 0) / n;
  const f1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
  if (pos === 'QB') return `${Math.round(avg((g) => g.passing?.yds ?? 0))} pass yds · ${f1(avg((g) => g.passing?.td ?? 0))} TD · ${f1(avg((g) => g.passing?.int ?? 0))} INT per game`;
  if (pos === 'RB') return `${Math.round(avg((g) => g.rushing.yds))} rush yds · ${f1(avg((g) => g.rushing.car))} carries · ${f1(avg((g) => g.receiving.rec))} rec per game`;
  return `${f1(avg((g) => g.receiving.rec))} rec · ${Math.round(avg((g) => g.receiving.yds))} yds · ${f1(avg((g) => g.receiving.tgt))} targets per game`;
}

export function DepthChart({ r, teams, slug, sport = 'NFL' }: { r: EventResearchDoc; teams: Side[]; slug: string; sport?: string }) {
  const charts = useMemo(() => teams.map((t) => ({ t, groups: depthChart(r, t) })), [r, teams]);
  const players = useMemo(() => charts.flatMap((c) => c.groups.flatMap((g) => g.players.filter((p) => p.starter || p.order === 2 || p.projectedOnly).map((p) => ({ name: p.name, team: c.t.abbr })))), [charts]);
  const hist = usePropHistories(sport, players);
  const week = Number((r.event as unknown as { extensions?: { week?: number } }).extensions?.week ?? NaN);
  const season = (p: DepthPlayer, team: string) => {
    const h: PlayerHistoryDoc | null | undefined = hist.get(`${nameKey(p.name)}|${team}`);
    if (!h) return null;
    const rows = pregameRows(h, r.event.start_time_utc, Number.isFinite(week) ? week : null).current;
    const line = seasonLine(p.pos, rows);
    return line ? { line, games: rows.length } : null;
  };
  const proj = (p: DepthPlayer) => {
    if (!p.pid) return null;
    const parts = (MAIN[p.pos] ?? []).map((m) => ({ m, d: r.distributions.find((d) => d.entity_id === p.pid && d.metric_id === m.sim) })).filter((x) => x.d?.mean != null);
    return parts.length ? parts.map((x) => `${x.m.unit === 'rec' ? (Math.round(x.d!.mean! * 10) / 10).toFixed(1) : Math.round(x.d!.mean!)} ${x.m.label}`).join(' · ') : null;
  };
  return (
    <div className={`dch${teams.length > 1 ? ' dch--two' : ''}`}>
      {charts.map(({ t, groups }) => (
        <section key={t.abbr} className="dch__team" aria-labelledby={`dch-${t.abbr}`} style={{ ['--tc' as string]: teamAccent(sport, t.abbr) }}>
          <h3 className="dch__th" id={`dch-${t.abbr}`}><TeamMark sport={sport} abbr={t.abbr} size="md" /> {t.city ? `${t.city} ` : ''}{t.nick}</h3>
          {groups.map((g) => (
            <div key={g.pos} className="dch__g">
              <h4 className="dch__gh">{g.title}</h4>
              <ol className="dch__l">
                {g.players.map((p) => {
                  const s = p.starter || p.order === 2 || p.projectedOnly ? season(p, t.abbr) : null;
                  const pr = proj(p);
                  const body = (
                    <>
                      <span className="dch__slot">{p.projectedOnly ? '—' : `${p.slot}${p.order ?? ''}`}</span>
                      {p.starter && <PlayerFace photo={playerPhoto(p.pid ?? '', p.name, t.abbr)} team={t.abbr} sport={sport} size="sm" />}
                      <span className="dch__who">
                        <b>{p.name}</b>
                        {p.starter && <span className="dch__st">Starter</span>}
                        {p.injury && <span className={`pl__inj pl__inj--${p.injury.toLowerCase()}`}>{statusWord(p.injury)}</span>}
                        {pr && <small className="dch__proj">This game: {pr} <span className="muted">(projection)</span></small>}
                        {s && <small className="dch__ssn">Season: {s.line} <span className="muted">({s.games} {s.games === 1 ? 'game' : 'games'})</span></small>}
                        {p.projectedOnly && <small className="muted">Projected by the publication; not on the captured depth chart</small>}
                      </span>
                    </>
                  );
                  return (
                    <li key={p.name} className={`dch__p${p.starter ? ' is-starter' : ''}${p.injury ? ' is-hurt' : ''}`}>
                      {p.pid ? <Link to={routes.player(slug, p.pid)} className="dch__a">{body}</Link> : <span className="dch__a">{body}</span>}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
          {!groups.length && <p className="muted small">No depth chart is published for {t.nick} in this game.</p>}
        </section>
      ))}
    </div>
  );
}
