"""Projection Foundation feed monitor: makes a stale, malformed or missing projection feed visible.

For each sport it reads `projection-data/projections/<sport>/latest.json` and checks schema, research-only authority,
freshness (in season), distribution coherence and gate status mix. Writes a markdown summary (GitHub job summary) and
exits 1 if any *published* feed is invalid, incoherent or stale in season. A feed that has never been published is
reported as NOT PUBLISHED (warning) until its workflow has run once.

Promotion checks (read from src/lib/projectionApprovals.ts, the single record of which engine SIFT shows):
  * a PROMOTED family must be READY in the feed and must not have vanished from it while the feed has rows;
  * for APPROVED_PENDING_LIVE_INPUTS families it reports whether the live availability inputs are now verified. That
    line is information for the owner: nothing here activates a family, because activation is a reviewed change to the
    approvals table.

Usage: python research/projection_foundation/monitor.py [--now 2026-10-17T00:00:00Z] [--file SPORT=path ...]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

REPO = {"NFL": "nfl-edge-finder", "CFB": "cfb-edge-finder", "NBA": "nba-edge-finder", "MLB": "edge-finder-api", "NHL": "NHL-edge-finder"}
MAX_AGE_H = {"NFL": 192, "CFB": 192, "NBA": 48, "MLB": 36, "NHL": 48}
# (start month, end month) inclusive, wrapping the new year where needed
SEASON = {"NFL": (9, 2), "CFB": (8, 1), "NBA": (10, 6), "MLB": (3, 10), "NHL": (10, 6)}


def in_season(sport: str, now: datetime) -> bool:
    a, b = SEASON[sport]
    m = now.month
    return a <= m <= b if a <= b else (m >= a or m <= b)


def url(sport: str) -> str:
    return f"https://raw.githubusercontent.com/chmoses98/{REPO[sport]}/projection-data/projections/{sport.lower()}/latest.json"


APPROVALS_TS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src", "lib", "projectionApprovals.ts")
_ROW = re.compile(r"row\(\s*'([A-Z]+)'\s*,\s*'([a-z0-9_]+)'\s*,\s*'([A-Z_]+)'")
_LIST = re.compile(r"\.\.\.\[([^\]]*)\]\.map\(\(f\) =>\s*row\('([A-Z]+)'\s*,\s*f\s*,\s*'([A-Z_]+)'")


def decisions(path: str = APPROVALS_TS) -> dict[str, dict[str, str]]:
    """{sport: {family: decision}} parsed from the approvals table (both the single-row and the mapped-list forms)."""
    src = open(path, encoding="utf-8").read()
    out: dict[str, dict[str, str]] = {}
    for sport, family, decision in _ROW.findall(src):
        out.setdefault(sport, {})[family] = decision
    for names, sport, decision in _LIST.findall(src):
        for fam in re.findall(r"'([a-z0-9_]+)'", names):
            out.setdefault(sport, {})[fam] = decision
    return out


def promotion_findings(sport: str, doc: dict, dec: dict[str, dict[str, str]]) -> tuple[list[str], list[str]]:
    """(problems, notes) for one published feed against the approvals table."""
    problems, notes = [], []
    fams = doc.get("families") or {}
    rows = {}
    for p in doc.get("players", []):
        rows[p.get("family")] = rows.get(p.get("family"), 0) + 1
    for g in doc.get("games", []):
        for t in g.get("teams", []):
            rows[t.get("family")] = rows.get(t.get("family"), 0) + 1
    has_rows = bool(doc.get("players") or doc.get("games"))
    for fam, decision in sorted(dec.get(sport, {}).items()):
        if decision == "PROMOTED":
            info = fams.get(fam)
            if info is not None and info.get("readiness") != "READY":
                problems.append(f"promoted {fam} is {info.get('readiness')} in the feed")
            if has_rows and not rows.get(fam):
                notes.append(f"promoted {fam} has no rows in this run")
        elif decision == "APPROVED_PENDING_LIVE_INPUTS":
            players = [p for p in doc.get("players", []) if p.get("family") == fam]
            if not players:
                notes.append(f"{fam}: approved, waiting on live inputs; no rows yet")
                continue
            ok = sum(1 for p in players if ((p.get("participation") or {}).get("status")) in ("CONFIRMED_ACTIVE", "LIKELY_ACTIVE"))
            official = sum(1 for p in players if "official" in str((p.get("participation") or {}).get("source", "")))
            notes.append(f"{fam}: approved, waiting on live inputs; availability verified for {ok}/{len(players)} rows, {official} from an official report")
    return problems, notes


def check(sport: str, doc: dict | None, now: datetime) -> tuple[str, list[str], dict]:
    if doc is None:
        return "NOT PUBLISHED", ["no latest.json yet (workflow not merged or not run)"], {}
    problems: list[str] = []
    if doc.get("schema") != "sift.projections.v1":
        problems.append(f"schema {doc.get('schema')!r}")
    if (doc.get("model") or {}).get("authority") != "research_only":
        problems.append("authority is not research_only")
    gen = doc.get("generated_utc") or doc.get("data_asof_utc")
    age_h = None
    try:
        age_h = (now - datetime.fromisoformat(str(gen).replace("Z", "+00:00"))).total_seconds() / 3600
    except ValueError:
        problems.append("no parseable generated_utc")
    if age_h is not None and in_season(sport, now) and age_h > MAX_AGE_H[sport]:
        problems.append(f"stale: {age_h:.0f}h old (limit {MAX_AGE_H[sport]}h in season)")
    gates: dict[str, int] = {}
    incoherent = 0
    for p in doc.get("players", []):
        st = (p.get("gate") or {}).get("status", "MISSING")
        gates[st] = gates.get(st, 0) + 1
        th = sorted(((float(k), v) for k, v in (p.get("thresholds") or {}).items()), key=lambda t: t[0])
        if any(not (0 <= v <= 1) for _, v in th) or any(th[i + 1][1] > th[i][1] + 1e-9 for i in range(len(th) - 1)):
            incoherent += 1
        if p.get("p10") is not None and p.get("p90") is not None and p["p10"] > p["p90"]:
            incoherent += 1
    if incoherent:
        problems.append(f"{incoherent} incoherent player distributions")
    if gates.get("MISSING"):
        problems.append(f"{gates['MISSING']} projections without a gate status")
    try:
        extra_problems, notes = promotion_findings(sport, doc, decisions())
    except OSError:
        extra_problems, notes = [], []
    problems += extra_problems
    stats = {"players": len(doc.get("players", [])), "gate": gates, "age_h": None if age_h is None else round(age_h, 1), "notes": notes}
    return ("FAIL" if problems else "OK"), problems, stats


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--now")
    ap.add_argument("--file", action="append", default=[], help="SPORT=path to check a local file instead of fetching")
    a = ap.parse_args()
    now = datetime.fromisoformat(a.now.replace("Z", "+00:00")) if a.now else datetime.now(timezone.utc)
    local = dict(x.split("=", 1) for x in a.file)
    lines = ["## Projection Foundation feeds", "", "| Sport | Status | Players | Gate mix | Age (h) | Problems |", "|---|---|---|---|---|---|"]
    failed = False
    notes_by_sport: dict[str, list[str]] = {}
    for sport in REPO:
        doc = None
        if sport in local:
            doc = json.load(open(local[sport]))
        elif not local:
            try:
                with urllib.request.urlopen(url(sport), timeout=30) as r:
                    doc = json.load(r)
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    lines.append(f"| {sport} | FAIL | | | | fetch error HTTP {e.code} |")
                    failed = True
                    continue
            except (urllib.error.URLError, json.JSONDecodeError) as e:
                lines.append(f"| {sport} | FAIL | | | | {type(e).__name__}: {e} |")
                failed = True
                continue
        else:
            continue
        status, probs, st = check(sport, doc, now)
        failed |= status == "FAIL"
        if st.get("notes"):
            notes_by_sport[sport] = st["notes"]
        lines.append(f"| {sport} | {status} | {st.get('players', '')} | {st.get('gate', '')} | {st.get('age_h', '')} | {'; '.join(probs)} |")
    lines += ["", "### Promotion notes", ""]
    for sport, notes in notes_by_sport.items():
        lines += [f"- **{sport}**: {n}" for n in notes]
    text = "\n".join(lines) + "\n"
    print(text)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as f:
            f.write(text)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
