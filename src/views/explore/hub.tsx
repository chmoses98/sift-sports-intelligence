// The Explore hub's interactive parts (approved reference 11): the team rankings table (switchable unit and metric,
// opponent-adjusted first, real ranking documents joined by team), the quick-stats bar chart (league percentile of a
// published ranking), key matchups this week (NFL opponent-adjusted mismatches, or the closest games by the market's
// own win price) and the season timeline (NFL weeks via the season navigator's hook; other sports by day).
// Every value is a published field; a sport whose publication has none of it says so.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { BoardItem, EventResearchDoc, RankingDoc } from '../../contract/types';
import { FxCard } from '../../components/fx';
import { Icon } from '../../components/Icon';
import { TeamMark } from '../../components/ui';
import { useAsync } from '../../data/hooks';
import type { SportRepo } from '../../data/repo';
import { gameSides } from '../../insights/game';
import { matchupInsights } from '../../insights/matchups';
import { routes } from '../../lib/routes';
import { teamColors } from '../../lib/teams';
import { eventPhase } from '../../opportunity/lifecycle';
import { heroNumbers } from '../broadcast/numbers';
import { PMark } from '../broadcast/parts';
import { useNflWeeks } from './SeasonView';

export interface SearchItem { id: string; kind: string; label: string; secondary?: string | null; context?: { team?: string | null; position?: string | null; season?: string | null } }

const LOGO_SPORTS = new Set(['NFL', 'NHL', 'NBA', 'MLB', 'CFB']);

/** "Adjusted offensive EPA per play" from "Adjusted offensive EPA per play ranking (ADJ_RIDGE)". */
export const cleanRank = (label: string) => label.replace(/\s*ranking\s*/i, ' ').replace(/\s*\([^)]*\)\s*$/, '').trim();
/** What window a ranking covers, in words: "opponent-adjusted", "last 34", "2026-27 regular season, situation=5on4". */
export function rankWindow(r: SearchItem): string {
  const p = /\(([^)]*)\)\s*$/.exec(r.label)?.[1] ?? '';
  if (/^ADJ/i.test(p)) return 'opponent-adjusted';
  if (/^L(\d+)$/.test(p)) return `last ${p.slice(1)} games`;
  if (/^SEASON$/i.test(p)) return 'season';
  if (p) return p;
  return (r.secondary ?? '').split(', ').slice(1).join(', ');
}
const isAdj = (r: SearchItem) => /\(ADJ/i.test(r.label);
/** Which unit a team ranking describes. "Sack rate allowed" is an offense's protection, not a defense. */
export function unitOf(label: string): 'offense' | 'defense' {
  if (/sack rate allowed/i.test(label)) return 'offense';
  return /defens|against|allowed|takeaway|opponent|\bera\b|xfip|bullpen|pitch|save percentage/i.test(label) ? 'defense' : 'offense';
}
const yearOf = (r: SearchItem) => Math.max(0, ...((`${r.label} ${r.secondary ?? ''}`.match(/20\d\d/g) ?? []).map(Number)));

/** A sport's team rankings, opponent-adjusted first, then the most recent season, then recent form. */
export function teamRankings(items: SearchItem[]): SearchItem[] {
  return items
    .filter((i) => i.kind === 'RANKING' && /\b(teams|clubs)\b/i.test(i.secondary ?? i.label) && !/players|skaters|goalies|pitchers|batters/i.test(i.secondary ?? ''))
    .sort((a, b) => Number(isAdj(b)) - Number(isAdj(a)) || yearOf(b) - yearOf(a) || Number(/\(L\d+\)/.test(a.label)) - Number(/\(L\d+\)/.test(b.label)) || a.label.localeCompare(b.label));
}

const NFL_DEFAULT = { offense: /Adjusted offensive EPA per play ranking/i, defense: /Adjusted defensive EPA per play allowed ranking/i };
const NFL_COMPANIONS = {
  offense: [{ re: /Adjusted offensive success rate ranking/i, label: 'Success ±pts' }, { re: /Points scored per game ranking/i, label: 'Pts/gm' }],
  defense: [{ re: /Adjusted defensive success rate allowed ranking/i, label: 'Success allowed ±pts' }, { re: /Points allowed per game ranking/i, label: 'Pts allowed' }],
};

export function fmtRankValue(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a < 1) return `${v > 0 ? '+' : v < 0 ? '−' : ''}${a.toFixed(3)}`;
  return a >= 100 ? v.toFixed(0) : v.toFixed(1);
}

