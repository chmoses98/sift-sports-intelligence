// Expected, alternate and danger scripts for one game, with the evidence for each and the case against it. Pure.
//
// Sources, each only where the publication carries it:
//   * the published thesis (event_detail `theses[0]`: primary_game_script, supporting_factors, opposing_factors, key_dependencies);
//   * NFL/CFB-style margin scripts: lib/scripts.ts `gameScripts`, the simulation's share of games in each final-margin bucket;
//   * NHL: lib/nhl.ts `readNhl`, the publication's NHL_SCRIPT_V1 scripts with what each needs and what breaks it.
// The simulation shares are simulation shares, not calibrated probabilities: the screen calls them "of simulated games". No script text
// is generated here beyond naming the published script and joining the published evidence.
import type { EventDetailDoc, EventResearchDoc } from '../../../contract/types';
import { gameScripts, type GameScript, type ScriptSet } from '../../../lib/scripts';
import { isNhlScripts, readNhl, type NhlScript } from '../../../lib/nhl';

export type ScriptRole = 'expected' | 'alternate' | 'danger';

export interface ScriptCard {
  role: ScriptRole;
  title: string;
  /** One plain line saying what the script is. */
  line: string;
  /** What this role means for this game, in a sentence. */
  help: string;
  /** Share of simulated games, 0..1, when the source states one. */
  share: number | null;
  /** The published evidence for it. */
  evidence: string[];
  /** The case against it (what would break it, or the published opposing factors). */
  counter: string[];
  /** Where this card's content comes from, for the footnote. */
  source: 'thesis' | 'simulation' | 'nhl' | 'soccer';
}

export interface ScriptIntel {
  cards: ScriptCard[];
  /** The publication's own thesis summary, when it states one beyond the script. */
  thesisSummary: string | null;
  /** What the simulation does not model. */
  notSimulated: string[];
  /** What the shares are. */
  basis: string;
}

const pct = (p: number) => `${Math.round(p * 100)}%`;
const clean = (xs: readonly (string | null | undefined)[] | null | undefined) => (xs ?? []).map((x) => (x ?? '').trim()).filter(Boolean);

function marginCards(set: ScriptSet): ScriptCard[] {
  const sorted = [...set.scripts];
  if (!sorted.length) return [];
  const fav = set.fav, dog = fav === 'home' ? 'away' : 'home';
  const favName = set.names[fav];
  const expected = sorted[0];
  // The danger script is the most likely path that cuts against the simulation's favourite: the underdog winning.
  const danger: GameScript | undefined = sorted.find((s) => s !== expected && s.leader === dog);
  const alternate = sorted.find((s) => s !== expected && s !== danger);
  const evidence = (s: GameScript) => clean([`${pct(s.share)} of simulated games end this way.`, s.detail]);
  const card = (role: ScriptRole, s: GameScript, help: string, counter: string[]): ScriptCard => ({ role, title: s.name, line: s.line, share: s.share, help, evidence: evidence(s), counter, source: 'simulation' });
  const out: ScriptCard[] = [card('expected', expected, 'The most common way the simulated game ends',
    [expected.share < 0.5 ? `Fewer than half of simulated games end this way; ${pct(1 - expected.share)} end somewhere else.` : `${pct(1 - expected.share)} of simulated games end somewhere else.`])];
  if (alternate) out.push(card('alternate', alternate, 'The next most common path', [`Seen in ${pct(alternate.share)} of simulated games, behind “${expected.name}” at ${pct(expected.share)}.`]));
  if (danger) out.push(card('danger', danger, `The most likely path that cuts against ${favName}, the simulation’s favorite`, [`Only ${pct(danger.share)} of simulated games go this way, so it is a minority path, not the base case.`]));
  return out;
}

function nhlCards(scripts: NhlScript[]): ScriptCard[] {
  if (!scripts.length) return [];
  const expected = scripts[0];
  const danger = scripts.find((s) => s !== expected && s.side != null && s.side !== expected.side);
  const alternate = scripts.find((s) => s !== expected && s !== danger);
  const card = (role: ScriptRole, s: NhlScript): ScriptCard => ({
    role, title: s.label, line: s.summary || s.short, share: s.probability,
    help: role === 'expected' ? 'The most likely script in the publication’s simulation' : role === 'alternate' ? 'The next most likely script' : 'The most likely script that favours the other side',
    evidence: clean([s.needs ? `Needs: ${s.needs}` : null]), counter: clean([s.breaks ? `Breaks if: ${s.breaks}` : null]), source: 'nhl',
  });
  return [card('expected', expected), ...(alternate ? [card('alternate', alternate)] : []), ...(danger ? [card('danger', danger)] : [])];
}

/** The scripts of a game, or null when neither the thesis nor a script engine carries any. */
export function readScriptIntel(research: EventResearchDoc | null | undefined, detail: EventDetailDoc | null | undefined): ScriptIntel | null {
  const t = detail?.theses?.[0];
  const thesisScript = (t?.primary_game_script ?? '').trim();
  const supporting = clean(t?.supporting_factors), opposing = clean(t?.opposing_factors), deps = clean(t?.key_dependencies);
  let cards: ScriptCard[] = [];
  let notSimulated: string[] = [];
  let basis = '';
  if (research) {
    const nhl = readNhl(research);
    if (nhl && isNhlScripts(nhl)) { cards = nhlCards(nhl.scripts); basis = 'Shares are the publication’s simulated script probabilities.'; }
    else if (research.event?.sport !== 'NHL') {
      let set: ScriptSet | null;
      try { set = gameScripts(research); } catch { set = null; }
      if (set) { cards = marginCards(set); notSimulated = set.notSimulated; basis = 'Shares are simulation shares of final-margin outcomes, not calibrated probabilities.'; }
    }
  }
  if (thesisScript) {
    const head: ScriptCard = { role: 'expected', title: 'Published thesis', line: thesisScript, share: null, help: 'The game script the publication states', evidence: supporting, counter: opposing, source: 'thesis' };
    // The published thesis is the expected script; the simulation's most common outcome then reads as the alternate (never a second "expected"),
    // its own alternate is dropped to keep three cards, and its danger script stays.
    const sim = cards;
    const simExpected = sim.find((c) => c.role === 'expected');
    const simDanger = sim.find((c) => c.role === 'danger');
    cards = [head, ...(simExpected ? [{ ...simExpected, role: 'alternate' as const }] : []), ...(simDanger ? [simDanger] : [])];
    if (deps.length) head.evidence = [...head.evidence, ...deps.map((d) => `Depends on: ${d}`)];
  }
  if (!cards.length) return null;
  return { cards, thesisSummary: (t?.summary ?? '').trim() || null, notSimulated, basis };
}
