#!/usr/bin/env python3
"""Write the three converter contexts (contexts/<sport>.context.json). Not run in CI.

A context holds what the pure_forecast.v1 rows do not: the validation status of each model version with pinned
evidence, the driver catalogue (label, role, matchup role, read from each model's source code), the workload
statistic, units, the season facts stated by the source documents, and the reason for every field left null.
Holdout interval coverage is read from each source's committed scorecard at the pinned commit, never typed in.

    python3 -I make_contexts.py --mlb <path>/edge-finder-api --nfl <path>/nfl-edge-finder \
        --nba <path>/nba-edge-finder --out contexts
"""
import argparse
import json
import subprocess
from pathlib import Path

_ap = argparse.ArgumentParser()
for _s in ("mlb", "nfl", "nba"):
    _ap.add_argument(f"--{_s}", required=True)
_ap.add_argument("--out", required=True, type=Path)
ARGS = _ap.parse_args()
OUT = ARGS.out
CAPTURE = {"captured_at": "2026-10-11T03:00:00Z", "capture_mode": "historical_research_replay",
           "builder": "pure-contract/prop_explorer.py convert (prop_explorer 1.0.0)"}

def show(repo, commit, path):
    return subprocess.run(["git", "-C", repo, "show", f"{commit}:{path}"], check=True, capture_output=True, text=True).stdout

def ev(i, kind, repo, commit, path, url=None):
    # A permalink to the pinned file; a pull request keeps its own URL.
    return {"id": i, "kind": kind, "repo": repo, "commit": commit, "path": path,
            "url": url or f"https://github.com/{repo}/blob/{commit}/{path}"}

PLAYER_REASON = ("not carried by the source sidecar (pure_forecast.v1 identifies the player by player_id only); "
                 "the explorer resolves it from its own player registry")
COMMON_REASONS = {
    "player.name": PLAYER_REASON, "player.position": PLAYER_REASON, "player.team_id": PLAYER_REASON,
    "player.team_abbr": PLAYER_REASON,
    "game.opponent_team_id": "the source sidecar does not carry the player's team, so the opponent is not known from it",
    "game.is_home": "the source sidecar does not carry the player's team, so home/away is not known from it",
    "distribution.pmf": "the source sidecar publishes quantiles and a threshold ladder, not the full probability mass function",
    "provenance.conversion": "the source rows are already pure_forecast.v1 and are copied byte for byte",
    "validation.source_verdict": "the source evaluated this model only as a comparator and issued no verdict on it",
}

# ------------------------------------------------------------------ MLB
R, C = "chmoses98/edge-finder-api", "6a50874bb9f2dbb9b8576a5765433661871e9f02"
D = "data/research/pitcher_workload_joint/holdout_2025_2026"
sc = json.loads(show(ARGS.mlb, C, f"{D}/scorecard.json"))
mlb_ev = [ev("prereg", "preregistration", R, "58bbd6e14e00d2cb269e3c1f9215de018337c3a9", "docs/research/PITCHER_WORKLOAD_PREREG.md"),
          ev("results", "results", R, C, "docs/research/PITCHER_WORKLOAD_RESULTS.md"),
          ev("scorecard", "scorecard", R, C, f"{D}/scorecard.json"),
          ev("source_audit", "source_audit", R, C, "docs/research/PITCHER_WORKLOAD_SOURCE_AUDIT.md"),
          ev("rerun", "rerun", R, C, f"{D}/pure_gate_rerun_report.json"),
          ev("pr", "pull_request", R, C, "PR #283", "https://github.com/chmoses98/edge-finder-api/pull/283")]
stats = ["pitcher_batters_faced", "pitcher_outs", "pitcher_strikeouts"]
scope = {"season_type": "regular", "seasons": ["2025", "2026"], "statistics": stats,
         "population": "starter-games in the 2025 and 2026 regular seasons with at least 3 prior starts and observed "
                       "batters faced (9,025 scored after 178 exclusions)"}
def mlb_cov(arm):
    return {s: {"observed": sc["stats"][s]["overall"][arm]["p10_p90_coverage"], "n_rows": sc["stats"][s]["overall"][arm]["n"],
                "n_games": sc["stats"][s]["overall"][arm]["games"],
                "scope": "2025-2026 regular-season holdout, every scored starter-game", "evidence_id": "scorecard"} for s in stats}
