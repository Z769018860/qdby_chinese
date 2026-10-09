#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import base64, gzip, json, re
from pathlib import Path
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parents[1]
SEASON=70
MIN_SCORE=500
MAX_SCORE=525
RANK_INDEX=ROOT/'data/morimens/eremora/rank-index/70.json'
USAGE_INDEX=ROOT/'data/morimens/eremora/usage/70-local-gzip/index.json'
BATTLE_SUMMARY=ROOT/'data/morimens/dzone/season70/battle-summary.jsonl.gz'
RAW_TEAMS_DIR=ROOT/'data/morimens/dzone/season70/raw-teams'
OUT=ROOT/'exports/morimens-s70-score-500-525-full.zh-CN.json'

def read_json(p):
    return json.loads(Path(p).read_text(encoding='utf-8'))

def load_usage():
    idx=read_json(USAGE_INDEX)
    compressed=b''.join(base64.b64decode((ROOT/p).read_text(encoding='ascii').strip()) for p in idx['chunks'])
    return json.loads(gzip.decompress(compressed).decode('utf-8')), idx

def build_translation_map():
    mp={}
    # Harvest exact englishName -> Chinese name/title pairs from localization datasets.
    for base in [ROOT/'data/morimens/huiji', ROOT/'data/morimens/game']:
        if not base.exists(): continue
        for p in base.rglob('*.json'):
            try: doc=read_json(p)
            except Exception: continue
            stack=[doc]
            while stack:
                x=stack.pop()
                if isinstance(x,dict):
                    en=x.get('englishName') or x.get('enName') or x.get('nameEn')
                    zh=x.get('name') or x.get('title') or x.get('nameZh')
                    if isinstance(en,str) and isinstance(zh,str) and en.strip() and zh.strip() and re.search(r'[\u3400-\u9fff]',zh):
                        mp[en]=zh
                    stack.extend(x.values())
                elif isinstance(x,list): stack.extend(x)
    return mp

def localize(x, mp):
    if isinstance(x,str): return mp.get(x,x)
    if isinstance(x,list): return [localize(v,mp) for v in x]
    if isinstance(x,dict): return {k:localize(v,mp) for k,v in x.items()}
    return x

def uid_of(row):
    if not isinstance(row,dict): return None
    for k in ('uid','userId','playerUid','playerUID','roleId'):
        if row.get(k) is not None: return str(row[k])
    for v in row.values():
        if isinstance(v,dict):
            u=uid_of(v)
            if u: return u
    return None

def collect_battle_ids(x, out):
    if isinstance(x,dict):
        for k,v in x.items():
            lk=str(k).lower()
            if 'battle' in lk and ('id' in lk or lk.endswith('battle')) and isinstance(v,(str,int)):
                out.add(str(v))
            collect_battle_ids(v,out)
    elif isinstance(x,list):
        for v in x: collect_battle_ids(v,out)

def row_mentions_target(row,target_uids,battle_ids):
    u=uid_of(row)
    if u in target_uids: return True
    stack=[row]
    while stack:
        x=stack.pop()
        if isinstance(x,dict):
            for k,v in x.items():
                if isinstance(v,(str,int)) and 'battle' in str(k).lower() and str(v) in battle_ids:
                    return True
                if isinstance(v,(dict,list)): stack.append(v)
        elif isinstance(x,list): stack.extend(x)
    return False

def main():
    rank=read_json(RANK_INDEX)
    selected=[r for r in rank.get('rows',[]) if MIN_SCORE <= int(r.get('score',-1)) <= MAX_SCORE]
    target_uids={str(r['uid']) for r in selected}
    usage,usage_idx=load_usage()
    records=[r for r in usage.get('records',[]) if str(r.get('uid')) in target_uids]
    battle_ids=set(); collect_battle_ids(records,battle_ids)

    raw_rows=[]
    for p in sorted(RAW_TEAMS_DIR.glob('*.jsonl.gz')):
        with gzip.open(p,'rt',encoding='utf-8') as f:
            for line in f:
                if not line.strip(): continue
                try: row=json.loads(line)
                except Exception: continue
                if row_mentions_target(row,target_uids,battle_ids): raw_rows.append(row)
    collect_battle_ids(raw_rows,battle_ids)

    summaries=[]
    if BATTLE_SUMMARY.exists():
        with gzip.open(BATTLE_SUMMARY,'rt',encoding='utf-8') as f:
            for line in f:
                if not line.strip(): continue
                try: row=json.loads(line)
                except Exception: continue
                if row_mentions_target(row,target_uids,battle_ids): summaries.append(row)

    mp=build_translation_map()
    payload={
      'meta':{
        'seasonId':SEASON,
        'scoreRange':{'min':MIN_SCORE,'max':MAX_SCORE,'inclusive':True},
        'generatedAt':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),
        'rankSource':rank.get('source'),
        'rankCoverage':rank.get('coverage'),
        'usageRevision':usage_idx.get('revision'),
        'playerCount':len(selected),
        'structuredRecordCount':len(records),
        'rawTeamRowCount':len(raw_rows),
        'battleSummaryCount':len(summaries),
        'localization':'Chinese names substituted by exact englishName→Chinese-name mappings harvested from repository Huiji/game localization JSON; unmapped strings are preserved verbatim.',
        'sourceBranch':'preview'
      },
      'leaderboard':localize(selected,mp),
      'records':localize(records,mp),
      'rawTeamRows':localize(raw_rows,mp),
      'battleSummaries':localize(summaries,mp)
    }
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(payload['meta'],ensure_ascii=False,indent=2))

if __name__=='__main__': main()
