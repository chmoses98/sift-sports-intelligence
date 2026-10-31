// Soccer: what the soccer-edge-finder publication states for one fixture, as Overview research. The decoders are the SIFT 2.0 ones (src/lib/soccer.ts);
// this file only turns them into the v3 sections and decides, from the document, which exist.
//   extensions.board_summary        the model board: 1X2, both teams to score, over 2.5, mean goals (Dixon-Coles goal rates, not xG)
//   extensions.soccer_script_engine six scripts with simulation shares, the attack-against-defence matchup, lineup status, competition context, data gaps
//   extensions.calibration          the model's settled log loss next to the market's, shown with the number
//   extensions.rest_congestion / head_to_head
// Every soccer model family is RESEARCH_ONLY by the publication's own authority. The engine's survivability rows (priced expressions) are not read here.
import type { ScriptCard, ScriptIntel } from '../scriptIntel';
import type { Comparison } from '../build';
import type { Environment, EnvLine } from '../environment';
import type { ModelView } from '../projection';
import { isSoccerEngine, readSoccerEngine, soccerBoard, soccerCalibration, soccerH2H, soccerRest, type SoccerEngine, type SoccerScript } from '../../../../lib/soccer';
import { ordinal } from '../../research/matchup';
import type { SportBlock, SportInput, SportRead, SportRow } from './types';
import { arr, ext, matchupRow, one, pct, rec, seasonPairs, sideText, str, two, grp } from './shared';

const prob = (x: number | null): x is number => x != null && x >= 0 && x <= 1;

function boardModel(i: SportInput, engine: SoccerEngine | null): ModelView | null {
  const board = soccerBoard(i.research);
  const hda = board ? { home: board.pHome, draw: board.pDraw, away: board.pAway } : engine?.glance.hda ?? null;
  const goals = board ? { home: board.meanHome, away: board.meanAway } : engine?.glance.expectedGoals ?? null;
  if (!hda || !prob(hda.home) || !prob(hda.away) || !prob(hda.draw)) return null;
  const cal = soccerCalibration(i.research).find((c) => c.family === 'match_result_3way' && c.logLoss != null && c.marketLogLoss != null);
  const record = cal ? ` On ${grp(cal.n)} settled matches the model’s log loss was ${cal.logLoss!.toFixed(3)} against the market’s ${cal.marketLogLoss!.toFixed(3)} (lower is better).` : '';
  const families = arr(ext(i.research)?.model_families).map(String);
  const q = board?.quality ? ` Data quality: ${board.quality.toLowerCase()}.` : '';
  return {
    origin: 'research', version: families.length ? families[families.length - 1] : null, asOf: board?.generatedAt ?? engine?.modelGeneratedAt ?? null, asOfKind: 'published',
    awayScore: goals?.away ?? null, homeScore: goals?.home ?? null, awayWin: hda.away, homeWin: hda.home, draw: hda.draw, total: null,
    caveat: `Research only: every soccer model family is research-only by the publication’s own authority. Scores are mean goals from goal rates, not xG from shots.${record}${q}`,
    kind: 'research model board', range: null, unit: 'goals',
  };
}

const sideWord = (id: string) => (id.startsWith('HOME_') ? 'home' : id.startsWith('AWAY_') ? 'away' : null);

