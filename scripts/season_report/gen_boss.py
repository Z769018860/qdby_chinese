"""Boss-battle ("最终战") supplement page for a season report.
Usage: PYTHONPATH=/tmp/pylib python3 gen_boss.py <season> <records.json> <out.html> [<prev season> <prev records.json>]
Needs data/morimens/dzone/season<N>/battle-summary.jsonl.gz (bossBattleRoundCount = rounds of the final boss fight of the stage)
and the post-processed records (difficulty per battleUuid). Render with shot.mjs-style 2000x3600 screenshots."""
import sys,json,re,html,gzip,collections,statistics as st
R='/home/user/qdby_chinese/'
season,recf,outf=int(sys.argv[1]),sys.argv[2],sys.argv[3]
prev=(int(sys.argv[4]),sys.argv[5]) if len(sys.argv)>5 else None
pool=json.load(open(R+'data/morimens/game/tier-pool.json'))['kinds']
aw=json.load(open(R+'data/morimens/skeydb/awakeners.json'))['records']
norm=lambda s:re.sub(r'[^a-z0-9]','',str(s).lower().replace('+',''))
ZH={norm(it['en']):it['zh'] for it in pool['awakener'] if it['zh']}
slug={norm(a['name']):a['assetSlug'] for a in aw}
e=html.escape
zn=lambda en:ZH.get(norm(en),en)
def pt(en,size=44):
    s=slug.get(norm(en));n=e(zn(en))
    return f'<span class="pt" title="{n}"><img src="file://{R}assets/morimens/portraits/{s}.webp" width="{size}" height="{size}" alt=""><i>{n}</i></span>' if s else f'<span class="pt"><b>{n}</b></span>'
team=lambda names,size=44:'<div class="team">'+''.join(pt(n,size) for n in names)+'</div>'
WZ={1:'第一禁区',2:'第二禁区',3:'第三禁区',4:'第四禁区',5:'第五禁区'}
def load(s,f):
    recs=json.load(open(f))['records'];by={str(r['uid']):r for r in recs};diff={}
    for r in recs:
        for w in r['waves']:
            for t in w['teams']:diff[t['battleUuid']]=t['difficulty']
    rows=[json.loads(l) for l in gzip.open(f'{R}data/morimens/dzone/season{s}/battle-summary.jsonl.gz','rt')]
    out=[]
    for x in rows:
        if str(x['uid']) not in by or (x.get('bossBattleRoundCount') or 0)<=0:continue
        x['diff']=diff.get(x['battleUuid']);x['player']=re.sub(r'<[^>]*>','',by[str(x['uid'])]['player']);out.append(x)
    return out
def summ(L):
    v=[x['bossBattleRoundCount'] for x in L]
    return (len(v),min(v),sum(v)/len(v),st.median(v),max(v)) if v else None
def sel(rows,w=None,d=None):return [x for x in rows if (w is None or x['wave']==w) and (d is None or (x['diff'] in d))]
D=('threatDown',);S=('threatSSS',);DS=('threatDown','threatSSS')
rows=load(season,recf);prow=load(*prev) if prev else None
tot=summ(sel(rows,None,D));one=sum(1 for x in sel(rows,None,DS) if x['bossBattleRoundCount']==1)
zs={w:summ(sel(rows,w,D)) for w in range(1,6)};zss={w:summ(sel(rows,w,S)) for w in range(1,6)}
slow=max(zs,key=lambda w:zs[w][2]);fastz=min(zs,key=lambda w:zs[w][2])
allsum=summ(sel(rows,None,DS))
# ---- tables ----
def f1(x):return f'{x:.1f}'
trs=''
mx=max(zs[w][2] for w in zs)
for w in range(1,6):
    a,b=zs[w],zss[w]
    trs+=f'<tr><td>{WZ[w]}</td><td>{a[0]}</td><td>{a[1]}</td><td><b>{f1(a[2])}</b></td><td>{a[3]:g}</td><td>{a[4]}</td><td class="sep">{b[0]}</td><td>{b[1]}</td><td><b>{f1(b[2])}</b></td><td>{b[3]:g}</td><td>{b[4]}</td></tr>'