function useRanking(repo: SportRepo | null, id: string | null) {
  return useAsync(repo && id ? `hub:rank:${repo.source.root}:${id}` : null, () => repo!.ranking(id!).catch(() => null as RankingDoc | null));
}

export function RankingsTable({ slug, code, repo, items }: { slug: string; code: string; repo: SportRepo | null; items: SearchItem[] }) {
  const all = useMemo(() => teamRankings(items), [items]);
  const byUnit = useMemo(() => ({ offense: all.filter((r) => unitOf(r.label) === 'offense'), defense: all.filter((r) => unitOf(r.label) === 'defense') }), [all]);
  const both = byUnit.offense.length > 0 && byUnit.defense.length > 0;
  const [unit, setUnit] = useState<'offense' | 'defense'>('offense');
  const pool = both ? byUnit[unit] : all;
  const [pick, setPick] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const def = code === 'NFL' ? pool.find((r) => NFL_DEFAULT[unit].test(r.label)) : undefined;
  const cur = pool.find((r) => r.id === pick) ?? def ?? pool[0] ?? null;
  const doc = useRanking(repo, cur?.id ?? null);
  const comps = code === 'NFL' ? NFL_COMPANIONS[unit].map((c) => ({ ...c, item: all.find((r) => c.re.test(r.label)) ?? null })).filter((c) => c.item) : [];
  const c1 = useRanking(repo, comps[0]?.item?.id ?? null);
  const c2 = useRanking(repo, comps[1]?.item?.id ?? null);
  const compDocs = [c1.data, c2.data];
  const rows = doc.data?.entries ?? [];
  const shown = more ? rows : rows.slice(0, 10);
  if (!all.length) return <FxCard title="Team rankings" icon="shield" id="rk"><p className="tm-none"><Icon name="info" size={14} /> This publication ships no team rankings.</p></FxCard>;
  return (
    <FxCard title={`${code === 'TENNIS' ? 'Player' : `${code}`} team rankings`} icon="shield" id="rankings" className="ex-rk" action={cur ? { to: routes.ranking(slug, cur.id), label: 'Full ranking' } : undefined}>
      <div className="ex-rk__ctl">
        {both && (
          <div className="tm-seg" role="group" aria-label="Unit">
            {(['offense', 'defense'] as const).map((u) => <button key={u} type="button" className={unit === u ? 'is-on' : undefined} aria-pressed={unit === u} onClick={() => { setUnit(u); setPick(null); }}>{u === 'offense' ? 'Offense' : 'Defense'}</button>)}
          </div>
        )}
        <label className="hubm__select ex-rk__sel"><span className="sr-only">Metric</span>
          <select value={cur?.id ?? ''} onChange={(e) => setPick(e.target.value)} aria-label="Ranking metric">
            {pool.slice(0, 60).map((r) => <option key={r.id} value={r.id}>{cleanRank(r.label)} · {rankWindow(r)}</option>)}
          </select>
        </label>
      </div>
      {doc.loading ? <div className="skel" style={{ height: 240 }} /> : rows.length ? (
        <div className="tm-tw" role="region" aria-label="Team rankings table" tabIndex={0}>
          <table className={`tm-t ex-rk__t${more ? '' : ' is-collapsed'}`}>
            <thead><tr><th scope="col">Rank</th><th scope="col">Team</th><th scope="col">{cur ? cleanRank(cur.label).replace(/^Adjusted /, '') : 'Value'}</th>{comps.map((c) => <th key={c.label} scope="col" className="ex-rk__cmp">{c.label}</th>)}<th scope="col" className="ex-rk__pc">Percentile</th></tr></thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.entity_id}>
                  <td className="fx-num ex-rk__n">{e.rank}</td>
                  <th scope="row"><Link to={routes.team(slug, e.entity_id)} className="ex-rk__tm">{LOGO_SPORTS.has(code) && <TeamMark sport={code} abbr={e.short_name} size="sm" />}<span>{LOGO_SPORTS.has(code) ? e.short_name : e.display_name}</span></Link></th>
                  <td className={`fx-num ${(e.percentile ?? 50) >= 50 ? 'tm-pos' : 'tm-neg'}`}>{fmtRankValue(e.value)}</td>
                  {comps.map((c, i) => { const x = compDocs[i]?.entries.find((y) => y.entity_id === e.entity_id); return <td key={c.label} className="fx-num ex-rk__cmp">{x ? (/success/i.test(c.label) && x.value != null && Math.abs(x.value) <= 1 ? `${x.value > 0 ? '+' : x.value < 0 ? '−' : ''}${Math.abs(x.value * 100).toFixed(1)}` : fmtRankValue(x.value)) : '—'}</td>; })}
                  <td className="ex-rk__pc"><span className="ex-pbar" aria-hidden="true"><i style={{ width: `${Math.max(3, e.percentile ?? 0)}%` }} /></span><span className="sr-only">{Math.round(e.percentile ?? 0)}th percentile</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="tm-none"><Icon name="info" size={14} /> This ranking could not be read.</p>}
      <div className="ex-rk__foot">
        {rows.length > 10 && <button type="button" className="btn btn--sm btn--glass" aria-expanded={more} onClick={() => setMore((x) => !x)}>{more ? 'Show top 10' : `Show all ${rows.length}`}</button>}
        <span className="tm-note">{doc.data ? `${doc.data.universe.label} · as of ${new Date(doc.data.as_of).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}. Rank 1 = best at the unit’s job${doc.data.higher_is_better === false ? ' (lower values are better here)' : ''}.${comps.length ? ' Success ±pts: opponent-adjusted success rate against the league, in percentage points.' : ''}` : ''}</span>
      </div>
    </FxCard>
  );
}

