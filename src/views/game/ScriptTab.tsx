// THE SCRIPT THEATER (approved references 04 + 05): the game's simulated scripts as cinematic cards — each in its own
// identity colour (--script-1..4), carried by the player whose role IS the script (insights/cast.ts: real, licensed
// photos only; the team's mark when none is pinned) — then ONE script in depth, or two side by side (Compare).
//
// Single: what has to happen (the final margin), how the simulated game plays when it does (team volume against
// every simulated game), where it ends on the margin axis over the simulation's own bands, the volume lean of each
// team's key players (team volume, never a script-conditional player projection: the publication does not split
// player projections by script), the margin markets it settles and breaks, the unit ranks behind it, and how it fails.
// Compare lives in ScriptCompare.tsx. Shares are SIMULATION SHARES (lib/scripts.ts), labelled as such, never odds.
import { useSearchParams } from '../../routing';
import { Link } from '../../routing';
import type { EntityProfileDoc, EventResearchDoc } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { PlayerFace } from '../../components/insight';
import { TeamMark } from '../../components/ui';
import { MarginMap, ShareBar, type MarginSeg } from '../../components/fxResearch';
import { scriptCast, type CastMember } from '../../insights/cast';
import { teamStat, type PriceRow } from '../../lib/gamedata';
import { playerPhoto } from '../../lib/players';
import { routes } from '../../lib/routes';
import { sharePct, type GameScript, type ScriptId, type ScriptSet, type TeamVolume } from '../../lib/scripts';
import { teamColors, teamLogo } from '../../lib/teams';
import { useHeldImage } from '../../lib/useImage';
import { Info, ScriptGlyph, SIM_SHARE_INFO } from './panels';
import { ExpressionList, ScriptShareChart, SurvivorBoard, type BoardItem, type BoardScript, type ExpressionRow } from './ScriptSurvivors';
import { multiScriptSurvivors, scriptExpressions, VOLUME_LEAN_NOTE } from '../../lib/scriptExpressions';
import { useNow } from '../../live/hooks';
import { ScriptCompareStudio } from './ScriptCompare';

/**
 * Under the split chart when the close game is split by winner: the tie share (no winner, so no script) and what the split
 * is worth. Evidence: nfl-edge-finder research/game_script_v2/CLOSE_SPLIT_CALIBRATION.md (2021–2025, 1,424 games).
 */
export function CloseSplitNote({ tie }: { tie: number }) {
  return (
    <p className="fr-note" data-testid="close-split-note">
      Ties after overtime: {(tie * 100).toFixed(1)}% of simulated games, no winner, so not a script.{' '}
      <Info label="About the close-game split">
        One-score games are split by who wins them, from the same simulated games, so the shares still add up to the whole simulation. Over
        2021–2025 the split was about as accurate as the point spread alone at saying who wins a close game, no better. Read these as simulation
        shares, not odds.
      </Info>
    </p>
  );
}

/** Shown where the split would be when the publication holds it back: the pooled one-score script stays, nothing is estimated. */
export function CloseSplitHeldNote() {
  return (
    <p className="fr-note" data-testid="close-split-held-note">
      The one-score script pools both teams’ close wins. Splitting it by winner is held back: over 2021–2025 that split was not shown to be more accurate than the point spread alone.
    </p>
  );
}

export function rangeText(s: GameScript, set: ScriptSet): string {
  const fav = set.fav === 'home' ? set.names.home : set.names.away;
  const dog = set.fav === 'home' ? set.names.away : set.names.home;
  switch (s.id) {
    case 'fav-big': return `The ${fav} win by 14 or more points.`;
    case 'fav': return `The ${fav} win by 7 to 13 points.`;
    case 'close': return `The final margin is 6 points or fewer either way — the ${fav} winning a one-score game or the ${dog} winning one.`;
    case 'fav-close': return `The ${fav} win by 1 to 6 points.`;
    case 'dog-close': return `The ${dog} win by 1 to 6 points.`;
    case 'dog': return `The ${dog} win by 7 or more points.`;
  }
}

