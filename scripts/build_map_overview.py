#!/usr/bin/env python3
"""Build the compact map-overview dataset from the local game client config dump (see data/morimens/local-config/README.md).
Usage: python3 scripts/build_map_overview.py <dump dir> [--repo .]
Writes data/morimens/local-config/*.json.gz (filtered raw tables) and data/morimens/maps/{index,maps,battles,monsters}.json.
Unreleased content (D-Zone periods after the current one, awakener events of not yet released awakeners) is left out on purpose."""
import json,re,sys,gzip,collections,argparse
from pathlib import Path
ap=argparse.ArgumentParser();ap.add_argument('dump');ap.add_argument('--repo',default='.');ap.add_argument('--max-dzone',type=int,default=0,help='0 = every period that has already started')
ap.add_argument('--hide',default='')
ap.add_argument('--include-future',action='store_true',help='also write unreleased content (hidden by the page until its unlock time `u`); it becomes publicly downloadable!')
ap.add_argument('--unlock',action='append',default=[],help='TERM=ISO time: unlock time of content matching TERM (needed for --hide terms when --include-future)')
a=ap.parse_args()
D=Path(a.dump);R=Path(a.repo)
import datetime
UNLOCK={x.split('=',1)[0]:x.split('=',1)[1] for x in a.unlock if '=' in x}
_uf=R/'scripts/data/map_unlocks.json'
HOLD=[]
if _uf.exists():
    _u=json.load(open(_uf,encoding='utf-8')); UNLOCK={**_u.get('unlock',{}),**UNLOCK}; HOLD=_u.get('hold',[])
# D-Zone period start times (SKeyDB list; later periods run every 14 days)
_sk=json.load(open(R/'data/morimens/skeydb/dzone/index.json'))['seasons']
_start={x['period']:x['start'] for x in _sk}
_last=max(_start)
def period_start(p):
    if p in _start: return _start[p]
    t=datetime.datetime.fromisoformat(_start[_last].replace('Z','+00:00'))+datetime.timedelta(days=14*(p-_last))
    return t.strftime('%Y-%m-%dT%H:%M:%SZ')
NOW=datetime.datetime.now(datetime.timezone.utc)
def started(p): return datetime.datetime.fromisoformat(period_start(p).replace('Z','+00:00'))<=NOW
L=lambda f:json.load(open(D/f))
stages=L('stages.json');maps=L('maps.json');nodes=L('nodes.json');ntypes=L('node-types.json');battles=L('battles.json');mons=L('monsters.json');skills=L('skills.json');smd=L('stage-monster-data.json');sdiff=L('stage-difficulty.json');sdata=L('stage-data.json')
hide=sorted({*[x for x in a.hide.split(',') if x],*UNLOCK,*HOLD})
def cn(s): return s['config'].get('CnID','')
def category(s):
    c=cn(s); n=s.get('name') or ''
    if '疾驰的欢愉专列' in c: return ('记忆回廊','疾驰的欢愉专列'+('·V2' if 'V2' in c else ''),0)
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
kept=[]; unlock_of={}
for s in stages:
    cat,sub,per=category(s)
    u=None
    if cat=='融灾' and per:
        future=(per>a.max_dzone) if a.max_dzone else (not started(per))
        if future:
            if not a.include_future: continue
            u=period_start(per)
    text=cn(s)+(s.get('name') or '')+str(s['config'].get('Desc',''))
    hit=[h for h in hide if h in text]
    if hit:
        if any(h in HOLD and h not in UNLOCK for h in hit): continue            # release time unknown: never published
        if not (a.include_future and any(h in UNLOCK for h in hit)): continue
        u=UNLOCK[next(h for h in hit if h in UNLOCK)]
    if not (s['mapIds'] or s['nodeSequence']): continue
    kept.append((s,cat,sub,per)); unlock_of[s['id']]=u
