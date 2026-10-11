// TEAM-SPECIFIC SCRIPT WORDS (owner item 8). A script that belongs to one team says that team's name, everywhere a
// script renders ("Blues control and pull away", "Arsenal in control"), never "home control" or a bare tricode. Only
// the words change: every script keeps its id, its share and its definition's meaning, and a script that belongs to
// neither team (a tight game, an open game) keeps its neutral title while its sentence names both teams where the
// publication says "one team" or "one side".
//
// Pure functions over the publication's own titles and definitions — nothing here creates a number.
import { NHL_TEAMS, nhlTeam } from './nhlTeams';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The first sentence of a description (the tight line), and the rest (the expandable detail) — owner item 13. */
export function splitSentence(text: string | null | undefined): { lead: string; rest: string | null } {
  const t = (text ?? '').trim();
  if (!t) return { lead: '', rest: null };
  // A sentence ends at ". " / "; " followed by a capital, never inside "St. Louis" or a decimal.
  const m = /^(.{24,}?(?<!\bSt|\bvs|\bNo|\bMt|\b[A-Z])[.!?])\s+(?=[A-Z0-9“"])/.exec(t);
  if (!m) return { lead: t, rest: null };
  const rest = t.slice(m[0].length).trim();
  return { lead: m[1], rest: rest || null };
}

// ------------------------------------------------------------------ NHL

export interface NhlScriptWords { label: string; short: string; summary: string; needs?: string; breaks?: string }

/** The two clubs of an NHL game by tricode, for naming. */
export interface NhlPair { home: string; away: string }

/**
 * NHL_SCRIPT_V1 words with the clubs named: the control scripts get the club's nickname as the subject ("Blues
 * control and pull away"); every tricode in a sentence becomes the club's place name ("St. Louis holds the
 * territorial edge…", grammatical with the publication's singular verbs); "One team" / "one side" becomes the two
 * clubs ("Chicago or St. Louis is clearly out-shot…").
 */
export function nhlScriptWords(s: { id: string; label: string; short: string; summary: string; needs?: string; breaks?: string; side?: string | null }, pair: NhlPair): NhlScriptWords {
  const team = (code: string) => nhlTeam(code);
  const place = (code: string) => team(code)?.short ?? code;
  const nick = (code: string) => team(code)?.name ?? code;
  const both = `${place(pair.away)} or ${place(pair.home)}`;
  const sentence = (t: string | undefined) => {
    if (!t) return t;
    let out = t;
    for (const code of [pair.home, pair.away]) if (code) out = out.replace(new RegExp(`\\b${esc(code)}\\b`, 'g'), place(code));
    return out.replace(/^One team\b/, both).replace(/\bone team\b/g, `${both}`).replace(/\bone side\b/g, both);
  };
  const ctl = s.id === 'HOME_CONTROL' ? pair.home : s.id === 'AWAY_CONTROL' ? pair.away : null;
  const label = ctl && team(ctl) ? `${nick(ctl)} control and pull away` : sentence(s.label) ?? s.label;
  const short = ctl && team(ctl) ? `${nick(ctl)} control` : sentence(s.short) ?? s.short;
  return { label, short, summary: sentence(s.summary) ?? s.summary, needs: sentence(s.needs), breaks: sentence(s.breaks) };
}

// ------------------------------------------------------------------ soccer

/** The publication's generic soccer script titles, said with the clubs' names. Neutral scripts keep their title. */
export function soccerScriptTitle(id: string, title: string, names: { home: string; away: string }): string {
  switch (id) {
    case 'HOME_CONTROL': return `${names.home} in control`;
    case 'AWAY_CONTROL': return `${names.away} in control`;
    case 'HOME_CHASE': return `${names.home} fight back`;
    case 'AWAY_CHASE': return `${names.away} fight back`;
    default: return title;
  }
}

/** "Home side scores first and wins" → "Arsenal scores first and wins"; "(1-0 or 0-1)" is left as the score rule. */
export function soccerScriptDefinition(text: string, names: { home: string; away: string }): string {
  return text
    .replace(/\b[Hh]ome side\b/g, names.home)
    .replace(/\b[Aa]way side\b/g, names.away);
}

/** Lower-case a script label for use mid-sentence, unless it starts with a team (a tricode, nickname or place). */
export function scriptLower(label: string): string {
  if (/^[A-Z]{2,3}\b/.test(label)) return label;
  if (NHL_TEAMS.some((t) => label.startsWith(`${t.name} `) || label.startsWith(`${t.short} `) || label.startsWith(`${t.city} `))) return label;
  return label.charAt(0).toLowerCase() + label.slice(1);
}
