#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import argparse, json, math, re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

SPECIAL={-1:None,-2:None,-3:None,-4:None,-5:None,-6:0}

def load_json(p:Path, default):
    try: return json.loads(p.read_text(encoding="utf-8"))
    except Exception: return default

def save_json(p:Path, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj,ensure_ascii=False,indent=2,allow_nan=False)+"\n",encoding="utf-8")

def num(v):
    if v is None: return None
    try:
        n=float(str(v).replace(",","").strip())
        if not math.isfinite(n): return None
        return int(n) if n.is_integer() else n
    except Exception: return None

def fix_text(v):
    if not isinstance(v,str) or not re.search(r"[ÃÂæçåäéèä¸]",v): return v
    try:
        r=v.encode("latin1").decode("utf-8")
        bad=lambda s:s.count("�")+s.count("Ã")+s.count("Â")
        return r if bad(r)<bad(v) else v
    except Exception:return v

def payload(text):
    marker="Markdown Content:"
    if marker in text:text=text[text.index(marker)+len(marker):]
    text=text.strip()
    if text.startswith("```"):
        lines=text.splitlines()[1:]
        if lines and lines[-1].strip()=="```":lines=lines[:-1]
        text="\n".join(lines)
    return text.strip()

class Hydrator:
    def __init__(self,values):
        self.v=values;self.memo={};self.active=set()
    def h(self,r):
        if isinstance(r,int) and not isinstance(r,bool) and r in SPECIAL:return SPECIAL[r]
        if not isinstance(r,int) or isinstance(r,bool) or r<0 or r>=len(self.v):return r
        if r in self.memo:return self.memo[r]
        if r in self.active:return self.memo.get(r)
        x=self.v[r]
        if x is None or isinstance(x,(str,int,float,bool)):
            self.memo[r]=x;return x
        self.active.add(r)
        if isinstance(x,list):
            if x and isinstance(x[0],str):
                tag=x[0]
                if tag=="Date":out=x[1] if len(x)>1 else None
                elif tag=="Set":
                    out=[];self.memo[r]=out;out.extend(self.h(i) for i in x[1:])
                elif tag=="Map":
                    out=[];self.memo[r]=out
                    for i in range(1,len(x),2):
                        out.append({"key":self.h(x[i]),"value":self.h(x[i+1]) if i+1<len(x) else None})
                elif tag=="RegExp":out={"__type":"RegExp","pattern":x[1] if len(x)>1 else "","flags":x[2] if len(x)>2 else ""}
                elif tag=="BigInt":out=str(x[1]) if len(x)>1 else ""
                elif tag=="Object":out=self.h(x[1]) if len(x)>1 else {}
                elif tag=="null":
                    out={};self.memo[r]=out
                    for i in range(1,len(x),2):out[str(x[i])]=self.h(x[i+1]) if i+1<len(x) else None
                elif tag=="Promise":out={"__promise":self.h(x[1]) if len(x)>1 else None}
                else:
                    out=[tag];self.memo[r]=out
                    out.extend(self.h(i) if isinstance(i,int) and not isinstance(i,bool) else i for i in x[1:])
            else:
                out=[];self.memo[r]=out
                out.extend(None if i==-2 else self.h(i) for i in x)
        elif isinstance(x,dict):
            out={};self.memo[r]=out
            for k,v in x.items():out[k]=self.h(v)
        else:out=x
        self.memo[r]=out;self.active.discard(r);return out

def unflatten(v): return Hydrator(v).h(0) if isinstance(v,list) else v

def decode(text):
    docs=[]
    for ln,line in enumerate(payload(text).splitlines(),1):
        s=line.strip()
        if not s or s=="```" or s.startswith(("Title:","URL Source:","Published Time:")):continue
        if s.startswith("```"):s=s[3:].lstrip("json").strip()
        if not s:continue
        try:
            o=json.loads(s)
            if isinstance(o,dict):docs.append(o)
        except Exception:pass
    chunks=[{"id":d.get("id"),"data":unflatten(d["data"])} for d in docs if d.get("type")=="chunk" and isinstance(d.get("data"),list)]
    if not chunks:raise ValueError("No SvelteKit chunks found")
    roots=[x["data"] for x in chunks]
    return {"docs":docs,"roots":roots,"root":next((x["data"] for x in chunks if x.get("id")==1),roots[0])}