function scripts(i: SportInput, engine: SoccerEngine): ScriptIntel | null {
  const list = engine.scripts.filter((s) => s.share > 0);
  if (!list.length) return null;
  const hda = engine.glance.hda;
  const fav: 'home' | 'away' | null = hda && hda.home != null && hda.away != null && hda.home !== hda.away ? (hda.home > hda.away ? 'home' : 'away') : null;
  const expected = list[0];
  const dog = fav === 'home' ? 'away' : fav === 'away' ? 'home' : null;
  const danger = dog ? list.find((s) => s !== expected && sideWord(s.id) === dog) : undefined;
  const alternate = list.find((s) => s !== expected && s !== danger);
  const scores = (s: SoccerScript) => s.profile.typicalScores.slice(0, 3).map((t) => `${t.score.replace('-', '–')} (${pct(t.p)})`).join(', ');
  const range = (s: SoccerScript) => (s.shareLow != null && s.shareHigh != null ? ` (between ${pct(s.shareLow)} and ${pct(s.shareHigh)} across the simulation’s own uncertainty)` : '');
  const card = (role: ScriptCard['role'], s: SoccerScript, help: string, counter: string[]): ScriptCard => ({
    role, title: s.title, line: s.definition, share: s.share, help,
    evidence: [`${pct(s.share)} of simulated matches take this shape${range(s)}.`, ...(scores(s) ? [`Typical scores in it: ${scores(s)}.`] : [])],
    counter, source: 'soccer',
  });
  const cards: ScriptCard[] = [card('expected', expected, 'The most common shape of the simulated match', [expected.share < 0.5 ? `Fewer than half of simulated matches take this shape; ${pct(1 - expected.share)} go another way.` : `${pct(1 - expected.share)} of simulated matches go another way.`])];
  if (alternate) cards.push(card('alternate', alternate, 'The next most common shape', [`Seen in ${pct(alternate.share)} of simulated matches, behind “${expected.title}” at ${pct(expected.share)}.`]));
  if (danger) cards.push(card('danger', danger, `The most common shape that favours ${dog === 'home' ? i.g.home.nick : i.g.away.nick}, the side the model rates lower`, [`Only ${pct(danger.share)} of simulated matches take this shape, so it is a minority path, not the base case.`]));
  return { cards, thesisSummary: null, notSimulated: [], basis: 'Shares are simulation shares from the publication’s soccer script engine, not calibrated probabilities (every soccer model family is research-only).' };
}

function environment(i: SportInput, engine: SoccerEngine | null): Environment | null {
  const { g, research } = i;
  const lines: EnvLine[] = [];
  const board = soccerBoard(research);
  const eg = board ? { home: board.meanHome, away: board.meanAway } : engine?.glance.expectedGoals ?? null;
  if (eg && eg.home != null && eg.away != null) lines.push({ id: 'points', label: 'Expected goals', text: `${g.away.nick} ${two(eg.away)}, ${g.home.nick} ${two(eg.home)} on average (goal rates from the publication’s model, not shot-based xG).`, source: 'simulation' });
  if (board?.pBtts != null) lines.push({ id: 'close', label: 'Both teams score', text: `${pct(board.pBtts)} of simulated matches${board.pOver25 != null ? `; ${pct(board.pOver25)} have three goals or more` : ''}.`, source: 'simulation' });
  const rest = soccerRest(research);
  if (rest && rest.home.restDays != null && rest.away.restDays != null) {
    lines.push({ id: 'rest', label: 'Rest and congestion', text: `${g.away.nick}: ${rest.away.restDays} days since their last match, ${rest.away.matches14d ?? '—'} in the last 14 days. ${g.home.nick}: ${rest.home.restDays} days, ${rest.home.matches14d ?? '—'} in the last 14.${rest.quality ? ` (Publication’s quality grade: ${rest.quality.toLowerCase()}.)` : ''}`, source: 'season' });
  }
  const both = (id: string, label: string, textId: string, unit: string) => {
    const m = matchupRow(research, id);
    const a = sideText(m?.away, two, unit), h = sideText(m?.home, two, unit);
    if (a && h) lines.push({ id: textId, label, text: `${g.away.nick} ${a}; ${g.home.nick} ${h}.`, source: 'season' });
  };
  both('goals_for_per_game', 'Season scoring', 'pf', ' goals per match');
  both('goals_against_per_game', 'Season defense', 'pa', ' conceded per match');
  both('over_2_5_rate', 'Goal-heavy matches', 'o25', ' of matches over 2.5');
  return lines.length ? { lines, notSimulated: [], foot: 'Soccer publishes no shot-based expected goals, no tempo statistic and no lineup layer; those are not estimated here.' } : null;
}

const WORD = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
/** "MAJOR_HOME_DEFENSIVE_EDGE" -> "Major Arsenal defensive edge": the publication's own label with its sides named. */
const SIDED = (s: string, g: { home: { nick: string }; away: { nick: string } }) => s.split('_').map((w) => (w === 'HOME' ? g.home.nick : w === 'AWAY' ? g.away.nick : w.toLowerCase())).join(' ').replace(/^./, (c) => c.toUpperCase());
const th = (p: number | null) => (p == null ? '—' : ordinal(Math.max(1, Math.min(99, Math.round(p * 100)))));

