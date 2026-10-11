// THE COMBINED PROP EXPLORER (approved reference 03) — every published NFL player prop, filterable from a player rail
// (team toggle, prop-type chips, search, faces), with one selected prop analysed in full:
//   HEADER        the market line with both asks, the simulation's projection and the projection − line gap — the
//                 last two only where the publication simulates the stat (labelled research)
//   DISTRIBUTION  the simulation's five published quantiles drawn as blocks (components/fxResearch QuantileDist),
//                 with the line and projection marked; no bell curve is fitted and no probability is read off it
//   SIFT READ     the board's own reasons and the first published risk
//   RECENT FORM   the player's real game logs against today's line (Last 5 · Last 10 · season · last season)
//   MATCHUP       his offense's published unit ranks against the opponent's, unit by unit
//   SCRIPTS       his team's simulated volume in each final-margin script — team volume, never a player projection
//   LADDER        every rung with the captured asks, the main line lit, and the capture's age
// Selection lives in the address, so changing the prop replaces every panel at once (nothing from the previous prop
// stays on screen). Built on the game prop board (src/insights/propBoard.ts): no probability is derived from a mean;
// the shadow model's P(over) appears only where the publication priced it, labelled research.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { BoardItem, EventResearchDoc } from '../../contract/types';
import { useAsync } from '../../data/hooks';
import { Icon } from '../../components/Icon';
import { PlayerFace } from '../../components/insight';
import { SaveButton, Skeleton, TeamMark } from '../../components/ui';
import { VsBar } from '../../components/fx';
import { CapabilityState, FreshChip, QuantileDist, ShareBar, type QPoint } from '../../components/fxResearch';
import { pregameRows, statDef } from '../../history/stats';
import { HIT_WINDOWS, hitRate, hitWindowLabel, hitWindows, hitWindowShort, windowGames, type HitRate, type HitWindow } from '../../history/hitRate';
import type { PlayerHistoryDoc } from '../../history/types';
import { fmtValue, PROP_FAMILY_LABEL, PROP_FAMILY_ORDER, PROP_READ_WORD, propBoard, type PropFamily, type PropRow } from '../../insights/propBoard';
import { matchupObs, type Side } from '../../insights/game';
import { playerPhoto } from '../../lib/players';
import { rankView } from '../../lib/rank';
import { routes } from '../../lib/routes';
import { gameScripts, sharePct, type ScriptSet, type TeamVolume } from '../../lib/scripts';
import { teamColors } from '../../lib/teams';
import { useNow } from '../../live/hooks';
import { useSport } from '../../state/sport';
import { EXPLORE_STEP, useVisit } from '../../state/trail';
import { MarketCarousel } from '../props/MarketCarousel';
import { HitDots, HitSummary } from '../props/HitRate';
import { PerfChart } from '../props/PerfChart';
import { groupByPlayer, matchupSentence, NOT_IN_HISTORY, roleDisagreement, supportMetrics } from '../props/model';
import { histKey, usePropHits } from '../props/useHits';
import '../../styles/lane-b-props.css';

const cents = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const BANDS = [
  { id: 'long', label: 'Over ≤ 35¢', test: (a: number) => a <= 0.35 },
  { id: 'mid', label: '36–64¢', test: (a: number) => a > 0.35 && a < 0.65 },
  { id: 'short', label: 'Over ≥ 65¢', test: (a: number) => a >= 0.65 },
] as const;
const READS = ['ABOVE', 'BELOW', 'ON'] as const;

function gameLabel(b: BoardItem) {
  const a = b.participants.find((p) => p.participant_id === b.away_participant)?.short_name;
  const h = b.participants.find((p) => p.participant_id === b.home_participant)?.short_name;
  return `${a} @ ${h}`;
}

