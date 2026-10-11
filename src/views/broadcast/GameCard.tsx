// The shared game card body (issues 2, 19, 21, 50): team rows with records and opponent-adjusted ranks (or final
// scores), one line for the model's and the market's read (or the result against the closing spread), and a footer
// with one contextual tag and the validated-market indicator. Home's rail and the Games grid both draw it.
// A card first renders from the board alone; its game research loads only when the card scrolls into view.
import { useMemo } from 'react';
import { tierOf } from '../../lib/rank';
import { findLeagueGame, recordsFrom, useLeagueSchedule, LEAGUE_SOURCE, type LeagueScheduleDoc } from '../../history/league';
import { cardFacts, type CardFacts, type RankChip, type SideFacts } from './cardFacts';
import type { GameRow } from './games';
import { PMark, useGameResearch } from './parts';
import '../../styles/lane-e-cards.css';

/** Sports whose research documents carry what a card reads (ranks, model, market). Tennis and soccer cards stay light. */
const RESEARCH_SPORTS = new Set(['NFL', 'NHL', 'CFB', 'NBA']);

const recordCache = new WeakMap<LeagueScheduleDoc, Map<string, ReturnType<typeof recordsFrom>>>();
function recordsBefore(doc: LeagueScheduleDoc, date: string | null) {
  let m = recordCache.get(doc);
  if (!m) recordCache.set(doc, (m = new Map()));
  const k = date ?? '';
  if (!m.has(k)) m.set(k, recordsFrom(doc.games, date));
  return m.get(k)!;
}

const abbrOf = (p: GameRow['home']) => p?.short_name ?? p?.display_name ?? '';

/** The card's facts for one game, enriched once `load` is true (the card is on screen). */
export function useCardFacts(g: GameRow, load: boolean): { facts: CardFacts; loading: boolean } {
  const research = useGameResearch(load && RESEARCH_SPORTS.has(g.sport) ? g.slug : null, load && RESEARCH_SPORTS.has(g.sport) ? g.item.event_id : null);
  const league = useLeagueSchedule(g.sport === 'NFL' ? 'NFL' : null);
  const away = abbrOf(g.away);
  const home = abbrOf(g.home);
  const facts = useMemo(() => {
    const lg = league.data ? findLeagueGame(league.data.games, away, home, g.item.start_time_utc) : null;
    const records = league.data && lg ? recordsBefore(league.data, lg.date) : null;
    return cardFacts({ sport: g.sport, away, home, research: research.data ?? null, league: lg, records, opps: g.opps, over: g.phase !== 'PREGAME' && g.phase !== 'NO_START' });
  }, [research.data, league.data, g, away, home]);
  return { facts, loading: research.loading };
}

const TONE: Record<string, string> = { elite: 'good', strong: 'good', average: 'mid', weak: 'bad', poor: 'bad' };
export function Rank({ k, r, unit }: { k: string; r: RankChip | null; unit: string }) {
  if (!r) return null;
  return <span className={`gc-rk gc-rk--${TONE[tierOf(r.rank, r.of)] ?? 'mid'}`} title={`Opponent-adjusted ${unit} EPA per play: #${r.rank} of ${r.of} (the publication’s ranked teams)`}><i>{k}</i>#{r.rank}</span>;
}

function TeamRow({ g, p, s, size }: { g: GameRow; p: GameRow['home']; s: SideFacts; size: 'sm' | 'md' }) {
  const name = !p ? '' : g.sport === 'SOCCER' || g.sport === 'TENNIS' || g.sport === 'CBB' ? p.display_name : p.short_name ?? p.display_name;
  return (
    <span className={`gc-team${s.won === true ? ' is-win' : s.won === false ? ' is-loss' : ''}`}>
      <PMark sport={g.sport} p={p} size={size} />
      <span className="gc-team__n">{name}</span>
      {s.record && <span className="gc-team__rec" title={`${s.abbr} record before this game (${LEAGUE_SOURCE})`}>{s.record}</span>}
      <span className="gc-team__rks"><Rank k="O" r={s.off} unit="offense" /><Rank k="D" r={s.def} unit="defense" /></span>
      {s.score != null && <b className="gc-team__sc bnum">{s.score}</b>}
    </span>
  );
}

/** The card's read line and footer. */
function Reads({ f }: { f: CardFacts }) {
  if (f.final) {
    const a = f.final.ats;
    return (
      <span className="gc-read gc-read--final">
        <span className="gc-read__res">{f.final.line}</span>
        {a ? <span className={`gc-ats gc-ats--${a.cover ?? 'pk'}`} title={`Against the closing spread published by the ${LEAGUE_SOURCE}`}>{a.text}</span> : <span className="gc-read__none">No closing spread published</span>}
      </span>
    );
  }
  if (!f.model && !f.market) return null;
  return (
    <span className="gc-read">
      {f.model && <span className="gc-read__i" title={f.model.title}><i>Model</i>{f.model.text}</span>}
      {f.market && <span className="gc-read__i gc-read__i--mkt" title={f.market.title}><i>Market</i>{f.market.text}</span>}
    </span>
  );
}

export function CardFoot({ f, fallback }: { f: CardFacts; fallback?: string | null }) {
  const e = f.edge;
  if (!f.tag && !e && !fallback) return null;
  return (
    <span className="gc-foot">
      {f.tag && <span className={`gc-tag gc-tag--${f.tag.kind}`} title={f.tag.title}>{f.tag.text}</span>}
      {e ? <span className={`dword dword--${e.tone} gc-edge`} title={e.title}>{e.word}{e.text ? <small> · {e.text}</small> : null}</span> : !f.tag && fallback ? <span className="gc-foot__mk">{fallback}</span> : null}
    </span>
  );
}

/** The card's body: two team rows and the read. `facts` from useCardFacts. */
export function CardBody({ g, f, size = 'sm' }: { g: GameRow; f: CardFacts; size?: 'sm' | 'md' }) {
  const first = g.sport === 'SOCCER' ? g.home : g.away;
  const second = g.sport === 'SOCCER' ? g.away : g.home;
  const fs = g.sport === 'SOCCER' ? f.home : f.away;
  const ss = g.sport === 'SOCCER' ? f.away : f.home;
  return (
    <>
      <span className="gc-teams">
        <TeamRow g={g} p={first} s={fs} size={size} />
        <TeamRow g={g} p={second} s={ss} size={size} />
      </span>
      <Reads f={f} />
    </>
  );
}

/** A plain-language summary of the facts for an accessible name. */
export function factsLabel(f: CardFacts): string {
  const out: string[] = [];
  for (const s of [f.away, f.home]) {
    const bits = [s.record ? `record ${s.record}` : null, s.off ? `offense #${s.off.rank} of ${s.off.of}` : null, s.def ? `defense #${s.def.rank} of ${s.def.of}` : null].filter(Boolean);
    if (bits.length) out.push(`${s.abbr} ${bits.join(', ')}`);
  }
  if (f.final) out.push(`${f.final.line}${f.final.ats ? `, ${f.final.ats.text}` : ''}`);
  if (f.model) out.push(`model ${f.model.text}`);
  if (f.market) out.push(`market ${f.market.text}`);
  if (f.tag) out.push(f.tag.text);
  if (f.edge) out.push(`${f.edge.word}${f.edge.text ? `: ${f.edge.text}` : ''}`);
  return out.join('; ');
}