own = "not_matchup"
mlb = {
    "notes": ["season and season_type: the source population is the 2025-2026 regular season (results doc) and this "
              "sample's kickoffs are 2025-03-18..2025-03-30, i.e. season 2025."],
    "capture": CAPTURE,
    "game_defaults": {"season": "2025", "season_type": "regular"},
    "units": {"pitcher_batters_faced": "batters faced", "pitcher_outs": "outs", "pitcher_strikeouts": "strikeouts"},
    "workload": {"measure": "batters_faced", "unit": "batters faced", "statistic": "pitcher_batters_faced"},
    "drivers": {
        "mlb_pitcher_workload_joint_v1": {
            "n_hist": {"label": "Prior starts in the recency window", "role": "history_depth", "matchup_role": own},
            "season_starts": {"label": "Starts this season before the game", "role": "history_depth", "matchup_role": own},
            "days_rest": {"label": "Days since previous start", "role": "rest_schedule", "matchup_role": own},
            "w_bf": {"label": "Recency-weighted batters faced per start", "role": "workload", "matchup_role": own},
            "w_outs": {"label": "Recency-weighted outs per start", "role": "workload", "matchup_role": own},
            "w_pitches": {"label": "Recency-weighted pitches per start", "role": "workload", "matchup_role": own},
            "last_pitches": {"label": "Pitches in previous start", "role": "workload", "matchup_role": own},
            "last_bf": {"label": "Batters faced in previous start", "role": "workload", "matchup_role": own},
            "max_pitches_last3": {"label": "Most pitches in the last three starts", "role": "workload", "matchup_role": own},
            "pitches_per_bf": {"label": "Pitches per batter faced (history)", "role": "efficiency", "matchup_role": own},
            "k_rate_hist_bf": {"label": "Batters faced behind the strikeout rate", "role": "history_depth", "matchup_role": own},
            "k_rate_hist_k": {"label": "Strikeouts behind the strikeout rate", "role": "efficiency", "matchup_role": own},
            "outs_per_bf_hist_bf": {"label": "Batters faced behind the outs-per-batter rate", "role": "history_depth", "matchup_role": own},
            "outs_per_bf_hist_outs": {"label": "Outs behind the outs-per-batter rate", "role": "efficiency", "matchup_role": own},
            "bullpen_pitches_3d": {"label": "Own bullpen pitches, previous 3 days", "role": "team_environment", "matchup_role": own},
            "bullpen_pitches_1d": {"label": "Own bullpen pitches, previous day", "role": "team_environment", "matchup_role": own},
            "opp_k_rate": {"label": "Opponent batters' strikeout rate this season", "role": "opponent", "matchup_role": "opponent_input",
                           "null_value_reason": "the opponent has no same-season plate appearances before the cutoff (opp_pa = 0), so the source leaves the rate null"},
            "opp_nonout_rate": {"label": "Opponent batters' reach-base (non-out) rate this season", "role": "opponent", "matchup_role": "opponent_input",
                                "null_value_reason": "the opponent has no same-season plate appearances before the cutoff (opp_pa = 0), so the source leaves the rate null"},
            "opp_pa": {"label": "Opponent plate appearances this season", "role": "opponent", "matchup_role": "opponent_input"},
        },
        "pitcher_prop_projection@params_asof_2026-10-07": {
            "history_starts": {"label": "Prior starts in history", "role": "history_depth", "matchup_role": own},
            "mu_outs": {"label": "Expected outs (workload curve)", "role": "workload", "matchup_role": own},
            "k_rate": {"label": "Strikeout rate per batter faced, after the opponent factor", "role": "efficiency", "matchup_role": "opponent_adjusted"},
            "opponent_k_factor": {"label": "Opponent strikeout tendency factor", "role": "opponent", "matchup_role": "opponent_input"},
            "nonout_per_out": {"label": "Batters reaching base per out recorded", "role": "efficiency", "matchup_role": own},
        },
    },
    "validation": {
        "mlb_pitcher_workload_joint_v1": {
            "status": "RESEARCH_HISTORICAL_ACCEPTED", "research_only": True, "scope": scope,
            "source_verdict": "ACCEPTED_CHALLENGER for 2025–2026 regular-season research collection only. The 2026 postseason is BLOCKED_DATA.",
            "compared_against": ["pitcher_prop_projection@params_asof_2026-10-07", "naive_recent5_v1"],
            "evidence": mlb_ev + [ev("sample", "sidecar_sample", R, C, f"{D}/challenger.pure_v1.sample300.jsonl")],
            "caveats": ["Research collection only: no production, publication, staking or authority change, and the challenger is not wired into any export (source results doc).",
                        "The 2026 postseason is BLOCKED_DATA; the postseason diagnostic is on market-selected outcomes and is worse than the champion.",
                        "Lineup-confirmed subgroup is BLOCKED_DATA: no as-of lineup status before 2026-07-30; neither arm reads lineups.",
                        "Challenger minus champion p10-p90 coverage: -0.0824 [-0.0881, -0.0767] for batters faced and -0.0323 [-0.0362, -0.0290] for strikeouts; the champion's intervals covered 0.959 and 0.901 against a nominal 0.80."]},
        "pitcher_prop_projection@params_asof_2026-10-07": {
            "status": "NOT_VALIDATED", "research_only": True, "scope": scope, "source_verdict": None,
            "compared_against": ["mlb_pitcher_workload_joint_v1", "naive_recent5_v1"],
            "evidence": mlb_ev + [ev("sample", "sidecar_sample", R, C, f"{D}/champion.pure_v1.sample300.jsonl")],
            "caveats": ["Incumbent comparator in the W1-D holdout; the preregistered test was of the challenger, and this champion is unchanged.",
                        "178 starter-games (1.9%) were excluded from scoring because this model's date-ordered history contained a suspended game completed after the forecast cutoff."]},
    },
    "coverage": {"mlb_pitcher_workload_joint_v1": mlb_cov("challenger"),
                 "pitcher_prop_projection@params_asof_2026-10-07": mlb_cov("champion")},
    "null_reasons": {**COMMON_REASONS,
                     "game.week": "MLB has no schedule weeks",
                     "game.home_team_id": "not carried by the source sidecar; resolve from the schedule by game_id",
                     "game.away_team_id": "not carried by the source sidecar; resolve from the schedule by game_id",
                     "game_script": "the source model publishes no projection conditional on game script"},
}

