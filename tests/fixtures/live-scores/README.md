# Live-score fixtures — SYNTHETIC

Every file here is **hand-written**, not recorded. The session that built them had no network access to any score
provider (all provider hosts were refused by the environment's network policy), so no real response could be
captured. The shapes follow the providers' publicly documented/commonly observed response structure, and the values
are invented (teams are real, scores, clocks and times are not). They exercise the adapter and matcher code; they
prove nothing about any provider's real latency, coverage or accuracy.

Phase 0 of `docs/LIVE_SCORES.md` replaces them with recorded samples (see `scripts/` plan) before any provider is
trusted. Until then do not cite these as evidence about a provider.
