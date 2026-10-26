import json,re,html,collections,datetime
R='/home/user/qdby_chinese/'
S=json.load(open('/tmp/s71rep/stats.json'))
pool=json.load(open(R+'data/morimens/game/tier-pool.json'))['kinds']
aw=json.load(open(R+'data/morimens/skeydb/awakeners.json'))['records']
norm=lambda s:re.sub(r'[^a-z0-9]','',str(s).lower().replace('+',''))
Z={}; IMG={}
for kind in ['awakener','wheel','relic','posse','covenant']:
    for it in pool[kind]:
        (Z.__setitem__((kind,norm(it['en'])),it['zh']) if it['zh'] else None); IMG[(kind,norm(it['en']))]=it['img']
slug={norm(a['name']):a['assetSlug'] for a in aw}
TOK=json.load(open('/tmp/s71rep/token_zh_found.json'))['official']
TOK.update({k:v for k,v in json.load(open('/home/user/qdby_chinese/scripts/data/posse_zh_wiki.json')).items() if not k.startswith('_')})
AI_TOK={}
OFF_EXTRA={'Rusted Key':'锈蚀钥匙'}
def zn(kind,en):
    if kind=='posse':
        z=Z.get((kind,norm(en))) or TOK.get(en)
        if z: return z
        if en in AI_TOK: return AI_TOK[en]+'＊'
    if en in OFF_EXTRA: return OFF_EXTRA[en]
    return Z.get((kind,norm(en)),re.sub(r'^"|"$','',en))
def img(kind,en):
    if kind=='awakener':
        s=slug.get(norm(en)); return f"{R}assets/morimens/portraits/{s}.webp" if s else ''
    p=IMG.get((kind,norm(en)),'')
    return R+p if p else ''
e=html.escape
def num(n): return f"{int(n):,}"
def short(n):
    n=int(n)
    return f"{n/1e8:.2f}亿" if n>=1e8 else (f"{n/1e4:,.0f}万" if n>=1e5 else (f"{n/1e4:.1f}万" if n>=1e4 else f"{n:,}"))
