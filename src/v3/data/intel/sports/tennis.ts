// Tennis: what the Tennis-Edge-Finder publication states for one match, as Overview research. The decoder is the SIFT 2.0 one (src/lib/tennis.ts).
//   extensions.slate_model_context   the model's chance that player A wins (fair_v1, with its envelope, and the Gen-1 / Gen-2 values), uncertainty,
//                                    serve evidence, recency inputs, and how the surface priors move the number
//   matchup rows                     Elo, surface Elo, structural serve and return ability, serve-point win probability (a column per player, no ranks)
//   extensions.external_venues       de-vigged sharp references next to the Kalshi mid and the model
//   event.extensions                 level, round, surface, start status, model validity (doubles carry no model), warnings
// Every tennis model number is RESEARCH_ONLY by the publication's own words and its settled record has the Kalshi mid out-scoring the model, so the model
// lane says so and the references are shown in their own block. Selector labels (the publication's bet flags) are never read.
import { readTennis, START_WORD, TRIANGULATION_WORD, tennisRecordText, LEVEL_WORD, type TennisMatch } from '../../../../lib/tennis';
import type { Comparison } from '../build';
import type { ModelView } from '../projection';
import type { SportBlock, SportInput, SportRead, SportRow } from './types';
import { num, pct, sideOfParticipant, grp } from './shared';

/** The two players as the game's away and home sides. Null when they cannot be matched by identity (never guessed from order). */
export function tennisSides(g: SportInput['g'], t: TennisMatch): { away: 'a' | 'b'; home: 'a' | 'b' } | null {
  const a = sideOfParticipant(g, t.a.id) ?? sideOfParticipant(g, t.a.name);
  const b = sideOfParticipant(g, t.b.id) ?? sideOfParticipant(g, t.b.name);
  if (a && b && a !== b) return a === 'away' ? { away: 'a', home: 'b' } : { away: 'b', home: 'a' };
  if (a && !b) return a === 'away' ? { away: 'a', home: 'b' } : { away: 'b', home: 'a' };
  if (b && !a) return b === 'away' ? { away: 'b', home: 'a' } : { away: 'a', home: 'b' };
  return null;
}

function model(t: TennisMatch, s: { away: 'a' | 'b'; home: 'a' | 'b' } | null): { view: ModelView | null; absent: string | null } {
  const pA = t.model.fairV1;
  if (t.discipline === 'doubles' || (t.model.validity && pA == null)) {
    return { view: null, absent: t.model.validityReason ?? 'The publication produces no model probability for doubles.' };
  }
  if (pA == null || pA < 0 || pA > 1) return { view: null, absent: 'The publication carries no model probability for this match.' };
  if (!s) return { view: null, absent: 'The match’s two players could not be matched to the two sides of this game, so no model view is shown.' };
  const awayWin = s.away === 'a' ? pA : 1 - pA, homeWin = 1 - awayWin;
  const env = t.model.fairV1Envelope;
  const name = (side: 'a' | 'b') => t[side].name;
  const gens = [t.model.gen1 != null ? `Gen-1 ${pct(s.away === 'a' ? t.model.gen1 : 1 - t.model.gen1)} for ${name(s.away)}` : null, t.model.gen2 != null ? `Gen-2 ${pct(s.away === 'a' ? t.model.gen2 : 1 - t.model.gen2)}` : null].filter(Boolean).join(', ');
  const range = env && env[0] != null && env[1] != null ? ` The model’s own range for ${name('a')} is ${pct(env[0])} to ${pct(env[1])}.` : '';
  return {
    view: {
      origin: 'research', version: 'fair_v1', asOf: t.model.predictedAt, asOfKind: 'published', awayScore: null, homeScore: null, awayWin, homeWin, total: null,
      caveat: `Research only: ${tennisRecordText(null)}. It is shown beside the market and never as a pick.${gens ? ` Other model generations: ${gens}.` : ''}${range}`,
      kind: 'research match-win probability', range: null,
    },
    absent: null,
  };
}

const elo = (n: number) => String(Math.round(n));
const two = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const prob = (n: number) => pct(n);
const FORMAT: Record<string, (n: number) => string> = {
  'met_tennis.elo_overall': elo, 'met_tennis.elo_surface': elo, 'met_tennis.sr_serve_ability': two, 'met_tennis.sr_return_ability': two,
  'met_tennis.ledger_serve_point_win': prob, 'met_tennis.gen2_serve_point_win': prob,
};

function comparison(t: TennisMatch, s: { away: 'a' | 'b'; home: 'a' | 'b' } | null): Comparison | null {
  if (!s) return null;
  const rows = t.rows.flatMap((r) => {
    const f = FORMAT[r.metricId];
    const a = r.a, b = r.b;
    if (!f || a == null || b == null) return [];
    const val = (side: 'a' | 'b') => f(side === 'a' ? a : b);
    return [{ id: r.metricId, name: r.name, away: val(s.away), home: val(s.home), unit: null as string | null }];
  });
  return rows.length >= 2 ? { kind: 'values', rows, note: 'Published ratings for each player (research). The publication states no league rank for these. Ratings are as of the date in the model line above.' } : null;
}

