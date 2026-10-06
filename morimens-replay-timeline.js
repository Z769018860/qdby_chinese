// Compatibility entry point for full Morimens replay review.
// GitHub Pages is static and cannot proxy qookkagames itself.  Preview therefore
// prefers a user-owned relay (Vercel/EdgeOne/etc.) and keeps several public CORS
// bridges only as development fallbacks.  The target is always the exact public
// BattleReplay_<UUID>.json object; this is never an arbitrary URL proxy.
(()=>{
  const nativeFetch=window.fetch.bind(window);
  const replayUrl=/^https:\/\/z1g-warreport\.qookkagames\.com\/publish\/BattleReplay_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json(?:[?#].*)?$/i;
  const isGitHubPagesHost=/\.github\.io$/i.test(location.hostname);
  const MAX_RELAY_BYTES=20_000_000;
  const RELAY_STORAGE='morimens.replayRelayBase';
  const DEFAULT_RELAY_BASE='https://qdbychinese.vercel.app';
  const isEn=()=>localStorage.getItem('morimens.language')==='en';
  const ui=(zh,en)=>isEn()?en:zh;

  function inputUrl(input){
    if(typeof input==='string')return input;
    if(input instanceof URL)return input.href;
    if(input&&typeof input.url==='string')return input.url;
    return '';
  }
  function safeReplayInit(input,init={}){
    const inheritedMethod=input instanceof Request?input.method:'GET';
    const method=String(init.method||inheritedMethod||'GET').toUpperCase();
    const out={method,cache:'no-store',credentials:'omit'};
    if(init.signal)out.signal=init.signal;
    return out;
  }
  function relayBase(){
    const explicit=String(window.MORIMENS_REPLAY_RELAY_BASE||'').trim();
    const saved=String(localStorage.getItem(RELAY_STORAGE)||'').trim();
    return (explicit||saved||DEFAULT_RELAY_BASE).replace(/\/+$/,'');
  }
  function containsAscii(bytes,text){
    const needle=Array.from(text,c=>c.charCodeAt(0));
    outer:for(let i=0;i<=bytes.length-needle.length;i++){
      for(let j=0;j<needle.length;j++)if(bytes[i+j]!==needle[j])continue outer;
      return true;
    }
    return false;
  }
  function formatBytes(n){
    const v=Number(n)||0;if(v<1024)return `${v} B`;if(v<1048576)return `${(v/1024).toFixed(1)} KB`;return `${(v/1048576).toFixed(2)} MB`;
  }

  function ensureProgressStyle(){
    if(document.getElementById('morimensReplayTransportStyle'))return;
    const s=document.createElement('style');s.id='morimensReplayTransportStyle';s.textContent=`
      .mrRelayProgress{display:none;margin-top:10px;padding:10px 11px;border:1px solid rgba(98,183,255,.18);border-radius:10px;background:rgba(98,183,255,.045)}
      .mrRelayProgress.isActive{display:block}.mrRelayProgressHead{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#a8bad0;font-size:10px;margin-bottom:7px}.mrRelayProgressHead strong{color:#dbe9f7;font-size:11px}.mrRelayTrack{height:8px;border-radius:999px;overflow:hidden;background:rgba(148,163,184,.13)}.mrRelayFill{height:100%;width:0;background:linear-gradient(90deg,#6fa7cf,#d5b176);transition:width .18s ease}.mrRelayDetail{margin-top:6px;color:#77889d;font-size:9px;line-height:1.45}.mrRelayConfig{margin-top:10px;color:#8392a6;font-size:10px}.mrRelayConfig summary{cursor:pointer}.mrRelayConfigRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;margin-top:7px}.mrRelayConfig input{min-width:0;border:1px solid #334155;border-radius:7px;background:#0b1420;color:#dbe5ef;padding:6px 8px;font:inherit}.mrRelayConfig button{border:1px solid rgba(213,177,118,.28);border-radius:7px;background:rgba(213,177,118,.1);color:#e8cca0;padding:6px 9px;cursor:pointer}.mrRelayConfig small{display:block;margin-top:6px;line-height:1.55;color:#68778b}@media(max-width:720px){.mrRelayConfigRow{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }
  function attachProgressUi(){
    ensureProgressStyle();
    const intro=document.querySelector('#morimensReplayPanel .mr2intro');if(!intro||document.getElementById('mrRelayProgress'))return;
    const box=document.createElement('div');box.id='mrRelayProgress';box.className='mrRelayProgress';box.innerHTML=`<div class="mrRelayProgressHead"><strong id="mrRelayProgressLabel">${ui('等待获取','Waiting')}</strong><span id="mrRelayProgressPct">0%</span></div><div class="mrRelayTrack"><div id="mrRelayProgressFill" class="mrRelayFill"></div></div><div id="mrRelayProgressDetail" class="mrRelayDetail"></div>`;intro.appendChild(box);
    if(isGitHubPagesHost){
      const details=document.createElement('details');details.className='mrRelayConfig';details.innerHTML=`<summary>${ui('GitHub Pages 中继设置','GitHub Pages relay settings')}</summary><div class="mrRelayConfigRow"><input id="mrRelayBaseInput" spellcheck="false" placeholder="https://your-relay.example.com"><button id="mrRelayBaseSave" type="button">${ui('保存','Save')}</button></div><small>${ui('GitHub Pages 不能在服务器端转发跨域请求。建议配置自己控制的 Vercel / EdgeOne / Worker 中继根地址；公共 CORS 代理只作为开发兜底。','GitHub Pages cannot proxy cross-origin requests server-side. Configure a relay you control (Vercel / EdgeOne / Worker). Public CORS bridges are development fallbacks only.')}</small>`;intro.appendChild(details);
      const input=details.querySelector('#mrRelayBaseInput');input.value=relayBase();details.querySelector('#mrRelayBaseSave').addEventListener('click',()=>{const v=String(input.value||'').trim().replace(/\/+$/,'');if(v)localStorage.setItem(RELAY_STORAGE,v);else localStorage.removeItem(RELAY_STORAGE);setProgress(0,ui('中继设置已保存，请重新获取。','Relay setting saved. Fetch again.'),v||ui('未配置自有中继','No owned relay configured'),false)});
    }
  }
  function setProgress(percent,label,detail='',active=true){
    attachProgressUi();const box=document.getElementById('mrRelayProgress');if(!box)return;box.classList.toggle('isActive',!!active);const p=Math.max(0,Math.min(100,Math.round(Number(percent)||0)));box.querySelector('#mrRelayProgressFill').style.width=`${p}%`;box.querySelector('#mrRelayProgressPct').textContent=`${p}%`;box.querySelector('#mrRelayProgressLabel').textContent=label||'';box.querySelector('#mrRelayProgressDetail').textContent=detail||'';
  }
  window.MorimensReplayProgress={set:setProgress,attach:attachProgressUi,relayBase};

  async function readResponseWithProgress(response,candidate){
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const type=String(response.headers.get('content-type')||'').toLowerCase();
    if(type.includes('text/html'))throw new Error('unexpected HTML response');
    const declared=Number(response.headers.get('content-length')||0);
    if(declared>MAX_RELAY_BYTES)throw new Error(`response too large (${declared} bytes)`);
    if(!response.body||typeof response.body.getReader!=='function'){
      const body=new Uint8Array(await response.arrayBuffer());
      setProgress(66,ui('回放下载完成','Replay downloaded'),`${candidate.name} · ${formatBytes(body.length)}`);
      return body;
    }
    const reader=response.body.getReader(),chunks=[];let loaded=0;
    while(true){
      const {done,value}=await reader.read();if(done)break;if(!value)continue;loaded+=value.byteLength;if(loaded>MAX_RELAY_BYTES){try{await reader.cancel()}catch{}throw new Error(`response too large (${loaded} bytes)`)}chunks.push(value);
      const fraction=declared?Math.min(1,loaded/declared):Math.min(.92,loaded/(1.5*1024*1024));
      setProgress(12+fraction*52,ui('正在下载完整回放','Downloading full replay'),`${candidate.name} · ${formatBytes(loaded)}${declared?` / ${formatBytes(declared)}`:''}`);
    }
    const body=new Uint8Array(loaded);let off=0;for(const chunk of chunks){body.set(chunk,off);off+=chunk.byteLength}
    setProgress(66,ui('回放下载完成','Replay downloaded'),`${candidate.name} · ${formatBytes(body.length)}`);
    return body;
  }
  async function validatedRelayResponse(response,candidate,safe){
    if(safe.method==='HEAD'){if(!response.ok)throw new Error(`HTTP ${response.status}`);return response}
    const body=await readResponseWithProgress(response,candidate);
    if(!body.length)throw new Error('empty response');
    if(!containsAscii(body,'"compStr"'))throw new Error(`response is not a BattleReplay envelope (${body.length} bytes)`);
    setProgress(74,ui('正在校验并解压回放','Validating and decoding replay'),ui('下一步：LZ4 → MessagePack → recordZips','Next: LZ4 → MessagePack → recordZips'));
    const headers=new Headers(response.headers);headers.set('X-Morimens-Replay-Relay',candidate.name);headers.set('Content-Length',String(body.length));return new Response(body,{status:200,statusText:'OK',headers});
  }

  function githubRelayCandidates(target,uuid){
    const out=[];const owned=relayBase();
    if(owned)out.push({name:'Owned relay',url:`${owned}/api/morimens/replay/${uuid}`,owned:true});
    out.push(
      {name:'isomorphic-git',url:`https://cors.isomorphic-git.org/${target}`},
      {name:'CodeTabs',url:`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`},
      {name:'corsproxy.io',url:`https://corsproxy.io/?url=${encodeURIComponent(target)}`},
      {name:'AllOrigins',url:`https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`},
      {name:'cors.dev',url:`https://proxy.cors.dev/${target}`}
    );
    return out;
  }
  async function fetchGitHubPagesReplay(target,uuid,input,init){
    const safe=safeReplayInit(input,init);if(safe.method!=='GET'&&safe.method!=='HEAD')throw new Error('Replay relay only supports GET/HEAD');const candidates=githubRelayCandidates(target,uuid),errors=[];
    setProgress(4,ui('正在连接回放源','Connecting to replay source'),uuid);
    for(let i=0;i<candidates.length;i++){
      const candidate=candidates[i];setProgress(5+i,ui(`正在尝试中继 ${i+1}/${candidates.length}`,`Trying relay ${i+1}/${candidates.length}`),candidate.name);
      try{const response=await nativeFetch(candidate.url,{...safe,mode:'cors'});const validated=await validatedRelayResponse(response,candidate,safe);window.MorimensReplayTransport=`github-pages-relay:${candidate.name}`;return validated}catch(error){errors.push(`${candidate.name}: ${error?.message||error}`);setProgress(6+i,ui('当前中继失败，正在尝试下一个','Relay failed; trying the next one'),errors[errors.length-1])}
    }
    const hint=relayBase()?ui('自有中继也失败，请检查其中继日志/CORS。','The owned relay also failed; check its logs/CORS.'):ui('未配置自有中继；GitHub Pages 无法自己代理跨域请求。','No owned relay is configured; GitHub Pages cannot proxy cross-origin requests itself.');
    setProgress(0,ui('完整回放获取失败','Full replay fetch failed'),hint,true);
    throw new TypeError(`GitHub Pages replay relay failed for ${uuid}: ${errors.join(' | ')}. ${hint}`);
  }
  // Large replays can make an edge/serverless proxy fail (e.g. EdgeOne HTTP 545, Vercel payload limits): fetch them as small Range chunks instead
  async function fetchProxyChunks(proxy,safe){
    const CH=1024*1024,hdr=(a,b)=>({Range:`bytes=${a}-${b}`});
    const r0=await nativeFetch(proxy,{...safe,mode:'same-origin',headers:hdr(0,CH-1)});
    if(r0.status!==206)throw new Error(`Range request not supported (HTTP ${r0.status})`);
    const total=Number(String(r0.headers.get('content-range')||'').match(/\/(\d+)$/)?.[1]||0);
    if(!total||total>MAX_RELAY_BYTES)throw new Error('bad Range response');
    const out=new Uint8Array(total);out.set(new Uint8Array(await r0.arrayBuffer()),0);let loaded=Math.min(CH,total);
    const prog=()=>setProgress(12+Math.min(1,loaded/total)*52,ui('正在分块下载完整回放','Downloading full replay in chunks'),`${formatBytes(loaded)} / ${formatBytes(total)}`);prog();
    const starts=[];for(let p=CH;p<total;p+=CH)starts.push(p);let next=0;
    const worker=async()=>{while(next<starts.length){const a=starts[next++],b=Math.min(total-1,a+CH-1);let err=null,ok=false;
      for(let t=0;t<3&&!ok;t++){try{const r=await nativeFetch(proxy,{...safe,mode:'same-origin',headers:hdr(a,b)});if(r.status!==206)throw new Error(`HTTP ${r.status}`);const buf=new Uint8Array(await r.arrayBuffer());if(buf.length!==b-a+1)throw new Error('short chunk');out.set(buf,a);loaded+=buf.length;prog();ok=true}catch(e){err=e}}
      if(!ok)throw err}};
    await Promise.all([worker(),worker(),worker()]);
    if(!containsAscii(out,'"compStr"'))throw new Error(`response is not a BattleReplay envelope (${out.length} bytes)`);
    setProgress(74,ui('正在校验并解压回放','Validating and decoding replay'),'');
    return new Response(out,{status:200,statusText:'OK',headers:{'Content-Type':'application/octet-stream','Content-Length':String(out.length),'X-Morimens-Replay-Relay':'same-origin-chunks'}});
  }
  async function fetchSameOriginOrStaticFallback(target,uuid,input,init){
    const safe=safeReplayInit(input,init),proxy=`/api/morimens/replay/${uuid}`;setProgress(4,ui('正在连接同源回放代理','Connecting to same-origin replay proxy'),uuid);
    try{const response=await nativeFetch(proxy,{...safe,mode:'same-origin'}),source=response.headers.get('x-morimens-replay-source'),type=String(response.headers.get('content-type')||'').toLowerCase(),looksLikeStatic404=!source&&(response.status===404||response.status===405)&&type.includes('text/html');if(!looksLikeStatic404){window.MorimensReplayTransport='same-origin-proxy';return await validatedRelayResponse(response,{name:'same-origin'},safe)}}catch(error){console.warn('Replay same-origin proxy failed; trying ranged chunks.',error);try{const resp=await fetchProxyChunks(proxy,safe);window.MorimensReplayTransport='same-origin-proxy-chunks';return resp}catch(error2){console.warn('Replay chunked proxy unavailable; trying static Pages relay.',error2)}}
    return fetchGitHubPagesReplay(target,uuid,input,init);
  }

  if(!window.__morimensReplayProxyFetchInstalled){
    window.__morimensReplayProxyFetchInstalled=true;window.MorimensReplayTransport=isGitHubPagesHost?'github-pages-relay':'same-origin-proxy';window.fetch=(input,init={})=>{const url=inputUrl(input),match=url.match(replayUrl);if(!match)return nativeFetch(input,init);const uuid=match[1].toLowerCase();if(isGitHubPagesHost)return fetchGitHubPagesReplay(url,uuid,input,init);return fetchSameOriginOrStaticFallback(url,uuid,input,init)};
  }

  // the result host can be replaced when the review module builds its own panel, so look it up fresh and watch the whole document
  let doneKey='';
  const observe=()=>{attachProgressUi();const done=()=>{const host=document.getElementById('mrReplayResult');if(!host)return;const ready=host.querySelector('.mr2binfo,.mr2sum,.mr2mvps');
    if(ready){if(doneKey===(ready.dataset.progDone||'')&&ready.dataset.progDone)return;ready.dataset.progDone='1';doneKey='1';setProgress(100,ui('完整复盘已生成','Replay review ready'),ui('下载、LZ4、MessagePack 与事件时间线解析完成。','Download, LZ4, MessagePack and event timeline parsing completed.'));setTimeout(()=>{const box=document.getElementById('mrRelayProgress');if(box)box.classList.remove('isActive')},1200)}
    else{doneKey='';if(host.querySelector('.mr2status.err')){const box=document.getElementById('mrRelayProgress');if(box)box.classList.add('isActive')}}};
    done();let q=false;new MutationObserver(()=>{if(q)return;q=true;queueMicrotask(()=>{q=false;done()})}).observe(document.documentElement,{childList:true,subtree:true})};
  const bodyObserver=new MutationObserver(()=>{if(document.getElementById('morimensReplayPanel')){observe();bodyObserver.disconnect()}});bodyObserver.observe(document.documentElement,{childList:true,subtree:true});

  import('./morimens-replay-review-v2.js?v=20261006.14').catch(error=>{setProgress(0,ui('回放模块加载失败','Replay module failed to load'),String(error?.message||error));console.error('Replay review failed to load',error)});
})();