export function QuickStats({ code, repo, items }: { code: string; repo: SportRepo | null; items: SearchItem[] }) {
  const all = useMemo(() => teamRankings(items), [items]);
  const def = all.find((r) => /Adjusted offensive EPA per dropback ranking/i.test(r.label)) ?? all[1] ?? all[0] ?? null;
  const [pick, setPick] = useState<string | null>(null);
  const cur = all.find((r) => r.id === pick) ?? def;
  const doc = useRanking(repo, cur?.id ?? null);
  const top = (doc.data?.entries ?? []).slice(0, 10);
  if (!all.length) return null;
  return (
    <FxCard title={`${code} quick stats`} icon="chart" id="quick" className="ex-qs">
      <label className="hubm__select ex-rk__sel"><span>Statistic</span>
        <select value={cur?.id ?? ''} onChange={(e) => setPick(e.target.value)}>
          {all.slice(0, 60).map((r) => <option key={r.id} value={r.id}>{cleanRank(r.label)} · {rankWindow(r)}</option>)}
        </select>
      </label>
      {top.length ? (
        <ol className="ex-qs__bars" aria-label={`${cur ? cleanRank(cur.label) : 'Ranking'}: top ten`}>
          {top.map((e) => (
            <li key={e.entity_id} style={{ ['--bc' as string]: LOGO_SPORTS.has(code) ? teamColors(code, e.short_name)[0] : 'var(--fx-cyan)' }}>
              <span className="fx-num ex-qs__n">{e.rank}</span>
              {LOGO_SPORTS.has(code) && <TeamMark sport={code} abbr={e.short_name} size="sm" />}
              <span className="ex-qs__t">{LOGO_SPORTS.has(code) ? e.short_name : e.display_name}</span>
              <span className="ex-qs__bar" aria-hidden="true"><i style={{ width: `${Math.max(4, e.percentile ?? 0)}%` }} /></span>
              <b className="fx-num ex-qs__v">{fmtRankValue(e.value)}</b>
            </li>
          ))}
        </ol>
      ) : doc.loading ? <div className="skel" style={{ height: 220 }} /> : <p className="tm-none"><Icon name="info" size={14} /> No values published for this ranking.</p>}
      <p className="tm-note">Bar = the team’s league percentile on this published ranking (longer is better at the job).</p>
    </FxCard>
  );
}