/** The publication's own data gaps, once each, the first few in full (the rest are counted). */
function gapsFoot(engine: SoccerEngine | null): string | null {
  const all = [...new Set((engine?.dataGaps ?? []).map((d) => (d.detail || WORD(d.code)).replace(/\.$/, '')))];
  if (!all.length) return null;
  const shown = all.slice(0, 3);
  return `Gaps the publication states: ${shown.join('; ')}${all.length > shown.length ? `; and ${all.length - shown.length} more` : ''}.`;
}

function blocks(i: SportInput, engine: SoccerEngine | null): SportBlock[] {
  const { g, research } = i;
  const out: SportBlock[] = [];
  const m = engine?.matchup;
  if (m && (m.home || m.away)) {
    const rows: SportRow[] = [];
    for (const [t, s] of [[g.away, m.away], [g.home, m.home]] as const) {
      if (!s) continue;
      rows.push({
        id: `rt-${t.id}`, label: t.nick, source: 'model',
        text: `Attack ${th(s.attack.percentile)} percentile, defence ${th(s.defence.percentile)}, overall ${th(s.netRating.percentile)}${s.sampleQuality ? `; ${s.sampleQuality.toLowerCase()} sample` : ''}${s.effectiveMatches != null ? ` (${one(s.effectiveMatches)} effective matches)` : ''}.`,
      });
    }
    const pm = engine?.glance.primaryMismatch;
    if (pm) {
      rows.push({ id: 'mismatch', label: 'Largest mismatch', source: 'model', text: `${SIDED(pm.label, g)}: ${SIDED(pm.matchup.replace(/_vs_/i, '_against_'), g)}${pm.evidenceQuality ? `; evidence ${pm.evidenceQuality.toLowerCase()}` : ''}.` });
    }
    if (rows.length) out.push({ id: 'ratings', title: 'Attack and defence', note: 'model ratings, opponent-adjusted', rows, foot: 'Percentiles are among the teams in the publication’s rating pool; higher is stronger. They are model ratings (research), not match statistics.' });
  }
  const ctx: SportRow[] = [];
  const c = engine?.context;
  const comp = c?.competitionName ?? str(research.event?.competition);
  if (comp) ctx.push({ id: 'comp', label: 'Competition', source: 'status', text: `${comp}${engine?.glance.competition?.stage ? `, ${engine.glance.competition.stage}` : ''}${c?.knockout ? '; knockout: a winner is required' : ''}${c?.neutralSite ? '; neutral site' : ''}.` });
  const lineup = engine?.lineupStatus ?? str(rec(research.event?.extensions)?.lineup_status) ?? str(rec(ext(research))?.lineup_status);
  if (lineup) ctx.push({ id: 'lineup', label: 'Lineups', source: 'status', text: `${lineup === 'unknown' ? 'Not known' : WORD(lineup)}: the publication has no lineup or injury layer for soccer.` });
  const h2h = soccerH2H(research);
  if (h2h) ctx.push({ id: 'h2h', label: 'Head to head', source: 'season', text: `Last ${h2h.n} meetings: ${g.home.nick} ${h2h.homeWins}, ${g.away.nick} ${h2h.awayWins}, ${h2h.draws} drawn; goals ${h2h.homeGoals}–${h2h.awayGoals}.` });
  if (ctx.length) out.push({ id: 'context', title: 'Match context', note: 'published', rows: ctx, foot: gapsFoot(engine) });
  return out;
}

export function readSoccerSport(i: SportInput): SportRead | null {
  const eng = readSoccerEngine(i.research);
  const engine = isSoccerEngine(eng) ? eng : null;
  const model = boardModel(i, engine);
  const pairs = seasonPairs(i.research, i.g, ['points_per_game', 'goals_for_per_game', 'goals_against_per_game', 'goal_difference_per_game', 'over_2_5_rate', 'btts_rate', 'clean_sheet_rate'], 7);
  const comparison: Comparison | null = pairs.length >= 2 ? { kind: 'ranks', pairs, adjusted: false } : null;
  return {
    model, modelAbsent: model ? null : 'The publication’s model board has not priced this fixture, so no model view is shown.',
    environment: environment(i, engine), comparison, script: engine ? scripts(i, engine) : null, blocks: blocks(i, engine),
    reasons: {
      script: eng.status === 'OK' ? 'The script engine produced no scripts for this fixture.' : `${(eng as { reason: string }).reason}`,
      advantages: 'Soccer publishes no opponent-adjusted unit ranks for fixtures.', notes: 'The publication has no injury or lineup layer for soccer.',
    },
  };
}