def walk(root,cb):
    seen=set()
    def rec(v,p="$"):
        if not isinstance(v,(dict,list)) or id(v) in seen:return
        seen.add(id(v));cb(v,p)
        if isinstance(v,list):
            for i,c in enumerate(v):rec(c,f"{p}[{i}]")
        else:
            for k,c in v.items():rec(c,f"{p}.{k}")
    rec(root)

def find_activities(decoded):
    found=[]
    for root in decoded["roots"]:
        def cb(v,p):
            if not isinstance(v,dict):return
            a=v.get("activity");st=v.get("stages")
            if not isinstance(a,dict) or not isinstance(st,list):return
            name=str(a.get("name") or "")
            if not re.search(r"Dissoluted Abyss|D[- ]?Zone",name,re.I) and a.get("period") is None:return
            per=num(a.get("period"))
            if per is not None:found.append({"path":p,"node":v,"period":int(per),"stageCount":len(st)})
        walk(root,cb)
    best={}
    for x in found:
        k=f'{x["period"]}:{x["node"].get("activity_tid","")}'
        if k not in best or x["stageCount"]>best[k]["stageCount"]:best[k]=x
    return sorted(best.values(),key=lambda x:(-x["period"],-x["stageCount"]))

def find_media(decoded):
    val=None
    def cb(v,p):
        nonlocal val
        if val is None and isinstance(v,dict) and isinstance(v.get("mediaBase"),str):val=v["mediaBase"]
    for r in decoded["roots"]:
        walk(r,cb)
        if val:break
    return val

def find_header(decoded):
    val={}
    def cb(v,p):
        nonlocal val
        if val:return
        h=v.get("header") if isinstance(v,dict) else None
        if isinstance(h,dict) and h.get("uid") is not None and h.get("name"):val=h
    for r in decoded["roots"]:
        walk(r,cb)
        if val:break
    return val

def media(base,p,thumb=False):
    if not p:return None
    p=str(p)
    if re.match(r"^https?://",p,re.I):return p
    if not base:return None
    return f'{str(base).rstrip("/")}/{"thumb/" if thumb else ""}{p.lstrip("/")}'

def attrs(xs):
    out=[]
    for x in xs if isinstance(xs,list) else []:
        if isinstance(x,dict):
            out.append({"id":x.get("id"),"name":fix_text(x.get("name") or ""),"value":x.get("value"),"percentage":bool(x.get("percentage")),"rollQuality":x.get("roll_quality")})
    return out

def norm_equipment(x,base,kind):
    if not isinstance(x,dict):return None
    o={"id":x.get("id"),"name":fix_text(x.get("name") or ""),"image":media(base,x.get("image")),"rarity":x.get("rarity")}
    if kind in ("wheel","trinket"):
        o.update({"slot":x.get("slot"),"level":num(x.get("level")),"enhanceLevel":num(x.get("enhance_level")),"breakLevel":num(x.get("break_level")),"attrs":attrs(x.get("attrs"))})
    if kind=="trinket":o.update({"suitId":x.get("suit_id"),"bound":bool(x.get("bound"))})
    return o

def norm_cov(x,base):
    if not isinstance(x,dict):return None
    return {"id":x.get("id"),"name":fix_text(x.get("name") or ""),"image":media(base,x.get("image")),"count":num(x.get("count")),
            "effects":[{"pieces":num(e.get("pieces")),"desc":fix_text(e.get("desc") or ""),"active":bool(e.get("active"))} for e in (x.get("effects") or []) if isinstance(e,dict)]}

def ingame_id(a):
    raw=a.get("res") or ""
    if not raw:
        m=re.search(r"Awaker_([A-Za-z0-9]+)_AF",str(a.get("mini") or a.get("image") or ""),re.I);raw=m.group(1) if m else ""
    return re.sub(r"_AF$","",str(raw),flags=re.I).upper() or None