tab=f'<table class="tb cmp"><tr><th rowspan="2">禁区</th><th colspan="5">▼ 癫狂</th><th colspan="5">SSS</th></tr><tr><th>场次</th><th>最少</th><th>平均</th><th>中位</th><th>最多</th><th>场次</th><th>最少</th><th>平均</th><th>中位</th><th>最多</th></tr>{trs}</table>'
# ---- histograms (▼) ----
def hist(w):
    L=[x['bossBattleRoundCount'] for x in sel(rows,w,D)];c=collections.Counter(min(v,30) for v in L)
    m=max(c.values());W,H=880,190;bw=W/30;g=''
    for r in range(1,31):
        v=c.get(r,0);h=(H-52)*v/m
        g+=f'<rect x="{(r-1)*bw+3:.1f}" y="{H-34-h:.1f}" width="{bw-6:.1f}" height="{h:.1f}" fill="#8c1a12"/>'
        if r%5==0 or r==1:g+=f'<text x="{(r-1)*bw+bw/2:.1f}" y="{H-8}" text-anchor="middle" font-size="22" font-family="Noto Sans SC" fill="#333">{r if r<30 else "30+"}</text>'
    med=zs[w][3]
    g+=f'<text x="{W-4}" y="26" text-anchor="end" font-size="30" font-family="Noto Sans SC" font-weight="700" fill="#1d1d1b">中位 {med:g} · 均 {f1(zs[w][2])}</text>'
    return f'<div class="hz"><h4>{WZ[w]}（{zs[w][0]} 场）</h4><svg viewBox="0 0 {W} {H}" width="100%">{g}</svg></div>'
hists=''.join(hist(w) for w in range(1,6))
# ---- fastest ▼ kills ----
def fast(w,n=2):
    L=sorted(sel(rows,w,D),key=lambda x:(x['bossBattleRoundCount'],x['rank'] or 9999))[:n]
    return ''.join(f'<tr><td>{WZ[w] if i==0 else ""}</td><td><b>{x["bossBattleRoundCount"]}</b> 回合</td><td>「{e(x["player"])}」#{x["rank"]}</td><td>{team([a["name"] for a in x["awakers"]],40)}</td></tr>' for i,x in enumerate(L))
