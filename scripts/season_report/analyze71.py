import json,collections,gzip,re,sys,statistics
R='/home/user/qdby_chinese/'
recs=json.load(open('/tmp/s71rep/season71_records.json'))['records']
by_uid={r['uid']:r for r in recs}
pool=json.load(open(R+'data/morimens/game/tier-pool.json'))['kinds']
aw=json.load(open(R+'data/morimens/skeydb/awakeners.json'))['records']
norm=lambda s:re.sub(r'[^a-z0-9]','',str(s).lower().replace('+',''))
zhmap={}
for kind in ['awakener','wheel','relic','posse','covenant']:
    for it in pool[kind]:
        if it['zh']: zhmap[(kind,norm(it['en']))]=it['zh']
slug={norm(a['name']):a['assetSlug'] for a in aw}
def zh(kind,en): return zhmap.get((kind,norm(en)),en)
# stage names / token names
out={}
n=len(recs); scores=[r['score'] for r in recs]
out['total']=n
out['tiers']={k:sum(1 for s in scores if s>=k) for k in (525,520,515,510,505,500,490,480,470,460,450,425,400,350,300)}
out['cut']={rk:recs[rk-1]['score'] for rk in (1,10,50,100,200,300,500,1000,1500,2000)}
hist=collections.Counter((s//25)*25 for s in scores)
out['hist']=sorted(hist.items())
out['avg']=round(statistics.mean(scores),1); out['median']=statistics.median(scores)
out['perfect']=[(r['rank'],r['player'],r['score']) for r in recs if r['score']>=525]
# per-zone difficulty distribution (best clear)
DIFF=['threatDown','threatSSS','threatSS','threatS','threatA','threatB','threatC']
zone={}
for wv in range(1,6):
    c=collections.Counter(); ex=0; tot=0
    for r in recs:
        for w in r['waves']:
            if w['wave']!=wv: continue
            tot+=1
            cl=[t for t in w['teams'] if t['clearType']=='clear']
            if cl: c[cl[0]['difficulty']]+=1
            if any(t['clearType']=='extra' for t in w['teams']): ex+=1
    zone[wv]={'dist':dict(c),'players':tot,'extra':ex}
out['zone']=zone
# team stats per zone among clear teams
def mem_names(t): return [m['canonicalName'] for m in t['members'] if not m.get('borrowed')] 
def team_key(t): return tuple(sorted(m['canonicalName'] for m in t['members']))
zt={}
for wv in range(1,6):
    cnt=collections.Counter(); sample={}; awc=collections.Counter(); n=0
    toks=collections.Counter(); crs=collections.Counter()
    best={}
    for r in recs:
        for w in r['waves']:
            if w['wave']!=wv: continue
            for t in w['teams']:
                if t['clearType']!='clear': continue
                if t['difficulty']!='threatDown': continue
                n+=1
                k=team_key(t); cnt[k]+=1; sample.setdefault(k,(r,t))
                for m in t['members']: awc[m['canonicalName']]+=1
                if t.get('token'): toks[t['token']['name']]+=1
                for c in t.get('creations',[]): crs[c['name']]+=1
    zt[wv]={'n':n,'teams':[(k,v) for k,v in cnt.most_common(5)],'aw':awc.most_common(8),'tok':toks.most_common(3),'cr':crs.most_common(5)}
out['zt']=zt

# ---- battle extremes ----
rows=[json.loads(l) for l in gzip.open(R+'data/morimens/dzone/season71/battle-summary.jsonl.gz','rt')]
rows=[x for x in rows if str(x['uid']) in by_uid]
MAXS={1:95,2:100,3:105,4:110,5:115}
def pname(uid): return re.sub(r'<[^>]*>','',by_uid[str(uid)]['player'])
def brief(x,key=None,val=None):
    return {'uid':x['uid'],'player':pname(x['uid']),'rank':by_uid[str(x['uid'])]['rank'],'wave':x['wave'],'slot':x['slot'],'val':val,
            'team':[a['name'] for a in x['awakers']],'rounds':x['stageRoundCount']}
def top(key,n=3,f=None,rev=True,filt=lambda x:True):
    L=[x for x in rows if filt(x) and x.get(key) is not None]
    if f: L=[x for x in L if f(x)]
    L.sort(key=lambda x:x[key],reverse=rev)
    return [brief(x,key,x[key]) for x in L[:n]]
DIFF_BY_UUID={}
for r in recs:
    for w in r['waves']:
        for t in w['teams']:
            if t.get('battleUuid'): DIFF_BY_UUID[t['battleUuid']]=t['difficulty']
isdown=lambda x:DIFF_BY_UUID.get(x['battleUuid'])=='threatDown'
ext={}
ext['maxBout']=top('maxBoutDamage')
for x in rows: x['_tot']=sum((a.get('damage') or 0) for a in x['awakers'])
ext['totalDamage']=top('_tot')
ext['minRounds']={wv:top('stageRoundCount',3,filt=lambda x,wv=wv:isdown(x) and x['wave']==wv,rev=False) for wv in range(1,6)}
ext['minBossRounds']={wv:top('bossBattleRoundCount',1,filt=lambda x,wv=wv:isdown(x) and x['wave']==wv and x['bossBattleRoundCount'],rev=False) for wv in range(1,6)}
ext['death']=top('deathResistCount')
ext['counter']=top('maxCounterAtt'); ext['tentacle']=top('maxTentacleDamage'); ext['strength']=top('maxStrength'); ext['poison']=top('maxPosion'); ext['hp']=top('maxHp')
ext['cardsMax']=top('totalUseCard',3,filt=isdown); ext['cardsMin']=top('totalUseCard',3,filt=isdown,rev=False)
ext['boutCards']=top('maxBoutUseCard')
best=None
for x in rows:
    for a in x['awakers']:
        if a.get('damage') and (best is None or a['damage']>best[0]): best=(a['damage'],a['name'],x)
ext['soloDamage']={**brief(best[2]),'val':best[0],'awakener':best[1]}
# highest block / heal
bb=max(((a.get('block') or 0,a['name'],x) for x in rows for a in x['awakers']),key=lambda t:t[0]); ext['block']={**brief(bb[2]),'val':bb[0],'awakener':bb[1]}
hh=max(((a.get('heal') or 0,a['name'],x) for x in rows for a in x['awakers']),key=lambda t:t[0]); ext['heal']={**brief(hh[2]),'val':hh[0],'awakener':hh[1]}
out['ext']=ext
out['battles']=len(rows)
# ---- usage ----
def usage(filt_player=lambda r:True):
    pa=collections.Counter(); pw=collections.Counter(); pc=collections.Counter(); pr=collections.Counter(); pt=collections.Counter(); n=0
    for r in recs:
        if not filt_player(r): continue
        n+=1; sa=set();sw=set();sc=set();sr=set();st=set()
        for w in r['waves']:
            for t in w['teams']:
                if t['clearType']!='clear': continue
                for m in t['members']:
                    sa.add(m['canonicalName'])
                    for x in m.get('wheels',[]): sw.add(x['name'])
                    for x in m.get('covenants',[]): sc.add(x['name'])
                for x in t.get('creations',[]): sr.add(x['name'])
                if t.get('token'): st.add(t['token']['name'])
        pa.update(sa);pw.update(sw);pc.update(sc);pr.update(sr);pt.update(st)
    return n,pa,pw,pc,pr,pt
for tag,f in (('all',lambda r:True),('top200',lambda r:r['rank']<=200),('p525',lambda r:r['score']>=525)):
    n,pa,pw,pc,pr,pt=usage(f)
    out['use_'+tag]={'n':n,'aw':pa.most_common(12),'wh':pw.most_common(8),'cv':pc.most_common(6),'cr':pr.most_common(40),'tk':pt.most_common(8)}
# top teams of rank 1 and 525 players per zone
out['rank1']=[{'wave':w['wave'],'score':[t['score'] for t in w['teams'] if t['clearType']=='clear'][0],'team':[m['canonicalName'] for m in [t for t in w['teams'] if t['clearType']=='clear'][0]['members']],'token':([t for t in w['teams'] if t['clearType']=='clear'][0].get('token') or {}).get('name')} for w in recs[0]['waves']]
# enlightenment tiers of awakeners (最高三启 etc.)
et=collections.Counter()
for r in recs:
    for w in r['waves']:
        for t in w['teams']:
            if t['clearType']=='clear':
                for m in t['members']: et[m.get('enlightTierLabel')]+=1
out['enlight']=et.most_common()
# borrowed (assist) awakener usage
bw=collections.Counter()
for r in recs:
    for w in r['waves']:
        for t in w['teams']:
            if t['clearType']!='clear': continue
            for m in t['members']:
                if m.get('borrowed'): bw[m['canonicalName']]+=1
out['borrowed']=bw.most_common(6)
out['namemap']={'aw':{},'wh':{},'cr':{},'tk':{},'cv':{}}
def reg(kind,key,v):
    out['namemap'][key][v]=zh(kind,v)
for src in out.values() if False else []: pass
# per-zone top teams detail: best ▼ clears sorted by clear rounds (stage rounds) for context + most used
out['zone_best']={}
for wv in range(1,6):
    L=[x for x in rows if isdown(x) and x['wave']==wv]
    L.sort(key=lambda x:(x['stageRoundCount'],x['rank'] or 0))
    out['zone_best'][wv]=[brief(x,None,x['stageRoundCount']) for x in L[:3]]
# ---- ▼ + SSS usage ----
ds_use=collections.Counter(); ds_n=0
for r in recs:
    for w in r['waves']:
        for t in w['teams']:
            if t['difficulty'] not in ('threatDown','threatSSS'): continue
            ds_n+=1
            for m in t['members']: ds_use[m['canonicalName']]+=1
out['ds_n']=ds_n; out['ds_use']=ds_use.most_common()
# ---- niche: 癫狂(▼) ----
down_use=collections.Counter(); down_teams={}
all_use=collections.Counter()
for r in recs:
    for w in r['waves']:
        for t in w['teams']:
            for m in t['members']:
                if t['clearType']=='clear' or t['clearType']=='extra': all_use[m['canonicalName']]+=1
            if t['difficulty']!='threatDown': continue
            names=[m['canonicalName'] for m in t['members']]
            for nme in names: down_use[nme]+=1
            down_teams.setdefault((w['wave'],tuple(sorted(names))),[]).append((r,t))
allaw=[a['name'] for a in aw]
out['down_teams_n']=sum(len(v) for v in down_teams.values())
out['down_use']=down_use.most_common()
out['all_use_zero']=[n for n in allaw if all_use.get(re.sub(r'^"|"$','',n),0)==0 and all_use.get(n,0)==0]
out['allaw']=allaw
def uc(n): return down_use.get(n,0)
mys=[]
for (wv,key),L in down_teams.items():
    r,t=L[0]
    tot=sum(uc(n) for n in key)
    mys.append((tot,wv,key,r['player'],r['rank'],r['score'],len(L),t['token']['name'] if t.get('token') else '',[uc(n) for n in key]))
mys.sort(key=lambda x:(x[0],-x[4]))
out['mystery']=[{'sum':m[0],'wave':m[1],'team':list(m[2]),'player':re.sub(r'<[^>]*>','',m[3]),'rank':m[4],'score':m[5],'count':m[6],'token':m[7],'uses':m[8]} for m in mys[:8]]
dr=[x for x in rows if isdown(x)]
out['down_battles']=len(dr)
def topd(key,n=3,rev=True):
    L=[x for x in dr if x.get(key) is not None]; L.sort(key=lambda x:(x[key],x['rank'] or 0),reverse=rev)
    return [brief(x,key,x[key]) for x in L[:n]]
out['niche']={k:topd(k) for k in ['stageRoundCount','bossBattleRoundCount','deathResistCount','totalUseCard','totalEnergyCost','maxBoutUseCard','respawnedNum']}
out['niche']['lowHp']=[brief(x,'leftHp',x['leftHp']) for x in sorted([x for x in dr if x.get('leftHp') is not None],key=lambda x:x['leftHp'])[:3]]
out['niche']['fewCards']=[brief(x,'totalUseCard',x['totalUseCard']) for x in sorted(dr,key=lambda x:x['totalUseCard'])[:3]]
out['niche']['hp1']=sum(1 for x in dr if x.get('leftHp') is not None and x['leftHp']<=1)
out['niche']['noDeath']=sum(1 for x in dr if x['deathResistCount']==0)
out['niche']['avgRounds']=round(sum(x['stageRoundCount'] for x in dr)/len(dr),1)
s71=json.load(open(R+'data/morimens/skeydb/dzone/seasons/71.json'))
cat={r['id']:r['name'] for r in json.load(open(R+'data/morimens/skeydb/public-v3/catalogs/relics.json'))['records']}
out['initial_relics']=sorted({cat[i] for w in s71['waves'] for i in w.get('initialRelicIds',[]) if i in cat})
# ---- ▼ + SSS niche ----
isds=lambda x:DIFF_BY_UUID.get(x['battleUuid']) in ('threatDown','threatSSS')
dsb=[x for x in rows if isds(x)]
out['ds_battles']=len(dsb)
def brief2(x,val):
    b=brief(x,None,val); b['diff']='▼' if DIFF_BY_UUID.get(x['battleUuid'])=='threatDown' else 'SSS'; return b
def topds(key,n=3,rev=True):
    L=[x for x in dsb if x.get(key) is not None]; L.sort(key=lambda x:(x[key],x['rank'] or 0),reverse=rev)
    return [brief2(x,x[key]) for x in L[:n]]
out['niche2']={k:topds(k) for k in ['stageRoundCount','bossBattleRoundCount','deathResistCount','totalUseCard','totalEnergyCost','maxBoutUseCard']}
out['niche2']['fewCards']=topds('totalUseCard',3,False)
out['niche2']['avgRounds']=round(sum(x['stageRoundCount'] for x in dsb)/len(dsb),1)
# mystery teams over ▼+SSS
dst={}
for r in recs:
    for w in r['waves']:
        for t in w['teams']:
            if t['difficulty'] not in ('threatDown','threatSSS'): continue
            key=tuple(sorted(m['canonicalName'] for m in t['members']))
            dst.setdefault((w['wave'],key,t['difficulty']),[]).append((r,t))
dsu=dict(ds_use)
mys2=[]
for (wv,key,df),L in dst.items():
    r,t=L[0]; tot=sum(dsu.get(n,0) for n in key)
    mys2.append((tot,wv,key,r['player'],r['rank'],r['score'],len(L),t['token']['name'] if t.get('token') else '',[dsu.get(n,0) for n in key],'▼' if df=='threatDown' else 'SSS'))
mys2.sort(key=lambda x:(x[0],-x[4]))
out['mystery2']=[{'sum':m[0],'wave':m[1],'team':list(m[2]),'player':re.sub(r'<[^>]*>','',m[3]),'rank':m[4],'score':m[5],'count':m[6],'token':m[7],'uses':m[8],'diff':m[9]} for m in mys2[:8]]
# average death resist
avg={}
for wv in range(1,6):
    for lab,df in (('▼','threatDown'),('SSS','threatSSS')):
        L=[x['deathResistCount'] for x in rows if x['wave']==wv and DIFF_BY_UUID.get(x['battleUuid'])==df and x['deathResistCount'] is not None]
        avg[f'{wv}-{lab}']=(round(sum(L)/len(L),2) if L else None,len(L))
out['avg_death_zone']=avg
al=sum(x['deathResistCount'] for x in dsb if x['deathResistCount'] is not None)/len(dsb)
out['avg_death_all']=round(al,2)
byaw=collections.defaultdict(list)
for x in dsb:
    for a in x['awakers']:
        if not a.get('assist') and x['deathResistCount'] is not None: byaw[a['name']].append(x['deathResistCount'])
out['avg_death_aw']=sorted([(n,round(sum(v)/len(v),2),len(v)) for n,v in byaw.items() if len(v)>=15],key=lambda t:-t[1])[:8]
out['avg_death_aw_low']=sorted([(n,round(sum(v)/len(v),2),len(v)) for n,v in byaw.items() if len(v)>=15],key=lambda t:t[1])[:3]
byp=collections.defaultdict(list)
for x in dsb: byp[x['uid']].append(x['deathResistCount'] or 0)
out['avg_death_player']=[(pname(u),round(sum(v)/len(v),2),len(v),by_uid[str(u)]['rank']) for u,v in sorted(byp.items(),key=lambda kv:-sum(kv[1])/len(kv[1])) if len(v)>=5][:5]
# ---- enlightenment (启灵) share of every awakener in ▼+SSS teams ----
def bucket(p):
    try: p=int(p)
    except: return 'unknown'
    return 'low' if p<=2 else 'e3plus3' if p<=6 else 'plus4plus11' if p<=14 else 'plus12'
en=collections.defaultdict(collections.Counter)
for r in recs:
    for w in r['waves']:
        for t in w['teams']:
            if t['difficulty'] not in ('threatDown','threatSSS'): continue
            for m in t['members']: en[m['canonicalName']][bucket(m.get('potencyLevel'))]+=1
out['enlight_ds']={n:dict(c) for n,c in en.items()}
json.dump(out,open('/tmp/s71rep/stats.json','w'),ensure_ascii=False,default=lambda o:list(o) if isinstance(o,tuple) else str(o))
print('done')
