// Shared pieces of the Prop Discovery screens: the avatar, the opponent chip, the lane readouts, the price pill and the chart atoms.
// Every identity, number and object is its own navigation target (nav/Targets.tsx); a missing figure is "—", never a guess.
import { useId, useMemo, type ReactNode } from 'react';
import { broadcastPlayerPhoto } from '../../../components/sift2/playerArt';
import { hitCount } from '../../data/props/history';
import type { HistoryState } from '../../data/props/hooks';
import { modelPercent } from '../../data/props/model';
import { trackPct } from '../../data/props/rank';
import type { ChipState } from '../../data/props/ranks';
import type { Matchup, Prop, PropRung } from '../../data/props/types';
import { clockTime } from '../../model/format';
import type { Price, V3Team } from '../../model/types';
import { GameLink, PlayerLink, PriceTap, StatLink } from '../../nav/Targets';
import { Icon } from '../../ui/Icon';
import { TeamLogo } from '../../ui/TeamLogo';

export const teamOf = (p: Prop): V3Team | null => (p.team ? (p.team === p.away.abbr ? p.away : p.team === p.home.abbr ? p.home : null) : null);
// `clockTime` builds an Intl formatter on every call: a row re-renders often, so each kickoff is formatted once.
const clocks = new Map<number, string>();
export const clockOf = (ms: number) => { let c = clocks.get(ms); if (c === undefined) { c = clockTime(ms); clocks.set(ms, c); } return c; };
export const gameText = (p: Prop) => `${p.away.abbr} at ${p.home.abbr} · ${clockOf(p.startMs)}`;
export const statText = (p: Prop, k: number) => `${p.label} ${k}+`;
/** Player Research's line for a count rung: "3+" settles over 2.5. */
export const lineOf = (k: number) => k - 0.5;
export const playerRef = (p: Prop) => (p.playerPage && p.playerId ? { slug: p.slug, id: p.playerId } : null);
export const playerState = (p: Prop, k: number) => (p.playerStat ? { stat: p.playerStat, line: lineOf(k) } : undefined);
export const firstName = (name: string) => name.split(' ')[0];
export const lastName = (name: string) => name.split(' ').slice(-1)[0];

export function Avatar({ p, size = 40, link = true, k }: { p: Prop; size?: number; link?: boolean; k?: number }) {
  const photo = useMemo(() => (p.playerId && p.team ? broadcastPlayerPhoto(p.playerId, p.name, p.team, 'portrait') : null), [p.playerId, p.name, p.team]);
  const t = teamOf(p);
  const inner: ReactNode = photo
    ? <img className="pd-ph" src={photo.src} alt="" width={size} height={size} loading="lazy" decoding="async" />
    : t ? <TeamLogo team={t} size={Math.round(size * 0.68)} /> : <Icon name="user" size={Math.round(size * 0.5)} />;
  const style = { ['--s' as string]: `${size}px` };
  const ref = playerRef(p);
  return (
    <span className="pd-avwrap" style={style}>
      {link && ref
        ? <PlayerLink player={ref} state={playerState(p, k ?? p.featured)} className="pd-av" label={`${p.name}, Player Research`}>{inner}</PlayerLink>
        : <span className="pd-av" aria-hidden="true">{inner}</span>}
    </span>
  );
}

/**
 * What a row says about availability when it matters: "Checking availability" until the game's availability document is read (a player the
 * publication lists out is never shown as available without that being said), and the status word when he is listed out and "Hide out" is off.
 */
export function availTag(p: Prop): ReactNode {
  if (p.availPending) return <i className="pd-tag" data-avail="pending">Checking availability</i>;
  if (p.out) return <i className="pd-tag is-out" data-avail="out">{p.out}</i>;
  return null;
}
export const availWord = (p: Prop): string => (p.availPending ? ', checking availability' : p.out ? `, listed ${p.out}` : '');