def norm_member(b,base,catalog):
    b=b if isinstance(b,dict) else {};a=b.get("awaker") if isinstance(b.get("awaker"),dict) else {}
    iid=ingame_id(a);cat=catalog.get(iid or "",{})
    en=[{"id":x.get("id"),"name":fix_text(x.get("name") or ""),"lv":num(x.get("lv")),"unlocked":bool(x.get("unlocked"))} for x in (b.get("enlightenment") or []) if isinstance(x,dict)]
    ec=sum(1 for x in en if x["unlocked"]);mil=["E0","E1","E2","E3","OE","AA"][max(0,min(5,ec))]
    wheels=[z for z in (norm_equipment(x,base,"wheel") for x in (b.get("weapons") or [])) if z]
    trink=[z for z in (norm_equipment(x,base,"trinket") for x in (b.get("trinkets") or [])) if z]
    cov=[z for z in (norm_cov(x,base) for x in (b.get("suits") or [])) if z]
    assets=cat.get("assets") if isinstance(cat.get("assets"),dict) else {}
    return {"id":a.get("id"),"name":fix_text(a.get("name") or cat.get("name") or iid or "未知"),"canonicalName":cat.get("name") or fix_text(a.get("name") or "") or iid or "未知",
            "skeydbId":cat.get("id"),"ingameId":iid,"image":media(base,a.get("mini") or a.get("image"),True) or assets.get("portrait"),
            "realm":fix_text((a.get("realm") or {}).get("name") if isinstance(a.get("realm"),dict) else ""),"role":fix_text(a.get("role") or ""),"rarity":fix_text(a.get("rarity") or ""),
            "level":num(b.get("level")),"potencyLevel":num(b.get("potency_level")),"breakLevel":num(b.get("break_level")),"fighting":num(b.get("fighting")),"potential":b.get("potential"),
            "likeLevel":num(b.get("like_level")),"enlightenLevel":ec,"enlightenCount":ec,"enlightenMilestone":mil,"enlightenment":en,"progression":mil,
            "wheels":wheels,"trinkets":trink,"covenants":cov,"covenant":cov[0] if cov else None,"covenantScore":num(b.get("covenant_score")),
            "borrowed":bool(b.get("borrowed")),"assistUid":b.get("assist_uid"),"stats":attrs(b.get("stats"))}

def norm_token(x,base):
    if not isinstance(x,dict):return None
    return {"id":x.get("id"),"name":fix_text(x.get("name") or ""),"image":media(base,x.get("image")),"rarity":fix_text(x.get("rarity") or "")}

def norm_creation(x,base):
    if not isinstance(x,dict):return None
    return {"id":x.get("id"),"name":fix_text(x.get("name") or str(x.get("id") or "")),"image":media(base,x.get("image")),"quality":fix_text(x.get("quality") or ""),"desc":fix_text(x.get("desc") or "")}

