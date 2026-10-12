#!/usr/bin/env python3
"""Build the compact map-overview dataset from the local game client config dump (see data/morimens/local-config/README.md).
Usage: python3 scripts/build_map_overview.py <dump dir> [--repo .]
Writes data/morimens/local-config/*.json.gz (filtered raw tables) and data/morimens/maps/{index,maps,battles,monsters}.json.
Unreleased content (D-Zone periods after the current one, awakener events of not yet released awakeners) is left out on purpose."""
import json,re,sys,gzip,collections,argparse
from pathlib import Path
ap=argparse.ArgumentParser();ap.add_argument('dump');ap.add_argument('--repo',default='.');ap.add_argument('--max-dzone',type=int,default=71)
ap.add_argument('--hide',default='薇薇安');a=ap.parse_args()
D=Path(a.dump);R=Path(a.repo)
L=lambda f:json.load(open(D/f))
stages=L('stages.json');maps=L('maps.json');nodes=L('nodes.json');ntypes=L('node-types.json');battles=L('battles.json');mons=L('monsters.json');skills=L('skills.json');smd=L('stage-monster-data.json');sdiff=L('stage-difficulty.json');sdata=L('stage-data.json')
hide=[x for x in a.hide.split(',') if x]
def cn(s): return s['config'].get('CnID','')
def category(s):
    c=cn(s); n=s.get('name') or ''
    k=c.split('@',1)[-1] if '@' in c else c
    if c.startswith('关卡@融蚀深渊'):
        m=re.search(r'融蚀深渊(\d+)期',c); return ('融灾',f'第{int(m.group(1))}期' if m else '融灾',int(m.group(1)) if m else 0)
    if '主线' in k: return ('主线','星辰篇' if '星辰篇' in k else '忘却篇',0)
    if '日常挑战' in k: return ('日常挑战','星辰篇' if '星辰' in k else '忘却篇',0)
    if '无光之境' in k: return ('无光之境','',0)
    if '尖塔' in k: return ('尖塔模式','',0)
    if '模拟战' in k: return ('模拟战','',0)
    if '支线' in k or '活动' in k or '复刻' in k:
        m=re.match(r'^(.+?)(?:活动|复刻|支线)',k); return ('活动 / 支线',(m.group(1) if m else '').replace('关卡组@',''),0)
    return ('其他','',0)
kept=[]
for s in stages:
    cat,sub,per=category(s)
    if cat=='融灾' and per>a.max_dzone: continue
    text=cn(s)+(s.get('name') or '')+str(s['config'].get('Desc',''))
    if any(h in text for h in hide): continue
    if not (s['mapIds'] or s['nodeSequence']): continue
    kept.append((s,cat,sub,per))
print('stages kept',len(kept),'of',len(stages))
used_maps={m for s,_,_,_ in kept for m in s['mapIds']}
nodeById={n['id']:n for n in nodes}
mapById={m['id']:m for m in maps}
used_nodes=set()
for s,_,_,_ in kept: used_nodes.update(s['nodeSequence'])
for mid in used_maps:
    m=mapById.get(mid)
    if not m: continue
    for c in m['cells']:
        for v in c['variants']: used_nodes.add(v['nodeId'])
battleById={b['id']:b for b in battles}
used_battles={nodeById[n]['battleConfigId'] for n in used_nodes if n in nodeById and nodeById[n].get('battleConfigId')}
monById={m['id']:m for m in mons}
used_mons={mo['monsterId'] for b in used_battles if b in battleById for mo in battleById[b]['monsters']}
skillById={s['id']:s for s in skills}
used_skills={sid for m in used_mons if m in monById for sid in monById[m]['skillIds']}
smd_ids={s['stageMonsterDataId'] for s,_,_,_ in kept if s.get('stageMonsterDataId')}
print('maps',len(used_maps),'nodes',len(used_nodes),'battles',len(used_battles),'monsters',len(used_mons),'skills',len(used_skills))
# ---- filtered raw tables (gzip) ----
rawdir=R/'data/morimens/local-config';rawdir.mkdir(parents=True,exist_ok=True)
def save_gz(name,obj):
    with gzip.open(rawdir/(name+'.json.gz'),'wt',encoding='utf-8',compresslevel=9) as f: json.dump(obj,f,ensure_ascii=False,separators=(',',':'))