WAVE_ZH={1:'第一禁区',2:'第二禁区',3:'第三禁区',4:'第四禁区',5:'第五禁区'}
CSS=open('/tmp/s71rep/paper.css').read()
def page(n,title,body):
    return f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>{title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700;900&family=Noto+Sans+SC:wght@400;500;700&display=swap">
<style>{CSS}</style></head><body><div class="paper pg{n}" id="paper">
<div class="topline"><span>忘忘看报 · 融灾特刊</span><span>第 {n} 版 / 共 6 版</span><span>终榜快照 2026-10-26 16:47（北京时间）</span></div>
<div class="body">{body}</div>
<div class="foot">数据来源：取自官方榜单和详细战斗数据，汇总于忘忘看报：qingdengbuyi.top/morimens-tools.html#dtide，b站@青灯不弈。　统计口径：每名玩家每个禁区的「通关队」；官方榜单满分 525 = 五个禁区单区最高分之和（95+100+105+110+115）。画面素材版权归原权利人所有。</div>
</div></body></html>"""
def portrait(en,size=84,cls=''):
    p=img('awakener',en)
    return f'<span class="pt {cls}" title="{e(zn("awakener",en))}"><img src="file://{p}" width="{size}" height="{size}" alt=""><i>{e(zn("awakener",en))}</i></span>' if p else f'<span class="pt"><b>{e(zn("awakener",en))}</b></span>'
def team_html(names,size=84):
    return '<div class="team">'+''.join(portrait(n,size) for n in names)+'</div>'
def icon(kind,en,size=44):
    p=img(kind,en); 
    return f'<img class="ic" src="file://{p}" width="{size}" height="{size}" alt="">' if p else ''
rel=json.load(open(R+'data/morimens/skeydb/public-v3/catalogs/relics.json'))['records']
realm_of={a['id']:a['realm'] for a in aw}
INIT_REL={norm(n) for n in S['initial_relics']}
DIM_AEQ={norm(r['name']) for r in rel if r.get('relicType')=='Dimensional Image' and realm_of.get(r.get('ownerAwakenerId'))=='CHAOS'}
def keep_cr(items):
    m={}
    for n,c in items:
        if norm(n) in DIM_AEQ or norm(n) in INIT_REL: continue
        k=norm(n)
        if k in m: m[k]=(m[k][0],max(m[k][1],c))
        else: m[k]=(n,c)
    return sorted(m.values(),key=lambda x:-x[1])
# ================= PAGE 1 =================
T=S['tiers']; cut=S['cut']
def bar_hist():
    # bins of 10 points from 400..525
    import collections
    recs=json.load(open('/tmp/s71rep/season71_records.json'))['records']
    c=collections.Counter(r['score']//10*10 for r in recs)
    bins=list(range(380,530,10)); mx=max(c.get(b,0) for b in bins)
    W=900;H=360;bw=W/len(bins)
    g=''
    for i,b in enumerate(bins):
        v=c.get(b,0); h=(H-60)*v/mx
        lab=f"{b}" if b<520 else "520+"
        g+=f'<rect x="{i*bw+6:.1f}" y="{H-30-h:.1f}" width="{bw-12:.1f}" height="{h:.1f}" fill="#1d1d1b"/><text x="{i*bw+bw/2:.1f}" y="{H-30-h-6:.1f}" text-anchor="middle" class="svn">{v}</text><text x="{i*bw+bw/2:.1f}" y="{H-8}" text-anchor="middle" class="svl">{lab}</text>'
    return f'<svg viewBox="0 0 {W} {H}" class="hist">{g}</svg>'
def ladder():
    rows=[(525,'满分 525'),(510,'≥ 510'),(500,'≥ 500'),(490,'≥ 490'),(480,'≥ 480'),(470,'≥ 470'),(460,'≥ 460'),(450,'≥ 450'),(425,'≥ 425'),(400,'≥ 400')]
    mx=T['400']
    h=''
    for k,l in rows:
        v=T[str(k)]; h+=f'<div class="lad"><span class="ll">{l}</span><span class="lb"><i style="width:{max(2,100*v/mx):.1f}%"></i></span><span class="lv">{v} 人</span></div>'
    return h
DIFFS=[('threatDown','▼','#b3201a'),('threatSSS','SSS','#c75b12'),('threatSS','SS','#d7a21b'),('threatS','S','#6f8f3a'),('threatA','A','#3f7f9a'),('threatB','B','#8a8a8a'),('threatC','C','#c8c8c8')]
_zd=sorted(range(1,6),key=lambda w:-S['zone'][str(w)]['dist'].get('threatDown',0))
ZCAP=f"{WAVE_ZH[_zd[0]]}（{S['zone'][str(_zd[0])]['dist']['threatDown']} 人）与{WAVE_ZH[_zd[1]]}（{S['zone'][str(_zd[1])]['dist']['threatDown']} 人）▼ 通关人数最多，{WAVE_ZH[_zd[-1]]}（{S['zone'][str(_zd[-1])]['dist']['threatDown']} 人）最少。"
def zone_bars():
    h=''
    for wv in '12345':
        z=S['zone'][wv]; tot=sum(z['dist'].values())
        seg=''.join(f'<i style="width:{100*z["dist"].get(k,0)/tot:.2f}%;background:{c}" title="{l}"></i>' for k,l,c in DIFFS)
        nums=' · '.join(f'{l} {z["dist"].get(k,0)}' for k,l,c in DIFFS[:5])
        h+=f'<div class="zrow"><b>{WAVE_ZH[int(wv)]}</b><div class="zb">{seg}</div><span>{nums}</span><em>▼ 通关率 {100*z["dist"].get("threatDown",0)/tot:.1f}% · 双队 {z["extra"]} 人</em></div>'
    leg=''.join(f'<span><i style="background:{c}"></i>{l}</span>' for k,l,c in DIFFS)
    return h+f'<div class="zleg">{leg}</div>'
perfect=''.join(f'<li><b>{i+1}</b>{e(re.sub("<[^>]*>","",p[1]))}</li>' for i,p in enumerate(S['perfect']))
p1=f"""
<div class="mast"><div class="mastsub">THE MORIMENS DAILY · DISSOLUTED ABYSS SPECIAL</div><h1>忘忘看报</h1><div class="mastsub2">融灾第 71 期 · 「混沌戒指」 · 2026 年 10 月 12 日 — 10 月 26 日 · 终榜特刊</div></div>
<div class="headline"><h2>{T['525']} 人登顶 525 满分，<br>{T['450']} 位玩家站上 450 分线</h2><p class="deck">本报统计终榜 Top 2000（上榜门槛 {cut['2000']} 分）：{T['500']} 人 ≥500 分，{T['450']} 人 ≥450 分，满分 525 仅 {T['525']} 人，占统计样本的 {100*T['525']/2000:.1f}%。</p></div>
<div class="kpis">
<div><small>上榜门槛 · 第 2000 名</small><b>{cut['2000']}</b></div>
<div><small>统计样本 · Top</small><b>2,000</b></div>
<div class="hot"><small>525 满分</small><b>{T['525']}</b></div>
<div><small>≥ 500 分</small><b>{T['500']}</b></div>
<div><small>≥ 450 分</small><b>{T['450']}</b></div>
<div><small>平均 / 中位</small><b>{S['avg']:.0f}<em>/</em>{S['median']:.0f}</b></div>
</div>
<div class="cols3">
<section class="art"><h3>分数分布</h3><p class="cap">每 10 分一档的人数。上榜线 {cut['2000']} 分，主体集中在 400–450。</p>{bar_hist()}</section>
<section class="art"><h3>分数阶梯</h3><p class="cap">累计人数：达到该分数的玩家数。</p><div class="ladder">{ladder()}</div></section>
<section class="art"><h3>排名分数线</h3><p class="cap">各名次对应的分数。</p>
<table class="tb"><tr><th>名次</th><th>分数</th><th>名次</th><th>分数</th></tr>
<tr><td>第 1 名</td><td>{cut['1']}</td><td>第 300 名</td><td>{cut['300']}</td></tr>
<tr><td>第 10 名</td><td>{cut['10']}</td><td>第 500 名</td><td>{cut['500']}</td></tr>
<tr><td>第 50 名</td><td>{cut['50']}</td><td>第 1000 名</td><td>{cut['1000']}</td></tr>
<tr><td>第 100 名</td><td>{cut['100']}</td><td>第 1500 名</td><td>{cut['1500']}</td></tr>
<tr><td>第 200 名</td><td>{cut['200']}</td><td>第 2000 名</td><td>{cut['2000']}</td></tr></table>
<h3 class="sm">525 名人堂</h3><ul class="hall">{perfect}</ul></section>
</div>
<section class="wide"><h3>各禁区通关难度分布（Top 2000）</h3><p class="cap">每名玩家在各禁区「通关队」的最高难度。▼ 为最高难度，通关的人最少、含金量最高；{ZCAP}</p>{zone_bars()}</section>
<section class="wide twocol">
<div><h3>头版观察</h3><ul class="notes">
<li>满分 525 = 五个禁区都拿到单区最高分（95/100/105/110/115）。510–520 分段仅 {T['510']-T['525']} 人，「差一点满分」的玩家极少；{T['500']} 人跨过 500 分线。</li>
<li>500 分以上 {T['500']} 人；450 分是一道明显的断层——累计人数从 ≥460 分的 {T['460']} 人一下跳到 ≥450 分的 {T['450']} 人，说明「全部禁区稳定通关 S/SS」是大多数玩家的收益平台期。</li>
<li>上榜线 {cut['2000']} 分，前 1000 名需 {cut['1000']} 分，前 500 名需 {cut['500']} 分。</li>
<li>两支队伍（通关队 + 额外队）都通关的玩家：第一禁区 {S['zone']['1']['extra']} 人，第五禁区 {S['zone']['5']['extra']} 人，越往后越难凑齐第二队。</li></ul></div>
<div><h3>读报指南</h3><ul class="notes">
<li><b>第 2 版</b>：每个禁区的 ▼ 通关配队榜——冠军配队、最热门配队、最快通关配队。</li>
<li><b>第 3 版</b>：「数据之最」——单回合最高伤害、单场总伤害、死扛之王……以及唤醒体、命轮、密契、造物、钥令的出场榜。</li><li><b>第 4 版</b>：「小众数据」——癫狂（▼）与 SSS 难度里谁没出场、神秘配队 Top 5、最多回合 / 死扛 / 出牌。</li><li><b>第 5 版</b>：「启灵榜」——▼ + SSS 难度下所有唤醒体的启灵占比，按 +12 占比排序。</li>
<li><b>第 6 版</b>：「对比特刊」——和第 70 期逐项对比：分数线、▼ 通关人数、最快回合、唤醒体 / 钥令 / 命轮出场率的变化。</li><li>名次相同的玩家并列；统计对象为终榜 Top 2000 的 2000 名玩家，共 {num(S['battles'])} 场战斗记录。</li></ul></div>
</section>
"""
open('/tmp/s71rep/p1.html','w').write(page(1,'融灾第71期特刊 · 第一版',p1))
# ================= PAGE 2 =================
def usage_line(cnt,total):
    return f"{cnt} 人（{100*cnt/total:.0f}%）"
zhtok=lambda n:zn('posse',n)
blocks=''
rank1={x['wave']:x for x in S['rank1']}
zt=S['zt']; zb=S['zone_best']
for wv in '12345':
    w=int(wv); z=zt[wv]; tot=S['zone'][wv]['dist'].get('threatDown',0)
    champ=rank1[w]
    tops=''
    for i,(k,v) in enumerate(z['teams'][:3]):
        tops+=f'<div class="trow"><span class="tn">{i+1}</span>{team_html(k,70)}<span class="tc"><b>{v} 队</b><small>占 {100*v/z["n"]:.0f}%</small></span></div>'
    fast=zb[wv][0]
    aws=''.join(f'<li>{icon("awakener",n,36)}<b>{e(zn("awakener",n))}</b><span>{c}</span></li>' for n,c in z['aw'][:6])
    toks=''.join(f'<li>{icon("posse",n,36)}<b>{e(zhtok(n))}</b><span>{c}</span></li>' for n,c in z['tok'][:3])
    crs=''.join(f'<li>{icon("relic",n,36)}<b>{e(zn("relic",n))}</b><span>{c}</span></li>' for n,c in keep_cr(z['cr'])[:4])
    blocks+=f"""<section class="zone"><div class="zhead"><h3>{WAVE_ZH[w]}</h3><span>▼ 通关 {z['n']} 人 · 通关队满分 {champ['score']} 分</span></div>
<div class="zgrid">
<div class="zc"><h4>冠军配队</h4><p class="who">榜首「{e(re.sub('<[^>]*>','',json.load(open('/tmp/s71rep/season71_records.json'))['records'][0]['player']))}」</p>{team_html(champ['team'],96)}<p class="tk">钥令：{e(zhtok(champ['token'] or '—'))}</p></div>
<div class="zc"><h4>最热门 ▼ 配队 Top 3</h4>{tops}</div>
<div class="zc"><h4>最快通关 ▼（{fast['val']} 回合）</h4><p class="who">「{e(fast['player'])}」· 排名第 {fast['rank']}</p>{team_html(fast['team'],96)}<p class="tk">其后：{'、'.join(e(x['player'])+' '+str(x['val'])+'回合' for x in zb[wv][1:3])}</p></div>
<div class="zc narrow"><h4>出场 Top 6</h4><ul class="mini">{aws}</ul></div>
<div class="zc narrow"><h4>常用钥令 · 造物</h4><ul class="mini">{toks}{crs}</ul></div>
</div></section>"""
p2=f"""<div class="mast small"><h1>忘忘看报</h1><div class="mastsub2">融灾第 71 期 · 各禁区 ▼ 配队榜</div></div>
<div class="headline h2"><h2>五大禁区，五种打法：<br>谁是 ▼ 难度的通关密码？</h2><p class="deck">统计各禁区「通关队」中达成最高难度 ▼ 的队伍：第一禁区 {zt['1']['n']} 队、第二禁区 {zt['2']['n']} 队、第三禁区 {zt['3']['n']} 队、第四禁区 {zt['4']['n']} 队、第五禁区 {zt['5']['n']} 队。同阵容（不计站位）合并计数。</p></div>
{blocks}"""
open('/tmp/s71rep/p2.html','w').write(page(2,'融灾第71期特刊 · 第二版',p2))
# ================= PAGE 3 =================
E=S['ext']
def card(title,val,unit,item,sub=''):
    return f'<div class="rc"><h4>{title}</h4><div class="rv">{val}<small>{unit}</small></div><p class="who">「{e(item["player"])}」· 第 {item["rank"]} 名 · {WAVE_ZH[item["wave"]]}</p>{team_html(item["team"],56)}<p class="sub">{sub}</p></div>'
m=E['maxBout'][0]; t=E['totalDamage'][0]; so=E['soloDamage']; d=E['death'][0]; c=E['counter'][0]; te=E['tentacle'][0]; st=E['strength'][0]; po=E['poison'][0]; hp=E['hp'][0]
cards=''.join([
 card('单回合最高伤害',short(m['val']),'',m,f'{num(m["val"])} 点'),
 card('单场总伤害之王',short(t['val']),'',t,f'整场队伍伤害合计 {num(t["val"])}'),
 card('单角色最高伤害',short(so['val']),'',so,f'{e(zn("awakener",so["awakener"]))} 一人打出 {num(so["val"])}'),
 card('死扛之王',d['val'],'次',d,'单场触发死扛次数最多'),
 card('反击之王',short(c['val']),'',c,f'单场最高反击伤害 {num(c["val"])}'),
 card('触手之王',num(te['val']),'',te,'单场最高触手伤害'),
 card('力量之王',num(st['val']),'',st,'单场最高力量'),
 card('毒伤之王',short(po['val']),'',po,f'单场最高中毒层伤害 {num(po["val"])}'),
 card('生命之王',num(hp['val']),'',hp,'单场最高生命'),
])
speed=''.join(f'<tr><td>{WAVE_ZH[int(w)]}</td><td><b>{E["minRounds"][w][0]["val"]}</b> 回合</td><td>「{e(E["minRounds"][w][0]["player"])}」#{E["minRounds"][w][0]["rank"]}</td><td>{team_html(E["minRounds"][w][0]["team"],40)}</td></tr>' for w in '12345')
def rank_list(title,items,kind,total,sizing=40):
    mx=items[0][1]
    return f'<div class="rk"><h4>{title}</h4>'+''.join(f'<div class="rr"><span class="rn">{i+1}</span>{icon(kind,n,sizing)}<span class="rname">{e(zn(kind,n))}</span><span class="rbar"><i style="width:{100*c/mx:.1f}%"></i></span><span class="rc2">{100*c/total:.0f}%</span></div>' for i,(n,c) in enumerate(items))+'</div>'
U=S['use_all']; N=U['n']
U5=S['use_p525']; N5=U5['n']
# creations: drop the near-universal starting creations (>=95% of players)
cr=[(n,c) for n,c in keep_cr(U['cr']) if c/N<0.95][:8]
cr5=[(n,c) for n,c in keep_cr(U5['cr']) if c/N5<0.95][:8]
p3=f"""<div class="mast small"><h1>忘忘看报</h1><div class="mastsub2">融灾第 71 期 · 数据之最与出场榜</div></div>
<div class="headline h2"><h2>{short(so['val'])}一人输出、<br>{d['val']} 次死扛：本期的极限数据</h2><p class="deck">从 {num(S['battles'])} 场战斗记录里挑出每项数据的第一名，并统计 Top 2000 的唤醒体、命轮、密契、造物与钥令出场率。</p></div>
<section class="wide"><h3>数据之最</h3><div class="rgrid">{cards}</div></section>
<section class="wide"><h3>最快通关榜（▼ 难度，最少回合）</h3><table class="tb speed"><tr><th>禁区</th><th>回合数</th><th>玩家</th><th>配队</th></tr>{speed}</table></section>
<section class="wide"><h3>出场榜（Top 2000，至少在一个禁区使用）</h3><div class="rkgrid">
{rank_list('唤醒体 Top 10',U['aw'][:10],'awakener',N,40)}
{rank_list('命轮 Top 8',U['wh'],'wheel',N,40)}
{rank_list('密契 Top 6',U['cv'],'covenant',N,40)}
{rank_list('造物 Top 8（排除固定 / 当期维度影像）',cr[:8],'relic',N,40)}
{rank_list('钥令 Top 6',U['tk'][:6],'posse',N,40)}
{rank_list('525 满分玩家的唤醒体 Top 6（'+str(N5)+' 人）',U5['aw'][:6],'awakener',N5,40)}
</div></section>
<section class="wide twocol"><div><h3>借用助战 Top 6</h3><ul class="notes two">{''.join(f'<li>{icon("awakener",n,34)} <b>{e(zn("awakener",n))}</b> · 被借用 {c} 次</li>' for n,c in S['borrowed'])}</ul></div>
<div><h3>编后</h3><ul class="notes"><li>所有统计只针对终榜 Top 2000 的 2000 名玩家，战斗记录来自官方接口。</li><li>「出场率」按玩家计：同一玩家多个禁区使用同一唤醒体只算 1 次。</li></ul></div></section>
"""
open('/tmp/s71rep/p3.html','w').write(page(3,'融灾第71期特刊 · 第三版',p3))
print('ok')

# ================= PAGE 4 =================
du=dict(S['down_use']); n_down=S['down_teams_n']
zero=[n for n in S['allaw'] if du.get(n,0)==0]
low=sorted([(n,c) for n,c in du.items() if c>0],key=lambda x:(x[1],x[0]))[:8]
zero_html=''.join(f'<div class="zeroc">{portrait(n,120)}</div>' for n in zero)
hot=sorted(du.items(),key=lambda x:-x[1])[:10]
hot_html=''.join(f'<div class="rr"><span class="rn">{i+1}</span>{icon("awakener",n,42)}<span class="rname">{e(zn("awakener",n))}</span><span class="rbar"><i style="width:{100*c/hot[0][1]:.0f}%"></i></span><span class="rc2">{c}</span></div>' for i,(n,c) in enumerate(hot))
dsu=dict(S['ds_use']); zero2=[n for n in S['allaw'] if dsu.get(n,0)==0]
zero2_html=''.join(f'<div class="zeroc">{portrait(n,120)}</div>' for n in zero2)
low2=sorted([(n,c) for n,c in dsu.items() if c>0],key=lambda x:(x[1],x[0]))[:8]
low2_html=''.join(f'<div class="rr"><span class="rn">{i+1}</span>{icon("awakener",n,42)}<span class="rname">{e(zn("awakener",n))}</span><span class="rbar"><i style="width:{100*c/low2[-1][1]:.0f}%"></i></span><span class="rc2">{c}</span></div>' for i,(n,c) in enumerate(low2))
low_html=''.join(f'<div class="rr"><span class="rn">{i+1}</span>{icon("awakener",n,42)}<span class="rname">{e(zn("awakener",n))}</span><span class="rbar"><i style="width:{100*c/low[-1][1]:.0f}%"></i></span><span class="rc2">{c}</span></div>' for i,(n,c) in enumerate(low))
myst=''
for i,m in enumerate(S['mystery2'][:5]):
    mem=''.join(f'<span class="mm">{portrait(n,78)}<small>出场 {u} 次</small></span>' for n,u in zip(m['team'],m['uses']))
    myst+=f'<div class="my"><span class="tn">{i+1}</span><div class="mt">{mem}</div><div class="mi"><b>「{e(m["player"])}」</b><span>第 {m["rank"]} 名 · {m["score"]} 分</span><span>{WAVE_ZH[m["wave"]]} {m["diff"]} · 钥令：{e(zn("posse",m["token"]))}</span><span class="red">四人合计仅出场 {m["sum"]} 人次</span></div></div>'
NI=S['niche2']
XT={True:' · 额外队',False:''}
def nc(title,val,unit,item,sub):
    xt=XT[item['slot']=='extra']
    return f'<div class="rc"><h4>{title}</h4><div class="rv">{val}<small>{unit}</small></div><p class="who">「{e(item["player"])}」· 第 {item["rank"]} 名 · {WAVE_ZH[item["wave"]]} {item["diff"]}{xt}</p>{team_html(item["team"],56)}<p class="sub">{sub}</p></div>'
def runner(key,fmt=str):
    return '、'.join(f'{e(x["player"])} {fmt(x["val"])}' for x in NI[key][1:3])
AZ=S['avg_death_zone']
avgzone=''.join(f'<tr><td>{WAVE_ZH[w]}</td><td>{AZ[f"{w}-▼"][0]}</td><td>{AZ[f"{w}-SSS"][0]}</td></tr>' for w in range(1,6))
avgcard=f'<div class="rc"><h4>平均死扛榜</h4><div class="rv">{S["avg_death_all"]}<small>次/场</small></div><p class="who">▼ + SSS 通关战斗的平均死扛次数</p><table class="tb mini2"><tr><th>禁区</th><th>▼</th><th>SSS</th></tr>{avgzone}</table></div>'
cards4=''.join([
 nc('最长鏖战',NI['stageRoundCount'][0]['val'],'回合',NI['stageRoundCount'][0],f'平均 {NI["avgRounds"]} 回合 · 其后 '+runner('stageRoundCount')),
 nc('首领战最久',NI['bossBattleRoundCount'][0]['val'],'回合',NI['bossBattleRoundCount'][0],'其后 '+runner('bossBattleRoundCount')),
 nc('死扛最多',NI['deathResistCount'][0]['val'],'次',NI['deathResistCount'][0],'其后 '+runner('deathResistCount')),
 nc('出牌最多',NI['totalUseCard'][0]['val'],'张',NI['totalUseCard'][0],'整场累计出牌 · 其后 '+runner('totalUseCard')),
 nc('耗能最多',NI['totalEnergyCost'][0]['val'],'点',NI['totalEnergyCost'][0],'整场累计算力消耗 · 其后 '+runner('totalEnergyCost')),
 nc('单回合出牌最多',NI['maxBoutUseCard'][0]['val'],'张',NI['maxBoutUseCard'][0],'其后 '+runner('maxBoutUseCard')),
 nc('最少出牌通关',NI['fewCards'][0]['val'],'张',NI['fewCards'][0],'其后 '+'、'.join(f'{e(x["player"])} {x["val"]}' for x in NI['fewCards'][1:3])),
 avgcard,
])
avgaw=''.join(f'<div class="rr"><span class="rn">{i+1}</span>{icon("awakener",n,40)}<span class="rname">{e(zn("awakener",n))}</span><span class="rbar"><i style="width:{100*v/S["avg_death_aw"][0][1]:.0f}%"></i></span><span class="rc2">{v}</span></div>' for i,(n,v,c) in enumerate(S['avg_death_aw'][:5]))
avgpl=''.join(f'<div class="rr"><span class="rn">{i+1}</span><span></span><span class="rname">{e(n)}（第 {rk} 名）</span><span class="rbar"><i style="width:{100*v/S["avg_death_player"][0][1]:.0f}%"></i></span><span class="rc2">{v}</span></div>' for i,(n,v,c,rk) in enumerate(S['avg_death_player']))
p4=f"""<div class="mast small"><h1>忘忘看报</h1><div class="mastsub2">融灾第 71 期 · 小众数据特刊</div></div>
<div class="headline h2"><h2>癫狂难度里，{len(zero)} 位唤醒体<br>一次都没出场</h2><p class="deck">本版统计「癫狂」（▼）与 SSS 难度的队伍（含通关队与额外队伍）：▼ 共 {n_down} 队，▼ + SSS 共 {S['ds_n']} 队。{len(S['allaw'])} 位唤醒体里只有 {len(S['allaw'])-len(zero)} 位在 ▼ 登场过；还有 5 支「神秘配队」，四位成员加起来也没几个人用。</p></div>
<section class="wide twocol"><div><h3>癫狂（▼）零出场</h3><div class="zerorow">{zero_html}</div><p class="cap">这 {len(zero)} 位唤醒体在 ▼ 难度的 {n_down} 支队伍（含额外队伍）里一次都没有出现。</p></div>
<div><h3>▼ + SSS 零出场</h3><div class="zerorow">{zero2_html}</div><p class="cap">把 SSS 难度的队伍也算进来（共 {S['ds_n']} 队），仍然无人使用的唤醒体。</p></div></section>
<section class="wide twocol"><div><h3>癫狂（▼）出场最少 Top 8</h3><div class="rk">{low_html}</div><p class="cap">数字为 ▼ 通关队中的出场人次（含 5 个禁区）；神秘配队 = 四位成员的 ▼ + SSS 出场人次之和最低的配队。</p></div>
<div><h3>▼ + SSS 出场最少 Top 8</h3><div class="rk">{low2_html}</div><p class="cap">数字为 ▼ 与 SSS 难度通关队中的出场人次，不含上面的零出场。</p></div></section>
<section class="wide"><h3>神秘配队 Top 5（癫狂 + SSS 出场最少）</h3><div class="mylist">{myst}</div></section>
<section class="wide"><h3>神秘数据（▼ + SSS 通关战斗之最）</h3><div class="rgrid g4">{cards4}</div></section>
<section class="wide twocol"><div><h3>平均死扛最高的唤醒体 Top 5</h3><div class="rk">{avgaw}</div><p class="cap">▼ + SSS 通关战斗里，队伍含该唤醒体时的平均死扛次数（至少 15 场）。</p></div><div><h3>平均死扛最高的玩家 Top 5</h3><div class="rk">{avgpl}</div><p class="cap">玩家在 ▼ + SSS 通关战斗里的平均死扛次数（至少 5 场）。</p></div></section>
"""
open('/tmp/s71rep/p4.html','w').write(page(4,'融灾第71期特刊 · 第四版',p4))
print('ok4')

# ================= PAGE 5 =================
EN=S['enlight_ds']
BK=[('low','0～2启','#8a93a0'),('e3plus3','3启～+3','#d7a21b'),('plus4plus11','+4～+11','#3f7f9a'),('plus12','+12','#b3201a')]
rowsE=[]
for n in S['allaw']:
    c=EN.get(n)
    if not c: continue
    t=sum(c.values()); rowsE.append((n,t,c,c.get('plus12',0)/t))
rowsE.sort(key=lambda x:(-x[3],-x[1]))
_un=[zn('awakener',n) for n in S['allaw'] if n not in EN]
ZNOTE=('、'.join(_un)+' 在 ▼ + SSS 难度无人使用，未列入。') if _un else ''
tot=sum(r[1] for r in rowsE); p12=sum(r[2].get('plus12',0) for r in rowsE)
def erow(i,r):
    n,t,c,sh=r
    seg=''.join(f'<i style="width:{100*c.get(k,0)/t:.2f}%;background:{col}"></i>' for k,lab,col in BK)
    return f'<div class="er"><span class="rn">{i+1}</span>{portrait_small(n)}<span class="en">{e(zn("awakener",n))}<small>{t} 队</small></span><span class="eb">{seg}</span><span class="ev">{100*sh:.0f}%</span></div>'
def portrait_small(n):
    p=img('awakener',n); return f'<img class="ep" src="file://{p}" width="64" height="64" alt="">' if p else '<span class="ep"></span>'
half=(len(rowsE)+1)//2
col1=''.join(erow(i,r) for i,r in enumerate(rowsE[:half])); col2=''.join(erow(i+half,r) for i,r in enumerate(rowsE[half:]))
legend=''.join(f'<span><i style="background:{col}"></i>{lab}</span>' for k,lab,col in BK)
hi=rowsE[0]; lo=rowsE[-1]
big=[r for r in rowsE if r[1]>=20]
top20=big[:3]
p5=f"""<div class="mast small"><h1>忘忘看报</h1><div class="mastsub2">融灾第 71 期 · 启灵榜特刊</div></div>
<div class="headline h2"><h2>▼ 与 SSS 难度里，<br>{100*p12/tot:.0f}% 的唤醒体已经 +12</h2><p class="deck">统计 ▼ + SSS 难度的 {S['ds_n']} 支队伍（含通关队与额外队伍）、共 {tot} 个出场位，按各唤醒体「+12」占比从高到低排序。样本在 20 队以上的唤醒体里，+12 占比最高的是：{'、'.join(zn('awakener',r[0])+f' {100*r[3]:.0f}%' for r in top20)}。</p></div>
<section class="wide"><div class="elegend">{legend}<em>色条 = 各启灵档位占该唤醒体出场的比例；右侧数字 = +12 占比；名字下方为出场队数</em></div>
<div class="ecols"><div class="ecol">{col1}</div><div class="ecol">{col2}</div></div>
<p class="cap">启灵档位按 potencyLevel 划分：≤2 为 0～2启，3～6 为 3启～+3，7～14 为 +4～+11，15 为 +12（与融灾榜单页一致）。出场队数很少的唤醒体比例波动大，仅供参考；{ZNOTE}</p></section>
"""
open('/tmp/s71rep/p5.html','w').write(page(5,'融灾第71期特刊 · 第五版',p5))
print('ok5')

# ================= PAGE 6 : S70 vs S71 =================
import collections as _c
A=json.load(open('/tmp/s4/rep/stats.json')); B=S
rec70=json.load(open('/tmp/s4/season70_records.json'))['records']; rec71=json.load(open('/tmp/s71rep/season71_records.json'))['records']
def players_using(recs,kind):
    c=_c.Counter()
    for r in recs:
        st=set()
        for w in r['waves']:
            for t in w['teams']:
                if t['clearType']!='clear': continue
                if kind=='aw':
                    for m in t['members']: st.add(m['canonicalName'])
                elif kind=='tk' and t.get('token'): st.add(t['token']['name'])
                elif kind=='wh':
                    for m in t['members']:
                        for x in m.get('wheels',[]): st.add(x['name'])
        c.update(st)
    return c
CSS+="""
.cmp td.up{color:#8c1a12;font-weight:700}.cmp td.dn{color:#1f5f8b;font-weight:700}
.kpis.k6 b{font-size:60px}.kpis.k6 em{font-size:38px}.kpis.k6 small{font-size:22px}
.zc2{display:grid;grid-template-columns:200px 1fr;align-items:center;gap:14px;margin:2px 0;font:700 28px 'Noto Sans SC'}
.zc2 .bb{display:grid;gap:6px}.zc2 .bb div{display:grid;grid-template-columns:1fr 120px;align-items:center;gap:10px}
.zc2 .bb span.bar{height:13px;background:rgba(0,0,0,.08);display:block}.zc2 .bb i{display:block;height:100%}
.zc2 .bb .a i{background:#6f8f3a}.zc2 .bb .b i{background:#8c1a12}.zc2 .bb em{font-style:normal;text-align:right;font-size:26px}
.lg2{font:700 24px 'Noto Sans SC';margin:6px 0 10px}.lg2 i{display:inline-block;width:20px;height:20px;margin:0 8px 0 18px;vertical-align:-3px}
.mv{display:grid;grid-template-columns:40px 48px 1fr 110px 250px;align-items:center;gap:10px;margin:1px 0;font:600 24px 'Noto Sans SC'}
.mv .d{text-align:right;font-weight:800}.mv .d.up{color:#8c1a12}.mv .d.dn{color:#1f5f8b}.mv small{color:#666;font-size:21px;text-align:right;white-space:nowrap}
"""
cnt70=players_using(rec70,'aw'); cnt71=players_using(rec71,'aw')
def share(c,n): return 100*c/n
sh70={k:share(v,2000) for k,v in cnt70.items()}; sh71={k:share(v,2000) for k,v in cnt71.items()}
names=set(sh70)|set(sh71)
rk70={n:i+1 for i,(n,_) in enumerate(cnt70.most_common())}; rk71={n:i+1 for i,(n,_) in enumerate(cnt71.most_common())}
delta=sorted(((n,sh71.get(n,0)-sh70.get(n,0)) for n in names),key=lambda x:-x[1])
def arrow(d): return f'<span class="d {"up" if d>0 else "dn"}">{"▲" if d>0 else "▼"} {abs(d):.1f}</span>'
top10=''.join(f'<div class="mv"><span class="rn">{i+1}</span>{icon("awakener",n,48)}<span class="rname">{e(zn("awakener",n))}</span><span class="d" style="font-weight:700">{sh71.get(n,0):.0f}%</span><small>上期第 {rk70.get(n,"—")} 名 {sh70.get(n,0):.0f}%</small></div>' for i,(n,_) in enumerate(cnt71.most_common(8)))
rise=''.join(f'<div class="mv"><span class="rn">{i+1}</span>{icon("awakener",n,48)}<span class="rname">{e(zn("awakener",n))}</span>{arrow(d)}<small>{sh70.get(n,0):.0f}% → {sh71.get(n,0):.0f}%</small></div>' for i,(n,d) in enumerate(delta[:4]))
fall=''.join(f'<div class="mv"><span class="rn">{i+1}</span>{icon("awakener",n,48)}<span class="rname">{e(zn("awakener",n))}</span>{arrow(d)}<small>{sh70.get(n,0):.0f}% → {sh71.get(n,0):.0f}%</small></div>' for i,(n,d) in enumerate(delta[::-1][:4]))
# cutoff table
def dcell(a,b):
    d=b-a
    return f'<td class="{"up" if d>0 else "dn" if d<0 else ""}">{"+" if d>0 else ""}{d}</td>'
cutrows=''.join(f'<tr><td>第 {k} 名</td><td>{A["cut"][k]}</td><td>{B["cut"][k]}</td>{dcell(A["cut"][k],B["cut"][k])}</tr>' for k in ('1','10','50','100','200','500','1000','2000'))
tierrows=''.join(f'<tr><td>≥ {k} 分</td><td>{A["tiers"][k]}</td><td>{B["tiers"][k]}</td>{dcell(A["tiers"][k],B["tiers"][k])}</tr>' for k in ('525','500','480','450','425','400'))
# per-zone ▼
d70=sum(A['zone'][w]['dist'].get('threatDown',0) for w in '12345'); d71=sum(B['zone'][w]['dist'].get('threatDown',0) for w in '12345')
mxz=max(max(A['zone'][w]['dist'].get('threatDown',0),B['zone'][w]['dist'].get('threatDown',0)) for w in '12345')
zrows=''
for w in '12345':
    a=A['zone'][w]['dist'].get('threatDown',0); b=B['zone'][w]['dist'].get('threatDown',0)
    zrows+=f'<div class="zc2"><span>{WAVE_ZH[int(w)]}</span><div class="bb"><div class="a"><span class="bar"><i style="width:{100*a/mxz:.0f}%"></i></span><em>{a}</em></div><div class="b"><span class="bar"><i style="width:{100*b/mxz:.0f}%"></i></span><em>{b}</em></div></div></div>'
zleg='<div class="lg2"><i style="background:#6f8f3a"></i>第 70 期（深海戒指）<i style="background:#8c1a12"></i>第 71 期（混沌戒指）</div>'
fastrows=''.join(f'<tr><td>{WAVE_ZH[int(w)]}</td><td>{A["ext"]["minRounds"][w][0]["val"]} 回合</td><td>{B["ext"]["minRounds"][w][0]["val"]} 回合</td>{dcell(A["ext"]["minRounds"][w][0]["val"],B["ext"]["minRounds"][w][0]["val"])}</tr>' for w in '12345')
# tokens / wheels share (players, clear teams)
def top_share(kind,n=6):
    c70=players_using(rec70,kind); c71=players_using(rec71,kind)
    return c70,c71
tk70,tk71=top_share('tk'); wh70,wh71=top_share('wh')
def listcmp(c70,c71,kind,k=4):
    out=''
    for i,(n,c) in enumerate(c71.most_common(k)):
        out+=f'<div class="mv"><span class="rn">{i+1}</span>{icon(kind,n,44)}<span class="rname">{e(zn(kind,n))}</span><span class="d" style="font-weight:700">{100*c/2000:.0f}%</span><small>上期 {100*c70.get(n,0)/2000:.0f}%</small></div>'
    return out
ext70,ext71=A['ext'],B['ext']
extrows=[
 ('单回合最高伤害',short(ext70['maxBout'][0]['val']),short(ext71['maxBout'][0]['val'])),
 ('单场总伤害之王',short(ext70['totalDamage'][0]['val']),short(ext71['totalDamage'][0]['val'])),
 ('单场死扛最多',f"{ext70['death'][0]['val']} 次",f"{ext71['death'][0]['val']} 次"),
 ('▼ 战斗平均回合',f"{A['niche']['avgRounds']}",f"{B['niche']['avgRounds']}"),
 ('▼+SSS 平均死扛',f"{A['avg_death_all']} 次/场",f"{B['avg_death_all']} 次/场"),
]
extt=''.join(f'<tr><td>{a}</td><td>{b}</td><td>{c}</td></tr>' for a,b,c in extrows)
pc=lambda a,b:f"{100*(b-a)/a:+.0f}%"
p6=f"""<div class="mast small"><h1>忘忘看报</h1><div class="mastsub2">融灾第 71 期 vs 第 70 期 · 对比特刊</div></div>
<div class="headline h2"><h2>混沌戒指对比深海戒指：<br>▼ 通关人数 {d70} → {d71}（{pc(d70,d71)}）</h2><p class="deck">同样统计终榜 Top 2000。第 71 期上榜门槛降到 {B['cut']['2000']} 分（上期 {A['cut']['2000']}），满分 525 的人数从 {A['tiers']['525']} 人变为 {B['tiers']['525']} 人，但各禁区的 ▼ 通关总数明显增加，▼ 战斗平均回合从 {A['niche']['avgRounds']} 缩短到 {B['niche']['avgRounds']}。</p></div>
<div class="kpis k6">
<div><small>525 满分</small><b>{A['tiers']['525']}<em>→</em>{B['tiers']['525']}</b></div>
<div><small>≥ 500 分</small><b>{A['tiers']['500']}<em>→</em>{B['tiers']['500']}</b></div>
<div><small>≥ 450 分</small><b>{A['tiers']['450']}<em>→</em>{B['tiers']['450']}</b></div>
<div><small>平均分</small><b>{A['avg']:.0f}<em>→</em>{B['avg']:.0f}</b></div>
<div><small>上榜门槛</small><b>{A['cut']['2000']}<em>→</em>{B['cut']['2000']}</b></div>
<div class="hot"><small>▼ 通关总数</small><b>{d70}<em>→</em>{d71}</b></div>
</div>
<div class="cols3">
<section class="art"><h3>排名分数线</h3><p class="cap">同一名次的分数，红色为上升、蓝色为下降。</p><table class="tb cmp"><tr><th>名次</th><th>70 期</th><th>71 期</th><th>变化</th></tr>{cutrows}</table></section>
<section class="art"><h3>分数阶梯（累计人数）</h3><p class="cap">达到该分数的玩家数。</p><table class="tb cmp"><tr><th>分数</th><th>70 期</th><th>71 期</th><th>变化</th></tr>{tierrows}</table></section>
<section class="art"><h3>最快 ▼ 通关回合</h3><p class="cap">各禁区 ▼ 难度的最少回合数（越小越快）。</p><table class="tb cmp"><tr><th>禁区</th><th>70 期</th><th>71 期</th><th>变化</th></tr>{fastrows}</table>
<h3 class="sm">极限数据</h3><table class="tb"><tr><th>项目</th><th>70 期</th><th>71 期</th></tr>{extt}</table></section>
</div>
<section class="wide"><h3>各禁区 ▼ 通关人数</h3><p class="cap">每个禁区「通关队」里达成最高难度 ▼ 的玩家数（Top 2000）。</p>{zleg}{zrows}</section>
<section class="wide twocol"><div><h3>唤醒体出场 Top 8（71 期）</h3><p class="cap">占统计样本的比例（至少在一个禁区使用），并附上期名次。</p>{top10}</div>
<div><h3>出场率上升最多</h3><p class="cap">数字为占比变化（百分点）。</p>{rise}<h3 class="sm">出场率下降最多</h3>{fall}</div></section>
<section class="wide twocol"><div><h3>钥令 Top 4</h3>{listcmp(tk70,tk71,'posse')}</div><div><h3>命轮 Top 4</h3>{listcmp(wh70,wh71,'wheel')}</div></section>
<section class="wide"><h3>编后</h3><ul class="notes"><li>第 71 期的戒指是混沌，第 70 期是深海；当期维度影像与固定初始造物在造物榜里已排除。</li><li>第 70 期上榜线 {A['cut']['2000']} 分、第 71 期 {B['cut']['2000']} 分：分数线下移不代表更难——第 71 期 ▼ 通关总数增加 {d71-d70} 人，▼ 战斗的平均回合也更短。</li><li>唤醒体薇薇安 10 月 19 日才上线，只覆盖第 71 期的后半程；第 70 期没有她。</li></ul></section>
"""
open('/tmp/s71rep/p6.html','w').write(page(6,'融灾第71期特刊 · 第六版',p6))
print('ok6')
