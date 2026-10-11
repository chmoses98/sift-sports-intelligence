#!/usr/bin/env python3
"""Extract the example source rows from the sport repositories' committed research outputs (read-only).

Not run in CI (it needs local checkouts of the three sport repositories). It reads each file with `git show` at a
pinned commit, picks ONE player-game per sport deterministically, copies that player-game's rows verbatim, and
writes `sources/<sport>_<arm>.v1.jsonl` plus `sources/SOURCES.json` (repo, commit, path, sha256 of the source
file as committed, the selection rule and any conversion). Nothing is edited, rounded or invented.

    python3 -I extract_sources.py --mlb <path>/edge-finder-api --nfl <path>/nfl-edge-finder \
        --nba <path>/nba-edge-finder --out sources

The NFL sample is committed in the kit interim format (pure_forecast.v0), so it is converted to
pure_forecast.v1 with the NFL repository's own converter (scripts/research/pure_player_v1_v1sidecar.py, run from
the same pinned commit with the frozen hash its RESULTS.md reports, git:0441dfc). The MLB and NBA samples are
already v1 and are copied byte for byte.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

PLAN = {
    "MLB": {
        "repo": "chmoses98/edge-finder-api", "arg": "mlb",
        "commit": "6a50874bb9f2dbb9b8576a5765433661871e9f02",  # merge of PR #283
        "arms": {
            "challenger": "data/research/pitcher_workload_joint/holdout_2025_2026/challenger.pure_v1.sample300.jsonl",
            "champion": "data/research/pitcher_workload_joint/holdout_2025_2026/champion.pure_v1.sample300.jsonl",
        },
        "stats": ["pitcher_batters_faced", "pitcher_outs", "pitcher_strikeouts"],
    },
    "NFL": {
        "repo": "chmoses98/nfl-edge-finder", "arg": "nfl",
        "commit": "762d69df61d153f4f1ec4fb9edd03344b2708db1",  # merge of PR #135
        "arms": {
            "pure_player_v1": "research/pure_player_v1/sidecars/SAMPLE_2025_wk15-18.PURE_PLAYER_V1.forecasts.jsonl.gz",
            "pure_ewm_baseline": "research/pure_player_v1/sidecars/SAMPLE_2025_wk15-18.PURE_EWM_BASELINE.forecasts.jsonl.gz",
        },
        "stats": ["receiving_yards", "receptions", "snap_share", "targets"],
        "converter": "scripts/research/pure_player_v1_v1sidecar.py", "frozen": "git:0441dfc",
    },
    "NBA": {
        "repo": "chmoses98/nba-edge-finder", "arg": "nba",
        "commit": "1742b74b4148a5b97e55ad2ff78cc5cdd9d6b0a6",  # merge of PR #21
        "arms": {
            "sim_rotation_unc": "docs/research/w1_nba/sidecars_sample/pure_sim_rotation_unc.v1.jsonl.gz",
            "sim_challenger_unc": "docs/research/w1_nba/sidecars_sample/pure_sim_challenger_unc.v1.jsonl.gz",
        },
        "stats": ["assists", "minutes", "points", "rebounds", "threes"],
    },
}


def git_show(repo: Path, commit: str, path: str) -> bytes:
    return subprocess.run(["git", "-C", str(repo), "show", f"{commit}:{path}"], check=True,
                          capture_output=True).stdout


def lines_of(blob: bytes, path: str) -> list[str]:
    text = (gzip.decompress(blob) if path.endswith(".gz") else blob).decode("utf-8")
    return [ln for ln in text.splitlines() if ln.strip()]


def main() -> int:
    ap = argparse.ArgumentParser()
    for sport in PLAN.values():
        ap.add_argument(f"--{sport['arg']}", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    manifest = []
    for sport, plan in PLAN.items():
        repo = getattr(a, plan["arg"])
        blobs = {arm: git_show(repo, plan["commit"], path) for arm, path in plan["arms"].items()}
        rows = {arm: [(ln, json.loads(ln)) for ln in lines_of(b, plan["arms"][arm])] for arm, b in blobs.items()}
        need = set(plan["stats"])
        have = {}
        for arm, rs in rows.items():
            d: dict[tuple, set] = {}
            for _, r in rs:
                d.setdefault((r["game_id"], r["player_id"]), set()).add(r["statistic"])
            have[arm] = d
        candidates = sorted(k for k in have[next(iter(have))] if all(need <= have[arm].get(k, set()) for arm in have))
        if not candidates:
            print(f"{sport}: no player-game with {sorted(need)} in every arm", file=sys.stderr)
            return 1
        game, player = candidates[0]
        selection = (f"first (game_id, player_id) in sorted order with statistics {sorted(need)} in every arm "
                     f"({', '.join(plan['arms'])}): game_id={game}, player_id={player}; all of that player-game's rows")
        for arm, rs in rows.items():
            picked = [ln for ln, r in rs if r["game_id"] == game and r["player_id"] == player]
            conversion = None
            if "converter" in plan:
                with tempfile.TemporaryDirectory() as tmp:
                    conv = Path(tmp) / "converter.py"
                    conv.write_bytes(git_show(repo, plan["commit"], plan["converter"]))
                    src, dst = Path(tmp) / "in.jsonl", Path(tmp) / "out.jsonl"
                    src.write_text("".join(ln + "\n" for ln in picked), encoding="utf-8")
                    subprocess.run([sys.executable, "-I", str(conv), "--in", str(src), "--out", str(dst),
                                    "--frozen", plan["frozen"]], check=True)
                    picked = [ln for ln in dst.read_text(encoding="utf-8").splitlines() if ln.strip()]
                conversion = (f"pure_forecast.v0 -> v1 with {plan['repo']}:{plan['converter']} at {plan['commit'][:12]} "
                              f"--frozen {plan['frozen']}")
            name = f"{sport.lower()}_{arm}.v1.jsonl"
            (a.out / name).write_text("".join(ln + "\n" for ln in picked), encoding="utf-8")
            manifest.append({"file": name, "sport": sport, "arm": arm, "repo": plan["repo"], "commit": plan["commit"],
                             "path": plan["arms"][arm], "file_sha256": hashlib.sha256(blobs[arm]).hexdigest(),
                             "rows": len(picked), "selection": selection, "conversion": conversion})
    (a.out / "SOURCES.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