export function NameLine({ p, k, plain = false }: { p: Prop; k: number; plain?: boolean }) {
  const ref = playerRef(p);
  const tag = availTag(p);
  return (
    <div className={`pd-pn${tag ? ' has-tag' : ''}`}>
      {ref && !plain ? <PlayerLink player={ref} state={playerState(p, k)}>{p.name}</PlayerLink> : <b>{p.name}</b>}
      <GameLink game={{ slug: p.slug, eventId: p.eventId }}>{gameText(p)}</GameLink>
      {tag}
    </div>
  );
}

/** The opponent unit chip: a team's rank on the unit that bears on the statistic. A tap opens that statistic's ranking, the team highlighted. */
export function OppChip({ m, p, wrap = false, loading = false }: { m: Matchup | null; p: Prop; wrap?: boolean; loading?: boolean }) {
  if (!m && loading && p.opp && p.oppUnit) return <em className="pd-chip is-none" role="status" aria-label="Reading the opponent ranking">{chipPlaceholder(p)}</em>;
  if (!m) return <em className="pd-chip is-none">no matchup rows</em>;
  void wrap;
  return (
    <StatLink stat={{ slug: p.slug, statId: m.statId }} state={{ win: m.window, sel: m.oppCode, opp: m.selfCode ?? undefined }} className="pd-chip" label={`${m.text}. Open the ranking`}>
      {m.text}
    </StatLink>
  );
}

/** What the chip says while its ranking is on its way. */
export const chipPlaceholder = (p: Prop) => `${p.opp} ${p.oppUnit?.chip ?? 'unit'} · …`;
/** The chip's text for LAYOUT: the matchup, else (ranking on its way) the widest words it will take so the row does not move when they arrive, else the empty note. */
export const chipText = (p: Prop, c: ChipState) => (c.state === 'ready' ? c.m.text : c.state === 'loading' ? `${p.opp} ${p.oppUnit?.chip ?? 'unit'} · 28th of 32` : 'no matchup rows');

export function PricePill({ p, r, price }: { p: Prop; r: PropRung; price: Price | null }) {
  return (
    <PriceTap ticker={r.ticker} className={`pd-px${price ? '' : ' is-none'}`} label={`Exact contract: ${p.name} ${statText(p, r.k)}, ${price ? `${price.ask} cents` : 'price unavailable right now'}`}>
      <b className="num">{price?.ask != null ? `${price.ask}¢` : '—'}</b><small>ask</small>
    </PriceTap>
  );
}

export interface Lanes { market: number | null; hist: { h: number; n: number } | null; histState: HistoryState['state']; model: number | null }

export function lanesFor(p: Prop, k: number, price: Price | null, hs: HistoryState): Lanes {
  const h = hs.state === 'ready' ? hitCount(hs.values, k) : null;
  return { market: price?.ask ?? null, hist: h, histState: hs.state, model: modelPercent(p.model, k) };
}

export const histText = (l: Lanes): string => (l.hist ? `${l.hist.h}/${l.hist.n}` : l.histState === 'loading' || l.histState === 'idle' ? '…' : '—');

export const Mark = ({ lane }: { lane: 'm' | 'h' | 'z' }) => <i className={`pd-sw${lane === 'h' ? ' pd-sw--h' : lane === 'z' ? ' pd-sw--z' : ''}`} aria-hidden="true" />;

/** The three lanes on one line, in the fixed order and with the fixed marks: Market square, History ring, SIFT model diamond. */
export function LaneLine({ l, histNotLoaded = false }: { l: Lanes; histNotLoaded?: boolean }) {
  return (
    <div className="pd-ln3" aria-label="Market, History, SIFT model">
      <span className="pd-m"><Mark lane="m" />{l.market != null ? `${l.market}%` : <u className="is-none" style={{ textDecoration: 'none' }}>—</u>}</span>
      <span className="pd-hc">{histNotLoaded ? <><Mark lane="h" /><u className="is-none" style={{ textDecoration: 'none' }}>not loaded</u></> : <><Mark lane="h" />{l.hist || l.histState === 'loading' || l.histState === 'idle' ? histText(l) : <u className="is-none" style={{ textDecoration: 'none' }}>—</u>}</>}</span>
      <span className="pd-z"><Mark lane="z" />{l.model != null ? `${l.model}%` : <u className="is-none" style={{ textDecoration: 'none' }}>—</u>}</span>
    </div>
  );
}