# ------------------------------------------------------------------ NFL
R, C = "chmoses98/nfl-edge-finder", "762d69df61d153f4f1ec4fb9edd03344b2708db1"
res = json.loads(show(ARGS.nfl, C, "research/pure_player_v1/results.json"))["player"]["season_2025"]["PURE_PLAYER_V1__vs__PURE_EWM_BASELINE"]
all9 = ["snap_share", "targets", "receptions", "receiving_yards", "carries", "rushing_yards", "passing_attempts", "completions", "passing_yards"]
nfl_ev = [ev("prereg", "preregistration", R, "dfd7a269063f13a445186df759cd636ac56d46a2", "docs/research/PURE_PLAYER_V1_PREREGISTRATION.md"),
          ev("results", "results", R, C, "research/pure_player_v1/RESULTS.md"),
          ev("scorecard", "scorecard", R, C, "research/pure_player_v1/results.json"),
          ev("source_audit", "source_audit", R, C, "docs/research/PURE_PLAYER_V1_DEPENDENCY_AUDIT.md"),
          ev("rerun", "rerun", R, C, "research/pure_player_v1/pure_gate_rerun.json"),
          ev("pr", "pull_request", R, C, "PR #135", "https://github.com/chmoses98/nfl-edge-finder/pull/135")]
nscope = {"season_type": "regular", "seasons": ["2024", "2025"], "statistics": all9,
          "population": "every eligible skill player-game in sports data, conditional on own participation (primary scope 2024+2025)"}
def nfl_cov(side):
    return {s: {"observed": res[s][f"cov80_{side}"], "n_rows": res[s]["n_player_games"], "n_games": res[s]["n_games"],
                "scope": "2025 regular season, every scored player-game", "evidence_id": "scorecard"} for s in ("snap_share", "targets", "receptions", "receiving_yards")}
