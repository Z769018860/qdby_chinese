#!/usr/bin/env python3
"""Merge Eremora structured exports without discarding existing fields."""
import argparse, json
from pathlib import Path

def load(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}

def merge_value(old, new):
    if new in (None, "", [], {}): return old
    if old in (None, "", [], {}): return new
    if isinstance(old, dict) and isinstance(new, dict):
        out = dict(old)
        for key, value in new.items(): out[key] = merge_value(out.get(key), value)
        return out
    if isinstance(old, list) and isinstance(new, list):
        out = list(old)
        seen = {json.dumps(x, sort_keys=True, ensure_ascii=False) for x in out}
        for value in new:
            marker = json.dumps(value, sort_keys=True, ensure_ascii=False)
            if marker not in seen: out.append(value); seen.add(marker)
        return out
    return new

def main():
    ap = argparse.ArgumentParser(description="Merge Eremora raw structured snapshots")
    ap.add_argument("raw")
    ap.add_argument("--existing", action="append", default=[])
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    merged = {}
    for filename in args.existing + [args.raw]:
        doc = load(filename)
        for record in doc.get("records", []):
            season = str(record.get("dzoneSeason", doc.get("seasonId", "")))
            uid = str(record.get("uid", ""))
            if uid: merged[(season, uid)] = merge_value(merged.get((season, uid), {}), record)
    incoming = load(args.raw)
    output = dict(incoming)
    output["records"] = sorted(merged.values(), key=lambda x: (int(x.get("rank", 10**9)), str(x.get("uid", ""))))
    output["recordCount"] = len(output["records"])
    target = Path(args.out)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + chr(10), encoding="utf-8")
    counts = {"records": len(output["records"]), "members": 0, "wheels": 0,
              "tokens": 0, "creations": 0, "covenants": 0, "enlightenment": 0}
    seasons = {}
    for record in output["records"]:
        sid = str(record.get("dzoneSeason", output.get("seasonId", "unknown")))
        summary = seasons.setdefault(sid, {"records": 0, "members": 0, "wheels": 0,
                                           "tokens": 0, "creations": 0, "covenants": 0})
        summary["records"] += 1
        for wave in record.get("waves", []):
            for team in wave.get("teams", []):
                if team.get("token"): counts["tokens"] += 1; summary["tokens"] += 1
                counts["creations"] += len(team.get("creations", [])); summary["creations"] += len(team.get("creations", []))
                for member in team.get("members", []):
                    counts["members"] += 1; summary["members"] += 1
                    wheels = member.get("wheels") or member.get("weapons") or []
                    covenants = member.get("covenants") or member.get("suits") or []
                    counts["wheels"] += len(wheels); summary["wheels"] += len(wheels)
                    counts["covenants"] += len(covenants); summary["covenants"] += len(covenants)
                    counts["enlightenment"] += int(bool(member.get("enlightenment") or member.get("progression") or member.get("enlightTier")))
    report = {"source": str(Path(args.raw)), "output": str(target), "recordCount": len(output["records"]),
              "fieldCoverage": counts, "seasonCoverage": seasons,
              "missingFields": [key for key in ("wheels", "tokens", "creations", "covenants") if counts[key] == 0],
              "note": "Missing fields are not inferred; provide raw records containing them to fill them."}
    target.with_name(target.stem + "-merge-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + chr(10), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