function NflExplorer() {
  const { repo, slug, sport } = useSport();
  const now = useNow(60_000);
  const [sp, setSp] = useSearchParams();
  const board = useAsync(`props:board:${repo.source.root}`, () => repo.board());
  const games = useMemo(() => (board.data?.items ?? []).filter((b) => Date.parse(b.start_time_utc) > now - 3 * 3600_000 && Date.parse(b.start_time_utc) < now + 8 * 86_400_000).sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc)), [board.data, now]);
  const gameId = sp.get('game') ?? games[0]?.event_id ?? null;
  const game = games.find((g) => g.event_id === gameId) ?? null;
  const data = useAsync(gameId ? `props:game:${gameId}` : null, async () => {
    const [r, d] = await Promise.all([repo.eventResearch(gameId!), repo.eventDetail(gameId!)]);
    return { r, b: propBoard(r, d), scripts: gameScripts(r) };
  });
  const set = (patch: Record<string, string | null>, push = false) => setSp((prev) => { const n = new URLSearchParams(prev); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); } return n; }, { replace: !push });
  const fam = (sp.get('cat') as PropFamily | null) ?? null;
  const team = sp.get('team');
  const pos = sp.get('pos');
  const read = sp.get('read');
  const band = sp.get('band');
  const q = (sp.get('q') ?? '').trim().toLowerCase();
  const priced = sp.get('priced') !== '0';
  const winParam = sp.get('win') as HitWindow | null;
  const win: HitWindow = winParam && HIT_WINDOWS.includes(winParam) ? winParam : 'last10';
  const rows = useMemo(() => data.data?.b.rows ?? [], [data.data]);
  const positions = [...new Set(rows.map((r) => r.role).filter(Boolean))] as string[];
  const shown = rows.filter((r) => (!fam || r.family === fam) && (!team || r.team.abbr === team) && (!pos || r.role === pos) && (!read || r.read === read) && (!priced || r.main) && (!q || r.name.toLowerCase().includes(q)) && (!band || (r.main?.yesAsk != null && BANDS.find((b) => b.id === band)!.test(r.main.yesAsk))));
  const groups = groupByPlayer(shown);
  const selId = sp.get('prop');
  const sel = shown.find((r) => r.id === selId) ?? (selId ? rows.find((r) => r.id === selId) : undefined) ?? groups[0]?.lead ?? null;
  // Every market of the selected player (priced or not), so his carousel is complete whatever the rail's filters.
  const selRows = useMemo(() => (sel ? groupByPlayer(rows.filter((r) => r.playerId === sel.playerId))[0]?.rows ?? [] : []), [rows, sel]);
  const { docs, hits, loading: histLoading } = usePropHits(sport.code, rows, game?.start_time_utc ?? null, win);
  const season = [...docs.values()].find(Boolean)?.season ?? (game ? new Date(game.start_time_utc).getFullYear() : new Date().getFullYear());
  const winName = hitWindowLabel(win, season, [...docs.values()].find((d) => d?.prior)?.prior?.season ?? null);
  const teams = data.data ? [data.data.b.rows[0]?.team, data.data.b.rows[0]?.opp].filter((t): t is Side => !!t).sort((a, b) => Number(a.home) - Number(b.home)) : [];
  const pickRow = (r: PropRow) => set({ prop: r.id }, true);
  const [more, setMore] = useState(false);
  return (
    <>
      <div className="pex__games gtabs2" role="group" aria-label="Game">
        {games.map((g) => <button key={g.event_id} type="button" className={`gtab${g.event_id === gameId ? ' is-on' : ''}`} aria-pressed={g.event_id === gameId} onClick={() => set({ game: g.event_id, prop: null, team: null, pos: null, q: null }, true)}>{gameLabel(g)}<small>{new Date(g.start_time_utc).toLocaleDateString(undefined, { weekday: 'short' })}</small></button>)}
      </div>
      {!games.length && !board.loading && <div className="bempty"><h3>No upcoming NFL games listed</h3><p>The prop explorer reads the coming week’s games.</p></div>}
      <div className="pex fr-pex">
        <aside className="pex__side fr-rail" aria-label="Filters and players">
          <div className="pex__filters">
            {teams.length === 2 && (
              <div className="fr-teams" role="group" aria-label="Team">
                <button type="button" className={`fr-team${!team ? ' is-on' : ''}`} aria-pressed={!team} onClick={() => set({ team: null, prop: null })}>Both</button>
                {teams.map((t) => (
                  <button key={t.abbr} type="button" className={`fr-team${team === t.abbr ? ' is-on' : ''}`} aria-pressed={team === t.abbr} onClick={() => set({ team: team === t.abbr ? null : t.abbr, prop: null })} style={{ ['--tc' as string]: teamColors('NFL', t.abbr)[0] }}>
                    <TeamMark sport="NFL" abbr={t.abbr} size="sm" />{t.abbr}
                  </button>
                ))}
              </div>
            )}
            <label className="fr-search">
              <Icon name="search" size={16} />
              <span className="sr-only">Search players</span>
              <input type="search" placeholder="Search players…" value={sp.get('q') ?? ''} onChange={(e) => set({ q: e.target.value || null, prop: null })} />
            </label>
            <span className="fr-rail__k" id="pex-cat-k">Prop type</span>
            <div className="fr-chips" role="group" aria-labelledby="pex-cat-k">
              <button type="button" className={`fr-chip${!fam ? ' is-on' : ''}`} aria-pressed={!fam} onClick={() => set({ cat: null, prop: null })}>All <small>{rows.length}</small></button>
              {PROP_FAMILY_ORDER.filter((f) => data.data?.b.byFamily[f]).map((f) => <button key={f} type="button" className={`fr-chip${fam === f ? ' is-on' : ''}`} aria-pressed={fam === f} onClick={() => set({ cat: fam === f ? null : f, prop: null })}>{PROP_FAMILY_LABEL[f]} <small>{data.data?.b.byFamily[f]}</small></button>)}
            </div>
            <button type="button" className="pex__moreb" aria-expanded={more} aria-controls="pex-more" onClick={() => setMore((m) => !m)}><Icon name="sliders" size={15} /> {more ? 'Fewer filters' : 'More filters'}{pos || read || band || !priced ? <span className="pex__moren"> · {[pos, read, band, !priced ? 'all lines' : null].filter(Boolean).length} on</span> : null}</button>
            <div id="pex-more" className={`pex__more${more ? ' is-open' : ''}`}>
            <div className="pex__sels">
              <label className="term__sel"><span>Position</span>
                <select value={pos ?? ''} onChange={(e) => set({ pos: e.target.value || null, prop: null })}><option value="">All</option>{positions.map((p) => <option key={p} value={p}>{p}</option>)}</select>
              </label>
              <label className="term__sel"><span>Vs line</span>
                <select value={read ?? ''} onChange={(e) => set({ read: e.target.value || null, prop: null })}><option value="">Any</option>{READS.map((r) => <option key={r} value={r}>{PROP_READ_WORD[r]}</option>)}</select>
              </label>
              <label className="term__sel"><span>Price</span>
                <select value={band ?? ''} onChange={(e) => set({ band: e.target.value || null, prop: null })}><option value="">Any</option>{BANDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select>
              </label>
            </div>
            <label className="pex__chk"><input type="checkbox" checked={priced} onChange={(e) => set({ priced: e.target.checked ? null : '0', prop: null })} /> Priced lines only</label>
            </div>
          </div>
          {data.loading ? <Skeleton lines={8} /> : (
            <ol className="pex__list pex__players" aria-label={`${groups.length} players, ${shown.length} props`}>
              {groups.map((g) => {
                const on = sel?.playerId === g.playerId;
                return (
                  <li key={g.playerId} className={`pex__player${on ? ' is-on' : ''}`} style={{ ['--tc' as string]: teamColors('NFL', g.team.abbr)[0] }}>
                    <button type="button" className="pex__ph" aria-pressed={on} onClick={() => pickRow(g.rows.find((r) => r.id === sel?.id) ?? g.lead)}>
                      <PlayerFace photo={playerPhoto(g.playerId, g.name, g.team.abbr)} team={g.team.abbr} size="sm" />
                      <span className="pex__rb"><b>{g.name}</b><small>{g.team.abbr} {g.role ?? ''} · {g.rows.length} market{g.rows.length === 1 ? '' : 's'}{g.injury ? <span className="fr-inj"> · {g.injury.toLowerCase().replace(/_/g, ' ')}</span> : null}</small></span>
                      <Icon name="chevronRight" size={16} />
                    </button>
                    <MarketCarousel rows={g.rows} selectedId={sel?.id ?? null} onSelect={pickRow} hits={hits} hitLabel={winName} label={`${g.name} markets`} size="sm" pending={histLoading} />
                  </li>
                );
              })}
              {!groups.length && <li className="muted">No prop matches these filters.</li>}
            </ol>
          )}
        </aside>
        <div className="pex__main">
          {data.loading && <Skeleton lines={10} tall />}
          {sel && data.data && game && (
            <PropAnalysis key={sel.id} histLoading={histLoading} row={sel} playerRows={selRows} hits={hits} hist={docs.get(histKey(sel.name, sel.team.abbr)) ?? null} win={win} onWin={(w) => set({ win: w === 'last10' ? null : w })} onPick={pickRow}
              r={data.data.r} scripts={data.data.scripts} kickoff={game.start_time_utc} slug={slug} sportCode={sport.code} eventId={game.event_id} now={now} />
          )}
          {!data.loading && !sel && data.data && <div className="bempty"><h3>Pick a player</h3><p>Choose a player and one of his markets to see the full analysis.</p></div>}
        </div>
      </div>
    </>
  );
}

