#!/usr/bin/env python3
"""Report UID records whose saved Eremora details are incomplete."""
import json, glob
from pathlib import Path

ROOT = Path("data/morimens/eremora")
out = []
for filename in sorted(glob.glob(str(ROOT / "usage" / "*.json")) + glob.glob(str(ROOT / "seasons" / "*.json"))):
    doc = json.loads(Path(filename).read_text(encoding="utf-8"))
    default_season = doc.get("seasonId")
    for record in doc.get("records", []):
        missing = set()
        teams = 0
        members = 0
        for wave in record.get("waves", []):
            for team in wave.get("teams", []):
                teams += 1
                if not team.get("token") and not team.get("keyToken"):
                    missing.add("钥令")
                if not team.get("creations") and not team.get("relics"):
                    missing.add("造物")
                for member in team.get("members", []):
                    members += 1
                    if not (member.get("wheels") or member.get("weapons")):
                        missing.add("命轮")
                    if not (member.get("covenants") or member.get("suits") or member.get("trinkets")):
                        missing.add("密契")
                    if not (member.get("enlightenment") or member.get("progression") or member.get("enlightTier")):
                        missing.add("启灵")
        if not record.get("waves"):
            missing.add("波次")
        if missing:
            out.append({
                "seasonId": record.get("dzoneSeason", record.get("seasonId", default_season)),
                "rank": record.get("rank"),
                "uid": str(record.get("uid")),
                "missing": sorted(missing),
                "teamCount": teams,
                "memberCount": members,
                "source": filename.replace("\\", "/")
            })

unique = {}
for row in out:
    key = (str(row["seasonId"]), row["uid"])
    if key not in unique:
        unique[key] = row
    else:
        unique[key]["missing"] = sorted(set(unique[key]["missing"]) | set(row["missing"]))
out = list(unique.values())
out.sort(key=lambda x: (int(x["seasonId"] or 0), int(x["rank"] or 10**9), x["uid"]))
summary = {}
for row in out:
    key = str(row["seasonId"])
    summary.setdefault(key, {"incompleteRecords": 0, "uids": [], "missingByField": {}})
    summary[key]["incompleteRecords"] += 1
    summary[key]["uids"].append(row["uid"])
    for field in row["missing"]:
        summary[key]["missingByField"][field] = summary[key]["missingByField"].get(field, 0) + 1
report = {"generatedAt": "2026-09-17", "incompleteRecordCount": len(out),
          "summaryBySeason": summary, "records": out,
          "note": "This reports missing fields in the repository snapshot; it does not infer unavailable data."}
target = ROOT / "incomplete-uids-report.json"
target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + chr(10), encoding="utf-8")
Path(ROOT / "incomplete-uids-69.txt").write_text(
    chr(10).join(x["uid"] for x in out if str(x["seasonId"]) == "69") + (chr(10) if any(str(x["seasonId"]) == "69" for x in out) else ""),
    encoding="utf-8")
print(json.dumps({"incompleteRecordCount": len(out), "summaryBySeason": summary}, ensure_ascii=False, indent=2))
