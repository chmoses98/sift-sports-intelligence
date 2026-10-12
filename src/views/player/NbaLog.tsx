// The NBA player page's history (backlog 1.1, 1.2): the publication's own game log and the record against the
// Kalshi lines that were actually posted for him. Every figure is a published field or plain arithmetic on one
// (averages over games played, counts of settled lines); nothing is projected and no probability is shown.
import { useState } from 'react';
import type { EntityProfileDoc } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { num, readBoxLog, type BoxRow } from '../../history/boxLog';
import { NBA_STAT_LABEL, nbaLatestSeason, nbaSeasonAverages, postedRecord, readPropLog } from '../../history/nbaLog';

/* eslint-disable @typescript-eslint/no-explicit-any */

const day = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
};
/** A tip time (UTC) as its Eastern calendar date, the date the box log uses. */
const etDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const r1 = (v: number | null) => (v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1));
const cents = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
const n0 = (v: unknown) => (num(v) == null ? '—' : String(Math.round(num(v)!)));

const COLS: [key: string, label: string, title: string][] = [
  ['min', 'MIN', 'Minutes'], ['pts', 'PTS', 'Points'], ['reb', 'REB', 'Rebounds'], ['ast', 'AST', 'Assists'], ['fg3m', '3PM', '3-pointers made'],
  ['stl', 'STL', 'Steals'], ['blk', 'BLK', 'Blocks'], ['tov', 'TOV', 'Turnovers'], ['plus_minus', '+/−', 'Plus-minus'],
];

function typeWord(t: unknown) {
  return t === 'playoffs' ? 'Playoffs' : t === 'preseason' ? 'Preseason' : t === 'play-in' ? 'Play-in' : '';
}

function LogRow({ r }: { r: BoxRow }) {
  const opp = `${r.home === true ? 'vs' : r.home === false ? '@' : ''} ${String(r.opp ?? '')}`.trim();
  const tw = typeWord(r.season_type);
  if (r.played === false) {
    return (
      <tr className="nbalog__dnp">
        <th scope="row">{day(String(r.date_et ?? ''))}</th>
        <td>{opp}{tw && <small className="muted"> · {tw}</small>}</td>
        <td colSpan={COLS.length + 1} className="muted small">Did not play{r.dnp_reason ? ` · ${String(r.dnp_reason).toLowerCase()}` : ''}</td>
      </tr>
    );
  }
  return (
    <tr>
      <th scope="row">{day(String(r.date_et ?? ''))}</th>
      <td>{opp}{tw && <small className="muted"> · {tw}</small>}</td>
      {COLS.map(([k]) => <td key={k} className="r fx-num">{k === 'plus_minus' && (num(r[k]) ?? 0) > 0 ? `+${n0(r[k])}` : n0(r[k])}</td>)}
      <td className="r fx-num">{num(r.fgm) != null && num(r.fga) != null ? `${r.fgm}-${r.fga}` : '—'}</td>
    </tr>
  );
}