def norm_activity(item,entry,decoded,catalog):
    node=item["node"];act=node.get("activity") if isinstance(node.get("activity"),dict) else {};base=find_media(decoded);hdr=find_header(decoded);rows=[]
    for sr in node.get("stages") or []:
        if not isinstance(sr,dict):continue
        team=sr.get("team")
        if not isinstance(team,dict) or not isinstance(team.get("awakers"),list):continue
        st=sr.get("stage") if isinstance(sr.get("stage"),dict) else {};sn=fix_text(st.get("name") or "");m=re.search(r"Wave\s*(\d+)",sn,re.I)
        if not m:continue
        result=team.get("result") if isinstance(team.get("result"),dict) else {}
        rows.append({"wave":int(m.group(1)),"madness":num(st.get("rec_level")),"stageId":st.get("id") if st.get("id") is not None else team.get("stage_tid"),
                     "stageName":sn,"score":num(sr.get("score")),"clearType":"extra" if sr.get("extra") else "clear","extraPass":bool(sr.get("extra_pass")),
                     "groupTid":sr.get("group_tid"),"token":norm_token(team.get("keeper_skill"),base),
                     "creations":[z for z in (norm_creation(x,base) for x in (result.get("relics") or [])) if z],
                     "wid":team.get("wid"),"battleUuid":team.get("battle_uuid"),"members":[norm_member(x,base,catalog) for x in team.get("awakers")]})
    wm={}
    for s in rows:
        w=wm.setdefault(s["wave"],{"wave":s["wave"],"madness":s["madness"],"teams":[]})
        w["teams"].append({k:v for k,v in s.items() if k not in ("wave","madness")})
    uid=str(hdr.get("uid") if hdr.get("uid") is not None else entry.get("uid") or "")
    per=item["period"];score=sum((x.get("score") or 0) for x in rows)
    return {"rank":entry.get("rank"),"player":fix_text(hdr.get("name") or entry.get("name") or entry.get("player") or ""),"uid":uid,
            "score":entry.get("score") if entry.get("score") is not None else score,"currentScore":score,"leaderboardScore":entry.get("score"),
            "url":entry.get("url") or f"https://eremora.com/u/{uid}/challenges/dzone/{per}","seasonId":per,
            "activity":{"id":act.get("id"),"tid":node.get("activity_tid"),"name":fix_text(act.get("name") or "Dissoluted Abyss"),
                        "start":num(act.get("start")),"end":num(act.get("end")),"maxScore":num(node.get("max_score")),"stageCount":num(node.get("stage_count")) or len(rows)},
            "waves":sorted(wm.values(),key=lambda x:x["wave"]),"sourceTransport":"Eremora SvelteKit __data.json raw snapshot"}

def team_count(r):return sum(len(w.get("teams") or []) for w in r.get("waves") or [])
def merge_rec(old,new):return new if old is None or team_count(new)>=team_count(old) else old