OA, NM = "opponent_adjusted", "not_matchup"
nfl = {
    "notes": ["season, week, home and away come from the nflverse game_id convention <season>_<week>_<away>_<home>; "
              "season_type: the source population is the regular season (RESULTS.md)."],
    "capture": CAPTURE,
    "game_id_pattern": r"^(?P<season>\d{4})_(?P<week>\d{2})_(?P<away_team_id>[A-Z]{2,3})_(?P<home_team_id>[A-Z]{2,3})$",
    "game_defaults": {"season_type": "regular"},
    "units": {"snap_share": "share of team offensive snaps", "targets": "targets", "receptions": "receptions",
              "receiving_yards": "yards"},
    "workload": {"measure": "snap_share", "unit": "share of team offensive snaps", "statistic": "snap_share"},
    "drivers": {
        "pure-player-v1.0.0": {
            "snap_mean": {"label": "Predicted snap share", "role": "workload", "matchup_role": NM},
            "e_snap_share": {"label": "Snap share, player EWM", "role": "workload", "matchup_role": NM},
            "vol_pa": {"label": "Predicted team pass attempts", "role": "team_environment", "matchup_role": OA},
            "share_t": {"label": "Predicted target share", "role": "opportunity", "matchup_role": NM},
            "e_targets": {"label": "Targets, player EWM", "role": "opportunity", "matchup_role": NM},
            "mu_targets": {"label": "Expected targets", "role": "opportunity", "matchup_role": OA},
            "r_cr": {"label": "Catch rate (player EWM and opponent allowed rate)", "role": "efficiency", "matchup_role": OA},
            "mu_receptions": {"label": "Expected receptions", "role": "opportunity", "matchup_role": OA},
            "r_ypr": {"label": "Yards per reception (player EWM and opponent allowed rate)", "role": "efficiency", "matchup_role": OA},
        },
        "pure-ewm-baseline-1.0.0": {
            "e_snap_share": {"label": "Snap share, player EWM", "role": "workload", "matchup_role": NM},
            "e_targets": {"label": "Targets, player EWM", "role": "opportunity", "matchup_role": NM},
            "e_receptions": {"label": "Receptions, player EWM", "role": "opportunity", "matchup_role": NM},
            "e_receiving_yards": {"label": "Receiving yards, player EWM", "role": "opportunity", "matchup_role": NM},
        },
    },
    "validation": {
        "pure-player-v1.0.0": {
            "status": "RESEARCH_HISTORICAL_ACCEPTED", "research_only": True, "scope": nscope,
            "source_verdict": "ACCEPTED_CHALLENGER (preregistered rule, primary scope 2024+2025, PURE_PLAYER_V1 vs PURE_EWM_BASELINE). Research collection only; nothing here authorises live use.",
            "compared_against": ["pure-ewm-baseline-1.0.0"],
            "evidence": nfl_ev + [ev("sample", "sidecar_sample", R, C, "research/pure_player_v1/sidecars/SAMPLE_2025_wk15-18.PURE_PLAYER_V1.forecasts.jsonl.gz")],
            "caveats": ["Not the most accurate arm in the source repository: DATA_PLAYER_V4 (as-is with market_env=False, and with the closing line) is slightly more accurate on most player statistics; this is the most accurate arm whose inputs are football-only and point-in-time provable from the committed sources.",
                        "Conditional on playing; no participation model, so participation_probability is null.",
                        "Abstained inputs: injury reports, depth charts, weather, target-game QB identity, routes / play-by-play."]},
        "pure-ewm-baseline-1.0.0": {
            "status": "NOT_VALIDATED", "research_only": True, "scope": nscope, "source_verdict": None,
            "compared_against": ["pure-player-v1.0.0"],
            "evidence": nfl_ev + [ev("sample", "sidecar_sample", R, C, "research/pure_player_v1/sidecars/SAMPLE_2025_wk15-18.PURE_EWM_BASELINE.forecasts.jsonl.gz")],
            "caveats": ["The simplest sports-only comparator for PURE_PLAYER_V1: the player's own EWM with no environment, role or opponent model.",
                        "Conditional on playing; no participation model, so participation_probability is null."]},
    },
    "coverage": {"pure-player-v1.0.0": nfl_cov("a"), "pure-ewm-baseline-1.0.0": nfl_cov("b")},
    "null_reasons": {**COMMON_REASONS,
                     "game_script": "neither source arm publishes a player projection conditional on game script"},
}

# ------------------------------------------------------------------ NBA
R, C = "chmoses98/nba-edge-finder", "1742b74b4148a5b97e55ad2ff78cc5cdd9d6b0a6"
hs = json.loads(show(ARGS.nba, C, "docs/research/w1_nba/scorecard_holdout.json"))
nba_stats = ["minutes", "points", "rebounds", "assists", "threes"]
def nba_cov(arm):
    out = {}
    for s in nba_stats:
        u = hs["minutes"]["unc"] if s == "minutes" else hs["final_stats"][s]["unc"]
        out[s] = {"observed": u[arm]["p10_p90_coverage"], "n_rows": u["n_player_games"], "n_games": u["n_games"],
                  "scope": "2026-02-01..2026-04-12 holdout, unconditional, every eligible player-game", "evidence_id": "scorecard"}
    return out
