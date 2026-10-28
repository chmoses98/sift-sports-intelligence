// What the CFB Slate Priorities rail must show on the LIVE site, decided from the published board.
//
// The rail's two slate states are both correct app behaviour (src/views/cfb/CfbPriorities.tsx):
//   upcoming games on the board -> the ranked items, led by the Top value signal slot
//   no upcoming game            -> "No upcoming games": no item, no value slot (every game has kicked off or finished,
//                                  e.g. late on a Saturday night or on a Sunday before the next slate publishes)
// The check therefore chooses its assertions from the board (scripts/cfb/select.mjs `upcoming`), never assumes one.

export const NO_UPCOMING = 'No upcoming games';

/** The rail's slate state as rendered, from its text. */
export const railStateOf = (text) => (/No upcoming games/i.test(text ?? '') ? 'none' : 'upcoming');

/**
 * The state the board says the rail should be in. The board is read once per run and a game can kick off while the
 * page is open, so the count is taken before and after the rail is read: when they differ either state is accepted.
 */
export function judgeRailState(text, upcomingBefore, upcomingAfter) {
  const state = railStateOf(text);
  const expected = upcomingBefore === 0 && upcomingAfter === 0 ? ['none'] : upcomingBefore > 0 && upcomingAfter > 0 ? ['upcoming'] : ['none', 'upcoming'];
  const counts = upcomingBefore === upcomingAfter ? `${upcomingAfter}` : `${upcomingBefore}→${upcomingAfter}`;
  return {
    state,
    ok: expected.includes(state),
    msg: `the rail shows ${state === 'none' ? `"${NO_UPCOMING}"` : 'priorities'} and the board has ${counts} upcoming game(s)`,
  };
}

/** The assertions that define the empty state: said plainly, and nothing is prioritized. */
export function noUpcomingChecks(name, { text, links, valueSlots }) {
  return [
    [new RegExp(NO_UPCOMING, 'i').test(text), `${name}: CFB Slate Priorities: says plainly "${NO_UPCOMING}"`],
    [/Priorities return with the next slate/i.test(text), `${name}: CFB Slate Priorities: says when priorities return`],
    [valueSlots === 0 && !/top value signal/i.test(text), `${name}: CFB Slate Priorities: no value signal is shown when no game is upcoming`],
    [links === 0, `${name}: CFB Slate Priorities: no game is prioritized when no game is upcoming (${links} link(s))`],
  ];
}
