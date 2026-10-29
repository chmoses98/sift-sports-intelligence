"""The feed monitor reads SIFT's approvals table and flags a promoted family that regresses in the feed."""
import os
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import monitor  # noqa: E402

NOW = datetime(2026, 10, 18, 12, tzinfo=timezone.utc)


def test_approvals_table_parses_every_decision_form():
    d = monitor.decisions()
    assert d["NFL"]["receptions"] == "PROMOTED" and d["NFL"]["passing_yards"] == "HELD" and d["NFL"]["passing_tds"] == "RETAINED"
    assert d["MLB"]["pitcher_strikeouts"] == "PROMOTED" and d["MLB"]["hits"] == "HELD"       # mapped-list and spread forms
    assert d["NBA"]["minutes"] == "PROMOTED" and d["NBA"]["fga"] == "PROMOTED" and d["NBA"]["team_points"] == "HELD"   # promoted 2026-10-23
    assert d["CFB"]["passing_yards"] == "HELD" and d["NHL"]["shots"] == "RETAINED"


def _doc(readiness="READY", players=None, games=None):
    return {"schema": "sift.projections.v1", "generated_utc": "2026-10-18T09:00:00Z", "model": {"authority": "research_only"},
            "families": {"receptions": {"readiness": readiness}}, "players": players or [], "games": games or []}


def test_a_promoted_family_that_stops_being_ready_fails_the_monitor():
    p = {"family": "receptions", "gate": {"status": "PASS"}, "thresholds": {"3": 0.9, "5": 0.5}, "p10": 1, "p90": 8}
    status, problems, _ = monitor.check("NFL", _doc(players=[p]), NOW)
    assert status == "OK" and problems == []
    status, problems, _ = monitor.check("NFL", _doc(readiness="NEEDS IMPROVEMENT", players=[p]), NOW)
    assert status == "FAIL" and any("promoted receptions is NEEDS IMPROVEMENT" in x for x in problems)


def _nba(readiness="READY"):
    return {"schema": "sift.projections.v1", "generated_utc": "2026-10-18T09:00:00Z", "model": {"authority": "research_only"},
            "families": {"minutes": {"readiness": readiness}},
            "players": [{"family": "minutes", "gate": {"status": "REVIEW"}, "participation": {"status": "UNVERIFIED", "source": ""}},
                        {"family": "minutes", "gate": {"status": "PASS"}, "participation": {"status": "CONFIRMED_ACTIVE", "source": "nba_official_injury_report"}}]}


def test_a_promoted_nba_family_that_stops_being_ready_fails_the_monitor():
    status, problems, _ = monitor.check("NBA", _nba(), NOW)
    assert status == "OK" and problems == []
    status, problems, _ = monitor.check("NBA", _nba("SHADOW VALIDATION"), NOW)
    assert status == "FAIL" and any("promoted minutes is SHADOW VALIDATION" in x for x in problems)


def test_pending_family_reports_availability_verification_without_failing():
    # no family is pending in the live table any more (NBA was promoted 2026-10-23); the pending path still serves the next one
    problems, notes = monitor.promotion_findings("NBA", _nba(), {"NBA": {"minutes": "APPROVED_PENDING_LIVE_INPUTS"}})
    assert problems == []
    assert any("availability verified for 1/2 rows, 1 from an official report" in n for n in notes)
