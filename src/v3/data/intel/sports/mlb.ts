// MLB: what the MLB publication (edge-finder-api) states for one game's slate entry, as Overview research.
//   extensions.model_inputs.model   the slate model (win probability, projected runs, confidence) with the inputs behind each team's run projection
//   matchup rows                    season, last-7 and last-15 runs per game, wRC+ proxy, bullpen ERA and xFIP, as of the slate (no league ranks are published)
//   event.extensions                probable pitchers, park and park factor, lineup status, series game
//   context.lineups                 whether each batting order has been posted
// Freshness is checked against the document's own data-as-of (`isCurrent`): a slate more than three days old shows no model view and says so. The team
// explorer profiles are a different document with older statistics and stay gated in capabilities.ts.
import type { Comparison } from '../build';
import type { Environment, EnvLine } from '../environment';
import { isCurrent } from '../../../model/capabilities';
import type { ModelView } from '../projection';
import type { SportBlock, SportInput, SportRead, SportRow } from './types';
import { arr, ext, matchupRow, num, one, rec, str, two } from './shared';

/** A slate entry older than this has no current model view (MLB plays daily; the projection is of one day's slate). */
export const MLB_CURRENT_DAYS = 3;

const inputs = (i: SportInput) => rec(ext(i.research)?.model_inputs);

export function mlbCurrent(i: Pick<SportInput, 'research' | 'now'>): boolean {
  return isCurrent(str(i.research.quality?.data_as_of) ?? str(i.research.generated_at), MLB_CURRENT_DAYS, i.now);
}

function slateModel(i: SportInput): ModelView | null {
  const m = rec(inputs(i)?.model);
  const aw = num(m?.away), hw = num(m?.home), ar = num(m?.awayProjRuns), hr = num(m?.homeProjRuns);
  if (!m || aw == null || hw == null || ar == null || hr == null || aw < 0 || hw < 0 || aw > 100 || hw > 100) return null;
  const note = (i.research.context?.notes ?? []).find((n) => /^Projections are research evidence/i.test(n));
  const conf = str(m.confidence);
  return {
    origin: 'research', version: null, asOf: str(i.research.quality?.data_as_of) ?? str(i.research.generated_at), asOfKind: 'inputs',
    awayScore: ar, homeScore: hr, awayWin: aw / 100, homeWin: hw / 100, total: num(m.totalProj),
    caveat: `Research only.${conf ? ` The publication rates its confidence ${conf.toLowerCase()}.` : ''} ${note ?? 'Projections are research evidence, not bets.'}`.trim(),
    kind: 'slate research model', range: null, unit: 'runs',
  };
}

const rowText = (m: ReturnType<typeof matchupRow>, side: 'away' | 'home', fmt: (n: number) => string = two, suffix = '') => {
  const o = m?.[side];
  return o && o.value != null ? `${o.display_value ?? fmt(o.value)}${suffix}` : null;
};

function environment(i: SportInput): Environment | null {
  const { g, research } = i;
  const lines: EnvLine[] = [];
  const model = rec(inputs(i)?.model);
  const ar = num(model?.awayProjRuns), hr = num(model?.homeProjRuns), tot = num(model?.totalProj);
  if (ar != null && hr != null) lines.push({ id: 'points', label: 'Projected runs', text: `${g.away.nick} ${one(ar)}, ${g.home.nick} ${one(hr)}${tot != null ? `; ${one(tot)} in all` : ''}.`, source: 'model' });
  const park = rec(inputs(i)?.park);
  const pf = num(park?.parkFactor);
  if (pf != null) lines.push({ id: 'park', label: 'Park', text: `${str(park?.name) ?? 'The park'}: park factor ${pf} (100 is average; above 100 favours scoring)${park?.dome === true ? ', a dome' : park?.dome === false ? ', open to the weather' : ''}.`, source: 'season' });
  const both = (id: string, label: string, textId: string, unit: string, fmt: (n: number) => string = two) => {
    const m = matchupRow(research, id, () => true);
    const a = rowText(m, 'away', fmt, unit), h = rowText(m, 'home', fmt, unit);
    if (a && h) lines.push({ id: textId, label, text: `${g.away.nick} ${a}; ${g.home.nick} ${h}.`, source: 'season' });
  };
  both('slate_season_rpg', 'Season scoring', 'pf', ' runs per game');
  both('slate_last15_rpg', 'Last 15 games', 'l15', ' runs per game');
  both('slate_last7_rpg', 'Last 7 games', 'l7', ' runs per game');
  both('wrc_plus_proxy', 'Offensive efficiency', 'wrc', ' wRC+ (proxy)', (n) => String(Math.round(n)));
  both('bullpen_xfip', 'Bullpen', 'bp', ' xFIP');
  return lines.length ? { lines, notSimulated: [], foot: 'Run projections are the publication’s slate model; the rest are season statistics as of the slate. No league ranks are published for baseball statistics.' } : null;
}

