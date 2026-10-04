"""Build data/morimens/replay-gear.json: id -> names/icons/effects for wheels and covenants.

Replay states only carry the equipped wheel's in-game id and the covenant's Chinese set name,
so the replay review page needs this small lookup. Sources (all already in the repo):
  * data/morimens/eremora/seasons/*.json  - wheel id/name/icon, covenant id/name/icon/set effects
  * data/morimens/game/glossary.json      - Chinese names (kind wheel / covenant)
"""
import glob
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "morimens", "replay-gear.json")


def basename(url):
    return re.sub(r"\.[a-z0-9]+$", "", str(url or "").split("/")[-1], flags=re.I)


def main():
    gloss = json.load(open(os.path.join(ROOT, "data/morimens/game/glossary.json"), encoding="utf-8"))["entries"]
    norm = lambda t: str(t or "").replace("\xa0", " ").strip()
    zh_wheel = {norm(e["en"]): e["zh"] for e in gloss if e.get("k") == "wheel"}
    zh_cov = {norm(e["en"]): e["zh"] for e in gloss if e.get("k") == "covenant"}
    wheels, covenants = {}, {}
    for path in sorted(glob.glob(os.path.join(ROOT, "data/morimens/eremora/seasons/*.json"))):
        try:
            data = json.load(open(path, encoding="utf-8"))
        except ValueError:
            print("skip unreadable", os.path.basename(path))
            continue
        for rec in data.get("records", []):
            for wave in rec.get("waves", []):
                for team in wave.get("teams", []):
                    for m in team.get("members", []):
                        for w in m.get("wheels") or []:
                            wid = str(w.get("id"))
                            if wid not in wheels and w.get("name"):
                                wheels[wid] = {"en": norm(w["name"]), "zh": zh_wheel.get(norm(w["name"]), ""), "icon": basename(w.get("image")), "rarity": w.get("rarity", "")}
                        for c in m.get("covenants") or []:
                            cid = str(c.get("id"))
                            if cid not in covenants and c.get("name"):
                                covenants[cid] = {"en": norm(c["name"]), "zh": zh_cov.get(norm(c["name"]), ""), "icon": basename(c.get("image")), "effects": [{"pieces": e.get("pieces"), "desc": re.sub(r"<[A-Za-z]+:([^>]*)>", r"\1", e.get("desc", ""))} for e in c.get("effects", [])]}
    # covenants known only from the glossary (never seen in the season data)
    seen = {v["en"] for v in covenants.values()}
    for en, zh in zh_cov.items():
        if en not in seen:
            covenants["g:" + en] = {"en": en, "zh": zh, "icon": "", "effects": []}
    out = {"version": 1, "wheels": wheels, "covenants": covenants}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("wheels", len(wheels), "covenants", len(covenants), "bytes", os.path.getsize(OUT))


if __name__ == "__main__":
    main()
