export const STUDIES = [
  {
    id: "nba-selector-tail",
    sport: "NBA",
    title: "Why our biggest model gaps keep losing",
    status: "Investigate",
    date: "2026-10-28",
    question: "Does selecting the largest model-versus-market discrepancies select model errors instead of real edges?",
    finding: "In the sealed-candidate audit, the 38 settled trades averaged 58.6% predicted win probability, compared with 41.5% market mid and 28.9% observed wins.",
    caveat: "Only 38 trades across 12 games. Burn-in and counted seals are pooled, and trades are correlated. This is diagnostic research, not an out-of-sample trading claim.",
    next: "Pre-register and test a market-shrunk selection rule against the frozen selector on untouched decisions. Preserve the original strategy as control.",
    metrics: [
      { label: "Selected trades", value: "38 / 12 games" },
      { label: "Predicted vs observed", value: "58.6% / 28.9%" }
    ],
    sources: [{ label: "Selection and calibration audit — draft PR #79", url: "https://github.com/chmoses98/nba-edge-finder/pull/79" }],
    checklist: ["Freeze the new selector and time window", "Preserve one chronological executable portfolio", "Compare calibration, CLV and after-fee ROI by independent game"]
  },
  {
    id: "nba-market-benchmark",
    sport: "NBA",
    title: "Our NBA market baseline is beating the model",
    status: "Evidence against",
    date: "2026-10-28",
    question: "Does SIFT's published probability model beat Kalshi's probability baseline at T-60?",
    finding: "Over the 52-game Week 1 research sample, T-60 Brier was 0.167 for the model versus 0.159 for the market mid. Selected PF_EDGE_V1 paper decisions returned -12.2% after modeled costs.",
    caveat: "Preliminary research, paper returns and correlated markets. A negative comparison does not imply every model family or future version is worse.",
    next: "Identify the error sources by family and probability bucket; require held-out improvement before using this model to rank bets.",
    metrics: [
      { label: "Model / market Brier", value: "0.167 / 0.159" },
      { label: "Selected paper ROI", value: "-12.2%" }
    ],
    sources: [{ label: "NBA Week 1 preliminary research report — issue #39", url: "https://github.com/chmoses98/nba-edge-finder/issues/39" }],
    checklist: ["Separate projection precision from market superiority", "Review selected tails by side and family", "Keep model results research-only until validated"]
  },
  {
    id: "mlb-pricing",
    sport: "MLB",
    title: "Sharp-anchored MLB pricing has no qualified edge",
    status: "No qualified signal",
    date: "2026-10-27",
    question: "Can a Pinnacle-anchored simulator find executable Kalshi baseball contracts mispriced beyond fees and spreads?",
    finding: "The full-market study found no executable, post-fee, out-of-sample strategy. Most modeled prices were within 0.4–1.3 cents of Kalshi mid; the broad 0-cent threshold replay returned -2.9% across 778 trades in 201 games.",
    caveat: "Research PR #305 is draft. Some point-in-time price captures were unusable, and passive queue fill rates were very low; do not infer untested opportunities are profitable.",
    next: "Repair and verify quote capture, then restrict fresh tests to specifically motivated information-lag hypotheses rather than repeatedly optimizing old results.",
    metrics: [
      { label: "Model vs mid gap", value: "0.4–1.3¢" },
      { label: "Broad replay ROI", value: "-2.9%" }
    ],
    sources: [{ label: "MLB Alpha full-market research — draft PR #305", url: "https://github.com/chmoses98/edge-finder-api/pull/305" }],
    checklist: ["Verify corrected dollars-field capture", "Record real ask, depth and age", "Require a fresh frozen holdout before promotion"]
  },
  {
    id: "nfl-pit-capture",
    sport: "NFL",
    title: "Verify the pregame information clock",
    status: "Verify fix",
    date: "2026-10-28",
    question: "Can we prove that injury and roster inputs were actually available before our NFL betting decision?",
    finding: "Before the clock change, only 6 of 35 required pregame capture slots arrived on time in a seven-day audit. PR #212 introduces a self-clocked lane and a late-night capture slot.",
    caveat: "The prior miss rate describes the pre-fix period. A merged code fix is not proof that subsequent production captures are on time.",
    next: "Measure post-fix timely slots and compare archived input timestamps with decision timestamps before trusting any apparent historical edge.",
    metrics: [
      { label: "Prior slots on time", value: "6 / 35" },
      { label: "Fix state", value: "Merged; verify" }
    ],
    sources: [{ label: "NFL point-in-time capture fix — PR #212", url: "https://github.com/chmoses98/nfl-edge-finder/pull/212" }],
    checklist: ["Measure slots after deployment", "Report missing/late vintages explicitly", "Refuse retroactively reconstructed inputs"]
  }
];