/** The script list as the shared script graphics read it: tone = colour identity, team = the side the script belongs to. */
export function boardScripts(set: ScriptSet): (BoardScript & { share: number })[] {
  // The survivor graphics' tones 5..7 are NHL's extra scripts; the NFL's fifth script (underdog by 1–6) is tone 8.
  return set.scripts.map((s) => ({ id: s.id, name: s.name, tone: s.index === 5 ? 8 : s.index, share: s.share, team: s.leader ? (s.leader === 'home' ? set.homeAbbr : set.awayAbbr) : null }));
}

/** The NFL multi-script survivors as survivor-board items (exact fit: margin-settled contracts only). */
export function survivorItems(rows: PriceRow[], set: ScriptSet, slug: string, eventId: string): BoardItem[] {
  return multiScriptSurvivors(rows, set, 2, 6).map((x) => ({
    key: x.row.m.market_id, label: x.row.label, href: routes.market(slug, x.row.m.market_id, eventId), side: 'YES', ask: x.row.ask, at: x.row.m.captured_at ?? null,
    cells: x.fits, similar: x.similar,
  }));
}

export const VOL: { k: keyof TeamVolume; label: string; fmt: (v: number) => string; pct?: boolean }[] = [
  { k: 'plays', label: 'Offensive plays', fmt: (v) => v.toFixed(1) },
  { k: 'passAtt', label: 'Pass attempts', fmt: (v) => v.toFixed(1) },
  { k: 'rushAtt', label: 'Rush attempts', fmt: (v) => v.toFixed(1) },
  { k: 'passRate', label: 'Pass rate', fmt: (v) => `${Math.round(v * 100)}%`, pct: true },
];

export function Delta({ v, base, pct }: { v: number | null; base: number | null; pct?: boolean }) {
  if (v == null || base == null || base === 0) return null;
  const d = pct ? (v - base) * 100 : ((v - base) / base) * 100;
  const r = Math.round(d);
  if (r === 0) return <span className="delta delta--flat">±0{pct ? ' pts' : '%'}</span>;
  return <span className={`delta delta--${r > 0 ? 'up' : 'down'}`}>{r > 0 ? '▲' : '▼'} {Math.abs(r)}{pct ? ' pts' : '%'}</span>;
}