nba_ev = [ev("prereg", "preregistration", R, "5f50cb3b0251d1176cadc67fdbae3511bad1f233", "docs/research/PREREG_W1_NBA_DECOMPOSITION.md"),
          ev("results", "results", R, C, "docs/research/MATCHED_DECOMPOSITION.md"),
          ev("scorecard", "scorecard", R, C, "docs/research/w1_nba/scorecard_holdout.json"),
          ev("rerun", "rerun", R, C, "docs/research/w1_nba/pg_rerun.json"),
          ev("pr", "pull_request", R, C, "PR #21", "https://github.com/chmoses98/nba-edge-finder/pull/21")]
bscope = {"season_type": "regular", "seasons": ["2025-26"], "statistics": nba_stats,
          "population": "every eligible player-game (pre-tip roster rule), 2026-02-01..2026-04-12, 501 games"}
nba_drivers = {
    "p_start": {"label": "Probability of starting (feature layer)", "role": "participation", "matchup_role": NM},
    "p_play_feature": {"label": "Participation probability (feature layer)", "role": "participation", "matchup_role": NM},
    "n_prior_played_team": {"label": "Prior games played for this team", "role": "history_depth", "matchup_role": NM},
    "ewm5_min_mean": {"label": "Minutes mean, EWM-5 (feature layer)", "role": "workload", "matchup_role": NM},
}
nba = {
    "notes": ["season and season_type: the holdout is the 2025-26 regular season (MATCHED_DECOMPOSITION.md)."],
    "capture": CAPTURE,
    "game_defaults": {"season": "2025-26", "season_type": "regular"},
    "units": {"minutes": "minutes", "points": "points", "rebounds": "rebounds", "assists": "assists",
              "threes": "three-pointers made"},
    "workload": {"measure": "minutes", "unit": "minutes", "statistic": "minutes"},
    "drivers": {"NBA_BASELINE_2026_PRESEASON_V1:sim-rotation": nba_drivers, "sim_challenger": nba_drivers},
    "validation": {
        "NBA_BASELINE_2026_PRESEASON_V1:sim-rotation": {
            "status": "NOT_VALIDATED", "research_only": True, "scope": bscope,
            "source_verdict": "Champion: frozen NBA_BASELINE_2026_PRESEASON_V1 (digest 5a4cbda0…193be78), unchanged.",
            "compared_against": ["EWM5_BASELINE_W1", "sim_challenger"],
            "evidence": nba_ev + [ev("sample", "sidecar_sample", R, C, "docs/research/w1_nba/sidecars_sample/pure_sim_rotation_unc.v1.jsonl.gz")],
            "caveats": ["Incumbent champion in a diagnostic holdout: on the full population it has lower unconditional MAE/CRPS than EWM-5 for minutes, points, rebounds and assists (threes MAE tie); conditional on actually playing, EWM-5 has the lower MAE on minutes, points, rebounds and threes.",
                        "No injury reports are read (none are committed historically); inputs are box rows dated strictly before the game date from a retrospective backfill (2026-09-19)."]},
        "sim_challenger": {
            "status": "REJECTED", "research_only": True, "scope": bscope,
            "source_verdict": "REJECTED — strict criteria applied (2026-10-11 review). Not promoted.",
            "compared_against": ["NBA_BASELINE_2026_PRESEASON_V1:sim-rotation", "EWM5_BASELINE_W1"],
            "evidence": nba_ev + [ev("sample", "sidecar_sample", R, C, "docs/research/w1_nba/sidecars_sample/pure_sim_challenger_unc.v1.jsonl.gz")],
            "caveats": ["RATE_PRIOR_5: threes p10-p90 coverage and threes bias worsen with CIs excluding zero, the gate's 3-quantile CRPS CI spans zero, and it over-corrects the bottom usage tercile.",
                        "The sidecar's model_frozen_hash is the champion's parameter digest; the challenger is the champion with BuildConfig.player_prior_minutes 60 -> 5 (preregistration)."]},
    },
    "coverage": {"NBA_BASELINE_2026_PRESEASON_V1:sim-rotation": nba_cov("sim_rotation"), "sim_challenger": nba_cov("sim_challenger")},
    "null_reasons": {**COMMON_REASONS,
                     "game.week": "NBA has no schedule weeks",
                     "game.home_team_id": "not carried by the source sidecar; resolve from the schedule by game_id",
                     "game.away_team_id": "not carried by the source sidecar; resolve from the schedule by game_id",
                     "game_script": "neither source arm publishes a player projection conditional on game script"},
}

for name, ctx in (("mlb", mlb), ("nfl", nfl), ("nba", nba)):
    (OUT / f"{name}.context.json").write_text(json.dumps(ctx, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
print("ok")
