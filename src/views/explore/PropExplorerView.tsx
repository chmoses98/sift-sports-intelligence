// THE COMBINED PROP EXPLORER — every published NFL player prop, filterable, with one selected prop analysed in
// full: the projection and its published range against the line, recent games against today's line (Last 5 · Last
// 10 · This season · Last season — historical lines are not published, and the page says so), the opposing unit's
// rank, the ladder of alternative thresholds with their real asks, and the risks. Selection lives in the address,
// so changing the prop replaces every panel at once (nothing from the previous prop stays on screen).
// Built on the game prop board (src/insights/propBoard.ts): no probability is derived from a mean; the shadow
// model's P(over) appears only where the publication priced it, labelled research.
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { BoardItem } from '../../contract/types';
import { useAsync } from '../../data/hooks';
import { Icon } from '../../components/Icon';
import { PlayerFace, RangeBar, RankBadge } from '../../components/insight';
import { SaveButton, Skeleton, TeamMark } from '../../components/ui';
import { pregameRows, statDef, windowLabel, windowRows, windowsFor, type HistoryWindow } from '../../history/stats';
import { fmtValue, PROP_FAMILY_LABEL, PROP_FAMILY_ORDER, PROP_READ_WORD, propBoard, type PropFamily, type PropRow } from '../../insights/propBoard';
import { playerPhoto } from '../../lib/players';
import { routes } from '../../lib/routes';
import { useNow } from '../../live/hooks';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import { GameBars, HistorySummary } from '../player/history';
import { usePropHistories } from '../game/matters';

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
    return { r, b: propBoard(r, d) };
  });
  const set = (patch: Record<string, string | null>, push = false) => setSp((prev) => { const n = new URLSearchParams(prev); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); } return n; }, { replace: !push });
  const fam = (sp.get('cat') as PropFamily | null) ?? null;
  const team = sp.get('team');
  const pos = sp.get('pos');
  const read = sp.get('read');
  const band = sp.get('band');
  const priced = sp.get('priced') !== '0';
  const rows = data.data?.b.rows ?? [];
  const positions = [...new Set(rows.map((r) => r.role).filter(Boolean))] as string[];
  const shown = rows.filter((r) => (!fam || r.family === fam) && (!team || r.team.abbr === team) && (!pos || r.role === pos) && (!read || r.read === read) && (!priced || r.main) && (!band || (r.main?.yesAsk != null && BANDS.find((b) => b.id === band)!.test(r.main.yesAsk))));
  const selId = sp.get('prop');
  const sel = shown.find((r) => r.id === selId) ?? (selId ? rows.find((r) => r.id === selId) : undefined) ?? shown[0] ?? null;
  const teams = data.data ? [data.data.b.rows[0]?.team, data.data.b.rows[0]?.opp].filter(Boolean) : [];
  return (
    <>
      <div className="pex__games gtabs2" role="group" aria-label="Game">
        {games.map((g) => <button key={g.event_id} type="button" className={`gtab${g.event_id === gameId ? ' is-on' : ''}`} aria-pressed={g.event_id === gameId} onClick={() => set({ game: g.event_id, prop: null, team: null, pos: null }, true)}>{gameLabel(g)}<small>{new Date(g.start_time_utc).toLocaleDateString(undefined, { weekday: 'short' })}</small></button>)}
      </div>
      {!games.length && !board.loading && <div className="bempty"><h3>No upcoming NFL games listed</h3><p>The prop explorer reads the coming week’s games.</p></div>}
      <div className="pex">
        <aside className="pex__side" aria-label="Filters and props">
          <div className="pex__filters">
            <div className="gtabs2 gtabs2--wrap" role="group" aria-label="Prop category">
              <button type="button" className={`gtab${!fam ? ' is-on' : ''}`} aria-pressed={!fam} onClick={() => set({ cat: null, prop: null })}>All <small>{rows.length}</small></button>
              {PROP_FAMILY_ORDER.filter((f) => data.data?.b.byFamily[f]).map((f) => <button key={f} type="button" className={`gtab${fam === f ? ' is-on' : ''}`} aria-pressed={fam === f} onClick={() => set({ cat: fam === f ? null : f, prop: null })}>{PROP_FAMILY_LABEL[f]} <small>{data.data?.b.byFamily[f]}</small></button>)}
            </div>
            <div className="gtabs2 gtabs2--wrap" role="group" aria-label="Team">
              <button type="button" className={`gtab${!team ? ' is-on' : ''}`} aria-pressed={!team} onClick={() => set({ team: null, prop: null })}>Both teams</button>
              {teams.map((t) => <button key={t!.abbr} type="button" className={`gtab${team === t!.abbr ? ' is-on' : ''}`} aria-pressed={team === t!.abbr} onClick={() => set({ team: team === t!.abbr ? null : t!.abbr, prop: null })}><TeamMark sport="NFL" abbr={t!.abbr} size="sm" />{t!.abbr}</button>)}
            </div>
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
          {data.loading ? <Skeleton lines={8} /> : (
            <ol className="pex__list" aria-label={`${shown.length} props`}>
              {shown.map((r) => (
                <li key={r.id}>
                  <button type="button" className={`pex__row${sel?.id === r.id ? ' is-on' : ''}`} aria-pressed={sel?.id === r.id} onClick={() => set({ prop: r.id }, true)}>
                    <PlayerFace photo={playerPhoto(r.playerId, r.name, r.team.abbr)} team={r.team.abbr} size="sm" />
                    <span className="pex__rb"><b>{r.name}</b><small>{r.team.abbr} {r.role ?? ''} · {r.def.label}</small></span>
                    <span className="pex__rv"><span className="bnum">{r.line ?? '—'}</span><small className={`pex__rd pex__rd--${r.read.toLowerCase()}`}>{r.read === 'ABOVE' ? 'Proj ↑' : r.read === 'BELOW' ? 'Proj ↓' : r.read === 'ON' ? 'Proj =' : '—'}</small></span>
                  </button>
                </li>
              ))}
              {!shown.length && <li className="muted">No prop matches these filters.</li>}
            </ol>
          )}
        </aside>
        <div className="pex__main">
          {data.loading && <Skeleton lines={10} tall />}
          {sel && data.data && game && <PropAnalysis key={sel.id} row={sel} kickoff={game.start_time_utc} slug={slug} sportCode={sport.code} eventId={game.event_id} week={null} />}
          {!data.loading && !sel && data.data && <div className="bempty"><h3>Pick a prop</h3><p>Choose a player and stat on the left to see the full analysis.</p></div>}
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

function PropAnalysis({ row, kickoff, slug, sportCode, eventId, week }: { row: PropRow; kickoff: string; slug: string; sportCode: string; eventId: string; week: number | null }) {
  const [sp, setSp] = useSearchParams();
  const players = useMemo(() => [{ name: row.name, team: row.team.abbr }], [row.name, row.team.abbr]);
  const hists = usePropHistories(sportCode, players);
  const hist = [...hists.values()][0] ?? null;
  const hdef = statDef(row.def.stat);
  const hrows = hist ? pregameRows(hist, kickoff, week) : null;
  const wins = hrows ? windowsFor(hrows) : [];
  const win = (sp.get('win') as HistoryWindow | null) ?? wins[0] ?? 'last5';
  const wrows = hrows ? windowRows(hrows, win) : [];
  const season = hist?.season ?? new Date(kickoff).getFullYear();
  const def = row.def;
  const fmt = (v: number) => fmtValue(v, def).replace(/ \S+$/, '');
  return (
    <article className="pexa" aria-labelledby="pexa-t">
      <header className="glass glass--lit pexa__h">
        <PlayerFace photo={playerPhoto(row.playerId, row.name, row.team.abbr)} team={row.team.abbr} size="lg" />
        <div className="pexa__id">
          <span className="eyebrow2">{row.team.abbr} {row.role ?? ''} · vs {row.opp.abbr}{row.injury ? ` · ${row.injury.toLowerCase()}` : ''}</span>
          <h2 className="pexa__t" id="pexa-t">{row.name} <span>{def.label}</span></h2>
          <div className="pexa__nums">
            <div><span>Projection</span><b className="bnum">{row.projection != null ? fmtValue(row.projection, def) : '—'}</b></div>
            <div><span>Line</span><b className="bnum">{row.line ?? '—'}</b></div>
            <div><span>Over</span><b className="bnum">{cents(row.main?.yesAsk)}</b></div>
            <div><span>Under</span><b className="bnum">{cents(row.main?.noAsk)}</b></div>
          </div>
          <span className={`pb__read pb__read--${row.read === 'ABOVE' ? 'above' : row.read === 'BELOW' ? 'below' : row.read === 'ON' ? 'on' : 'none'}`}>{PROP_READ_WORD[row.read]}</span>
        </div>
        <div className="pexa__acts">
          <Link to={routes.player(slug, row.playerId)} className="btn btn--sm">Player profile</Link>
          <Link to={routes.game(slug, eventId, { tab: 'props' })} className="btn btn--sm">Game props</Link>
          {row.main && <SaveButton ref_kind="MARKET" sport={sportCode} id={row.main.market.market_id} extra={{ market_id: row.main.market.market_id, event_id: eventId }} label={{ label: `${row.name} ${def.label.toLowerCase()} ${row.line ?? ''}`.trim(), sub: `Over ${cents(row.main.yesAsk)} · under ${cents(row.main.noAsk)}`, href: routes.props(slug, { game: eventId }) + `&prop=${encodeURIComponent(row.id)}` }} kickoff={kickoff} />}
        </div>
      </header>
      <div className="pexa__grid">
        <section className="tpanel tpanel--wide" aria-labelledby="pexa-dist">
          <h3 className="tpanel__h" id="pexa-dist"><Icon name="chart" size={15} /> Projection vs the line</h3>
          {row.range && row.projection != null ? (
            <>
              <RangeBar typical={row.range.typical} full={row.range.full} projection={row.projection} line={row.line} format={fmt} label={`${row.name} ${def.label.toLowerCase()}`} />
              <p className="tpanel__note">Band = typical range (middle half of simulations, {fmt(row.range.typical[0])}–{fmt(row.range.typical[1])}); ends = wider range ({fmt(row.range.full[0])}–{fmt(row.range.full[1])}); dot = projection; gold tick = today’s line. Where the projection sits is not a probability: {row.main?.modelP != null ? <>the shadow model priced the over at <b>{pct(row.main.modelP)}</b> (research, {String(row.main.modelState ?? '').toLowerCase().replace(/_/g, ' ')}) vs the market’s {pct(row.main.marketP)}.</> : 'no validated probability is published for this prop.'}</p>
            </>
          ) : <p className="tpanel__note">The publication does not simulate this stat, so there is no projected range — only the market.</p>}
        </section>
        <section className="tpanel tpanel--wide" aria-labelledby="pexa-hist">
          <h3 className="tpanel__h" id="pexa-hist"><Icon name="clock" size={15} /> Recent games against today’s line</h3>
          {hist && hdef && hrows ? (
            <>
              <div className="gtabs2" role="group" aria-label="History window">
                {wins.map((w) => <button key={w} type="button" className={`gtab${w === win ? ' is-on' : ''}`} aria-pressed={w === win} onClick={() => setSp((p) => { const n = new URLSearchParams(p); n.set('win', w); return n; }, { replace: true })}>{windowLabel(w, season, hist.prior?.season ?? null)}</button>)}
              </div>
              <HistorySummary rows={wrows} stat={hdef} line={row.line} projection={row.projection} windowName={windowLabel(win, season, hist.prior?.season ?? null)} unit={hdef.unit} />
              <GameBars rows={wrows} stat={hdef} line={row.line} season={win === 'prior' ? hist.prior?.season ?? season : season} upcoming={row.projection != null && row.range && win !== 'prior' ? { projection: row.projection, typical: row.range.typical, label: 'Today' } : null} sport={sportCode} />
              <p className="tpanel__note">Bars compare each past game with <b>today’s</b> line; historical betting lines are not published.</p>
            </>
          ) : <p className="tpanel__note">No game log for this player in the history layer yet.</p>}
        </section>
        <section className="tpanel" aria-labelledby="pexa-mu">
          <h3 className="tpanel__h" id="pexa-mu"><Icon name="compare" size={15} /> Matchup</h3>
          {row.matchup ? <><p className="tpanel__lead">{row.opp.abbr} {row.matchup.label}</p><span className="pexa__mu"><RankBadge rank={row.matchup.rank} against /><MatchupWord tier={row.matchup.rank.tier} /></span><p className="tpanel__note">Opponent-adjusted league rank of the unit this stat runs into (#1 = best at stopping it). For {row.name}, a top-ranked unit is the tough side of the matchup.</p></> : <p className="tpanel__note">No opposing-unit rank is published for this stat.</p>}
          {row.reasons.length > 0 && <ul className="tpanel__list">{row.reasons.map((x) => <li key={x}>{x}</li>)}</ul>}
        </section>
        <section className="tpanel" aria-labelledby="pexa-lad">
          <h3 className="tpanel__h" id="pexa-lad"><Icon name="layers" size={15} /> Alternative lines</h3>
          {row.ladder.length ? (
            <div className="lab__tw" tabIndex={0} role="region" aria-label="Scrollable table"><table className="lab__t">
              <thead><tr><th scope="col">Line</th><th scope="col">Over</th><th scope="col">Under</th><th scope="col">Market</th><th scope="col">Model (research)</th></tr></thead>
              <tbody>{row.ladder.map((r) => <tr key={r.market.market_id} className={r.market.market_id === row.main?.market.market_id ? 'is-main' : undefined}><th scope="row">{r.line}{r.market.market_id === row.main?.market.market_id && <small className="pexa__main"> main</small>}</th><td className="bnum">{cents(r.yesAsk)}</td><td className="bnum">{cents(r.noAsk)}</td><td className="bnum">{pct(r.marketP)}</td><td className="bnum">{pct(r.modelP)}</td></tr>)}</tbody>
            </table></div>
          ) : <p className="tpanel__note">No contracts listed for this prop.</p>}
          <p className="tpanel__note">Asks are the publication’s capture; open the market for its live quote and fee-aware break-even.</p>
        </section>
        <section className="tpanel tpanel--risk" aria-labelledby="pexa-risk">
          <h3 className="tpanel__h" id="pexa-risk"><Icon name="flame" size={15} /> Risks</h3>
          {row.risks.length ? <ul className="tpanel__list">{row.risks.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="tpanel__note">No specific risk flagged by the publication.</p>}
          <p className="tpanel__note">The NFL publication’s own scorecard has the market ahead of its prop pricing: everything here is research, not a validated edge.</p>
        </section>
      </div>
    </article>
  );
}

export function PropExplorerView() {
  const { sport, slug } = useSport();
  useVisit('Prop explorer', 'explore');
  return (
    <div className="page pexp">
      <header className="bhome__mast">
        <div><span className="eyebrow2">Explore · {sport.label}</span><h1 className="bhome__h">Prop explorer</h1></div>
        <p className="bhome__sum">Pick a game, filter, then read one prop in full</p>
      </header>
      {sport.code === 'NFL' ? <NflExplorer /> : (
        <div className="bempty">
          <h3>{sport.label} props live on each game page</h3>
          <p>{sport.code === 'MLB' ? 'MLB pitcher and hitter props, with their ladders and any published projection, are on each game’s Player Props section.' : sport.code === 'NHL' ? 'NHL skater and goalie research is on each game and player page; the publication prices player goals as research candidates.' : 'This publication does not publish player-prop projections, so there is nothing to explore without inventing numbers.'}</p>
          <Link to={routes.sport(slug)} className="btn btn--primary">Open {sport.label}</Link>
        </div>
      )}
    </div>
  );
}