function VolumeTable({ s, set }: { s: GameScript; set: ScriptSet }) {
  const teams: ['away' | 'home', string][] = [['away', set.awayAbbr], ['home', set.homeAbbr]];
  return (
    <table className="fr-t voltab">
      <caption className="sr-only">Simulated volume in games that end this way, against every simulated game</caption>
      <thead>
        <tr><th scope="col">Metric</th><th scope="col" className="r">{set.awayAbbr}</th><th scope="col" className="r">{set.homeAbbr}</th></tr>
      </thead>
      <tbody>
        {VOL.map((v) => (
          <tr key={v.k}>
            <th scope="row">{v.label}</th>
            {teams.map(([side]) => {
              const x = s.volume[side][v.k];
              const base = set.overall[side][v.k];
              return (
                <td key={side} className="r">
                  <span className="fx-num">{x != null ? v.fmt(x) : '—'}</span> <Delta v={x} base={base} pct={v.pct} />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MarketList({ rows, slug, eventId, empty }: { rows: PriceRow[]; slug: string; eventId: string; empty: string }) {
  if (!rows.length) return <p className="fr-note">{empty}</p>;
  return (
    <ul className="fr-mlist">
      {rows.map((r) => (
        <li key={r.m.market_id}>
          <Link to={routes.market(slug, r.m.market_id, eventId)} className="fr-mlist__a">
            <span>{r.label}</span>
            <span className="fx-num fr-mlist__p">{r.ask != null ? `${Math.round(r.ask * 100)}¢` : '—'}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const UNIT_ROWS: { off: string; def: string; label: string }[] = [
  { off: 'met_nfl.adj_off_epa', def: 'met_nfl.adj_def_epa', label: 'Overall' },
  { off: 'met_nfl.adj_off_db_epa', def: 'met_nfl.adj_def_db_epa', label: 'Passing' },
  { off: 'met_nfl.adj_off_rush_epa', def: 'met_nfl.adj_def_rush_epa', label: 'Rushing' },
];

function UnitEvidence({ offProf, defProf, offAbbr, defAbbr, sportCode }: { offProf?: EntityProfileDoc | null; defProf?: EntityProfileDoc | null; offAbbr: string; defAbbr: string; sportCode: string }) {
  return (
    <div className="unitev">
      <div className="unitev__h">
        <span><TeamMark sport={sportCode} abbr={offAbbr} size="sm" /> {offAbbr} offense</span>
        <span className="muted">vs</span>
        <span>{defAbbr} defense <TeamMark sport={sportCode} abbr={defAbbr} size="sm" /></span>
      </div>
      {UNIT_ROWS.map((u) => {
        const o = teamStat(offProf, u.off);
        const d = teamStat(defProf, u.def);
        return (
          <div key={u.label} className="unitev__row">
            <span className={`unitev__r${o.rank != null && o.rank <= 8 ? ' is-top' : ''}`}>{o.rank == null ? '—' : `#${o.rank}`}</span>
            <span className="unitev__l">{u.label}</span>
            <span className={`unitev__r${d.rank != null && d.rank <= 8 ? ' is-top' : ''}`}>{d.rank == null ? '—' : `#${d.rank}`}</span>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ cinematic cards

function CastArt({ cast, lead, sport }: { cast: CastMember[]; lead: string | null; sport: string }) {
  const logo = useHeldImage(lead ? teamLogo(sport, lead) : null);
  return (
    <span className="fr-sc__art" aria-hidden="true">
      {logo && <img className="fr-sc__logo" src={logo} alt="" />}
      <span className={`fr-sc__cast${cast.length > 1 ? ' fr-sc__cast--two' : ''}`}>
        {cast.map((c) => <CastPhoto key={c.team} c={c} />)}
      </span>
    </span>
  );
}

function CastPhoto({ c }: { c: CastMember }) {
  const img = useHeldImage(c.photo?.src ?? null);
  return img ? <img className="fr-sc__img" src={img} alt="" style={{ objectPosition: c.photo!.focus }} /> : null;
}

/** Where each script ends on the final margin, over the simulation's published margin bands. */
export function scriptSegs(set: ScriptSet, on: ScriptId[], dimOthers: boolean): MarginSeg[] {
  return set.scripts.map((s) => ({ key: s.id, lo: s.home.lo, hi: s.home.hi, tone: s.index, label: s.canonical, on: on.includes(s.id), dim: dimOthers && !on.includes(s.id) }));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function marginBand(r: EventResearchDoc) {
  const hm = (r.extensions as any)?.game_script_inputs?.game_environment?.home_margin;
  return hm ? { mean: hm.mean ?? null, r50: hm.range_50 ?? null, r90: hm.range_90 ?? null } : null;
}

export function TheaterCards({ r, set, current, onPick, hrefFor, marks }: { r: EventResearchDoc; set: ScriptSet; current: ScriptId[]; onPick?: (id: ScriptId) => void; hrefFor?: (id: ScriptId) => string; marks?: Partial<Record<ScriptId, string>> }) {
  const lead = (s: GameScript) => (s.leader ? (s.leader === 'home' ? set.homeAbbr : set.awayAbbr) : null);
  return (
    <ul className="fr-scards">
      {set.scripts.map((s, rank) => {
        const on = current.includes(s.id);
        const cast = scriptCast(r, set, s);
        const leadAbbr = lead(s);
        const body = (
          <>
            <CastArt cast={cast} lead={leadAbbr} sport="NFL" />
            <span className="fr-sc__shade" aria-hidden="true" />
            <span className="fr-sc__top">
              <span className="fr-sc__ic" aria-hidden="true"><ScriptGlyph id={s.id} /></span>
              {rank === 0 && <span className="fr-sc__badge">Most likely</span>}
              {marks?.[s.id] && <span className="fr-sc__mark">{marks[s.id]}</span>}
            </span>
            <span className="fr-sc__name">{s.name}</span>
            <span className="fr-sc__pct"><b className="fx-num">{sharePct(s.share)}</b> of simulated games</span>
            <span className="fr-sc__d">{s.line}</span>
            <span className="fr-sc__bar" aria-hidden="true"><i style={{ width: `${Math.max(3, s.share * 100)}%` }} /></span>
          </>
        );
        const label = `${rank === 0 ? 'Most likely: ' : ''}${s.name}: ${sharePct(s.share)} of simulated games. ${s.summary}${on ? ' Selected.' : ''}`;
        return (
          <li key={s.id}>
            {onPick ? (
              <button type="button" className={`fr-sc fr-sc--s${s.index}${on ? ' is-on' : ''}`} aria-pressed={on} aria-label={label} onClick={() => onPick(s.id)}>{body}</button>
            ) : (
              <Link to={hrefFor!(s.id)} className={`fr-sc fr-sc--s${s.index}${on ? ' is-on' : ''}`} aria-current={on ? 'true' : undefined} aria-label={label}>{body}</Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Each team's key players and the team volume that bears on each, in one script against all simulated games. */
export function keyPlayers(r: EventResearchDoc, set: ScriptSet) {
  const proj = (pid: string, metric: string) => r.distributions.find((d) => d.entity_id === pid && d.metric_id === metric)?.mean ?? null;
  const out: { side: 'home' | 'away'; abbr: string; pid: string; name: string; role: string; vol: keyof TeamVolume; volLabel: string; proj: number | null; projLabel: string }[] = [];
  for (const side of ['away', 'home'] as const) {
    const tid = r.participants.find((p) => p.home_away === (side === 'home' ? 'HOME' : 'AWAY'))?.participant_id;
    const abbr = side === 'home' ? set.homeAbbr : set.awayAbbr;
    const top = (roles: string[], metric: string) => r.players.filter((p) => p.team_id === tid && roles.includes(p.role ?? '')).map((p) => ({ p, v: proj(p.participant_id, metric) })).filter((x) => x.v != null).sort((a, b) => b.v! - a.v!)[0];
    const qb = top(['QB'], 'met_nfl.sim_passing_yards');
    const rb = top(['RB'], 'met_nfl.sim_carries');
    const wr = top(['WR', 'TE'], 'met_nfl.sim_receiving_yards');
    if (qb) out.push({ side, abbr, pid: qb.p.participant_id, name: qb.p.display_name, role: 'QB', vol: 'passAtt', volLabel: 'Team pass att', proj: qb.v, projLabel: 'pass yds' });
    if (rb) out.push({ side, abbr, pid: rb.p.participant_id, name: rb.p.display_name, role: rb.p.role ?? 'RB', vol: 'rushAtt', volLabel: 'Team rush att', proj: rb.v, projLabel: 'carries' });
    if (wr) out.push({ side, abbr, pid: wr.p.participant_id, name: wr.p.display_name, role: wr.p.role ?? 'WR', vol: 'passAtt', volLabel: 'Team pass att', proj: wr.v, projLabel: 'rec yds' });
  }
  return out;
}

export function PlayerImpact({ p, s, set, slug }: { p: ReturnType<typeof keyPlayers>[number]; s: GameScript; set: ScriptSet; slug: string }) {
  const v = s.volume[p.side][p.vol];
  const base = set.overall[p.side][p.vol];
  const d = v != null && base ? (v - base) / base : null;
  return (
    <Link to={routes.player(slug, p.pid)} className="fr-pimp" style={{ ['--tc' as string]: teamColors('NFL', p.abbr)[0] }}>
      <PlayerFace photo={playerPhoto(p.pid, p.name, p.abbr)} team={p.abbr} size="md" />
      <span className="fr-pimp__id"><b>{p.name}</b><small>{p.role} · {p.abbr}</small></span>
      <span className="fr-pimp__v"><b className="fx-num">{v != null ? v.toFixed(1) : '—'}</b><small>{p.volLabel}</small></span>
      <span className={`fr-pimp__d fr-d fr-d--${d == null || Math.abs(d) < 0.03 ? 'flat' : d > 0 ? 'up' : 'down'}`}>{d == null ? '—' : Math.abs(d) < 0.03 ? 'avg' : `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) * 100)}%`}<small>vs all games</small></span>
    </Link>
  );
}

export function ScriptTab({ r, set, selected, hrefFor, rows, slug, eventId, homeProf, awayProf, sportCode }: {
  r: EventResearchDoc; set: ScriptSet; selected: ScriptId | null; hrefFor: (id: ScriptId | null) => string; rows: PriceRow[]; slug: string; eventId: string;
  homeProf?: EntityProfileDoc | null; awayProf?: EntityProfileDoc | null; sportCode: string;
}) {
  const [sp, setSp] = useSearchParams();
  const now = useNow(15_000);
  const compare = sp.get('view') === 'compare';
  const setView = (v: 'single' | 'compare') => setSp((p) => { const n = new URLSearchParams(p); if (v === 'compare') n.set('view', 'compare'); else n.delete('view'); return n; }, { replace: true });
  const s = set.scripts.find((x) => x.id === selected) ?? [...set.scripts].sort((a, b) => b.share - a.share)[0];
  const i = set.scripts.indexOf(s);
  const priced = rows.filter((x) => x.fit && x.ask != null && x.ask > 0.03 && x.ask < 0.97);
  const winsIn = (k: number) => priced.filter((x) => x.fit!.fits[k] === 'yes');
  const loses = priced.filter((x) => x.fit!.fits[i] === 'no').sort((a, b) => (b.ask ?? 0) - (a.ask ?? 0)).slice(0, 6);
  const leader = s.leader ?? set.fav;
  const trailer = leader === 'home' ? 'away' : 'home';
  const abbr = { home: set.homeAbbr, away: set.awayAbbr };
  const prof = { home: homeProf, away: awayProf };
  const players = keyPlayers(r, set);
  const lean = (sc: GameScript, side: 'home' | 'away', k: 'passAtt' | 'rushAtt') => {
    const v = sc.volume[side][k];
    const b = set.overall[side][k];
    return v != null && b ? (v - b) / b : null;
  };
  const leanWord = (x: number | null) => (x == null ? 'not published' : Math.abs(x) < 0.03 ? 'about the same' : `${x > 0 ? 'more' : 'less'} (${x > 0 ? '+' : '−'}${Math.round(Math.abs(x) * 100)}%)`);
  const others = set.scripts.filter((x) => x.id !== s.id).sort((a, b) => b.share - a.share);
  const band = marginBand(r);
  const scripts = boardScripts(set);
  const expr = scriptExpressions(r, rows, set, s.id, set.names);
  const exprRows: ExpressionRow[] = expr.items.map((x) => ({
    key: `${x.row.m.market_id}${x.side}`, family: x.kind === 'moneyline' ? 'Moneyline' : x.kind === 'spread' ? 'Spread' : 'Player props', label: x.row.label, side: x.side, ask: x.ask,
    at: x.row.m.captured_at ?? null, href: routes.market(slug, x.row.m.market_id, eventId), why: x.why, basis: x.basis,
  }));
  const details = (id: string) => {
    const k = set.scripts.findIndex((x) => x.id === id);
    const sc = set.scripts[k];
    const n = winsIn(k).length;
    return (
      <>
        <p><b>{sc.line}</b> {rangeText(sc, set)}</p>
        <p>{(['away', 'home'] as const).map((side) => `${set.names[side]} pass ${leanWord(lean(sc, side, 'passAtt'))}`).join(' · ')}.</p>
        <p>{n ? <><b>{n}</b> priced margin {n === 1 ? 'contract wins' : 'contracts win'} in every game of it.</> : 'No priced margin contract wins in every game of it.'}</p>
      </>
    );
  };
  return (
    <div className="fr-theater">
      <header className="fr-th__h">
        <span className="fr-th__ic" aria-hidden="true"><Icon name="layers" size={22} /></span>
        <div className="fr-th__tt">
          <h2 className="fr-th__t">SIFT Game Script Theater</h2>
          <p className="fr-th__sub">How {set.names.away} at {set.names.home} could end, and which priced contracts each ending pays. Shares are of simulated games, not odds. <Info label="What is sim share?">{SIM_SHARE_INFO}</Info></p>
        </div>
        <div className="fr-seg fr-th__mode" role="group" aria-label="Theater mode">
          <button type="button" className={`fr-seg__b${!compare ? ' is-on' : ''}`} aria-pressed={!compare} onClick={() => setView('single')}><Icon name="eye" size={15} /> Single script</button>
          <button type="button" className={`fr-seg__b${compare ? ' is-on' : ''}`} aria-pressed={compare} onClick={() => setView('compare')}><Icon name="compare" size={15} /> Compare scripts</button>
        </div>
      </header>

      {compare ? (
        <ScriptCompareStudio r={r} set={set} rows={rows} slug={slug} />
      ) : (
        <>
          <SurvivorBoard
            sport={sportCode} scripts={scripts} items={survivorItems(rows, set, slug, eventId)} now={now} selected={s.id}
            title="Bets that survive the most scripts"
            sub={<>Priced moneylines and spreads that win in every game of two or more scripts. Exact, because they settle on the final margin. <Info label="Why two of four is the ceiling">The four scripts are ranges of the final margin, so a side can always win in at most two of them; the third (a one-score game) it wins only in part. Surviving many scripts is not a reason on its own: read the price next to it.</Info></>}
            empty="No priced margin contract wins in every game of two or more scripts on this game."
          />

          <h3 className="fr-k fr-th__pick">Choose a script</h3>
          <TheaterCards r={r} set={set} current={[s.id]} hrefFor={(id) => hrefFor(id)} />
          <div className="fx-bento fr-th__grid">
            <section className={`fx-card fx-span-4 fr-sel fr-sel--s${s.index}`} aria-labelledby="stab-h">
              <span className="fr-sel__tag">Selected script</span>
              <h2 className="fr-sel__name" id="stab-h">{s.name}</h2>
              <p className="fr-sel__pct"><b className="fx-num">{sharePct(s.share)}</b> of simulated games <ShareBar value={s.share} tone={s.index} label={`${sharePct(s.share)} of simulated games`} /></p>
              <p className="fr-sel__story">{s.summary}</p>
              <details className="lsd-more">
                <summary>How it plays</summary>
                {s.detail && <p>{s.detail}</p>}
                <p>{rangeText(s, set)} Score paths are not simulated, only the final margin.</p>
                <p>{(['away', 'home'] as const).map((side) => `${set.names[side]} pass ${leanWord(lean(s, side, 'passAtt'))}, run ${leanWord(lean(s, side, 'rushAtt'))}`).join('; ')}.</p>
                <p>{sharePct(1 - s.share)} of simulated games end another way{others[0] ? `, most often ${others[0].name} (${sharePct(others[0].share)})` : ''}.</p>
              </details>
            </section>

            <section className="fx-card fx-span-8" aria-labelledby="stab-sim">
              <h3 className="fx-card__t" id="stab-sim"><Icon name="chart" size={16} /> How the simulations split <small className="fr-k">hover or tap a script · choose to select</small></h3>
              <ScriptShareChart
                sport={sportCode} scripts={scripts} selected={s.id} hrefFor={(id) => hrefFor(id as ScriptId)} details={details}
                label={`Share of simulated games by script: ${set.scripts.map((x) => `${x.name} ${sharePct(x.share)}`).join(', ')}`}
              />
              {set.tie != null ? <CloseSplitNote tie={set.tie} /> : set.scripts.some((x) => x.id === 'close') && <CloseSplitHeldNote />}
            </section>

            <section className="fx-card fx-span-7" aria-labelledby="stab-mk">
              <h3 className="fx-card__t" id="stab-mk"><Icon name="layers" size={16} /> Ways to bet {s.name}</h3>
              <ExpressionList rows={exprRows} missing={expr.missing} now={now} empty="No priced contract expresses this script." note={VOLUME_LEAN_NOTE} />
              <details className="lsd-more">
                <summary>Contracts this script beats ({loses.length})</summary>
                <MarketList rows={loses} slug={slug} eventId={eventId} empty="No priced margin market loses in every game of this script." />
              </details>
            </section>

            <section className="fx-card fx-span-5" aria-labelledby="stab-mm">
              <h3 className="fx-card__t" id="stab-mm"><Icon name="chart" size={16} /> Where it ends</h3>
              <MarginMap segs={scriptSegs(set, [s.id], false)} band={band} homeAbbr={set.homeAbbr} awayAbbr={set.awayAbbr} label={`Final margin of each script, ${s.name} selected`} />
              <p className="fr-note">Each script is a range of final margins over the simulation’s published bands.</p>
            </section>

            <section className="fx-card fx-span-8" aria-labelledby="stab-pl">
              <h3 className="fx-card__t" id="stab-pl"><Icon name="star" size={16} /> Impacted players · this script</h3>
              {players.length ? <div className="fr-pimps">{players.map((p) => <PlayerImpact key={p.pid} p={p} s={s} set={set} slug={slug} />)}</div> : <p className="fr-note">No projected players published for this game.</p>}
              <p className="fr-note">His <b>team’s</b> volume in this script against all simulated games. Player projections are not split by script.</p>
            </section>

            <section className="fx-card fx-span-4" aria-labelledby="stab-vol">
              <h3 className="fx-card__t" id="stab-vol"><Icon name="grid" size={16} /> Key game metrics</h3>
              <VolumeTable s={s} set={set} />
              <p className="fr-note">Simulated averages in games that end this way, against every simulated game.</p>
            </section>

            <section className="fx-card fx-span-6" aria-labelledby="stab-ev">
              <h3 className="fx-card__t" id="stab-ev"><Icon name="compare" size={16} /> Matchup evidence <Info label="About these ranks">League ranks (of 32) of the opponent-adjusted ratings. For defenses, #1 allows the least. Ranks show strength against strength; Sift does not combine them into one number (see the Matchup tab).</Info></h3>
              <UnitEvidence offProf={prof[leader]} defProf={prof[trailer]} offAbbr={abbr[leader]} defAbbr={abbr[trailer]} sportCode={sportCode} />
              {s.id === 'close' && <UnitEvidence offProf={prof[trailer]} defProf={prof[leader]} offAbbr={abbr[trailer]} defAbbr={abbr[leader]} sportCode={sportCode} />}
            </section>

            <section className="fx-card fx-span-6" aria-labelledby="stab-br">
              <h3 className="fx-card__t" id="stab-br"><Icon name="shield" size={16} /> What breaks it</h3>
              <ul className="breaks fr-breaks">
                {others.map((x) => (
                  <li key={x.id}><Link to={hrefFor(x.id)} className={`breaks__a scard--s${x.index}`}><i aria-hidden="true" />{x.name}<ShareBar value={x.share} tone={x.index} label={`${sharePct(x.share)} of simulated games`} /><span className="fx-num">{sharePct(x.share)}</span></Link></li>
                ))}
              </ul>
              {set.notSimulated.length > 0 && <p className="fr-note stab__foot">The simulation models the final margin and total only; it does not simulate {set.notSimulated.join(', ')}.</p>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