function comparison(i: SportInput): Comparison | null {
  const ids = ['slate_season_rpg', 'slate_last15_rpg', 'slate_last7_rpg', 'wrc_plus_proxy', 'offense_baseline_adj', 'bullpen_era', 'bullpen_xfip'];
  const rows = ids.flatMap((id) => {
    const m = matchupRow(i.research, id, () => true);
    const a = rowText(m, 'away'), h = rowText(m, 'home');
    return m && a && h ? [{ id, name: m.name, away: a, home: h, unit: m.away?.unit ?? m.home?.unit ?? null }] : [];
  });
  return rows.length >= 2 ? { kind: 'values', rows, note: 'Published values for each team as of the slate. The publication states no league rank for these, so none is shown.' } : null;
}

function startersBlock(i: SportInput): SportBlock | null {
  const { g, research } = i;
  const e = ext(research);
  const mi = rec(e?.model_inputs);
  const evx = rec(research.event?.extensions);
  const rows: SportRow[] = [];
  for (const [side, t, pitcherKey] of [['away', g.away, 'away_pitcher'], ['home', g.home, 'home_pitcher']] as const) {
    const name = str(evx?.[pitcherKey]);
    const detail = rec(rec(rec(mi?.model)?.[`${side}ProjDetail`]));
    const xfip = num(detail?.trueXFIP), ip = num(detail?.starterIP);
    rows.push({
      id: `sp-${side}`, label: `${t.nick} starter`, source: 'status',
      text: name ? `${name}${xfip != null ? `: xFIP ${one(xfip)}${detail?.xfipSource ? ` (${String(detail.xfipSource)})` : ''}` : ''}${ip != null ? `, projected ${one(ip)} innings` : ''}.` : 'The probable starter has not been announced.',
    });
  }
  for (const l of arr(research.context?.lineups)) {
    const x = rec(l);
    const team = str(x?.team);
    if (!x || (team !== g.away.id && team !== g.home.id)) continue;
    const t = team === g.away.id ? g.away : g.home;
    rows.push({ id: `lu-${team}`, label: `${t.nick} lineup`, source: 'status', text: x.batting_order_published === true ? `Batting order posted${x.official === true ? ' (official)' : ''}.` : `${str(x.reason) ?? 'Batting order not posted yet'}.` });
  }
  const series = str(evx?.series_description), n = num(evx?.series_game_number);
  if (series) rows.push({ id: 'series', label: 'Series', source: 'status', text: `${series}${n != null ? `, game ${n}` : ''}.` });
  return rows.length ? { id: 'starters', title: 'Starters and lineups', note: 'published status', rows, foot: 'Lineup status is as of the publication’s last check; no weather, umpire or injury values are published for baseball.' } : null;
}

function formBlock(i: SportInput): SportBlock | null {
  const { g } = i;
  const mi = inputs(i);
  const rows: SportRow[] = [];
  for (const [side, t] of [['away', g.away], ['home', g.home]] as const) {
    const s = rec(mi?.[side]);
    const rc = rec(s?.record), form = rec(rec(s?.team_form)?.form_label);
    const w = num(rc?.wins), l = num(rc?.losses), rd = num(rc?.runDiff);
    if (w != null && l != null) rows.push({ id: `rec-${side}`, label: t.nick, source: 'season', text: `${w}–${l}${rd != null ? `, run differential ${rd > 0 ? '+' : rd < 0 ? '−' : ''}${Math.abs(rd)}` : ''}${str(rc?.streak) ? `, streak ${str(rc?.streak)}` : ''}.` });
    if (form && str(form.label)) rows.push({ id: `form-${side}`, label: `${t.nick} recent form`, source: 'season', text: `${str(form.label)}${str(form.window) ? ` over ${str(form.window)}` : ''}${str(form.reason) ? `: ${str(form.reason)}` : ''}.` });
  }
  return rows.length ? { id: 'form', title: 'Record and recent form', note: 'season to date', rows } : null;
}

export function readMlbSport(i: SportInput): SportRead | null {
  // A stale slate shows nothing it would have to call current.
  if (!mlbCurrent(i)) {
    return { model: null, modelAbsent: `The publication’s MLB data for this game is as of ${str(i.research.quality?.data_as_of) ?? str(i.research.generated_at) ?? 'an unknown time'}, more than ${MLB_CURRENT_DAYS} days old, so no baseball research is shown as current.`, blocks: [], reasons: {} };
  }
  const model = slateModel(i);
  return {
    model, modelAbsent: model ? null : 'The publication carries no slate model for this game.',
    environment: environment(i), comparison: comparison(i), blocks: [startersBlock(i), formBlock(i)].filter((b): b is SportBlock => b != null),
    reasons: { advantages: 'Baseball publishes no opponent-adjusted unit ranks for games.', notes: 'The publication stores no injuries for baseball (it says so); lineup status is under Starters and lineups.' },
  };
}
