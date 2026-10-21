"""Regenerates nfl-season.pf_core-1.3.0.json with the real library (synthetic forecasts, seed 7):
    python3 tests/fixtures/pf-scorecard/generate.py tests/fixtures/pf-scorecard/nfl-season.pf_core-1.3.0.json
"""
import json, os, sys, tempfile
from math import exp, factorial
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "research", "projection_foundation"))
from pf_core import prospective as pr

def fc(role, fam, game, ent, mean, probs, lo=0):
    return dict(sport="NFL", family=fam, model_id=role, model_role=role, model_version="t", game_id=game, game_start_utc="2026-10-18T17:00:00Z",
                entity_id=ent, entity_name=ent, team="X", generated_utc="2026-10-18T12:00:00Z", data_asof_utc="2026-10-18T11:00:00Z",
                mean=mean, lo=lo, probs=probs, gate_status="PASS", participation=None, readiness="READY")
rng = np.random.default_rng(7)
recs, outs = [], []
for g in range(30):
    for e in range(4):
        gid, ent = f"g{g}", f"p{e}"
        y = int(rng.random() < 0.23)
        recs += [fc("challenger", "anytime_td", gid, ent, 0.23, [0.77, 0.23]), fc("incumbent", "anytime_td", gid, ent, 0.15, [])]
        outs.append(dict(game_id=gid, entity_id=ent, family="anytime_td", actual=y, participated=True, final=True, source="t", game_date="2026-10-18"))
        mu = 5.0
        pmf = [exp(-mu) * mu ** k / factorial(k) for k in range(25)]
        pmf = [p / sum(pmf) for p in pmf]
        recs += [fc("challenger", "receptions", gid, ent, mu, pmf), fc("incumbent", "receptions", gid, ent, 6.0, [])]
        outs.append(dict(game_id=gid, entity_id=ent, family="receptions", actual=int(rng.poisson(mu)), participated=True, final=True, source="t", game_date="2026-10-18"))
root = tempfile.mkdtemp()
pr.archive_forecasts(recs, root, now_utc="2026-10-18T13:00:00Z")
pr.archive_outcomes(outs, root, "NFL", now_utc="2026-10-19T04:00:00Z")
print(pr.settle(root, "NFL", now_utc="2026-10-19T05:00:00Z"))
card = pr.scorecard("NFL", root, {"receptions": {"crps": 1.2, "mae": 1.6}, "anytime_td": {"crps": 0.18}}, now_utc="2026-10-19T06:00:00Z")
card["capture"] = {"forecasts_archived": len(recs)}
json.dump(card, open(sys.argv[1], "w"), indent=1, sort_keys=True, default=float)
print(card["scoring_version"], [ (f["family"], f["outcome_type"]) for f in card["families"]], card["alerts"])
