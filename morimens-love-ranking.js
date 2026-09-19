(()=>{
  const SERVER='https://textbox.qingdengbuyi.top';
  const PATH_PREFIX='/__morimens_love_rank__/';
  const STORAGE_KEY='morimens.love-ranking.votes.v1';
  const CHUNK_SIZE=30;
  let initialized=false;
  let loading=false;
  let rows=[];
  let votes={};

  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>Number.isFinite(Number(v))?Number(v):0;

  function loadVotes(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      const parsed=raw?JSON.parse(raw):{};
      return parsed&&typeof parsed==='object'?parsed:{};
    }catch{return {}}
  }
  function saveVotes(){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(votes))}catch{}
  }
  function votePath(id){return PATH_PREFIX+encodeURIComponent(String(id||''))}
  function parsePayload(payload){
    if(payload&&payload.errno)throw new Error(payload.errmsg||('Waline errno '+payload.errno));
    return Array.isArray(payload?.data)?payload.data:[];
  }

  async function getCounters(ids){
    const result=new Map(ids.map(id=>[id,{likes:0,dislikes:0}]));
    for(let i=0;i<ids.length;i+=CHUNK_SIZE){
      const chunk=ids.slice(i,i+CHUNK_SIZE);
      const paths=chunk.map(votePath);
      const url=`${SERVER}/api/article?path=${encodeURIComponent(paths.join(','))}&type=${encodeURIComponent('reaction0,reaction1')}&lang=zh-CN`;
      const response=await fetch(url,{cache:'no-store'});
      if(!response.ok)throw new Error('Waline counter HTTP '+response.status);
      const data=parsePayload(await response.json());
      chunk.forEach((id,index)=>{
        const row=data[index]||{};
        result.set(id,{likes:Math.max(0,num(row.reaction0)),dislikes:Math.max(0,num(row.reaction1))});
      });
    }
    return result;
  }

  async function updateCounter(id,type,action){
    const response=await fetch(SERVER+'/api/article?lang=zh-CN',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({path:votePath(id),type,action})
    });
    if(!response.ok)throw new Error('Waline counter HTTP '+response.status);
    parsePayload(await response.json());
    const refreshed=await getCounters([id]);
    return refreshed.get(id)||{likes:0,dislikes:0};
  }

  function injectStyle(){
    if($('morimensLoveRankingStyle'))return;
    const style=document.createElement('style');
    style.id='morimensLoveRankingStyle';
    style.textContent=`
      .loveRankHero{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px}
      .loveRankHero h2{margin:3px 0 6px}.loveRankLead{margin:0;color:#9aa7b8;font-size:12px;line-height:1.7}
      .loveRankLegend{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#8997aa;font-size:10px}
      .loveRankLegend span{display:inline-flex;align-items:center;gap:5px}.loveRankLegend i{width:28px;height:7px;border-radius:99px}
      .loveRankLegend .hot{background:linear-gradient(90deg,rgba(213,177,118,.18),rgba(232,94,91,.7))}
      .loveRankLegend .cold{background:linear-gradient(90deg,rgba(70,142,214,.7),rgba(85,106,137,.15))}
      .loveRankStatus{margin:10px 0;color:#8593a6;font-size:11px}
      .loveRankList{display:grid;gap:8px}
      .loveRankRow{--love-positive:0;--love-negative:0;display:grid;grid-template-columns:52px minmax(160px,1fr) minmax(90px,.35fr) auto;align-items:center;gap:12px;padding:9px 11px;border:1px solid rgba(148,163,184,.14);border-radius:13px;background:
        linear-gradient(90deg,rgba(224,91,78,var(--love-positive)) 0%,rgba(213,177,118,calc(var(--love-positive)*.42)) 42%,rgba(7,13,23,.46) 68%),
        linear-gradient(90deg,rgba(64,126,195,var(--love-negative)) 0%,rgba(7,13,23,.46) 62%);
        transition:transform .18s ease,border-color .18s ease,background .2s ease}
      .loveRankRow:hover{transform:translateY(-1px);border-color:rgba(213,177,118,.32)}
      .loveRankPlace{font:900 18px/1 system-ui;color:#e9d3a8;text-align:center;font-variant-numeric:tabular-nums}
      .loveRankChar{display:flex;align-items:center;gap:10px;min-width:0}.loveRankAvatar{width:48px;height:48px;border-radius:12px;object-fit:cover;background:#101827;border:1px solid rgba(255,255,255,.08);flex:none}
      .loveRankName{min-width:0}.loveRankName strong{display:block;color:#eef3fa;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.loveRankName small{display:block;margin-top:4px;color:#7f8da1;font-size:9px}
      .loveRankScore{text-align:center}.loveRankScore strong{display:block;font:900 20px/1 system-ui;font-variant-numeric:tabular-nums}.loveRankScore small{display:block;margin-top:4px;color:#8190a3;font-size:9px}.loveRankScore.isPositive strong{color:#f0bd79}.loveRankScore.isNegative strong{color:#72b3ed}.loveRankScore.isZero strong{color:#a8b3c1}
      .loveRankActions{display:flex;align-items:center;justify-content:flex-end;gap:7px}.loveVoteBtn{min-width:72px;border:1px solid rgba(148,163,184,.2);border-radius:10px;padding:8px 10px;background:rgba(10,17,28,.7);color:#bac5d2;cursor:pointer;font:700 11px/1 inherit;white-space:nowrap}.loveVoteBtn:hover{border-color:rgba(213,177,118,.48);color:#f1ddb5}.loveVoteBtn[data-vote="like"].isActive{border-color:rgba(231,166,83,.7);background:rgba(213,151,67,.17);color:#ffd79b}.loveVoteBtn[data-vote="dislike"].isActive{border-color:rgba(86,157,224,.7);background:rgba(62,120,181,.17);color:#9bd0ff}.loveVoteBtn:disabled{opacity:.45;cursor:wait}
      .loveRankEmpty{padding:30px;text-align:center;color:#8997a9;border:1px dashed rgba(148,163,184,.2);border-radius:12px}
      @media(max-width:680px){.loveRankRow{grid-template-columns:36px minmax(0,1fr);gap:8px}.loveRankPlace{grid-row:1/3}.loveRankScore{text-align:left;padding-left:58px}.loveRankActions{grid-column:2;justify-content:flex-start;padding-left:58px}.loveRankAvatar{width:44px;height:44px}.loveVoteBtn{min-width:64px;padding:7px 9px}}
    `;
    document.head.appendChild(style);
  }

  function resolveCharacters(){
    const data=window.MorimensData;
    const records=Array.isArray(data?.db?.records)?data.db.records:[];
    return records.map(rec=>{
      const loc=data.localizedProfile?.(rec)||{};
      const image=data.assetFor?.(rec,'portrait')||data.assetFor?.(rec,'card')||'';
      return {id:String(rec.id),name:String(loc.name||rec.name||rec.id),englishName:String(rec.name||''),image};
    }).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
  }

  function scoreClass(score){return score>0?'isPositive':score<0?'isNegative':'isZero'}
  function render(){
    const host=$('morimensLoveRankingList');
    if(!host)return;
    if(!rows.length){host.innerHTML='<div class="loveRankEmpty">暂无角色数据。</div>';return}
    const maxAbs=Math.max(1,...rows.map(r=>Math.abs(r.score)));
    const sorted=[...rows].sort((a,b)=>b.score-a.score||b.likes-a.likes||a.dislikes-b.dislikes||a.name.localeCompare(b.name,'zh-CN'));
    host.innerHTML=sorted.map((r,index)=>{
      const intensity=Math.min(.58,Math.abs(r.score)/maxAbs*.58).toFixed(3);
      const positive=r.score>0?intensity:'0',negative=r.score<0?intensity:'0';
      const selected=votes[r.id]||'';
      return `<div class="loveRankRow" data-love-id="${esc(r.id)}" style="--love-positive:${positive};--love-negative:${negative}">
        <div class="loveRankPlace">#${index+1}</div>
        <div class="loveRankChar">${r.image?`<img class="loveRankAvatar" src="${esc(r.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`:''}<div class="loveRankName"><strong>${esc(r.name)}</strong><small>${esc(r.englishName)}</small></div></div>
        <div class="loveRankScore ${scoreClass(r.score)}"><strong>${r.score>0?'+':''}${r.score}</strong><small>👍 ${r.likes} · 👎 ${r.dislikes}</small></div>
        <div class="loveRankActions"><button type="button" class="loveVoteBtn ${selected==='like'?'isActive':''}" data-love-id="${esc(r.id)}" data-vote="like" aria-pressed="${selected==='like'}">👍 赞 ${r.likes}</button><button type="button" class="loveVoteBtn ${selected==='dislike'?'isActive':''}" data-love-id="${esc(r.id)}" data-vote="dislike" aria-pressed="${selected==='dislike'}">👎 踩 ${r.dislikes}</button></div>
      </div>`;
    }).join('');
    const status=$('morimensLoveRankingStatus');
    if(status)status.textContent=`共 ${sorted.length} 名角色 · 按 赞 − 踩 排序 · 数据跨设备同步`;
  }

  async function load(){
    if(loading)return;
    loading=true;
    const status=$('morimensLoveRankingStatus');
    if(status)status.textContent='正在载入角色与投票数据……';
    try{
      const characters=resolveCharacters();
      if(!characters.length)throw new Error('角色资料尚未加载');
      const counters=await getCounters(characters.map(x=>x.id));
      rows=characters.map(x=>{const c=counters.get(x.id)||{likes:0,dislikes:0};return {...x,...c,score:c.likes-c.dislikes}});
      render();
      initialized=true;
    }catch(error){
      console.error('爱的节奏榜加载失败',error);
      if(status)status.textContent='爱的节奏榜加载失败，请稍后重试。';
    }finally{loading=false}
  }

  async function vote(id,nextVote){
    const row=rows.find(x=>x.id===id);if(!row)return;
    const current=votes[id]||'';
    const buttons=[...document.querySelectorAll(`.loveVoteBtn[data-love-id="${CSS.escape(id)}"]`)];
    buttons.forEach(b=>b.disabled=true);
    try{
      if(current){
        const type=current==='like'?'reaction0':'reaction1';
        const result=await updateCounter(id,type,'desc');
        row.likes=result.likes;row.dislikes=result.dislikes;
      }
      if(current!==nextVote){
        const type=nextVote==='like'?'reaction0':'reaction1';
        const result=await updateCounter(id,type,'inc');
        row.likes=result.likes;row.dislikes=result.dislikes;
        votes[id]=nextVote;
      }else{
        delete votes[id];
      }
      row.score=row.likes-row.dislikes;
      saveVotes();
      render();
    }catch(error){
      console.error('爱的节奏榜投票失败',error);
      buttons.forEach(b=>{b.title='同步失败，请稍后重试'});
    }finally{
      document.querySelectorAll(`.loveVoteBtn[data-love-id="${CSS.escape(id)}"]`).forEach(b=>b.disabled=false);
    }
  }

  function bind(){
    const host=$('morimensLoveRankingList');
    if(host&&!host.dataset.bound){
      host.dataset.bound='1';
      host.addEventListener('click',e=>{
        const button=e.target.closest('.loveVoteBtn[data-love-id][data-vote]');
        if(!button)return;
        vote(button.dataset.loveId,button.dataset.vote);
      });
    }
  }

  async function open(){
    injectStyle();bind();
    if(initialized){render();return}
    if(!window.MorimensData?.db?.records?.length){
      await new Promise(resolve=>{
        const timer=setTimeout(resolve,3500);
        window.addEventListener('morimens-data-ready',()=>{clearTimeout(timer);resolve()},{once:true});
      });
    }
    await load();
  }

  votes=loadVotes();
  window.MorimensLoveRanking={open,refresh:load};
  window.addEventListener('morimens-love-ranking-open',open);
  if(location.hash==='#love')setTimeout(open,0);
})();