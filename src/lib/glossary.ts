// Plain-English definitions: ONE place for the short sentence a sports fan needs next to a metric.
//
// Two lookups:
//  - term(key): a concept that is not one registry metric (EPA, sim share, CLV, Brier, …).
//  - metricGloss(metricId, def): a registry metric. The meaning comes from the registry (what the metric
//    measures, per the publication's description); the direction sentence comes from the registry's own
//    higher_is_better, so a defensive "allowed" metric always reads "Lower is better." Opponent-adjusted
//    ratings say so. A metric this glossary does not know gets NO invented definition: the lookup returns
//    null and the screen falls back to the publication's own description.

export interface Gloss {
  term: string;
  /** One short sentence: what it is. */
  text: string;
  /** The direction sentence ("Higher is better." / "Lower is better." / "A tendency, not a quality."), when known. */
  direction: string | null;
}

const T = (term: string, text: string, direction: string | null = null): Gloss => ({ term, text, direction });

export const TERMS: Record<string, Gloss> = {
  epa: T('EPA', 'Expected points added: how much a play changes the expected scoring of the drive.', 'Higher is better for an offense; lower is better for a defense.'),
  epa_play: T('EPA/play', 'How much each play changes expected scoring, averaged per play.', 'Higher is better for an offense; lower is better for a defense.'),
  success_rate: T('Success rate', 'How often a play improves the offense’s expected scoring (a play with positive EPA).', 'Higher is better for an offense; lower is better for a defense.'),
  cpoe: T('CPOE', 'Completion percentage above or below what the difficulty of the throws would predict.', 'Higher is better.'),
  pressure_rate: T('Pressure rate', 'How often the quarterback is hit on a dropback; QB hits stand in for pressure in this publication.', null),
  sack_rate: T('Sack rate', 'Sacks per dropback.', 'Higher is better for a defense; lower is better for an offense.'),
  explosive_rate: T('Explosive play rate', 'Share of plays that are big gains (explosive passes and runs).', 'Higher is better for an offense; lower is better for a defense.'),
  opponent_adjusted: T('Opponent-adjusted', 'Performance after accounting for the quality of the opponents faced, shown as a difference from league average.', null),
  target_share: T('Target share', 'Share of the team’s pass targets directed to this player.', null),
  carry_share: T('Carry share', 'Share of the team’s carries given to this player.', null),
  dropbacks: T('Dropbacks', 'Plays where the quarterback drops back to pass, including sacks and scrambles.', null),
  sim_share: T('Sim share', 'Share of the model’s simulated games that end this way; the simulator’s own count, not a calibrated probability.', null),
  clv: T('CLV', 'Closing line value: how the model’s price compared with the market’s closing price for the same contract.', null),
  brier: T('Brier score', 'Measures probability accuracy: the average squared gap between the probability given and what happened.', 'Lower is better.'),
  payout_error: T('Payout error', 'The squared gap between a price (read as a probability) and what the contract actually paid, averaged over the same contracts for model and market.', 'Lower is better.'),
  log_loss: T('Log loss', 'Measures probability accuracy and penalizes confident wrong probabilities more heavily.', 'Lower is better.'),
  calibration: T('Calibration', 'Whether events predicted around X% actually happen around X% of the time.', null),
  projected_range: T('Projected range', 'The spread of outcomes in the model’s simulations: the middle half of games and the middle 90%.', null),
};

export function term(key: keyof typeof TERMS | string): Gloss | null {
  return TERMS[key] ?? null;
}

// ------------------------------------------------------------------ registry metrics

interface MetricLike {
  name?: string | null;
  higher_is_better?: boolean | null;
  description?: string | null;
}

/** Stem → what it measures (no direction; that comes from the registry). Order matters: first match wins. */
const STEMS: [RegExp, string, string][] = [
  // [pattern on the id without sport/adj_/side prefixes, plain term, sentence]
  [/^(dropback|db)_epa/, 'EPA per dropback', 'Expected points added per dropback (passes, sacks and scrambles).'],
  [/^rush_epa/, 'EPA per rush', 'Expected points added per designed run.'],
  [/^(early_down|ed)_epa/, 'Early-down EPA', 'Expected points added per first- and second-down play.'],
  [/^rz_epa/, 'Red-zone EPA', 'Expected points added per play inside the opponent’s 20-yard line.'],
  [/^st_epa/, 'Special-teams EPA', 'Expected points added on special-teams plays.'],
  [/^epa(_play)?_ng$/, 'EPA/play, neutral script', 'Expected points added per play in neutral game script (the score isn’t forcing either team’s hand).'],
  [/^epa(_play)?$/, 'EPA/play', 'How much each play changes expected scoring, averaged per play.'],
  [/^epa_per_dropback/, 'EPA per dropback', 'Expected points added per quarterback dropback.'],
  [/^(success_rate|sr)$/, 'Success rate', 'Share of plays that improve the offense’s expected scoring.'],
  [/^cpoe/, 'CPOE', 'Completion percentage above or below what the difficulty of the throws would predict.'],
  [/^qb_hit_rate/, 'QB hit rate', 'QB hits per opponent dropback; used here as the stand-in for pressure.'],
  [/^pressure_rate_proxy/, 'Pressure rate', 'How often the quarterback is hit on a dropback (QB hits stand in for pressure).'],
  [/^sack_rate_allowed/, 'Sack rate allowed', 'Sacks taken per dropback.'],
  [/^sack_rate/, 'Sack rate', 'Sacks per dropback.'],
  [/^(explosive_rate|explosive)$/, 'Explosive play rate', 'Share of plays that are big gains (explosive passes and runs).'],
  [/^(takeaway_rate|to_rate)$/, 'Turnover rate', 'Turnovers per play.'],
  [/^turnover_rate/, 'Turnover rate', 'Turnovers per offensive play.'],
  [/^int_rate/, 'Interception rate', 'Interceptions per dropback.'],
  [/^deep_rate/, 'Deep-attempt rate', 'Share of throws that go deep downfield.'],
  [/^td_drive_rate/, 'Touchdown drive rate', 'Share of drives that end in a touchdown.'],
  [/^adot/, 'aDOT', 'Average depth of target: how far downfield the passes are thrown.'],
  [/^proe/, 'Pass rate over expected', 'How much more (or less) often the team passes than the situation would predict.'],
  [/^no_huddle_rate/, 'No-huddle rate', 'Share of plays run without a huddle.'],
  [/^shotgun_rate/, 'Shotgun rate', 'Share of plays run from shotgun.'],
  [/^plays_per_drive/, 'Plays per drive', 'Average offensive plays per drive: pace and sustain.'],
  [/^points_for/, 'Points scored', 'Points the team scored per game.'],
  [/^points_against/, 'Points allowed', 'Points the team allowed per game.'],
  [/^point_margin/, 'Point margin', 'Points scored minus points allowed, per game.'],
  [/^proj_target_share/, 'Target share', 'The simulation’s projected share of the team’s pass targets for this player in this game.'],
  [/^proj_carry_share/, 'Carry share', 'The simulation’s projected share of the team’s carries for this player in this game.'],
  [/^incumbent_fair_probability/, 'Model probability', 'The model’s probability that the contract settles YES.'],
];