/** The matchup from the player's side: a strong opposing unit is unfavourable for him (red), a weak one favourable. */
export function MatchupWord({ tier }: { tier: string }) {
  const t = tier === 'elite' || tier === 'strong' ? { c: 'bad', w: 'Tough matchup' } : tier === 'weak' || tier === 'poor' ? { c: 'good', w: 'Favorable matchup' } : { c: 'mid', w: 'Neutral matchup' };
  return <span className={`tier tier--${t.c}`}>{t.w}</span>;
}

/** The player's offense against the opponent's defense, unit by unit, for the family of stat being read. */
const UNIT_PAIRS: Record<PropFamily, [off: string, def: string, label: string][]> = {
  passing: [['met_nfl.adj_off_db_epa', 'met_nfl.adj_def_db_epa', 'Passing EPA'], ['met_nfl.adj_off_sr', 'met_nfl.adj_def_sr', 'Success rate'], ['met_nfl.adj_off_explosive', 'met_nfl.adj_def_explosive', 'Explosive plays'], ['met_nfl.adj_off_sack_rate', 'met_nfl.adj_def_sack_rate', 'Sack rate'], ['met_nfl.adj_off_to_rate', 'met_nfl.adj_def_to_rate', 'Turnovers']],
  receiving: [['met_nfl.adj_off_db_epa', 'met_nfl.adj_def_db_epa', 'Passing EPA'], ['met_nfl.adj_off_sr', 'met_nfl.adj_def_sr', 'Success rate'], ['met_nfl.adj_off_explosive', 'met_nfl.adj_def_explosive', 'Explosive plays'], ['met_nfl.adj_off_epa', 'met_nfl.adj_def_epa', 'Overall EPA']],
  rushing: [['met_nfl.adj_off_rush_epa', 'met_nfl.adj_def_rush_epa', 'Rushing EPA'], ['met_nfl.adj_off_sr', 'met_nfl.adj_def_sr', 'Success rate'], ['met_nfl.adj_off_explosive', 'met_nfl.adj_def_explosive', 'Explosive plays'], ['met_nfl.adj_off_epa', 'met_nfl.adj_def_epa', 'Overall EPA']],
  touchdowns: [['met_nfl.adj_off_epa', 'met_nfl.adj_def_epa', 'Overall EPA'], ['met_nfl.points_for', 'met_nfl.points_against', 'Points per game'], ['met_nfl.adj_off_explosive', 'met_nfl.adj_def_explosive', 'Explosive plays'], ['met_nfl.adj_off_sr', 'met_nfl.adj_def_sr', 'Success rate']],
  other: [['met_nfl.adj_off_epa', 'met_nfl.adj_def_epa', 'Overall EPA'], ['met_nfl.adj_off_sr', 'met_nfl.adj_def_sr', 'Success rate'], ['met_nfl.adj_off_explosive', 'met_nfl.adj_def_explosive', 'Explosive plays']],
};

