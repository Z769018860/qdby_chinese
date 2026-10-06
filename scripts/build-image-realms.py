#!/usr/bin/env python3
"""Build data/morimens/replay/dimension-image-realms.json: realm of every Dimensional Image relic's awakener, and the realm of each realm-ring relic
(used by the keeper luck easter egg: an image from outside the current season's ring realm is a lucky find)."""
import json,os,re
root=os.path.join(os.path.dirname(__file__),'..')
aw=json.load(open(os.path.join(root,'data/morimens/skeydb/awakeners.json'),encoding='utf-8'))['records']
byname={}
for a in aw:
    byname[a['name'].strip('"').lower()]=a['realm']
    for al in a.get('aliases',[]):byname.setdefault(str(al).lower(),a['realm'])
rel=json.load(open(os.path.join(root,'data/morimens/replay-relics.json'),encoding='utf-8'))['relics']
out={'images':{},'rings':{},'unmatched':[]}
for tid,v in rel.items():
    en=v.get('en','')
    m=re.match(r'Dimensional Image:\s*(.+)$',en)
    if m:
        k=m.group(1).strip().strip('"').lower()
        r=byname.get(k)
        if r:out['images'][tid]={'realm':r,'awakener':m.group(1).strip(),'zh':v.get('zh')}
        else:out['unmatched'].append([tid,en,v.get('zh')])
    m=re.match(r'(Aequor|Caro|Chaos|Ultra)\s+Ring',en,re.I)
    if m:out['rings'][tid]={'realm':m.group(1).upper(),'zh':v.get('zh')}
out['rings'].update({'83509':{'realm':'AEQUOR','zh':'「深海指轮」'},'83510':{'realm':'CARO','zh':'「血肉指轮」'},'83511':{'realm':'ULTRA','zh':'「超维指轮」','guess':True},'83512':{'realm':'CHAOS','zh':'「混沌指轮」'}})
out['schoolIds']={'1':'CHAOS','2':'CARO','3':'ULTRA','4':'AEQUOR'}   # RelicConfig.SchoolID of an image / ring = realm
json.dump(out,open(os.path.join(root,'data/morimens/replay/dimension-image-realms.json'),'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
print(len(out['images']),'images',len(out['rings']),'rings','unmatched',out['unmatched'])