/** Research for the next few published games (at most ten), read once per sport and memoised. */
function useWeekResearch(repo: SportRepo | null, board: BoardItem[], slug: string) {
  const ids = useMemo(() => {
    const now = Date.now();
    return board.filter((b) => Date.parse(b.start_time_utc) > now - 3 * 3600_000 && Date.parse(b.start_time_utc) < now + 8 * 86_400_000).sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc)).slice(0, 10).map((b) => b.event_id);
  }, [board]);
  return useAsync(repo && ids.length ? `hub:week:${slug}:${ids.join(',')}` : null, async () => {
    const out = await Promise.allSettled(ids.map((id) => repo!.eventResearch(id)));
    return out.flatMap((o) => (o.status === 'fulfilled' ? [o.value] : [])) as EventResearchDoc[];
  });
}

export function KeyMatchups({ slug, code, repo, board, available }: { slug: string; code: string; repo: SportRepo | null; board: BoardItem[]; available: boolean }) {
  const res = useWeekResearch(available ? repo : null, board, slug);
  const [tab, setTab] = useState<'mismatch' | 'close'>(code === 'NFL' ? 'mismatch' : 'close');
  const mism = useMemo(() => (code === 'NFL' ? (res.data ?? []).flatMap((r) => matchupInsights(r).slice(0, 2).map((i) => ({ r, i }))).sort((a, b) => b.i.score - a.i.score).slice(0, 5) : []), [res.data, code]);
  const close = useMemo(() => (res.data ?? []).map((r) => ({ r, n: heroNumbers(r), g: gameSides(r) })).filter((x) => x.n?.home.marketWin != null && x.g).sort((a, b) => Math.abs(a.n!.home.marketWin! - 0.5) - Math.abs(b.n!.home.marketWin! - 0.5)).slice(0, 5), [res.data]);
  const t = code === 'NFL' ? tab : 'close';
  return (
    <FxCard title="Key matchups this week" icon="compare" id="keym" className="ex-km" action={{ to: routes.intelligence({ sport: slug }), label: 'Terminal' }}>
      {code === 'NFL' && (
        <div className="tm-seg" role="group" aria-label="Matchup view">
          <button type="button" className={t === 'mismatch' ? 'is-on' : undefined} aria-pressed={t === 'mismatch'} onClick={() => setTab('mismatch')}>Biggest mismatches</button>
          <button type="button" className={t === 'close' ? 'is-on' : undefined} aria-pressed={t === 'close'} onClick={() => setTab('close')}>Closest games</button>
        </div>
      )}
      {!available ? <p className="tm-none"><Icon name="info" size={14} /> This publication carries no per-game research documents, so there are no matchup reads to rank.</p>
        : res.loading ? <div className="skel" style={{ height: 260 }} />
        : t === 'mismatch' ? (mism.length ? (
          <ul className="ex-km__list">
            {mism.map(({ r, i }) => {
              const g = gameSides(r);
              return (
                <li key={`${r.event.event_id}:${i.id}`}>
                  <Link to={routes.game(slug, r.event.event_id, { tab: 'matchup' })} className="ex-km__row">
                    <span className="ex-km__marks"><TeamMark sport="NFL" abbr={g?.away.abbr} size="md" /><TeamMark sport="NFL" abbr={g?.home.abbr} size="md" /></span>
                    <span className="ex-km__txt"><b>{g ? `${g.away.abbr} @ ${g.home.abbr}` : ''} · {i.offense.team.abbr} {i.offense.unit} vs {i.defense.team.abbr} {i.defense.unit}</b><small>{i.offense.team.abbr} #{i.offense.rank.rank} vs {i.defense.team.abbr} #{i.defense.rank.rank} of {i.defense.rank.of} (opponent-adjusted)</small></span>
                    <span className={`ex-km__sz ex-km__sz--${i.size}`}>{i.size === 'major' ? 'Major' : 'Clear'}</span>
                    <Icon name="chevronRight" size={16} />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : <p className="tm-none"><Icon name="info" size={14} /> No ranked mismatch clears the publication’s threshold in the next week’s games.</p>)
        : close.length ? (
          <ul className="ex-km__list">
            {close.map(({ r, n, g }) => (
              <li key={r.event.event_id}>
                <Link to={routes.game(slug, r.event.event_id)} className="ex-km__row">
                  <span className="ex-km__marks"><PMark sport={code} p={r.event.participants.find((p) => p.participant_id === g!.away.pid) as never} size="sm" /><PMark sport={code} p={r.event.participants.find((p) => p.participant_id === g!.home.pid) as never} size="sm" /></span>
                  <span className="ex-km__txt"><b>{g!.away.abbr} @ {g!.home.abbr}</b><small>Market win price {n!.away.abbr} {Math.round((n!.away.marketWin ?? 1 - n!.home.marketWin!) * 100)}% · {n!.home.abbr} {Math.round(n!.home.marketWin! * 100)}% · {new Date(r.event.start_time_utc).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</small></span>
                  <span className="ex-km__sz ex-km__sz--clear">{Math.abs(n!.home.marketWin! - 0.5) < 0.05 ? 'Coin flip' : 'Close'}</span>
                  <Icon name="chevronRight" size={16} />
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="tm-none"><Icon name="info" size={14} /> No market win prices are published for the next games.</p>}
      <p className="tm-note">{t === 'mismatch' ? 'Opponent-adjusted unit ranks from each game’s research: a matchup read, not a bet.' : 'Market-implied win prices from the publication’s capture — the market’s view, not Sift’s.'}</p>
    </FxCard>
  );
}

const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);

function NflTimeline({ repo, slug }: { repo: SportRepo | null; slug: string }) {
  const wk = useNflWeeks(repo, 'NFL');
  const [week, setWeek] = useState<number | null>(null);
  const w = week ?? wk.currentWeek;
  const games = wk.byWeek.get(w) ?? [];
  if (wk.idx.loading) return <div className="skel" style={{ height: 200 }} />;
  return (
    <>
      <ol className="ex-wk" aria-label="Weeks">
        {WEEKS.map((n) => {
          const gs = wk.byWeek.get(n) ?? [];
          return (
            <li key={n}>
              <button type="button" className={`ex-wk__c${n === w ? ' is-on' : ''}${n === wk.currentWeek ? ' is-now' : ''}${gs.length ? '' : ' is-empty'}`} aria-pressed={n === w} onClick={() => setWeek(n)} aria-label={`Week ${n}: ${gs.length ? `${gs.length} games published` : 'not listed'}${n === wk.currentWeek ? ' (current week)' : ''}`}>
                <b>{n}</b><small>{gs.length || '—'}</small>
              </button>
            </li>
          );
        })}
      </ol>
      {games.length ? (
        <ul className="ex-tiles">
          {games.slice(0, 16).map((g) => {
            const a = wk.nameOf(g.away_participant), h = wk.nameOf(g.home_participant);
            const ph = eventPhase(g, Date.now()).phase;
            return (
              <li key={g.event_id}>
                <Link to={routes.game(slug, g.event_id)} className="ex-tile">
                  <span className="ex-tile__d">{new Date(g.start_time_utc).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  <span className="ex-tile__m"><TeamMark sport="NFL" abbr={a} size="md" /><b>{a}</b><i>@</i><b>{h}</b><TeamMark sport="NFL" abbr={h} size="md" /></span>
                  <span className="ex-tile__s">{ph === 'FINAL' ? 'Final' : ph === 'STARTED' ? 'Awaiting result' : new Date(g.start_time_utc).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : <p className="tm-none"><Icon name="info" size={14} /> Week {w} is not listed yet: the publication lists games as its schedule window reaches them. Sift never fills a week in.</p>}
    </>
  );
}

function DayTimeline({ board, code, slug }: { board: BoardItem[]; code: string; slug: string }) {
  const days = useMemo(() => {
    const m = new Map<string, BoardItem[]>();
    for (const b of board) { const k = new Date(b.start_time_utc).toLocaleDateString('en-CA'); m.set(k, [...(m.get(k) ?? []), b]); }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [board]);
  const today = new Date().toLocaleDateString('en-CA');
  const [pick, setPick] = useState<string | null>(null);
  const sel = pick ?? days.find(([d]) => d >= today)?.[0] ?? days[days.length - 1]?.[0] ?? null;
  const items = days.find(([d]) => d === sel)?.[1] ?? [];
  if (!days.length) return <p className="tm-none"><Icon name="info" size={14} /> The publication’s board lists no games right now.</p>;
  return (
    <>
      <ol className="ex-wk ex-wk--days" aria-label="Days">
        {days.slice(0, 14).map(([d, gs]) => { const dt = new Date(`${d}T12:00:00`); return <li key={d}><button type="button" className={`ex-wk__c${d === sel ? ' is-on' : ''}${d === today ? ' is-now' : ''}`} aria-pressed={d === sel} onClick={() => setPick(d)} aria-label={`${dt.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}: ${gs.length} games`}><b>{dt.getDate()}</b><small>{dt.toLocaleDateString(undefined, { weekday: 'short' })}</small></button></li>; })}
      </ol>
      <ul className="ex-tiles">
        {items.slice(0, 16).map((g) => {
          const away = g.participants.find((p) => p.participant_id === g.away_participant) ?? g.participants[1];
          const home = g.participants.find((p) => p.participant_id === g.home_participant) ?? g.participants[0];
          const ph = eventPhase(g, Date.now()).phase;
          return (
            <li key={g.event_id}>
              <Link to={routes.game(slug, g.event_id)} className="ex-tile">
                <span className="ex-tile__d">{g.competition ?? code}</span>
                <span className="ex-tile__m"><PMark sport={code} p={away} size="sm" /><b>{away?.short_name ?? away?.display_name}</b><i>{code === 'SOCCER' || code === 'TENNIS' ? 'v' : '@'}</i><b>{home?.short_name ?? home?.display_name}</b><PMark sport={code} p={home} size="sm" /></span>
                <span className="ex-tile__s">{ph === 'FINAL' ? 'Final' : ph === 'STARTED' ? 'In play / awaiting result' : new Date(g.start_time_utc).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function SeasonTimeline({ slug, code, repo, board }: { slug: string; code: string; repo: SportRepo | null; board: BoardItem[] }) {
  return (
    <FxCard title={code === 'NFL' ? 'Season timeline' : 'Schedule'} icon="grid" id="timeline" className="ex-tl" action={{ to: routes.season(slug), label: code === 'NFL' ? 'Season navigator' : 'Full calendar' }}>
      {code === 'NFL' ? <NflTimeline repo={repo} slug={slug} /> : <DayTimeline board={board} code={code} slug={slug} />}
    </FxCard>
  );
}
