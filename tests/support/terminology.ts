// Development vocabulary that must not reach a screen (see tests/uiTerminology.test.ts).
/** Phrases that mean "a second, development-only model" to a reader. */
export const CONFUSING = [
  /shadow (model|p\(|v\d|arm|projection)/i,
  /\bP\(over\)/,
  /research arm/i,
  /simulation mean/i,
  /(challenger|incumbent|legacy) (model|projection|comparison|vs\b)/i,
  /vs (the )?(incumbent|challenger|legacy)/i,
  /\b(champion|challenger)\/(champion|challenger)\b/i,
];