const SIM_STAT: Record<string, string> = {
  attempts: 'pass attempts', carries: 'carries', completions: 'completions', passing_tds: 'passing touchdowns', passing_yards: 'passing yards',
  receiving_yards: 'receiving yards', receptions: 'receptions', rushing_yards: 'rushing yards', touchdowns: 'anytime touchdowns',
};

/** Which side of the ball, from the id (def_/adj_def_ = defense; off_/adj_off_/qb_ = offense). */
function sideOf(stem: string): 'defense' | 'offense' | null {
  return stem.startsWith('def_') ? 'defense' : stem.startsWith('off_') || stem.startsWith('qb_') ? 'offense' : null;
}

/** "Takeaways" read better than "turnovers" for a defense; "allowed" for a defense's EPA, success, explosives. */
function forDefense(sentence: string, stem: string): string {
  if (/takeaway|to_rate/.test(stem)) return 'Takeaways (interceptions and fumbles recovered) per defensive play.';
  if (/sack_rate/.test(stem)) return 'Sacks per opponent dropback.';
  if (/qb_hit_rate/.test(stem)) return sentence;
  if (/proe/.test(stem)) return 'How much more (or less) often opponents pass against this defense than the situation would predict.';
  return sentence
    .replace(/^Expected points added per /, 'Expected points this defense allows per ')
    .replace(/^How much each play changes expected scoring, averaged per play\./, 'Expected points this defense allows per play.')
    .replace(/^Share of plays that improve the offense’s expected scoring\./, 'Share of opponent plays that improved the offense’s expected scoring.')
    .replace(/^Share of plays that are big gains/, 'Share of opponent plays that are big gains')
    .replace(/^Expected points added on special-teams plays\./, 'Expected points opponents add against this team on special-teams plays.');
}

export function directionSentence(hib: boolean | null | undefined, description?: string | null): string | null {
  if (hib === true) return 'Higher is better.';
  if (hib === false) return 'Lower is better.';
  if (description && /a tendency, not a quality|not a quality on its own/i.test(description)) return 'A tendency, not a quality.';
  return null;
}

export function metricGloss(metricId: string, def?: MetricLike | null): Gloss | null {
  const bare = metricId.replace(/^met_[a-z]+\./, '');
  const adjusted = bare.startsWith('adj_');
  const stem0 = bare.replace(/^adj_/, '');
  const side = sideOf(stem0);
  const stem = stem0.replace(/^(def|off|qb)_/, '');
  const direction = directionSentence(def?.higher_is_better, def?.description);
  const name = def?.name ?? null;

  const sim = stem0.match(/^sim_(.+)$/);
  if (sim) {
    const what = SIM_STAT[sim[1]];
    if (!what) return null;
    return { term: name ?? `Simulated ${what}`, text: `The simulation’s average ${what} for this player in this game.`, direction: null };
  }
  const hit = STEMS.find(([re]) => re.test(stem) || re.test(stem0));
  if (!hit) return null;
  let text = side === 'defense' ? forDefense(hit[2], stem) : side === 'offense' && /^sack_rate$/.test(stem) ? 'Sacks taken per dropback.' : hit[2];
  if (stem0.startsWith('qb_') && !/quarterback/i.test(text)) text = `${text.replace(/\.$/, '')}, for this quarterback.`;
  if (adjusted) text = `${text.replace(/\.$/, '')}, adjusted for the opponents faced (shown against league average).`;
  return { term: name ?? hit[1], text, direction };
}

/** "text direction" as one line, for tooltips and accessible descriptions. */
export function glossLine(g: Gloss | null): string | null {
  return g ? (g.direction ? `${g.text} ${g.direction}` : g.text) : null;
}
