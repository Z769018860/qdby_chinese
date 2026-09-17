#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import importlib.util, json, os, random, re, time
from datetime import datetime, timezone
from pathlib import Path
import requests
try:
    from playwright.sync_api import sync_playwright
except Exception:
    sync_playwright=None

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data/morimens/eremora'
SEASON=int(os.getenv('EREMORA_REPAIR_SEASON','69'))
BATCH=max(1,int(os.getenv('EREMORA_REPAIR_BATCH','10')))
TIMEOUT=max(20,int(os.getenv('EREMORA_REPAIR_TIMEOUT','75')))
DELAY_MIN=float(os.getenv('EREMORA_REPAIR_DELAY_MIN','6'))
DELAY_MAX=float(os.getenv('EREMORA_REPAIR_DELAY_MAX','12'))
RETRY=DATA/'retry-uids'/f'{SEASON}.txt'
RANK=DATA/'rank-index'/f'{SEASON}.json'
PROGRESS=DATA/'repair-progress'/f'{SEASON}.json'
RAW_DIR=DATA/'raw-repair'/str(SEASON)
USER_DIR=DATA/'users'/str(SEASON)
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36'

spec=importlib.util.spec_from_file_location('rawbase',ROOT/'scripts/process_morimens_raw1000.py')
base=importlib.util.module_from_spec(spec); spec.loader.exec_module(base)

def now(): return datetime.now(timezone.utc).isoformat()
def load(p,d):
    try:return json.loads(p.read_text(encoding='utf-8'))
    except Exception:return d
