// Compatibility entry point. Full replay review fetches public BattleReplay objects by battleUuid.
// GitHub Pages is static and cannot execute a same-origin server proxy, so preview pages use
// public CORS relays for this one anonymous BattleReplay object only. Production keeps the
// constrained same-origin /api/morimens/replay/:uuid transport.
(()=>{
  const nativeFetch=window.fetch.bind(window);
  const replayUrl=/^https:\/\/z1g-warreport\.qookkagames\.com\/publish\/BattleReplay_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json(?:[?#].*)?$/i;
  const isGitHubPagesHost=/\.github\.io$/i.test(location.hostname);
  const MAX_RELAY_BYTES=20_000_000;

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

  function containsAscii(bytes,text){
    const needle=Array.from(text,c=>c.charCodeAt(0));
    outer:for(let i=0;i<=bytes.length-needle.length;i++){
      for(let j=0;j<needle.length;j++)if(bytes[i+j]!==needle[j])continue outer;
      return true;
    }
    return false;
  }

  async function validatedRelayResponse(response,candidate,safe){
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    if(safe.method==='HEAD')return response;
    const type=String(response.headers.get('content-type')||'').toLowerCase();
    if(type.includes('text/html'))throw new Error('unexpected HTML response');
    const declared=Number(response.headers.get('content-length')||0);
    if(declared>MAX_RELAY_BYTES)throw new Error(`response too large (${declared} bytes)`);
    const body=new Uint8Array(await response.arrayBuffer());
    if(!body.length)throw new Error('empty response');
    if(body.length>MAX_RELAY_BYTES)throw new Error(`response too large (${body.length} bytes)`);
    // Public BattleReplay objects are JSON envelopes containing a compStr field.  Validate
    // the relay body before returning it so an intermittent proxy error cannot masquerade
    // as a successful HTTP 200 and prevent the next fallback from being tried.
    if(!containsAscii(body,'"compStr"'))throw new Error(`response is not a BattleReplay envelope (${body.length} bytes)`);
    const headers=new Headers(response.headers);
    headers.set('X-Morimens-Replay-Relay',candidate.name);
    headers.set('Content-Length',String(body.length));
    return new Response(body,{status:200,statusText:'OK',headers});
  }

  async function fetchGitHubPagesReplay(target,uuid,input,init){
    const safe=safeReplayInit(input,init);
    if(safe.method!=='GET'&&safe.method!=='HEAD')throw new Error('Replay relay only supports GET/HEAD');
    // AllOrigins is the primary keyless raw-body CORS bridge. cors.dev is a second
    // keyless GET fallback for preview/testing. Neither request forwards cookies or
    // Authorization, and the target is hard-coded by replayUrl above.
    const candidates=[
      {name:'AllOrigins',url:`https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`},
      {name:'cors.dev',url:`https://proxy.cors.dev/${target}`}
    ];
    const errors=[];
    for(const candidate of candidates){
      try{
        const response=await nativeFetch(candidate.url,{...safe,mode:'cors'});
        const validated=await validatedRelayResponse(response,candidate,safe);
        window.MorimensReplayTransport=`github-pages-cors-relay:${candidate.name}`;
        return validated;
      }catch(error){
        errors.push(`${candidate.name}: ${error?.message||error}`);
      }
    }
    throw new TypeError(`GitHub Pages replay relay failed for ${uuid}: ${errors.join(' | ')}`);
  }

  async function fetchSameOriginOrStaticFallback(target,uuid,input,init){
    const safe=safeReplayInit(input,init);
    const proxy=`/api/morimens/replay/${uuid}`;
    try{
      const response=await nativeFetch(proxy,{...safe,mode:'same-origin'});
      const source=response.headers.get('x-morimens-replay-source');
      const type=String(response.headers.get('content-type')||'').toLowerCase();
      const looksLikeStatic404=!source&&(response.status===404||response.status===405)&&type.includes('text/html');
      if(!looksLikeStatic404){
        window.MorimensReplayTransport='same-origin-proxy';
        return response;
      }
    }catch(error){
      console.warn('Replay same-origin proxy unavailable; trying static Pages relay.',error);
    }
    return fetchGitHubPagesReplay(target,uuid,input,init);
  }

  if(!window.__morimensReplayProxyFetchInstalled){
    window.__morimensReplayProxyFetchInstalled=true;
    window.MorimensReplayTransport=isGitHubPagesHost?'github-pages-cors-relay':'same-origin-proxy';
    window.fetch=(input,init={})=>{
      const url=inputUrl(input);
      const match=url.match(replayUrl);
      if(!match)return nativeFetch(input,init);
      const uuid=match[1].toLowerCase();
      if(isGitHubPagesHost)return fetchGitHubPagesReplay(url,uuid,input,init);
      return fetchSameOriginOrStaticFallback(url,uuid,input,init);
    };
  }

  import('./morimens-replay-review-v2.js?v=20261004.7')
    .catch(error=>console.error('Replay review failed to load',error));
})();