def stats(doc):
    c=Counter();en=Counter();wheel=Counter();tr=Counter();cov=Counter();cre=Counter();tok=Counter();teams=members=0
    for r in doc.get("records",[]):
        for w in r.get("waves",[]):
            for t in w.get("teams",[]):
                teams+=1
                if isinstance(t.get("token"),dict):tok[t["token"].get("name") or str(t["token"].get("id"))]+=1
                for x in t.get("creations",[]):cre[x.get("name") or str(x.get("id"))]+=1
                for m in t.get("members",[]):
                    members+=1;c[m.get("canonicalName") or m.get("name") or "未知"]+=1;en[m.get("enlightenMilestone") or "unknown"]+=1
                    for x in m.get("wheels",[]):wheel[x.get("name") or str(x.get("id"))]+=1
                    for x in m.get("trinkets",[]):tr[x.get("name") or str(x.get("id"))]+=1
                    for x in m.get("covenants",[]):cov[x.get("name") or str(x.get("id"))]+=1
    rows=lambda x:[{"name":k,"count":v} for k,v in x.most_common()]
    return {"seasonId":doc.get("seasonId"),"recordCount":len(doc.get("records",[])),"teamCount":teams,"memberSlots":members,
            "characters":rows(c),"enlightenment":rows(en),"tokens":rows(tok),"creations":rows(cre),"wheels":rows(wheel),"trinkets":rows(tr),"covenants":rows(cov)}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--root",default=".");ap.add_argument("--season",type=int,default=69)
    ap.add_argument("--raw-dir",default=None);ap.add_argument("--data-root",default="data/morimens/eremora")
    args=ap.parse_args();root=Path(args.root).resolve();data=root/args.data_root;raw=root/(args.raw_dir or f"data/morimens/eremora/raw/{args.season}")
    rank=load_json(data/"rank-index"/f"{args.season}.json",{"rows":[]});rrows=rank.get("rows",[]);rb={str(x.get("uid")):x for x in rrows if isinstance(x,dict) and x.get("uid") is not None}
    aw=load_json(root/"data/morimens/skeydb/awakeners.json",{"records":[]});catalog={str(x.get("ingameId")).upper():x for x in aw.get("records",[]) if isinstance(x,dict) and x.get("ingameId")}
    files=sorted(raw.glob("*.txt"));print(f"[INFO] raw={len(files)} rank-index={len(rrows)}")
    seasons=defaultdict(dict);fail=[];users=[]
    for i,f in enumerate(files,1):
        uid=f.stem;e=rb.get(uid,{"uid":uid});entry={"uid":uid,"rank":e.get("rank"),"name":e.get("name") or e.get("player") or "","score":num(e.get("score"))}
        try:
            d=decode(f.read_text(encoding="utf-8",errors="replace"));acts=find_activities(d)
            if not acts:raise ValueError("No D-Zone activities found")
            urecs=[]
            for a in acts:
                ee=dict(entry)
                if a["period"]!=args.season:ee.update({"rank":None,"score":None})
                rec=norm_activity(a,ee,d,catalog)
                if rec["waves"]:
                    seasons[a["period"]][uid]=merge_rec(seasons[a["period"]].get(uid),rec);urecs.append(rec)
            if not urecs:raise ValueError("No normalized records with waves")
            user={"uid":uid,"rank":entry.get("rank"),"player":urecs[0].get("player"),"availableSeasons":sorted({x["seasonId"] for x in urecs},reverse=True),"records":sorted(urecs,key=lambda x:x["seasonId"],reverse=True)}
            save_json(data/"users"/str(args.season)/f"{uid}.json",user);users.append({"uid":uid,"rank":entry.get("rank"),"player":user["player"],"seasons":user["availableSeasons"]})
            if i%25==0 or i==len(files):print(f"[OK] {i}/{len(files)}")
        except Exception as ex:
            fail.append({"uid":uid,"rank":entry.get("rank"),"file":str(f),"errorType":type(ex).__name__,"error":str(ex)});print(f"[FAIL] {uid}: {ex}")
    for sid,mp in seasons.items():
        existing=load_json(data/"seasons"/f"{sid}.json",{"records":[]});merged={str(x.get("uid")):x for x in existing.get("records",[]) if isinstance(x,dict)}
        for uid,r in mp.items():merged[uid]=merge_rec(merged.get(uid),r)
        recs=list(merged.values())
        if sid==args.season:recs.sort(key=lambda x:(x.get("rank") if x.get("rank") is not None else 999999,-(x.get("score") or 0)))
        else:recs.sort(key=lambda x:(-(x.get("score") or 0),str(x.get("player") or "")))
        doc={**existing,"source":{**(existing.get("source") or {}),"site":"Eremora","transport":"local raw Top1000 SvelteKit import"},
             "seasonId":sid,"leaderboardEntryCount":len(rrows) if sid==args.season else existing.get("leaderboardEntryCount"),"recordCount":len(recs),
             "complete":sid==args.season and len(recs)>=min(1000,len(rrows) or 1000) and not fail,
             "coverageMode":"raw-top1000" if sid==args.season else existing.get("coverageMode","profile-history-partial"),"records":recs}
        save_json(data/"seasons"/f"{sid}.json",doc);save_json(data/"stats"/f"{sid}.json",stats(doc))
    users.sort(key=lambda x:x.get("rank") if x.get("rank") is not None else 999999)
    save_json(data/"top1000"/f"{args.season}.json",{"seasonId":args.season,"rankIndexCount":len(rrows),"rawFileCount":len(files),"parsedUserCount":len(users),"failedUserCount":len(fail),"users":users})
    save_json(data/"parse-failures"/f"{args.season}.json",fail)
    manifest=load_json(data/"manifest.json",{})
    manifest["rawTop1000Import"]={"seasonId":args.season,"rawPath":f"data/morimens/eremora/raw/{args.season}","rawFileCount":len(files),"parsedUserCount":len(users),"parseFailureCount":len(fail),"structuredIndex":f"data/morimens/eremora/top1000/{args.season}.json","updatedBy":"scripts/process_morimens_raw1000.py"}
    save_json(data/"manifest.json",manifest)
    print(f"[DONE] parsed={len(users)} failed={len(fail)} seasons={sorted(seasons,reverse=True)}")
    return 0 if not fail else 1
if __name__=="__main__":raise SystemExit(main())
