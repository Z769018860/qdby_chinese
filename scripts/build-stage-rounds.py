#!/usr/bin/env python3
"""Rebuild data/morimens/replay/stage-rounds.json (per-stage round-count distribution used by the Keeper tempo score)
from the season battle summaries already in the repository (no replay download or parsing needed).
Each stage keeps 101 quantile points of bossBattleRoundCount over surviving runs; old replay-derived 'n:<name>' keys are kept."""
import gzip,json,glob,collections,os
root=os.path.join(os.path.dirname(__file__),'..')
out=os.path.join(root,'data/morimens/replay/stage-rounds.json')
old=json.load(open(out)) if os.path.exists(out) else {}
d=collections.defaultdict(list)
for f in sorted(glob.glob(os.path.join(root,'data/morimens/dzone/season*/battle-summary.jsonl.gz'))):
    for l in gzip.open(f,'rt'):
        r=json.loads(l)
        if r.get('stageId') and (r.get('bossBattleRoundCount') or 0)>0 and (r.get('leftHp') or 0)>0:
            d[str(r['stageId'])].append(int(r['bossBattleRoundCount']))
new=dict(old)
for k,v in d.items():
    v.sort();n=len(v)
    new[k]=v if n<=101 else [v[round(i*(n-1)/100)] for i in range(101)]
    new['cnt:'+k]=n
json.dump(new,open(out,'w'),ensure_ascii=False,separators=(',',':'))
print(len(new),'keys;',{k:len(x) for k,x in list(d.items())[:5]})