print('stages kept',len(kept),'of',len(stages))
# ---- 记忆回廊 · 疾驰的欢愉专列 (MapType 3): node groups from train-stages.json ----
train=None
if (D/'train-stages.json').exists():
    train=json.load(open(D/'train-stages.json'))['stages']
    for ts in train:
        st=next((x for x in stages if x['id']==ts['id']),None)
        if st: kept.append((st,'记忆回廊','疾驰的欢愉专列'+('·V2' if 'V2' in cn(st) else ''),0)); unlock_of[st['id']]=None
    trainIds={t['id'] for t in train}
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
# train: dedupe node groups, collect battles
tgroups={};tstage={};tbattles={}
def _node(n):
    bids=[]
    for v in n.get('variants') or []:
        b=v.get('battle')
        if b: bids.append(b['id']); tbattles[b['id']]=b
    ev=[(e['config'].get('Name','').split('|',1)[-1],e['config'].get('Desc','').split('|',1)[-1]) for e in n.get('events') or []]
    return [n['typeId'],n['name'],bids]+([ev[0][0],ev[0][1]] if ev else [])
def _grp(g):
    if g['id'] not in tgroups: tgroups[g['id']]={'cn':g['cnId'].split('@')[-1],'nodes':[_node(n) for n in g['nodes']]}
    return g['id']
for ts in train or []:
    segs=[]
    for sg in ts['segments']:
        G=sg['group']
        if G['type']=='Direct': segs.append({'t':'D','cn':G['cnId'].split('@')[-1],'g':[_grp(G)]})
        else: segs.append({'t':'P','cn':G['cnId'].split('@')[-1],'g':[_grp(o['group']) for o in G['options']]})
    tstage[str(ts['id'])]=segs
monById={m['id']:m for m in mons}
used_mons={mo['monsterId'] for b in used_battles if b in battleById for mo in battleById[b]['monsters']}|{mo['monsterId'] for b in tbattles.values() for mo in b['monsters']}
skillById={s['id']:s for s in skills}
used_skills={sid for m in used_mons if m in monById for sid in monById[m]['skillIds']}
smd_ids={s['stageMonsterDataId'] for s,_,_,_ in kept if s.get('stageMonsterDataId')}
print('maps',len(used_maps),'nodes',len(used_nodes),'battles',len(used_battles),'monsters',len(used_mons),'skills',len(used_skills))
# ---- filtered raw tables (gzip) ----
rawdir=R/'data/morimens/local-config';rawdir.mkdir(parents=True,exist_ok=True)
def save_gz(name,obj):
    data=json.dumps(obj,ensure_ascii=False,separators=(',',':')).encode('utf-8')
    with open(rawdir/(name+'.json.gz'),'wb') as raw, gzip.GzipFile(fileobj=raw,mode='wb',compresslevel=9,mtime=0) as f: f.write(data)
keptids={s['id'] for s,_,_,_ in kept}
save_gz('stages',[s for s in stages if s['id'] in keptids]);save_gz('maps',[mapById[m] for m in used_maps if m in mapById])
save_gz('nodes',[nodeById[n] for n in used_nodes if n in nodeById]);save_gz('node-types',ntypes);save_gz('battles',[battleById[b] for b in used_battles if b in battleById])
save_gz('monsters',[monById[m] for m in used_mons if m in monById]);save_gz('skills',[skillById[x] for x in used_skills if x in skillById])
if train: save_gz('train-stages',train)
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
                'm':s['mapIds'] or None,'q':s['nodeSequence'] or None,'sm':s.get('stageMonsterDataId'),'ir':list((cfg.get('InitRelic') or {}).values()) or None,**({'u':unlock_of[s['id']]} if unlock_of.get(s['id']) else {}),**({'t':1} if str(s['id']) in tstage else {})})
idx.sort(key=lambda x:(x['c'],x['p'] or 0,x['s'],x['id']))
def dump(name,obj): (outdir/name).write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
dump('index.json',{'version':1,'generatedFrom':'local game client config dump (2026-10-12/13)','note':('unreleased content is included and hidden until its unlock time u' if a.include_future else 'unreleased content (later D-Zone periods, hidden awakener events) is not included'),
    'nodeTypes':{str(k):[tstr[k],tdesc.get(k,'')] for k in tstr},'stages':idx})
dump('maps.json',{'maps':{str(k):v for k,v in cmaps.items()},'nodes':{str(k):v for k,v in ntab.items()}})
bt={}
for b in sorted(used_battles):
    bb=battleById.get(b)
    if bb: bt[str(b)]=[bb['type'],[[m['monsterId'],m['position']] for m in bb['monsters']]]
for b in tbattles.values(): bt[str(b['id'])]=[b['type'],[[m['monsterId'],m['position']] for m in b['monsters']]]
dump('battles.json',bt)
if train: dump('train.json',{'groups':{str(k):v for k,v in tgroups.items()},'stages':tstage})
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