/** Last games against the rung: green when the game reached it, coral when it did not, a dashed line at the rung. */
export function HitBars({ values, k, label }: { values: number[]; k: number; label: string }) {
  const uid = useId().replace(/:/g, '');
  const w = 322, h = 92;
  const mx = Math.max(...values, k) + 0.6;
  const pw = w - 8, sw = pw / values.length, bw = Math.min(22, sw - 8);
  const y = (v: number) => h - 16 - (v / mx) * (h - 26);
  return (
    <svg className="pd-bars" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <defs>
        <linearGradient id={`${uid}o`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#46e49b" /><stop offset="1" stopColor="#1c9a62" /></linearGradient>
        <linearGradient id={`${uid}u`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff7468" /><stop offset="1" stopColor="#cf453c" /></linearGradient>
      </defs>
      {values.map((v, i) => {
        const x = 4 + sw * i + sw / 2, hit = v >= k;
        return (
          <g key={i}>
            <rect x={x - bw / 2} y={y(v)} width={bw} height={Math.max(2, y(0) - y(v))} rx="3.5" fill={`url(#${uid}${hit ? 'o' : 'u'})`} />
            <text x={x} y={y(v) - 3} textAnchor="middle" fontSize="9.5" fontWeight="600" fill={hit ? '#46e49b' : '#ff7468'}>{v}</text>
          </g>
        );
      })}
      <line x1="4" x2={w - 4} y1={y(k - 0.5)} y2={y(k - 0.5)} stroke="#fff" strokeWidth="1.3" strokeDasharray="5 4" />
      <text x="4" y={h - 3} fontSize="9.5" fill="#7d8895">oldest</text>
      <text x={w - 4} y={h - 3} textAnchor="end" fontSize="9.5" fill="#7d8895">latest</text>
    </svg>
  );
}

/** The compare column's small bars (no labels). */
export function Spark({ values, k }: { values: number[]; k: number }) {
  const mx = Math.max(...values, k) + 0.5;
  const yy = (v: number) => 40 - 2 - (v / mx) * 34;
  return (
    <svg className="pd-spark" width="84" height="38" viewBox="0 0 92 40" aria-hidden="true">
      {values.map((v, i) => <rect key={i} x={i * 9.2 + 1} y={yy(v)} width="6.6" height={Math.max(2, (v / mx) * 34)} rx="1.6" fill={v >= k ? '#46e49b' : '#ff7468'} />)}
      <line x1="0" x2="92" y1={yy(k - 0.5)} y2={yy(k - 0.5)} stroke="#fff" strokeDasharray="3 3" strokeWidth="1" />
    </svg>
  );
}

/** The opponent on the worst-to-best track: the unit's logo sits where its rank puts it. */
export function UnitTrack({ m, opp }: { m: Matchup; opp: V3Team | null }) {
  return (
    <div className="pd-utrk" aria-hidden="true">
      <div className="rail" /><i className="tick" />
      <span className="mkr" style={{ left: `${trackPct(m.rank, m.n)}%` }}>{opp ? <TeamLogo team={opp} size={15} /> : null}</span>
      <div className="ends"><span>Worst</span><span>Best</span></div>
    </div>
  );
}

export const oppTeam = (p: Prop): V3Team | null => (p.opp ? (p.opp === p.away.abbr ? p.away : p.opp === p.home.abbr ? p.home : null) : null);
