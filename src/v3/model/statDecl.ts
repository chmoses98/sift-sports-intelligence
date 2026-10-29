// What Stat Detail needs to know about a sport that the publications do not say: which statistics make a unit comparison (offense and
// defense, scoring and preventing), which statistics are a defence, and the plain words that follow a value. A sport is a declaration
// here, never a branch in the screen. A statistic that is not named falls back to what its registry entry says (unit and name).

export type Role = 'o' | 'd';

export interface CompareGroup {
  role: Role;
  /** "Offense", "Preventing". */
  title: string;
  /** [row label, short statistic id]. Only rows both teams publish are shown. */
  rows: [string, string][];
}

export interface StatDecl {
  /** The Compare teams rows. A sport without a declaration has no team comparison (a locked row says so). */
  compare: CompareGroup[];
  /** The header's second line on Compare teams. */
  compareSub: string;
  /** Statistics that describe a defence (amber); everything else is an offense (ice). */
  defense: RegExp;
  /** Words that follow a value in the selected card, by short statistic id ("of power plays"). */
  valueNote: Record<string, string>;
  /** What the selected card calls the unit when the id does not say offense or defense ("TOR power play"). */
  unitWord: Record<string, string>;
}

export const STAT_DECL: Record<string, StatDecl> = {
  nfl: {
    compare: [
      { role: 'o', title: 'Offense', rows: [['Overall', 'adj_off_epa'], ['Passing', 'adj_off_db_epa'], ['Rushing', 'adj_off_rush_epa'], ['Early downs', 'adj_off_ed_epa']] },
      { role: 'd', title: 'Defense', rows: [['Overall', 'adj_def_epa'], ['Passing', 'adj_def_db_epa'], ['Rushing', 'adj_def_rush_epa'], ['Early downs', 'adj_def_ed_epa']] },
    ],
    compareSub: 'opponent-adjusted EPA per play',
    defense: /^(adj_def|def_)/,
    valueNote: {},
    unitWord: {},
  },
  nhl: {
    compare: [
      { role: 'o', title: 'Scoring', rows: [['Goals for', 'gf_per_game'], ['Exp. goals for', 'xgf_per60'], ['Power play', 'pp_pct']] },
      { role: 'd', title: 'Preventing', rows: [['Goals against', 'ga_per_game'], ['Exp. goals against', 'xga_per60'], ['Penalty kill', 'pk_pct']] },
    ],
    compareSub: 'official and season statistics',
    defense: /^(ga_|xga|pk_|oa_ga|oa_xga|rating_def|rating_stop)/,
    valueNote: { pp_pct: 'of power plays', pk_pct: 'of penalties killed', points_pct: 'of points available' },
    unitWord: { pp_pct: 'power play', pk_pct: 'penalty kill', points_pct: 'points', gf_per_game: 'scoring', ga_per_game: 'goals against' },
  },
};

export const statDecl = (slug: string): StatDecl | null => STAT_DECL[slug.toLowerCase()] ?? null;

/** Offense (ice) or defense (amber) for a statistic id. */
export const roleOf = (slug: string, id: string): Role => (statDecl(slug)?.defense.test(id) ? 'd' : 'o');

/** "offense" / "defense" for the selected card's first line ("DAL offense"); the statistic's own short name when it is neither. */
export function unitWord(slug: string, id: string, shortName: string | null): string {
  const decl = statDecl(slug)?.unitWord[id];
  if (decl) return decl;
  if (/^(adj_)?off_/.test(id)) return 'offense';
  if (/^(adj_)?def_/.test(id)) return 'defense';
  return (shortName ?? id.replace(/_/g, ' ')).trim();
}

/** The words under a value: the declaration, else read from the registry's own unit and name. */
export function valueNote(slug: string, id: string, unit: string | null, name: string): string {
  const decl = statDecl(slug)?.valueNote[id];
  if (decl) return decl;
  const u = (unit ?? '').trim();
  const epa = /^EPA\/(\w+)$/i.exec(u);
  if (epa) return `EPA per ${epa[1].toLowerCase()}`;
  if (/deviation/i.test(u)) {
    const m = /EPA per (\w+)/i.exec(name);
    return m ? `EPA per ${m[1].toLowerCase()}` : 'vs league mean';
  }
  if (u.toLowerCase() === 'share') return 'share';
  return u.replace(/\//g, ' per ');
}