fastt=''.join(fast(w) for w in range(1,6))
# ---- awakeners in the fastest quartile of each zone (▼+SSS) ----
cnt=collections.Counter();allc=collections.Counter();nq=0;na=0
for w in range(1,6):
    L=sorted(sel(rows,w,DS),key=lambda x:x['bossBattleRoundCount']);q=L[:max(1,len(L)//4)]
    for x in q:
        nq+=1
        for a in x['awakers']:cnt[a['name']]+=1
    for x in L:
        na+=1
        for a in x['awakers']:allc[a['name']]+=1
rk=''
top=cnt.most_common(6)
for i,(n,c) in enumerate(top):
    s=slug.get(norm(n));ic=f'<img class="ic" src="file://{R}assets/morimens/portraits/{s}.webp" width="42" height="42" alt="">' if s else ''
    rk+=f'<div class="rr"><span class="rn">{i+1}</span>{ic}<span class="rname">{e(zn(n))}</span><span class="rbar"><i style="width:{100*c/top[0][1]:.0f}%"></i></span><span class="rc2">{100*c/nq:.0f}%</span></div>'
lift=sorted([(n,100*cnt[n]/nq-100*allc[n]/na,100*cnt[n]/nq,100*allc[n]/na) for n in cnt if allc[n]>=40 and cnt[n]>=8],key=lambda t:-t[1])[:6]
lk=''
for i,(n,d,a,b) in enumerate(lift):
    s=slug.get(norm(n));ic=f'<img class="ic" src="file://{R}assets/morimens/portraits/{s}.webp" width="42" height="42" alt="">' if s else ''
    lk+=f'<div class="rr"><span class="rn">{i+1}</span>{ic}<span class="rname">{e(zn(n))}</span><span class="rbar"><i style="width:{100*d/lift[0][1]:.0f}%"></i></span><span class="rc2">+{d:.0f}</span></div>'
# ---- comparison with previous season ----
cmp_=''
if prow:
    ps={w:summ(sel(prow,w,D)) for w in range(1,6)}
    cr=''
    for w in range(1,6):
        a,b=ps[w],zs[w];dv=b[2]-a[2]
        cr+=f'<tr><td>{WZ[w]}</td><td>{f1(a[2])}</td><td>{f1(b[2])}</td><td style="color:{"#1d4f7a" if dv<0 else "#8c1a12"};font-weight:700">{dv:+.1f}</td><td>{a[1]} → {b[1]}</td></tr>'
    pa=summ(sel(prow,None,D))
    cmp_=f'<h3>与上一期对比（▼ 最终战）</h3><p class="cap">平均回合下降（蓝色）= 打得更快。</p><table class="tb cmp"><tr><th>禁区</th><th>上期平均</th><th>本期平均</th><th>变化</th><th>最少回合</th></tr>{cr}<tr><td><b>全部</b></td><td>{f1(pa[2])}</td><td>{f1(tot[2])}</td><td style="font-weight:700">{tot[2]-pa[2]:+.1f}</td><td>{pa[1]} → {tot[1]}</td></tr></table>'
CSS=open('/tmp/s71rep/paper.css').read()+'.hzs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px 26px}.hz h4{font:700 32px "Noto Serif SC";margin:0 0 4px}.tb .sep{border-left:3px solid #1d1d1b}.tb th[colspan]{text-align:center}'
body=f"""<div class="mast small"><h1>忘忘看报</h1><div class="mastsub2">融灾第 {season} 期 · 最终战增刊</div></div>
<div class="headline h2"><h2>最终战谁最耗时？<br>{WZ[slow]}平均 {f1(zs[slow][2])} 回合</h2><p class="deck">最终战 = 每个禁区尽头的首领战。本版统计终榜 Top 2000 的战斗记录（含通关队与额外队伍）里，击杀首领所用的回合数：▼ 癫狂共 {tot[0]} 场，平均 {f1(tot[2])} 回合；▼ + SSS 共 {allsum[0]} 场，其中 {one} 场在 1 回合内结束了首领战。最快的是{WZ[fastz]}（平均 {f1(zs[fastz][2])} 回合）。</p></div>
<div class="kpis k6">
<div class="hot"><small>▼ 最终战场次</small><b>{tot[0]}</b></div>
<div><small>▼ 平均回合</small><b>{f1(tot[2])}</b></div>
<div><small>▼ 中位回合</small><b>{tot[3]:g}</b></div>
<div><small>最短 / 最长</small><b>{tot[1]}<em>/</em>{tot[4]}</b></div>
<div><small>SSS 平均回合</small><b>{f1(summ(sel(rows,None,S))[2])}</b></div>
<div><small>1 回合秒杀</small><b>{one}</b></div>
</div>
<section class="wide"><h3>各禁区最终战回合数</h3><p class="cap">只统计打到首领战的战斗；回合数为首领战本身的回合（不含小怪战）。</p>{tab}</section>
<section class="wide"><h3>▼ 最终战回合分布</h3><p class="cap">横轴为首领战回合数，纵轴为场次，30 回合以上合并。</p><div class="hzs">{hists}</div></section>
<section class="wide"><h3>▼ 最快击杀 Top 2</h3><table class="tb speed"><tr><th>禁区</th><th>回合数</th><th>玩家</th><th>配队</th></tr>{fastt}</table></section>
<section class="wide twocol"><div><h3>速杀队常用唤醒体</h3><p class="cap">各禁区 ▼ + SSS 最终战最快的 25% 队伍里的出场占比。</p><div class="rk">{rk}</div></div>
<div>{cmp_ or '<h3>速杀加成最大</h3><p class="cap">速杀队占比减去全体占比（百分点），至少 40 场出场。</p><div class="rk">'+lk+'</div>'}</div></section>
<section class="wide"><h3>编后</h3><ul class="notes"><li>数据来自官方战斗详情的「首领战回合数」字段；没有打到首领战的记录不计入。回合数相同的并列，名次靠前者在前。</li><li>1 回合击杀多出现在爆发队：开局一次大伤害直接带走首领，参考价值有限，更适合看中位数与分布。</li></ul></section>
"""
page=f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>融灾第{season}期最终战增刊</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700;900&family=Noto+Sans+SC:wght@400;500;700&display=swap">
<style>{CSS}</style></head><body><div class="paper pg4" id="paper">
<div class="topline"><span>忘忘看报 · 融灾特刊</span><span>最终战增刊</span><span>终榜统计 Top 2000</span></div>
<div class="body">{body}</div>
<div class="foot">数据来源：取自官方榜单和详细战斗数据，汇总于忘忘看报：qingdengbuyi.top/morimens-tools.html#dtide，b站@青灯不弈。　统计口径：Top 2000 玩家的战斗记录（通关队 + 额外队伍），最终战回合数 = 首领战回合。</div>
</div></body></html>"""
open(outf,'w').write(page);print('ok',outf,tot,one)
