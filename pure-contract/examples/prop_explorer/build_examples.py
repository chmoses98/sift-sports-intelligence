#!/usr/bin/env python3
"""Rebuild the explorer examples from the committed source excerpts and contexts (deterministic, stdlib only).

    python3 -I build_examples.py [--check]

For every sport, each `sources/<sport>_<arm>.v1.jsonl` (verbatim pure_forecast.v1 rows from a sport repository's
committed research output, see sources/SOURCES.json) is converted with `contexts/<sport>.context.json` by
`prop_explorer.convert`, with the row provenance taken from SOURCES.json. Output:
`<sport>.prop_explorer_projection.v1.jsonl`. `--check` rebuilds in memory and fails if a committed example differs.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
import prop_explorer as px  # noqa: E402
import pure_gate as gate  # noqa: E402


def build() -> dict[str, str]:
    manifest = json.loads((HERE / "sources" / "SOURCES.json").read_text(encoding="utf-8"))
    out: dict[str, list[dict]] = {}
    for entry in manifest:
        sport = entry["sport"].lower()
        ctx = json.loads((HERE / "contexts" / f"{sport}.context.json").read_text(encoding="utf-8"))
        ctx["provenance"] = {k: entry[k] for k in ("repo", "commit", "path", "file_sha256", "selection", "conversion")}
        rows = gate.load_jsonl(HERE / "sources" / entry["file"])
        out.setdefault(sport, []).extend(px.convert(rows, ctx))
    texts = {}
    for sport, rows in out.items():
        px.validate_projection_file(rows)
        texts[f"{sport}.prop_explorer_projection.v1.jsonl"] = px.dumps_jsonl(rows)
    return texts


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    texts = build()
    stale = []
    for name, text in sorted(texts.items()):
        path = HERE / name
        if a.check:
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                stale.append(name)
        else:
            path.write_text(text, encoding="utf-8")
    if stale:
        print(f"examples differ from a rebuild: {stale}", file=sys.stderr)
        return 1
    print(json.dumps({"examples": sorted(texts), "rows": {k: v.count("\n") for k, v in sorted(texts.items())}}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
