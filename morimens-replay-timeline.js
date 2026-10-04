// Compatibility entry point. Full replay review fetches public BattleReplay objects by battleUuid.
// GitHub Pages is static and cannot execute a same-origin server proxy, so preview pages use
// public CORS relays for this one anonymous BattleReplay object only. Production keeps the
// constrained same-origin /api/morimens/replay/:uuid transport.
(()=>{
  const nativeFetch=window.fetch.bind(window);
  const replayUrl=/^https:\/\/z1g-warreport\.qookkagames\.com\/publish\/BattleReplay_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json(?:[?#].*)?$/i;
  const isGitHubPages=/\.github\.io$/i.test(location.hostname);

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

  async function fetchGitHubPagesReplay(target,uuid,input,init){
    const safe=safeReplayInit(input,init);
    if(safe.method!=='GET'&&safe.method!=='HEAD')throw new Error('Replay relay only supports GET/HEAD');
    const candidates=[
      {name:'AllOrigins',url:`https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`},
      {name:'isomorphic-git CORS proxy',url:`https://cors.isomorphic-git.org/${target}`}
    ];
    const errors=[];
    for(const candidate of candidates){
      try{
        const response=await nativeFetch(candidate.url,{...safe,mode:'cors'});
        if(!response.ok){errors.push(`${candidate.name}: HTTP ${response.status}`);continue}
        const type=String(response.headers.get('content-type')||'').toLowerCase();
        if(type.includes('text/html')){errors.push(`${candidate.name}: unexpected HTML response`);continue}
        response.morimensReplayTransport=candidate.name;
        return response;
      }catch(error){
        errors.push(`${candidate.name}: ${error?.message||error}`);
      }
    }
    throw new TypeError(`GitHub Pages replay relay failed for ${uuid}: ${errors.join(' | ')}`);
  }

  if(!window.__morimensReplayProxyFetchInstalled){
    window.__morimensReplayProxyFetchInstalled=true;
    window.MorimensReplayTransport=isGitHubPages?'github-pages-cors-relay':'same-origin-proxy';
    window.fetch=(input,init={})=>{
      const url=inputUrl(input);
      const match=url.match(replayUrl);
      if(!match)return nativeFetch(input,init);
      const uuid=match[1].toLowerCase();
      if(isGitHubPages)return fetchGitHubPagesReplay(url,uuid,input,init);
      const proxy=`/api/morimens/replay/${uuid}`;
      const safe=safeReplayInit(input,init);
      return nativeFetch(proxy,{...safe,mode:'same-origin'});
    };
  }

  import('./morimens-replay-review-v2.js?v=20261004.6')
    .catch(error=>console.error('Replay review failed to load',error));
})();
