// Cloudflare Worker relay for GitHub Pages: deploy this file as a Worker, then set
// the Worker origin (e.g. https://morimens-replay.<you>.workers.dev) as the relay base.
// Route: GET /api/morimens/replay/<uuid>  (exact BattleReplay object only, not an open proxy).
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPSTREAM='https://z1g-warreport.qookkagames.com/publish/BattleReplay_';
const MAX_BYTES=20_000_000;
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,HEAD,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};

export default {
  async fetch(request){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
    if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method Not Allowed',{status:405,headers:{...CORS,Allow:'GET, HEAD, OPTIONS'}});
    const m=new URL(request.url).pathname.match(/^\/api\/morimens\/replay\/([^/]+)\/?$/);
    const uuid=String(m?.[1]||'').toLowerCase();
    if(!UUID_RE.test(uuid))return new Response('Invalid replay UUID',{status:400,headers:CORS});
    let up;
    try{up=await fetch(`${UPSTREAM}${uuid}.json`,{method:request.method,headers:{Accept:'application/json,*/*;q=0.8'},cf:{cacheTtl:3600,cacheEverything:true}})}
    catch(e){return new Response(`Replay upstream fetch failed: ${e?.message||e}`,{status:502,headers:CORS})}
    if(!up.ok)return new Response(`Replay upstream returned ${up.status}`,{status:up.status,headers:CORS});
    const declared=Number(up.headers.get('content-length')||0);
    if(declared>MAX_BYTES)return new Response('Replay object too large',{status:413,headers:CORS});
    const headers=new Headers(CORS);
    headers.set('Content-Type',up.headers.get('content-type')||'application/json');
    headers.set('Cache-Control','public, max-age=300, s-maxage=3600');
    headers.set('X-Content-Type-Options','nosniff');
    return new Response(request.method==='HEAD'?null:up.body,{status:200,headers});
  }
};
