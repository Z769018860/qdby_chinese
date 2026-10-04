"""Build data/morimens/replay-relics.json: replay relic tid -> {en, zh, icon, desc}.

Some public replays ship without RelicConfig, so the review page falls back to this table.
Sources: Dzone id->English-name imports, glossary (en->zh) and SKeyDB relic records (icon / description)."""
import json, re, glob
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / "data" / "morimens"
ids = {}
for f in sorted(glob.glob(str(D / "dzone" / "*" / "id-names.json"))):
    for k, v in (json.load(open(f, encoding="utf-8")).get("creation") or {}).items():
        ids[k] = re.sub(r"\s+—.*$", "", v).strip()
def _zh(e):
    for a in e.get("alt") or []:
        if a[1] == "game":
            return a[0]  # in-game wording wins over the site wording
    return e["zh"]
zh = {e["en"]: _zh(e) for e in json.load(open(D / "game" / "glossary.json", encoding="utf-8"))["entries"] if e["k"] == "relic"}
MANUAL = {"Rusted Key": "锈蚀钥匙"}  # seen with Chinese text in replays that ship RelicConfig
zh.update(MANUAL)
assets = json.load(open(D / "skeydb" / "public-v3" / "indexes" / "assets.json", encoding="utf-8"))["assets"]
recs = {}
for f in glob.glob(str(D / "skeydb" / "public-v3" / "records" / "relics" / "*.json")):
    r = json.load(open(f, encoding="utf-8"))
    icon = (assets.get((r.get("assets") or {}).get("icon")) or {}).get("assetId")
    for nm in [r["name"]] + [v.get("name") for v in r.get("variants", [])]:
        if nm:
            recs.setdefault(nm, {"icon": icon, "desc": r.get("descriptionTemplate")})
def norm(s): return re.sub(r"[^a-z0-9]", "", s.lower().replace("+", "plus"))
recn = {norm(k): v for k, v in recs.items()}
out = {}
for tid, en in ids.items():
    en = en.strip("\"")
    base = en[:-1] if en.endswith("+") else en
    plus = "+" if en.endswith("+") else ""
    z = zh.get(en) or (zh.get(base) + plus if zh.get(base) else None)
    r = recs.get(en) or recn.get(norm(en)) or recs.get(base) or recn.get(norm(base)) or {}
    out[tid] = {"en": en, **({"zh": z} if z else {}), **({"icon": r["icon"]} if r.get("icon") else {})}
(D / "replay-relics.json").write_text(json.dumps({"version": 1, "relics": out}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(len(out), "zh", sum(1 for v in out.values() if v.get("zh")), "icon", sum(1 for v in out.values() if v.get("icon")))
