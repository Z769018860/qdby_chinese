(()=>{
  const SERVER='https://textbox.qingdengbuyi.top';
  const PATH_PREFIX='/__morimens_love_rank__/';
  const STORAGE_KEY='morimens.love-ranking.votes.v1';
  const CHUNK_SIZE=30;
  let initialized=false;
  let loading=false;
  let rows=[];
  let votes={};
  let sortMode='score';

  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const isEnglish=()=>localStorage.getItem('morimens.language')==='en';
  const ui=(zh,en)=>isEnglish()?en:zh;

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
      .loveRankDisclaimer{margin:10px 0 12px;padding:10px 12px;border:1px solid rgba(213,177,118,.28);border-left:3px solid rgba(213,177,118,.82);border-radius:10px;background:linear-gradient(90deg,rgba(94,63,32,.18),rgba(11,18,28,.34));color:#d8c6a6;font-size:11px;line-height:1.65}
      .loveRankToolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:10px 0 8px}
      .loveRankSort{display:flex;align-items:center;gap:8px;color:#8997aa;font-size:11px}.loveRankSort label{white-space:nowrap}.loveRankSort select{height:34px;min-width:150px;padding:0 30px 0 10px;border:1px solid rgba(148,163,184,.24);border-radius:9px;background:#111827;color:#e7edf5;outline:none}.loveRankSort select:focus{border-color:rgba(213,177,118,.6);box-shadow:0 0 0 3px rgba(213,177,118,.09)}
      .loveRankStatus{margin:0;color:#8593a6;font-size:11px}
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
      .loveRankActions{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap}
      .loveVoteBtn{display:inline-flex;align-items:center;gap:6px;border:0;padding:0;background:transparent;color:#e1e7ef;cursor:pointer;font:800 12px/1 inherit;white-space:nowrap;transition:transform .15s ease,filter .15s ease,opacity .15s ease}
      .loveVoteBtn:hover{transform:translateY(-1px);filter:brightness(1.08)}
      .loveVoteBtn:focus-visible{outline:2px solid rgba(213,177,118,.65);outline-offset:3px;border-radius:10px}
      .loveVoteBtn:disabled{opacity:.45;cursor:wait;transform:none}
      .loveVoteArtwork{display:block;object-fit:contain;pointer-events:none;user-select:none}
      .loveVoteLike .loveVoteArtwork{width:44px;height:44px}
      .loveVoteDislike .loveVoteArtwork{width:112px;height:40px}
      .loveVoteCount{display:inline-block;min-width:18px;text-align:left;color:#e7edf5;font-variant-numeric:tabular-nums;text-shadow:0 1px 2px rgba(0,0,0,.6)}
      .loveVoteBtn.isActive .loveVoteCount{color:#f2ddb5}
      .loveRankEmpty{padding:30px;text-align:center;color:#8997a9;border:1px dashed rgba(148,163,184,.2);border-radius:12px}
      @media(max-width:680px){.loveRankRow{grid-template-columns:36px minmax(0,1fr);gap:8px}.loveRankPlace{grid-row:1/3}.loveRankScore{text-align:left;padding-left:58px}.loveRankActions{grid-column:2;justify-content:flex-start;padding-left:58px;gap:8px}.loveRankAvatar{width:44px;height:44px}.loveVoteLike .loveVoteArtwork{width:40px;height:40px}.loveVoteDislike .loveVoteArtwork{width:98px;height:36px}.loveVoteCount{font-size:11px}}
    `;
    document.head.appendChild(style);
  }

  function resolveCharacters(){
    const data=window.MorimensData,records=Array.isArray(data?.db?.records)?data.db.records:[];
    return records.map(rec=>{
      const loc=data.localizedProfile?.(rec)||{},image=data.assetFor?.(rec,'portrait')||data.assetFor?.(rec,'card')||'';
      const displayName=isEnglish()?String(rec.name||rec.id):String(loc.name||rec.name||rec.id);
      return {id:String(rec.id),name:displayName,englishName:String(rec.name||''),image};
    }).sort((a,b)=>a.name.localeCompare(b.name,isEnglish()?'en':'zh-CN'));
  }

  const schoolCat={id:'special-misag-school-cat',name:'弥萨格校猫',englishName:'Misag School Cat',image:'assets/waline-avatars/160px-剧情角色-莱特头像.png'};

  function ensureControls(){
    const host=$('morimensLoveRankingList');if(!host)return;
    let disclaimer=$('morimensLoveRankingDisclaimer');
    if(!disclaimer){disclaimer=document.createElement('div');disclaimer.id='morimensLoveRankingDisclaimer';disclaimer.className='loveRankDisclaimer';host.insertAdjacentElement('beforebegin',disclaimer)}
    disclaimer.textContent=ui('免责声明：无恶意，纯节奏，加载慢或者失败是因为正在打榜的人太多。','Disclaimer: no hostility intended; this is a lighthearted ranking. Slow or failed loads may occur when too many people are voting.');
    let toolbar=$('morimensLoveRankingToolbar');
    if(!toolbar){
      toolbar=document.createElement('div');toolbar.id='morimensLoveRankingToolbar';toolbar.className='loveRankToolbar';
      toolbar.innerHTML='<div class="loveRankSort"><label for="morimensLoveRankingSort"></label><select id="morimensLoveRankingSort"><option value="score"></option><option value="likes"></option><option value="dislikes"></option><option value="heat"></option></select></div>';
      disclaimer.insertAdjacentElement('afterend',toolbar);
      const status=$('morimensLoveRankingStatus');if(status)toolbar.appendChild(status);
      $('morimensLoveRankingSort')?.addEventListener('change',e=>{sortMode=e.target.value||'score';render()});
    }
    const label=toolbar.querySelector('label');if(label)label.textContent=ui('排序方式','Sort by');
    const select=$('morimensLoveRankingSort');
    if(select){
      const labels={score:ui('总分排序（爱 − 拉黑）','Score (Love − Block)'),likes:ui('爱数量排序','Love count'),dislikes:ui('拉黑数量排序','Block count'),heat:ui('总热度排序（爱 + 拉黑）','Total heat (Love + Block)')};
      for(const option of select.options)option.textContent=labels[option.value]||option.value;
      select.value=sortMode;
    }
  }
  function sortRows(items){
    const cmpName=(a,b)=>a.name.localeCompare(b.name,'zh-CN');
    return [...items].sort((a,b)=>{
      if(sortMode==='likes')return b.likes-a.likes||b.score-a.score||b.dislikes-a.dislikes||cmpName(a,b);
      if(sortMode==='dislikes')return b.dislikes-a.dislikes||(b.likes+b.dislikes)-(a.likes+a.dislikes)||a.score-b.score||cmpName(a,b);
      if(sortMode==='heat')return (b.likes+b.dislikes)-(a.likes+a.dislikes)||b.likes-a.likes||b.score-a.score||cmpName(a,b);
      return b.score-a.score||b.likes-a.likes||a.dislikes-b.dislikes||cmpName(a,b);
    });
  }
  function sortLabel(){
    if(isEnglish())return sortMode==='likes'?'Love count':sortMode==='dislikes'?'Block count':sortMode==='heat'?'Total heat (Love + Block)':'Score (Love − Block)';
    return sortMode==='likes'?'爱数量':sortMode==='dislikes'?'拉黑数量':sortMode==='heat'?'总热度（爱 + 拉黑）':'总分（爱 − 拉黑）';
  }

  function scoreClass(score){return score>0?'isPositive':score<0?'isNegative':'isZero'}
  function render(){
    ensureControls();const host=$('morimensLoveRankingList');if(!host)return;
    if(!rows.length){host.innerHTML=`<div class="loveRankEmpty">${ui('暂无角色数据。','No character data.')}</div>`;return}
    const maxAbs=Math.max(1,...rows.map(r=>Math.abs(r.score))),sorted=sortRows(rows);
    host.innerHTML=sorted.map((r,index)=>{
      const intensity=Math.min(.58,Math.abs(r.score)/maxAbs*.58).toFixed(3),positive=r.score>0?intensity:'0',negative=r.score<0?intensity:'0',selected=votes[r.id]||'';
      const displayName=r.id===schoolCat.id?(isEnglish()?schoolCat.englishName:schoolCat.name):r.name;
      const subName=r.id===schoolCat.id?(isEnglish()?schoolCat.name:schoolCat.englishName):(isEnglish()?'':r.englishName);
      return `<div class="loveRankRow" data-love-id="${esc(r.id)}" style="--love-positive:${positive};--love-negative:${negative}">
        <div class="loveRankPlace">#${index+1}</div>
        <div class="loveRankChar">${r.image?`<img class="loveRankAvatar" src="${esc(r.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`:''}<div class="loveRankName"><strong>${esc(displayName)}</strong>${subName?`<small>${esc(subName)}</small>`:''}</div></div>
        <div class="loveRankScore ${scoreClass(r.score)}"><strong>${r.score>0?'+':''}${r.score}</strong><small>👍 ${r.likes} · 👎 ${r.dislikes}</small></div>
        <div class="loveRankActions"><button type="button" class="loveVoteBtn loveVoteLike ${selected==='like'?'isActive':''}" data-love-id="${esc(r.id)}" data-vote="like" aria-pressed="${selected==='like'}" aria-label="${selected==='like'?ui('取消点赞','Remove love'):ui('点赞','Love')}"><img class="loveVoteArtwork" src="assets/morimens/love-rank/${selected==='like'?'like-on.webp?v=20260920.73':'like-off.webp?v=20260920.73'}" alt=""><span class="loveVoteCount">${r.likes}</span></button><button type="button" class="loveVoteBtn loveVoteDislike ${selected==='dislike'?'isActive':''}" data-love-id="${esc(r.id)}" data-vote="dislike" aria-pressed="${selected==='dislike'}" aria-label="${selected==='dislike'?ui('取消拉黑','Remove block'):ui('拉黑','Block')}"><img class="loveVoteArtwork" src="assets/morimens/love-rank/${selected==='dislike'?'dislike-on.webp?v=20260920.73':'dislike-off.webp?v=20260920.73'}" alt=""><span class="loveVoteCount">${r.dislikes}</span></button></div>
      </div>`;
    }).join('');
    const status=$('morimensLoveRankingStatus');
    if(status)status.textContent=isEnglish()?`${sorted.length} entries · Sorted by ${sortLabel()} · Synced across devices`:`共 ${sorted.length} 个条目 · 按 ${sortLabel()} 排序 · 数据跨设备同步`;
  }

  async function load(){
    if(loading)return;
    loading=true;
    const status=$('morimensLoveRankingStatus');
    if(status)status.textContent=ui('正在载入角色与投票数据……','Loading character and vote data…');
    try{
      const characters=resolveCharacters();
      if(!characters.length)throw new Error(ui('角色资料尚未加载','Character data has not loaded yet'));
      const counters=await getCounters(characters.map(x=>x.id));
      rows=characters.map(x=>{const c=counters.get(x.id)||{likes:0,dislikes:0};return {...x,...c,score:c.likes-c.dislikes}});
      try{
        const specialCounters=await getCounters([schoolCat.id]);
        const c=specialCounters.get(schoolCat.id)||{likes:0,dislikes:0};
        rows.push({...schoolCat,...c,score:c.likes-c.dislikes});
      }catch(error){
        console.warn('弥萨格校猫投票计数加载失败，使用 0 票占位，不影响原榜单',error);
        rows.push({...schoolCat,likes:0,dislikes:0,score:0});
      }
      render();
      initialized=true;
    }catch(error){
      console.error('爱的节奏榜加载失败',error);
      if(status)status.textContent=ui('爱的节奏榜加载失败，请稍后重试。','Failed to load Love Rhythm Ranking. Please try again later.');
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
      buttons.forEach(b=>{b.title=ui('同步失败，请稍后重试','Sync failed. Please try again later.')});
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
    injectStyle();ensureControls();bind();
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
  window.addEventListener('morimens-language-change',()=>{
    if(initialized){
      const names=new Map(resolveCharacters().map(x=>[x.id,x]));
      rows=rows.map(row=>row.id===schoolCat.id?{...row,name:isEnglish()?schoolCat.englishName:schoolCat.name,englishName:schoolCat.englishName}:{...row,...(names.get(row.id)||{})});
      render();
    }else ensureControls();
  });
  window.addEventListener('morimens-love-ranking-open',open);
  if(location.hash==='#love')setTimeout(open,0);
})();