function blocks(t: TennisMatch, s: { away: 'a' | 'b'; home: 'a' | 'b' } | null): SportBlock[] {
  const out: SportBlock[] = [];
  const who = (side: 'a' | 'b') => t[side].name;
  const ctx: SportRow[] = [];
  const level = t.level ? LEVEL_WORD[t.level] ?? t.level.replace(/_/g, ' ') : null;
  ctx.push({ id: 'event', label: 'Event', source: 'status', text: [t.competition, level, t.round].filter(Boolean).join(' · ') + '.' });
  if (t.surface) ctx.push({ id: 'surface', label: 'Surface', source: 'status', text: `${t.surface}${t.indoor === true ? ', indoor' : t.indoor === false ? ', outdoor' : ''}. The publication states the surface only, with no court speed, altitude or indoor flag.` });
  if (t.start.status) ctx.push({ id: 'start', label: 'Start', source: 'status', text: `${START_WORD[t.start.status] ?? t.start.status.replace(/_/g, ' ').toLowerCase()}${t.start.nominalIsPlaceholder ? '; the listed time is a day placeholder, not this match’s start' : ''}.` });
  const adj = t.surfaceAdjustment ? Object.values(t.surfaceAdjustment).filter((v): v is number => v != null) : [];
  if (adj.length && s) {
    const worst = Math.max(...adj.map(Math.abs)) * 100;
    ctx.push({ id: 'surf-adj', label: 'Surface sensitivity', source: 'model', text: `Under the publication’s frozen surface-prior tests the model’s chance for ${who('a')} moves by at most ${worst.toFixed(1)} percentage points.` });
  }
  out.push({ id: 'context', title: 'Match and surface', note: 'published', rows: ctx, foot: t.warnings.length ? `Publication warnings: ${t.warnings.map((w) => w.split(':')[0].replace(/_/g, ' ').toLowerCase()).join('; ')}.` : null });

  const form: SportRow[] = [];
  const f = t.form;
  if (f.daysSinceA != null && f.daysSinceB != null) form.push({ id: 'rest', label: 'Days since last match', source: 'season', text: `${who('a')} ${f.daysSinceA}, ${who('b')} ${f.daysSinceB}.` });
  if (f.matchesA != null && f.matchesB != null) form.push({ id: 'record', label: 'Matches on record', source: 'season', text: `${who('a')} ${grp(f.matchesA)}, ${who('b')} ${grp(f.matchesB)}.` });
  if (t.serve.aPoints != null && t.serve.bPoints != null) form.push({ id: 'serve', label: 'Serve-point sample', source: 'season', text: `${who('a')} ${grp(Math.round(t.serve.aPoints))} points, ${who('b')} ${grp(Math.round(t.serve.bPoints))}; ratings rest on the thinner sample of ${grp(Math.round(t.serve.thinner ?? Math.min(t.serve.aPoints, t.serve.bPoints)))}.` });
  if (t.dataQuality.grade) form.push({ id: 'dq', label: 'Data quality', source: 'status', text: `Grade ${t.dataQuality.grade}${t.dataQuality.score != null ? ` (score ${num(t.dataQuality.score)?.toFixed(2)})` : ''}.` });
  if (form.length) out.push({ id: 'form', title: 'Form and sample', note: 'published inputs', rows: form, foot: f.note ? `${f.note.replace(/^./, (c) => c.toUpperCase()).replace(/\.?$/, '.')} Win-loss form is not published.` : null });

  const a = t.external.find((x) => x.ticker === t.a.ticker) ?? t.external[0];
  if (a && a.externalFair != null) {
    const aSide = a.ticker === t.a.ticker ? 'a' : 'b';
    const rows: SportRow[] = [{
      id: 'refs', label: who(aSide), source: 'status',
      text: `${a.sources.length ? `De-vigged ${a.sources.join(', ')}` : 'External references'} ${prob(a.externalFair)}${a.kalshiMid != null ? `; Kalshi mid ${prob(a.kalshiMid)}` : ''}${a.modelFair != null ? `; model ${prob(a.modelFair)}` : ''}.${a.triangulation ? ` ${TRIANGULATION_WORD[a.triangulation] ?? a.triangulation.replace(/_/g, ' ').toLowerCase()}.` : ''}`,
    }];
    out.push({ id: 'refs', title: 'Model against references', note: 'market data, not SIFT’s', rows, foot: 'References are other venues’ prices and the Kalshi mid is a market price: neither is a SIFT number.' });
  }
  return out;
}

export function readTennisSport(i: SportInput): SportRead | null {
  let t: TennisMatch;
  try { t = readTennis(i.research); } catch { return null; }
  const s = tennisSides(i.g, t);
  const m = model(t, s);
  return {
    model: m.view, modelAbsent: m.absent, comparison: comparison(t, s), blocks: blocks(t, s),
    reasons: { environment: 'Tennis publishes no scoring or pace simulation for matches.', advantages: 'Tennis publishes no opponent-adjusted unit ranks.', notes: 'The publication consumes no injury information for tennis.', script: 'Tennis has no game scripts.' },
  };
}