keptids={s['id'] for s,_,_,_ in kept}
save_gz('stages',[s for s in stages if s['id'] in keptids]);save_gz('maps',[mapById[m] for m in used_maps if m in mapById])
save_gz('nodes',[nodeById[n] for n in used_nodes if n in nodeById]);save_gz('node-types',ntypes);save_gz('battles',[battleById[b] for b in used_battles if b in battleById])
save_gz('monsters',[monById[m] for m in used_mons if m in monById]);save_gz('skills',[skillById[x] for x in used_skills if x in skillById])
save_gz('stage-monster-data',[x for x in smd if x['id'] in smd_ids]);save_gz('stage-data',sdata)
# ---- compact overview data ----
outdir=R/'data/morimens/maps';outdir.mkdir(parents=True,exist_ok=True)
VOID=11666
tstr={t['id']:t['name'] for t in ntypes};tdesc={t['id']:t['description'] for t in ntypes}
# node table: id -> [typeId, battleId|0]
ntab={n:[nodeById[n]['typeId'],nodeById[n].get('battleConfigId') or 0] for n in sorted(used_nodes) if n in nodeById and n!=VOID}
cmaps={}
for mid in sorted(used_maps):
    m=mapById.get(mid)
    if not m: continue
    cells=[]
    for c in m['cells']:
        vs=[v['nodeId'] for v in sorted(c['variants'],key=lambda v:v['variant']) if v['nodeId']!=VOID]
        if vs: cells.append([c['x'],c['y']]+vs)
    cmaps[mid]=cells
sorder={}
idx=[]
for s,cat,sub,per in kept:
    cfg=s['config']
    idx.append({'id':s['id'],'n':s.get('name') or cn(s),'c':cat,'s':sub,'p':per or None,'lv':cfg.get('StageLevel'),'cn':cn(s),
                'm':s['mapIds'] or None,'q':s['nodeSequence'] or None,'sm':s.get('stageMonsterDataId'),'ir':list((cfg.get('InitRelic') or {}).values()) or None})
idx.sort(key=lambda x:(x['c'],x['p'] or 0,x['s'],x['id']))
def dump(name,obj): (outdir/name).write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
dump('index.json',{'version':1,'generatedFrom':'local game client config dump (2026-10-12/13)','note':'unreleased content (D-Zone periods after %d, hidden awakener events) is not included'%a.max_dzone,
    'nodeTypes':{str(k):[tstr[k],tdesc.get(k,'')] for k in tstr},'stages':idx})
dump('maps.json',{'maps':{str(k):v for k,v in cmaps.items()},'nodes':{str(k):v for k,v in ntab.items()}})
bt={}
for b in sorted(used_battles):
    bb=battleById.get(b)
    if bb: bt[str(b)]=[bb['type'],[[m['monsterId'],m['position']] for m in bb['monsters']]]
dump('battles.json',bt)
TAG=re.compile(r'<[A-Za-z_0-9]+:([^>]*)>')
def clean(t):
    t=t or ''
    t=re.sub(r'<Damage:\[Damage:Arg\d\]>','X',t)          # damage numbers are template placeholders in the client tables
    t=TAG.sub(r'\1',t)
    t=re.sub(r'\[AttackTimes:Arg\d\]','N',t)
    t=re.sub(r'\[(?:Damage|Block|Power|TentaclePower|Heal|Layer)[A-Za-z]*:Arg\d\]','X',t)
    t=re.sub(r'\[[A-Za-z]+:Arg\d\]','X',t)
    t=re.sub(r'\[Arg\d\]','X',t)
    return re.sub(r'<[^>]*>','',t)
mo={}
for m in sorted(used_mons):
    x=monById.get(m)
    if not x: continue
    cfg=x['config']
    mo[str(m)]={'n':x['name'],'d':x['description'],'c':cfg.get('MonsterClass'),'b':cfg.get('BodySize'),
      'i':Path(cfg.get('MiniIcon') or '').stem or None,'sk':x['skillIds'],'cy':list((cfg.get('CycleSkillList1') or {}).values()) or None,'op':list((cfg.get('InitSkillList') or {}).values()) or None,
      'hp':cfg.get('MonsterHpPercent'),'atk':cfg.get('MonsterAtkPercent'),'df':cfg.get('MonsterDefPercent'),'bt':cfg.get('BattleTag')}
sk={}
for sid in sorted(used_skills):
    x=skillById.get(sid)
    if x: sk[str(sid)]=[clean(x['description']),list((x.get('types') or {}).values())]
dump('monsters.json',{'monsters':mo,'skills':sk})
smdo={}
for x in smd:
    if x['id'] in smd_ids: smdo[str(x['id'])]={k:[v.get('StandardLv'),v.get('StandardHp'),v.get('StandardAtk'),v.get('StandardDef'),v.get('BattleTag')] for k,v in x['dataList'].items()}
dump('stage-stats.json',smdo)
print('done')
