// Conventional betting words for a contract position (owner item 11). A Kalshi position is a side (YES/NO) on a
// contract; a viewer reads "Under 3.5", not "NO Total goals over 3.5". The rewrite is conservative and only applies
// where the settlement is unambiguous:
//   * a threshold ("over 3.5", "Over 20.5 games") on the NO side reads as the Under;
//   * a count threshold ("1+ goals") on the NO side reads as under the half-point below it ("under 0.5 goals");
//   * a margin ("Vancouver −1.5", "wins by more than 1.5") on the NO side reads as not covering;
//   * a winner ("Minnesota to win") on the NO side reads as "not to win" — never as the opponent winning, because
//     draws and ties exist.
// Anything else keeps the explicit side ("NO · …"). The contract's own wording stays on the details screen.
export interface BetPhrase {
  /** What the viewer reads. */
  text: string;
  /** True when the words were rewritten from the side + contract title. */
  rewritten: boolean;
  /** The exact position, for titles and accessible names: "NO on Total goals over 3.5". */
  exact: string;
}

const half = (n: number) => (Math.round((n - 0.5) * 10) / 10).toString();

export function betPhrase(side: 'YES' | 'NO', title: string): BetPhrase {
  const t = title.trim().replace(/^(YES|NO)\s+/, '');
  const exact = `${side} on ${t}`;
  if (side === 'YES') return { text: t, rewritten: false, exact };
  // "Total goals over 3.5" / "Chicago team total over 3.5 goals" / "Over 20.5 games"
  if (/\bover\s+\d+(\.\d+)?/i.test(t)) return { text: t.replace(/\bover(\s+\d+(?:\.\d+)?)/i, (_m, n) => `${/^Over/.test(t) ? 'Under' : 'under'}${n}`).replace(/^under/, 'Under'), rewritten: true, exact };
  // "Nikolaj Ehlers: 1+ goals" / "Josh Allen 2+ passing TDs"
  const cnt = t.match(/^(.*?)(\d+)\+\s+(.+)$/);
  if (cnt) return { text: `${cnt[1]}under ${half(Number(cnt[2]))} ${cnt[3]}`.replace(/\s+/g, ' ').trim(), rewritten: true, exact };
  // "away wins by more than 1.5" / "Vancouver −1.5" / "Bills -3.5"
  const by = t.match(/^(.*?)\s+wins by more than\s+(\d+(?:\.\d+)?)$/i);
  if (by) return { text: `${by[1]} does not win by more than ${by[2]}`, rewritten: true, exact };
  const spr = t.match(/^(.*?)\s+[−-](\d+(?:\.\d+)?)$/);
  if (spr) return { text: `${spr[1]} does not cover −${spr[2]}`, rewritten: true, exact };
  const win = t.match(/^(.*?)\s+to win$/i);
  if (win) return { text: `${win[1]} not to win`, rewritten: true, exact };
  return { text: `NO · ${t}`, rewritten: false, exact };
}
