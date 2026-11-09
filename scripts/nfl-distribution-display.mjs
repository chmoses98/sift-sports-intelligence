// How the live Explorer says a count stat's expected value, for scripts/nfl-distribution-production-check.mjs.
//
// The Explorer formats a count stat with src/insights/propBoard.ts `fmtValue`: one decimal, a trailing ".0" dropped, so a published
// mean of 5.038 reads "5 rec" and 5.4 reads "5.4 rec". The promoted families (receptions, completions) are count stats. The check
// compares what the page says with the published mean in that form; tests/nflDistributionCheckDisplay.test.ts holds this equal
// to the app's own fmtValue.

/** The published mean as the Explorer says it (without the unit). */
export const shownMean = (v) => String(Math.round(v * 10) / 10);

/** The text carries that value as a whole number token ("5" is not found in "15" or "5.4"). */
export const showsMean = (text, v) => new RegExp(`(?<![\\d.])${shownMean(v).replace('.', '\\.')}(?!\\d|\\.\\d)`).test(text);