export function NbaPlayerHistory({ p }: { p: EntityProfileDoc }) {
  const ext = (p.extensions ?? {}) as any;
  const rows = readBoxLog(ext.game_log) ?? [];
  const lines = readPropLog(ext.prop_log);
  const [all, setAll] = useState(false);
  if (!rows.length && !lines.length) return null;
  const season = nbaLatestSeason(rows);
  const avg = season ? nbaSeasonAverages(rows, season) : null;
  const newest = [...rows].reverse();
  const shown = all ? newest : newest.slice(0, 10);
  const record = postedRecord(lines);
  const byEvent = new Map(rows.map((r) => [String(r.event_id ?? ''), r]));
  const recent = lines.filter((l) => l.outcome != null).slice(0, 10);
  const name = p.entity.display_name;
  const limits = Array.isArray(ext.prop_log?.limitations) ? ext.prop_log.limitations.filter((x: unknown) => typeof x === 'string').join('; ') : '';
  return (
    <>
      {rows.length > 0 && (
        <section className="fx-card nbalog" aria-labelledby="nbalog-h">
          <h2 className="fx-card__t" id="nbalog-h"><Icon name="chart" size={17} /> Game log</h2>
          {avg && avg.games > 0 && (
            <dl className="fr-tiles nbalog__avg" aria-label={`${avg.season} regular-season averages`}>
              <div className="fr-tile"><dt>Games</dt><dd className="fx-num">{avg.games}</dd><dd className="fr-tile__s">{avg.season} regular season</dd></div>
              {(['min', 'pts', 'reb', 'ast', 'fg3m'] as const).map((k) => <div key={k} className="fr-tile"><dt>{NBA_STAT_LABEL[k]}</dt><dd className="fx-num">{r1(avg.avg[k])}</dd><dd className="fr-tile__s">per game</dd></div>)}
            </dl>
          )}
          <div className="lab__tw" tabIndex={0} role="region" aria-label={`${name} game log`}>
            <table className="fr-t nbalog__t">
              <thead><tr><th scope="col">Date</th><th scope="col">Opp</th>{COLS.map(([k, l, t]) => <th key={k} scope="col" className="r"><abbr title={t}>{l}</abbr></th>)}<th scope="col" className="r"><abbr title="Field goals made-attempted">FG</abbr></th></tr></thead>
              <tbody>{shown.map((r, i) => <LogRow key={`${String(r.event_id ?? i)}`} r={r} />)}</tbody>
            </table>
          </div>
          {newest.length > 10 && <button type="button" className="btn btn--sm nbalog__more" aria-expanded={all} onClick={() => setAll((x) => !x)}>{all ? 'Show the last 10' : `Show all ${newest.length} games`}</button>}
          <p className="fr-note">Newest first, from the NBA publication’s box scores ({newest.length} team games, games he missed included). Averages are regular-season games he played{avg ? ` in ${avg.season}` : ''}; playoffs and preseason are left out.</p>
        </section>
      )}
      {record.length > 0 && (
        <section className="fx-card nbalog" aria-labelledby="nbalines-h">
          <h2 className="fx-card__t" id="nbalines-h"><Icon name="layers" size={17} /> Against the lines Kalshi posted</h2>
          <p className="fx-card__sub">Unlike a hit rate against today’s line, these are the lines that were actually listed for {name} on the day (one per game, the rung priced nearest 50¢), with the over’s mid 30 minutes before tip.</p>
          <div className="lab__tw" tabIndex={0} role="region" aria-label="Record against posted lines">
            <table className="fr-t">
              <thead><tr><th scope="col">Stat</th><th scope="col" className="r">Settled lines</th><th scope="col" className="r">Over</th><th scope="col" className="r">Under</th><th scope="col" className="r">Average line</th><th scope="col" className="r">Average over mid, T−30m</th></tr></thead>
              <tbody>{record.map((x) => (
                <tr key={x.stat}>
                  <th scope="row">{NBA_STAT_LABEL[x.stat] ?? x.stat}</th>
                  <td className="r fx-num">{x.n}</td>
                  <td className="r fx-num"><b>{x.over}</b></td>
                  <td className="r fx-num">{x.under}</td>
                  <td className="r fx-num">{r1(x.avgLine)}</td>
                  <td className="r fx-num">{cents(x.avgMid)}{x.midN < x.n ? <small className="muted"> ({x.midN} priced)</small> : null}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {recent.length > 0 && (
            <>
              <h3 className="nfsec__h nbalog__sub">Most recent posted lines</h3>
              <div className="lab__tw" tabIndex={0} role="region" aria-label="Most recent posted lines">
                <table className="fr-t nbalog__rt">
                  <thead><tr><th scope="col">Date</th><th scope="col">Stat</th><th scope="col" className="r">Line</th><th scope="col" className="r">Over mid, T−30m</th><th scope="col" className="r">His result</th><th scope="col">Settled</th></tr></thead>
                  <tbody>{recent.map((l) => {
                    const g = byEvent.get(l.eventId);
                    return (
                      <tr key={`${l.eventId}-${l.stat}`}>
                        <th scope="row">{day(g?.date_et ? String(g.date_et) : etDay(l.tip))}{g ? <small className="muted"> {g.home === true ? 'vs' : '@'} {String(g.opp ?? '')}</small> : null}</th>
                        <td>{NBA_STAT_LABEL[l.stat] ?? l.stat}</td>
                        <td className="r fx-num">{l.line}</td>
                        <td className="r fx-num">{cents(l.mid)}</td>
                        <td className="r fx-num">{g ? n0(g[l.stat]) : '—'}</td>
                        <td><span className={`hsum2__chip hsum2__chip--${l.outcome === 1 ? 'over' : 'under'}`}>{l.outcome === 1 ? '▲ Over' : '▼ Under'}</span></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </>
          )}
          <p className="fr-note">Settled outcomes as published, {lines.length} posted line{lines.length === 1 ? '' : 's'} on record{limits ? ` · the publication notes: ${limits}` : ''}. A record against past lines, not a probability for the next one.</p>
        </section>
      )}
    </>
  );
}
