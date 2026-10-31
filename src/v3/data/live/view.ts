// What the live block prints for a game, decided in one pure place (so a test can pin every honest state without rendering): the facts that are
// available, and for each one that is not, the reason in plain words. A field is either a real value from a source or "not available" with why.
import type { V3Game } from '../../model/types';
import { situationText } from './freshness';
import type { LiveDetailState } from './useLiveDetail';
import type { DetailLeaders, DetailPlay, DetailSituation, Freshness } from './types';

export type Missing = { missing: string };
export type Field<T> = T | Missing;
export const isMissing = <T,>(f: Field<T>): f is Missing => typeof f === 'object' && f !== null && 'missing' in f;

export interface LiveView {
  /** 'withheld': the feed stopped updating (older than five minutes): no live state is printed, the reason says so. */
  mode: 'live' | 'withheld';
  freshness: Freshness | null;
  score: Field<{ away: number; home: number }>;
  period: Field<string>;
  clock: Field<string>;
  situation: Field<{ text: string; raw: DetailSituation | null }>;
  plays: Field<DetailPlay[]>;
  leaders: Field<DetailLeaders[]>;
  source: { label: string; attribution: string | null } | null;
  /** When the last refresh failed but an older answer is held (printed with its real age by the freshness mark, never as current). */
  refreshFailed: boolean;
}

const sportWord = (sport: string) => (sport === 'CFB' ? 'college football' : sport === 'CBB' ? 'college basketball' : sport);
const SITUATION_WORD: Record<string, string> = { NFL: 'Possession and down and distance', CFB: 'Possession and down and distance', MLB: 'Bases, outs and the count', NHL: 'Power-play status' };

/** Why something is not shown, for this sport and this state of the feed. */
export function missingReason(g: Pick<V3Game, 'sport'>, s: LiveDetailState, what: 'situation' | 'plays' | 'leaders' | 'clock' | 'score'): string {
  const sw = sportWord(g.sport);
  const label = what === 'situation' ? (SITUATION_WORD[g.sport] ?? 'Game situation') : what === 'plays' ? 'Play-by-play' : what === 'leaders' ? 'Player performances' : what === 'clock' ? 'The game clock' : 'The live score';
  if (s.kind === 'blocked') return `${label} would come from ${s.source.label}, which is not connected: its terms are not cleared for SIFT yet. Nothing is estimated.`;
  if (s.kind === 'score-only') return `${label} is not available: the licensed ${sw} feed (${s.source.label}) publishes the score and period only. Nothing is estimated.`;
  if (s.kind === 'none') return `${label} is not available: no live feed whose published terms permit this use covers ${sw}. Nothing is estimated.`;
  if (s.kind === 'loading') return `${label}: loading from ${s.source.label}.`;
  if (s.kind === 'ready' && !s.detail) {
    const kind = (s.error as { kind?: string } | null)?.kind;
    return kind === 'no-match' ? `${label} is not available: ${s.source.label} has no single game matching these teams and this start time. Nothing is estimated.` : `${label} is not available: ${s.source.label} did not answer. Trying again; nothing is estimated.`;
  }
  if (s.kind === 'ready') return `${label} is not in ${s.source.label}'s answer for this game.`;
  return `${label} is not available. Nothing is estimated.`;
}

function clockWhy(g: Pick<V3Game, 'sport'>, s: LiveDetailState): string {
  if (g.sport === 'MLB') return 'Baseball has no game clock.';
  if (s.kind === 'blocked') return 'Not available: the source is not connected.';
  if (s.kind === 'loading') return 'Loading.';
  return 'Not published by the feed.';
}

export function liveView(g: V3Game, s: LiveDetailState): LiveView {
  const hasScore = !!g.score;
  const scoreOrWhy = (): Field<{ away: number; home: number }> => (g.score ? { away: g.score.away, home: g.score.home } : { missing: 'Score unavailable: the feed has not given a verified, current score for this game.' });
  if (s.kind === 'ready' && s.freshness === 'withheld') {
    return {
      mode: 'withheld', freshness: 'withheld',
      score: { missing: 'The live feed has not updated in over five minutes, so no live score is printed.' },
      period: { missing: 'Withheld: the feed stopped updating.' }, clock: { missing: 'Withheld: the feed stopped updating.' },
      situation: { missing: 'Withheld: the feed stopped updating.' }, plays: { missing: 'Withheld: the feed stopped updating.' }, leaders: { missing: 'Withheld: the feed stopped updating.' },
      source: { label: s.source.label, attribution: s.source.attribution }, refreshFailed: !!s.error,
    };
  }
  const d = s.kind === 'ready' ? s.detail : null;
  const source = s.kind === 'ready' || s.kind === 'score-only' || s.kind === 'loading'
    ? { label: s.source.label, attribution: s.source.attribution }
    : g.score?.source === 'score-feed' ? { label: 'SportScore', attribution: 'Powered by SportScore' } : null;
  const period: Field<string> = g.score?.clock ? g.score.clock : { missing: hasScore ? 'The feed does not name the period.' : 'Not reported.' };
  const situ = d ? situationText(d.situation) : null;
  return {
    mode: 'live',
    freshness: s.kind === 'ready' ? s.freshness : g.score?.delayed ? 'delayed' : g.score ? 'live' : null,
    score: scoreOrWhy(),
    period,
    clock: d?.period.clock ? d.period.clock : { missing: clockWhy(g, s) },
    situation: situ ? { text: situ, raw: d!.situation } : { missing: missingReason(g, s, 'situation') },
    plays: d?.plays ? d.plays : { missing: missingReason(g, s, 'plays') },
    leaders: d?.leaders ? d.leaders : { missing: missingReason(g, s, 'leaders') },
    source,
    refreshFailed: s.kind === 'ready' && !!s.error,
  };
}