def save(p,o):
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(o,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
def read_uids(p):
    if not p.exists():return []
    out=[];seen=set()
    for x in p.read_text(encoding='utf-8',errors='ignore').splitlines():
        x=x.strip()
        if x.isdigit() and x not in seen:seen.add(x);out.append(x)
    return out
def write_uids(p,xs):
    p.parent.mkdir(parents=True,exist_ok=True);p.write_text('\n'.join(xs)+('\n' if xs else ''),encoding='utf-8')

def decode(text):
    marker='Markdown Content:'
    raw=text[text.index(marker)+len(marker):] if marker in text else text
    raw=raw.strip()
    if raw.startswith('```'):
        ls=raw.split('\n')[1:]
        if ls and ls[-1].strip()=='```':ls=ls[:-1]
        raw='\n'.join(ls)
    docs=[]
    for line in raw.split('\n'):
        s=line.strip()
        if not s or s=='```' or s.startswith(('Title:','URL Source:','Published Time:')):continue
        if s.startswith('```'):s=s[3:].lstrip('json').strip()
        try:
            o=json.loads(s)
            if isinstance(o,dict):docs.append(o)
        except Exception:pass
    chunks=[{'id':d.get('id'),'data':base.unflatten(d['data'])} for d in docs if d.get('type')=='chunk' and isinstance(d.get('data'),list)]
    if not chunks:raise ValueError('No SvelteKit chunks found')
    roots=[x['data'] for x in chunks]
    return {'docs':docs,'roots':roots,'root':next((x['data'] for x in chunks if x.get('id')==1),roots[0])}

def valid(text):
    low=text.lower()
    if 'target url returned error 403' in low:return None,'jina_403'
    if 'just a moment' in low or 'verify you are human' in low:return None,'cloudflare'
    try:d=decode(text)
    except Exception as e:return None,f'decode:{type(e).__name__}'
    return (d,'ok') if base.find_activities(d) else (None,'no_dzone')

def catalog():
    x=load(ROOT/'data/morimens/skeydb/awakeners.json',{'records':[]})
    return {str(r.get('ingameId')).upper():r for r in x.get('records',[]) if isinstance(r,dict) and r.get('ingameId')}

def rankmap():
    x=load(RANK,{'rows':[]});return {str(r.get('uid')):r for r in x.get('rows',[]) if isinstance(r,dict) and r.get('uid') is not None}

def quality(r):
    q=0
    for w in r.get('waves',[]):
        for t in w.get('teams',[]):
            q+=20+len(t.get('creations',[]))*2+(4 if t.get('token') else 0)
            for m in t.get('members',[]):q+=10+len(m.get('wheels',[]))*2+len(m.get('trinkets',[]))*2+len(m.get('covenants',[]))*2+len(m.get('enlightenment',[]))
    return q

def merge_record(r):
    per=int(r['seasonId']);p=DATA/'seasons'/f'{per}.json'
    doc=load(p,{'source':{'site':'Eremora','transport':'GitHub scheduled repair'},'seasonId':per,'records':[]})
    rs=[x for x in doc.get('records',[]) if isinstance(x,dict)];uid=str(r.get('uid'))
    old=next((x for x in rs if str(x.get('uid'))==uid),None)
    if old is None:rs.append(r)
    elif quality(r)>=quality(old):rs=[r if str(x.get('uid'))==uid else x for x in rs]
    if per==SEASON:rs.sort(key=lambda x:(x.get('rank') if x.get('rank') is not None else 999999))
    doc['records']=rs;doc['recordCount']=len(rs);doc['complete']=per==SEASON and len(rs)>=1000
    save(p,doc)

def structure(uid,text,d,entry,cat):
    records=[]
    for a in base.find_activities(d):
        per=int(a['period']);e={'uid':uid,'rank':entry.get('rank') if per==SEASON else None,'name':entry.get('name',''),'score':entry.get('score') if per==SEASON else None,'url':f'https://eremora.com/u/{uid}/challenges/dzone/{per}'}
        r=base.norm_activity(a,e,d,cat)
        if r.get('waves'):records.append(r)
    if not any(int(r.get('seasonId') or -1)==SEASON for r in records):return False
    for r in records:merge_record(r)
    save(USER_DIR/f'{uid}.json',{'uid':uid,'rank':entry.get('rank'),'player':records[0].get('player') if records else entry.get('name'),'currentSeason':SEASON,'availableSeasons':[r.get('seasonId') for r in records],'records':records,'updatedAt':now()})
    RAW_DIR.mkdir(parents=True,exist_ok=True);(RAW_DIR/f'{uid}.txt').write_text(text,encoding='utf-8',errors='replace')
    return True

def try_http(sess,url):
    for name,target in [('direct',url),('jina','https://r.jina.ai/'+url)]:
        try:
            r=sess.get(target,timeout=TIMEOUT,allow_redirects=True,headers={'User-Agent':UA,'Accept':'text/plain,*/*;q=0.8'})
            d,why=valid(r.text or '')
            print(f'[HTTP] {name} status={r.status_code} {why}')
            if r.status_code==200 and d is not None:return r.text,name,d
        except Exception as e:print('[HTTP]',name,type(e).__name__,e)
    return None,None,None

def try_browser(page,uid):
    if page is None:return None,None,None
    page_url=f'https://eremora.com/u/{uid}/challenges/dzone/{SEASON}';data_url=page_url+'/__data.json'
    try:
        page.goto(page_url,wait_until='domcontentloaded',timeout=TIMEOUT*1000)
        title=(page.title() or '').lower();body=(page.locator('body').inner_text(timeout=4000) or '').lower()
        if 'just a moment' in title or 'verify you are human' in body or 'checking your browser' in body:
            print('[BROWSER] Cloudflare challenge');return None,None,None
        res=page.evaluate("""async ({u,t})=>{const c=new AbortController();const h=setTimeout(()=>c.abort(),t);try{const r=await fetch(u,{credentials:'include',cache:'no-store',signal:c.signal});return {s:r.status,x:await r.text()}}finally{clearTimeout(h)}}""",{'u':data_url,'t':TIMEOUT*1000})
        d,why=valid(res.get('x') or '');print(f"[BROWSER] status={res.get('s')} {why}")
        if res.get('s')==200 and d is not None:return res.get('x'),'browser',d
    except Exception as e:print('[BROWSER]',type(e).__name__,e)
    return None,None,None

def main():
    ranks=rankmap()
    if len(ranks)<1000:raise RuntimeError(f'incomplete rank index: {len(ranks)}')
    pending=read_uids(RETRY)
    if not pending:
        print('[DONE] retry list is empty');return 0
    batch=pending[:BATCH];rest=pending[BATCH:];cat=catalog();sess=requests.Session()
    progress=load(PROGRESS,{'seasonId':SEASON,'runs':0,'success':{},'failures':{}});progress['runs']=int(progress.get('runs',0))+1;progress['lastRunStartedAt']=now()
    pw=browser=page=None
    if sync_playwright:
        try:
            pw=sync_playwright().start();browser=pw.chromium.launch(headless=True,args=['--disable-dev-shm-usage']);ctx=browser.new_context(user_agent=UA,locale='en-US');page=ctx.new_page()
        except Exception as e:print('[WARN] browser unavailable:',e)
    failed=[];ok=[]
    try:
        for i,uid in enumerate(batch,1):
            print(f'\n[USER] {i}/{len(batch)} uid={uid}')
            entry=ranks.get(uid)
            if not entry:failed.append(uid);continue
            url=f'https://eremora.com/u/{uid}/challenges/dzone/{SEASON}/__data.json'
            text,transport,d=try_http(sess,url)
            if text is None:text,transport,d=try_browser(page,uid)
            if text is not None and structure(uid,text,d,entry,cat):
                ok.append(uid);progress['success'][uid]={'at':now(),'transport':transport};progress['failures'].pop(uid,None);print('[REPAIRED]',uid,transport)
            else:
                failed.append(uid);progress['failures'][uid]={'at':now()};print('[FAILED]',uid)
            time.sleep(random.uniform(DELAY_MIN,DELAY_MAX))
    finally:
        try:
            if browser:browser.close()
            if pw:pw.stop()
        except Exception:pass
    remaining=list(dict.fromkeys(failed+rest));write_uids(RETRY,remaining)
    progress.update({'lastRunFinishedAt':now(),'successThisRun':ok,'failedThisRun':failed,'pendingAfter':len(remaining)});save(PROGRESS,progress)
    print(f'[DONE] success={len(ok)} failed={len(failed)} remaining={len(remaining)}')
    return 0
if __name__=='__main__':raise SystemExit(main())