/** The team-volume measure that bears on a family of props. */
const SCRIPT_VOL: Record<PropFamily, { k: keyof TeamVolume; label: string; pct?: boolean }> = {
  passing: { k: 'passAtt', label: 'Team pass attempts' },
  receiving: { k: 'passAtt', label: 'Team pass attempts' },
  rushing: { k: 'rushAtt', label: 'Team rush attempts' },
  touchdowns: { k: 'plays', label: 'Team plays' },
  other: { k: 'plays', label: 'Team plays' },
};

function pointsOf(row: PropRow): QPoint[] | null {
  if (!row.range) return null;
  const pts: QPoint[] = [{ p: 0.05, v: row.range.full[0] }, { p: 0.25, v: row.range.typical[0] }];
  if (row.range.median != null) pts.push({ p: 0.5, v: row.range.median });
  pts.push({ p: 0.75, v: row.range.typical[1] }, { p: 0.95, v: row.range.full[1] });
  return pts;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function PropAnalysis({ histLoading, row, playerRows, hits, hist, win, onWin, onPick, r, scripts, kickoff, slug, sportCode, eventId, now }: {
  histLoading: boolean; row: PropRow; playerRows: PropRow[]; hits: Map<string, HitRate | null>; hist: PlayerHistoryDoc | null; win: HitWindow; onWin: (w: HitWindow) => void; onPick: (r: PropRow) => void;
  r: EventResearchDoc; scripts: ScriptSet | null; kickoff: string; slug: string; sportCode: string; eventId: string; now: number;
}) {
  const hdef = statDef(row.def.stat);
  const hrows = hist ? pregameRows(hist, kickoff, null) : null;
  const wins = hrows && hdef ? hitWindows(hrows, hdef) : [];
  const season = hist?.season ?? new Date(kickoff).getFullYear();
  const prior = hist?.prior?.season ?? null;
  const shownWin: HitWindow = wins.some((w) => w.w === win) ? win : wins[wins.length > 1 ? 1 : 0]?.w ?? 'last10';
  const h = hrows && hdef && row.line != null ? hitRate(hrows, hdef, row.line, shownWin) : null;
  const wgames = hrows && hdef ? windowGames(hrows, hdef, shownWin).games.map((g) => g.row) : [];
  const support = supportMetrics(wgames, row.family, row.role);
  const def = row.def;
  const fmt = (v: number) => fmtValue(v, def).replace(/ \S+$/, '');
  const gap = row.projection != null && row.line != null ? row.projection - row.line : null;
  const points = pointsOf(row);
  const mi = (r.extensions as any)?.market_implied as { implied_score?: Record<string, number>; implied_spread?: number; implied_total_median?: number; label?: string } | undefined;
  const [tc] = teamColors('NFL', row.team.abbr);
  const pairs = UNIT_PAIRS[row.family].map(([o, d, label]) => ({ label, off: rankView(matchupObs(r, o, row.team)?.context), def: rankView(matchupObs(r, d, row.opp)?.context) })).filter((x) => x.off || x.def);
  const side: 'home' | 'away' = row.team.home ? 'home' : 'away';
  const vol = SCRIPT_VOL[row.family];
  const keyRisk = row.risks[0] ?? null;
  const mu = matchupSentence(row);
  const winName = hitWindowLabel(shownWin, season, prior);
  const ladderHist = (line: number, w: HitWindow) => (hrows && hdef ? hitRate(hrows, hdef, line, w) : null);
  return (
    <article className="pexa fr-pexa" aria-labelledby="pexa-t">
      <div className="fr-pexa__top">
        <header className="fx-card pexa__h fr-phead" style={{ ['--tc' as string]: tc }}>
          <span className="fr-phead__glow" aria-hidden="true" />
          <PlayerFace photo={playerPhoto(row.playerId, row.name, row.team.abbr)} team={row.team.abbr} size="xl" name={row.name} />
          <div className="pexa__id">
            <span className="fr-phead__team"><TeamMark sport="NFL" abbr={row.team.abbr} size="sm" /> {row.team.abbr} {row.role ?? ''} · vs {row.opp.abbr}{row.injury ? <span className="fr-inj"> · {row.injury.toLowerCase().replace(/_/g, ' ')}</span> : null}</span>
            <h2 className="pexa__t fr-phead__t" id="pexa-t">{row.name} <span>{def.label}</span></h2>
            <span className="pexa__pills">
              <span className={`pb__read pb__read--${row.read === 'ABOVE' ? 'above' : row.read === 'BELOW' ? 'below' : row.read === 'ON' ? 'on' : 'none'}`}>{PROP_READ_WORD[row.read]}</span>
              {h && h.n > 0 && <span className="pexa__hitpill" title="History against today's line, not a probability"><HitDots h={h} max={10} /> {winName}: {h.over}/{h.n} over{h.push ? ` · ${h.push} push` : ''}</span>}
            </span>
          </div>
          <dl className="fr-tiles pexa__nums">
            <div className="fr-tile"><dt>Market line</dt><dd className="fx-num">{row.line ?? '—'}</dd><dd className="fr-tile__s">{row.main ? <>Over {cents(row.main.yesAsk)} · Under {cents(row.main.noAsk)}</> : 'No priced line'}</dd></div>
            <div className="fr-tile fr-tile--cyan"><dt>SIFT projection</dt><dd className="fx-num">{row.projection != null ? fmt(row.projection) : '—'}</dd><dd className="fr-tile__s">{row.projection != null ? 'simulation mean · research' : 'not published'}</dd></div>
            <div className={`fr-tile fr-tile--${gap == null ? 'muted' : gap > 0 ? 'green' : gap < 0 ? 'red' : 'muted'}`}><dt>Gap</dt><dd className="fx-num">{gap == null ? '—' : `${gap > 0 ? '+' : gap < 0 ? '−' : ''}${fmt(Math.abs(gap))}`}</dd><dd className="fr-tile__s">{gap == null ? 'needs a projection and a line' : 'projection − line, not an edge'}</dd></div>
          </dl>
          {roleDisagreement(row) && <p className="pexa__warn" role="note"><Icon name="alert" size={16} /> <span>The line sits outside the simulation’s 5th–95th range: the market and the simulation are pricing different roles. Treat this gap as a data question, not a finding.</span></p>}
          {mu && <p className={`pexa__mu pexa__mu--${mu.word}`}><MatchupWord tier={row.matchup!.rank.tier} /> <span>{mu.text}</span></p>}
          <div className="pexa__acts">
            {row.main && <SaveButton ref_kind="MARKET" sport={sportCode} id={row.main.market.market_id} extra={{ market_id: row.main.market.market_id, event_id: eventId }} label={{ label: `${row.name} ${def.label.toLowerCase()} ${row.line ?? ''}`.trim(), sub: `Over ${cents(row.main.yesAsk)} · under ${cents(row.main.noAsk)}`, href: routes.props(slug, { game: eventId }) + `&prop=${encodeURIComponent(row.id)}` }} kickoff={kickoff} />}
            <Link to={routes.player(slug, row.playerId)} className="btn btn--sm">Player profile</Link>
            <Link to={routes.game(slug, eventId, { tab: 'props' })} className="btn btn--sm">Game props</Link>
          </div>
        </header>
        {mi?.implied_score && (
          <section className="fx-card fr-gamectx" aria-labelledby="pexa-ctx">
            <h3 className="fr-k" id="pexa-ctx">{row.opp.home ? `${row.team.abbr} at ${row.opp.abbr}` : `${row.opp.abbr} at ${row.team.abbr}`}</h3>
            <div className="fr-gamectx__teams">
              {[row.team.home ? row.opp : row.team, row.team.home ? row.team : row.opp].map((t) => (
                <div key={t.abbr} className="fr-gamectx__t"><TeamMark sport="NFL" abbr={t.abbr} size="md" /><b className="fx-num">{mi.implied_score?.[t.abbr] != null ? mi.implied_score[t.abbr].toFixed(1) : '—'}</b><small>{t.abbr} implied pts</small></div>
              ))}
            </div>
            <dl className="fr-gamectx__dl">
              <div><dt>Total</dt><dd className="fx-num">{mi.implied_total_median != null ? mi.implied_total_median.toFixed(1) : '—'}</dd></div>
              <div><dt>Spread</dt><dd className="fx-num">{mi.implied_spread != null ? `${row.team.home ? row.team.abbr : row.opp.abbr} ${mi.implied_spread > 0 ? '+' : ''}${mi.implied_spread.toFixed(1)}` : '—'}</dd></div>
            </dl>
            <p className="fr-note">Market-implied from contract midpoints: research context, not executable prices.</p>
          </section>
        )}
      </div>

      {playerRows.length > 1 && (
        <section className="fx-card pexa__mk" aria-labelledby="pexa-mk">
          <h3 className="fx-card__t" id="pexa-mk"><Icon name="layers" size={16} /> All {row.name.split(' ').slice(-1)[0]} markets <small className="pexa__mkn">{playerRows.length} stats · {playerRows.reduce((n, x) => n + x.ladder.length, 0)} lines</small></h3>
          <MarketCarousel rows={playerRows} selectedId={row.id} onSelect={onPick} hits={hits} hitLabel={winName} label={`${row.name}: every market`} pending={histLoading} />
        </section>
      )}

      <div className="fx-bento fr-pexa__grid">
        <section className="fx-card fx-span-8 fr-perf pexa__perf" aria-labelledby="pexa-hist">
          <h3 className="fx-card__t" id="pexa-hist"><Icon name="chart" size={16} /> Game by game vs today’s line</h3>
          {histLoading && !hist ? <Skeleton lines={5} /> : hist && hdef && hrows && wins.length ? (
            <>
              <div className="fr-seg pexa__wins" role="group" aria-label="History window">
                {wins.map((w) => <button key={w.w} type="button" className={`fr-seg__b${w.w === shownWin ? ' is-on' : ''}`} aria-pressed={w.w === shownWin} onClick={() => onWin(w.w)}>{hitWindowShort(w.w, season, prior)} <small className="pexa__wn">{w.n}</small></button>)}
              </div>
              {h ? (
                <>
                  <HitSummary h={h} windowName={winName} unit={hdef.unit} projection={shownWin !== 'prior' ? row.projection : null} />
                  <PerfChart h={h} statLabel={hdef.label} unit={hdef.unit} season={season} sport={sportCode} projection={row.projection != null && shownWin !== 'prior' ? { value: row.projection, typical: row.range?.typical ?? null } : null} />
                </>
              ) : <p className="fr-note">No priced line to compare with. {wgames.length} game{wgames.length === 1 ? '' : 's'} played in this window.</p>}
              <p className="fr-note">Each bar is a game he played, compared with <b>today’s</b> line; historical betting lines are not published. Small numbers above each window are the games played.</p>
            </>
          ) : <CapabilityState title={hdef ? 'No game log for this player yet' : 'No game log for this stat'}>{hdef ? 'The public game logs Sift reads have no games for him before this kickoff (a rookie or a player with no offensive snaps).' : `The public game logs do not carry ${def.label.toLowerCase()}, so there is no history to compare with the line.`}</CapabilityState>}
        </section>

        <section className="fx-card fx-span-4 pexa__use" aria-labelledby="pexa-use">
          <h3 className="fx-card__t" id="pexa-use"><Icon name="users" size={16} /> Usage &amp; role <small className="pexa__mkn">{winName}</small></h3>
          {support.length ? (
            <dl className="pexa__usel">
              {support.map((m) => <div key={m.key}><dt>{m.label}</dt><dd className="fx-num">{m.value}</dd><dd className="pexa__useb">{m.basis}</dd></div>)}
            </dl>
          ) : <p className="fr-note">No usage numbers in this window.</p>}
          <p className="fr-note">{NOT_IN_HISTORY}</p>
        </section>

        <section className="fx-card fx-span-8 fr-dist" aria-labelledby="pexa-dist">
          <h3 className="fx-card__t" id="pexa-dist"><Icon name="chart" size={16} /> Projection distribution</h3>
          <div className="fr-dist__body">
            <QuantileDist points={points} line={row.line} projection={row.projection} format={fmt} unit={def.unit} label={`${row.name} ${def.label.toLowerCase()}: simulated distribution`} minSpan={def.count ? 3 : 8} />
            <dl className="fr-legend">
              {row.projection != null && <div><dt><i className="fr-dot fr-dot--cyan" />SIFT projection</dt><dd className="fx-num">{fmt(row.projection)}</dd></div>}
              {row.range && <div><dt><i className="fr-dot fr-dot--blue" />Middle 50%</dt><dd className="fx-num">{fmt(row.range.typical[0])}–{fmt(row.range.typical[1])}</dd></div>}
              {row.range && <div><dt><i className="fr-dot fr-dot--dim" />90% range</dt><dd className="fx-num">{fmt(row.range.full[0])}–{fmt(row.range.full[1])}</dd></div>}
              <div><dt><i className="fr-dot fr-dot--line" />Market line</dt><dd className="fx-num">{row.line ?? '—'}</dd></div>
              {row.main?.modelP != null ? (
                <div className="fr-legend__p"><dt><i className="fr-dot fr-dot--violet" />Shadow model P(over)</dt><dd className="fx-num">{pct(row.main.modelP)}</dd><dd className="fr-tile__s">research · {String(row.main.modelState ?? '').toLowerCase().replace(/_/g, ' ')} · market {pct(row.main.marketP)}</dd></div>
              ) : <div className="fr-legend__p"><dt>Probability over</dt><dd className="fr-tile__s">No validated probability is published for this prop.</dd></div>}
            </dl>
          </div>
        </section>

        <section className="fx-card fx-span-4 fr-read" aria-labelledby="pexa-read">
          <h3 className="fx-card__t" id="pexa-read"><Icon name="bolt" size={16} /> SIFT read <span className="fr-badge">Research</span></h3>
          {row.reasons.length ? <ul className="fr-list">{row.reasons.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="fr-note">No standout reason on this prop: the projection, matchup and price sit near the middle.</p>}
          {keyRisk && <div className="fr-risk"><Icon name="flame" size={16} /><div><b>Key risk</b><p>{keyRisk}</p></div></div>}
          {row.risks.length > 1 && <ul className="fr-list fr-list--quiet">{row.risks.slice(1).map((x) => <li key={x}>{x}</li>)}</ul>}
          <p className="fr-note">The NFL publication’s own scorecard has the market ahead of its prop pricing: everything here is research, not a validated edge.</p>
        </section>

        <section className="fx-card fx-span-6 fr-mu" aria-labelledby="pexa-mu">
          <h3 className="fx-card__t" id="pexa-mu"><Icon name="compare" size={16} /> Matchup: {row.opp.abbr} {def.defUnit ?? 'defense'}</h3>
          {row.matchup ? <p className="fr-mu__lead"><MatchupWord tier={row.matchup.rank.tier} /> <span>{row.opp.abbr} {row.matchup.label.replace(`${row.opp.nick} `, '')} <b>#{row.matchup.rank.rank} of {row.matchup.rank.of}</b></span></p> : <p className="fr-mu__lead"><span>No opposing-unit rank is published for {def.label.toLowerCase()}.</span></p>}
          {pairs.length ? (
            <div className="fr-mu__rows">
              <div className="fr-mu__head"><span><TeamMark sport="NFL" abbr={row.team.abbr} size="sm" /> {row.team.abbr} offense</span><span>{row.opp.abbr} defense <TeamMark sport="NFL" abbr={row.opp.abbr} size="sm" /></span></div>
              {pairs.map((x) => <VsBar key={x.label} label={x.label} left={{ rank: x.off?.rank ?? null, of: x.off?.of ?? null, text: `${row.team.abbr} offense` }} right={{ rank: x.def?.rank ?? null, of: x.def?.of ?? null, text: `${row.opp.abbr} defense` }} />)}
            </div>
          ) : <p className="fr-note">No unit ranks are published for this matchup.</p>}
          <p className="fr-note">Opponent-adjusted league ranks (#1 = best unit). The lit side holds the edge; Sift does not combine ranks into one number.</p>
        </section>

        <section className="fx-card fx-span-6 fr-sens" aria-labelledby="pexa-sens">
          <h3 className="fx-card__t" id="pexa-sens"><Icon name="layers" size={16} /> Game script sensitivity</h3>
          {scripts ? (
            <>
              <table className="fr-t">
                <caption className="sr-only">{vol.label} for {row.team.abbr} in each simulated script</caption>
                <thead><tr><th scope="col">Script</th><th scope="col">Sim share</th><th scope="col" className="r">{vol.label.replace('Team ', `${row.team.abbr} `)}</th><th scope="col" className="r">vs avg</th></tr></thead>
                <tbody>
                  {scripts.scripts.map((s) => {
                    const v = s.volume[side][vol.k];
                    const base = scripts.overall[side][vol.k];
                    const d = v != null && base ? (v - base) / base : null;
                    return (
                      <tr key={s.id}>
                        <th scope="row"><i className={`fr-dot fr-dot--s${s.index}`} />{s.name}</th>
                        <td><ShareBar value={s.share} tone={s.index} label={`${sharePct(s.share)} of simulated games`} /><span className="fr-t__n">{sharePct(s.share)}</span></td>
                        <td className="r fx-num">{v != null ? v.toFixed(1) : '—'}</td>
                        <td className={`r fr-d fr-d--${d == null || Math.abs(d) < 0.03 ? 'flat' : d > 0 ? 'up' : 'down'}`}>{d == null ? '—' : Math.abs(d) < 0.03 ? 'avg' : `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) * 100)}%`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="fr-note">Team volume in simulated games that end each way. Player projections by script are not published, so no player number is shown per script.</p>
            </>
          ) : <CapabilityState title="No script summary for this game">The publication attached no simulated scripts, so Sift shows no script sensitivity.</CapabilityState>}
        </section>

        <section className="fx-card fx-span-12 fr-ladder" aria-labelledby="pexa-lad">
          <h3 className="fx-card__t" id="pexa-lad"><Icon name="layers" size={16} /> Every line, with his history {row.main && <FreshChip at={row.main.market.captured_at} now={now} label="Captured" />}</h3>
          {row.ladder.length ? (
            <div className="lab__tw" tabIndex={0} role="region" aria-label="Market ladder"><table className="fr-t fr-t--ladder pexa__lad">
              <thead><tr><th scope="col">Line</th><th scope="col" className="r">Over</th><th scope="col" className="r">Under</th><th scope="col" className="r">Market</th><th scope="col" className="r">Model <small>(research)</small></th>{hrows && hdef && <><th scope="col" className="r">Last 5</th><th scope="col" className="r">Last 10</th><th scope="col" className="r">{season}</th></>}</tr></thead>
              <tbody>{row.ladder.map((x) => {
                const ln = Number(x.line);
                const cell = (w: HitWindow) => { const hh = ladderHist(ln, w); return <td className="r fx-num pexa__ladh">{hh && hh.n ? <>{hh.over}<small>/{hh.n}</small>{hh.push ? <small> · {hh.push}P</small> : null}</> : '—'}</td>; };
                return <tr key={x.market.market_id} className={x.market.market_id === row.main?.market.market_id ? 'is-main' : undefined}><th scope="row" className="fx-num">{x.line}{x.market.market_id === row.main?.market.market_id && <small className="pexa__main"> main</small>}</th><td className="r fx-num">{cents(x.yesAsk)}</td><td className="r fx-num">{cents(x.noAsk)}</td><td className="r fx-num">{pct(x.marketP)}</td><td className="r fx-num">{pct(x.modelP)}</td>{hrows && hdef && <>{cell('last5')}{cell('last10')}{cell('season')}</>}</tr>;
              })}</tbody>
            </table></div>
          ) : <p className="fr-note">No contracts listed for this prop.</p>}
          <p className="fr-note">Asks are the publication’s capture; open the market for its live quote and fee-aware break-even.{hrows && hdef ? ' History columns: games played over each line (pushes marked P), not probabilities.' : ''}{row.main ? <> <Link to={routes.market(slug, row.main.market.market_id, eventId)}>Open the main line →</Link></> : null}</p>
        </section>
      </div>
    </article>
  );
}

/** What each sport's publication carries toward the Combined Prop Explorer. Only NFL has every part today. */
const CAPS: Record<string, { have: string[]; missing: string[]; where: string }> = {
  MLB: { have: ['Pitcher and hitter prop ladders with their captured asks', 'Published projections where the MLB publication ships them'], missing: ['Five-quantile simulated distributions for player stats', 'Opponent unit ranks per prop', 'Script-conditional team volume'], where: 'MLB pitcher and hitter props live on each game’s Player Props section.' },
  NHL: { have: ['Player-goal candidates priced as research', 'Skater and goalie research on game and player pages'], missing: ['A ladder of player-stat lines with simulated distributions', 'Opponent unit ranks per prop'], where: 'NHL skater and goalie research is on each game and player page.' },
};

export function PropExplorerView() {
  const { sport, slug } = useSport();
  useVisit('Prop explorer', 'explore', EXPLORE_STEP);
  const cap = CAPS[sport.code];
  return (
    <div className="page pexp">
      <header className="bhome__mast">
        <div><span className="eyebrow2">Explore · {sport.label}</span><h1 className="bhome__h">Prop explorer</h1></div>
        <p className="bhome__sum">Pick a game, filter, then read one prop in full</p>
      </header>
      {sport.code === 'NFL' ? <NflExplorer /> : (
        <div className="fr-capgrid">
          <CapabilityState title={`The Combined Prop Explorer is NFL-only today`} tone="gold" icon="info" action={<Link to={routes.sport(slug)} className="btn btn--primary">Open {sport.label}</Link>}>
            <p>{cap ? cap.where : 'This publication does not publish player-prop projections, so there is nothing to explore without inventing numbers.'}</p>
          </CapabilityState>
          {cap && (
            <div className="fx-card fr-capt">
              <h2 className="fx-card__t">What the {sport.label} publication carries</h2>
              <ul className="fr-capl">
                {cap.have.map((x) => <li key={x} className="is-have"><Icon name="check" size={15} />{x}</li>)}
                {cap.missing.map((x) => <li key={x} className="is-miss"><Icon name="close" size={15} />{x} <small>not published</small></li>)}
              </ul>
              <p className="fr-note">The explorer is built only where every panel can be filled with published numbers. Sift does not fit a distribution or rank a matchup a publication does not provide.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
